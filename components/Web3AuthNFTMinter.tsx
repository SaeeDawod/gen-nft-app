'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Web3Auth } from '@web3auth/modal';
import { initWeb3Auth, getAddress, getUserInfo, mintNFT, disconnect } from '@/utils/web3auth';
import { generateAndUploadNFT } from '@/app/actions';
import type { GenerationResult } from '@/app/actions';

interface UserInfo {
  email?: string;
  name?: string;
  profileImage?: string;
  walletAddress?: string;
}

export default function Web3AuthNFTMinter() {
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize Web3Auth
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const web3authInstance = await initWeb3Auth();
        setWeb3auth(web3authInstance);
      } catch (error) {
        console.error(error);
        if (error instanceof Error) {
          if (error.message.includes('failed to fetch project configurations')) {
            setError('Failed to connect to Web3Auth servers. Please check your internet connection and try again.');
          } else {
            setError(`Failed to initialize Web3Auth: ${error.message}`);
          }
        } else {
          setError('Failed to initialize Web3Auth');
        }
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // Add a retry function
  const retryInit = () => {
    // Reset error state
    setError(null);
    
    // Reinitialize Web3Auth
    const init = async () => {
      try {
        setIsLoading(true);
        const web3authInstance = await initWeb3Auth();
        setWeb3auth(web3authInstance);
      } catch (error) {
        console.error('Retry failed:', error);
        setError('Retry failed. Please check console for details.');
      } finally {
        setIsLoading(false);
      }
    };
    
    init();
  };

  // Handle login
  const login = async () => {
    if (!web3auth) {
      setError('Web3Auth not initialized');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await web3auth.connect();
      await updateUserInfo();
    } catch (error) {
      console.error('Error logging in:', error);
      setError('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle logout
  const logOut = async () => {
    if (!web3auth) {
      setError('Web3Auth not initialized');
      return;
    }

    try {
      setIsLoading(true);
      await disconnect(web3auth);
      setUserInfo(null);
      setResult(null);
    } catch (error) {
      console.error('Error logging out:', error);
      setError('Logout failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Update user info
  const updateUserInfo = async () => {
    if (!web3auth) return;

    try {
      const info = await getUserInfo(web3auth);
      const address = await getAddress(web3auth);

      setUserInfo({
        email: info?.email,
        name: info?.name,
        profileImage: info?.profileImage,
        walletAddress: `${address}`,
      });
    } catch (error) {
      console.error('Error getting user info:', error);
    }
  };

  // Handle NFT minting
  const handleMintNFT = async () => {
    if (!web3auth || !userInfo?.walletAddress) {
      setError('Please connect your wallet first');
      return;
    }

    try {
      setIsMinting(true);
      setError(null);

      // 1. Mint the NFT on the blockchain
      const mintResult = await mintNFT(web3auth, 1, false);
      
      if (!mintResult.success) {
        throw new Error(mintResult.error || 'Mint transaction failed');
      }

      console.log('NFT minted successfully. Tx hash:', mintResult.txHash);

      // 2. After successful minting, generate the NFT art and upload to MinIO
      setIsGenerating(true);
      const generationResult = await generateAndUploadNFT();
      setResult(generationResult);

      if (!generationResult.success) {
        throw new Error(generationResult.message);
      }
    } catch (error) {
      console.error('Error minting NFT:', error);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMinting(false);
      setIsGenerating(false);
    }
  };

  // Render status badge for MinIO upload
  const getStatusBadge = (minioStatus?: 'success' | 'failed' | 'skipped') => {
    if (!minioStatus) return null;
    
    const badgeClasses = {
      success: 'bg-green-100 text-green-800 border-green-200',
      failed: 'bg-orange-100 text-orange-800 border-orange-200',
      skipped: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    
    const badgeText = {
      success: 'MinIO: Uploaded',
      failed: 'MinIO: Upload Failed',
      skipped: 'MinIO: Upload Skipped'
    };
    
    return (
      <span className={`text-xs px-2 py-1 rounded-full border ${badgeClasses[minioStatus]}`}>
        {badgeText[minioStatus]}
      </span>
    );
  };

  return (
    <div className="w-full bg-white shadow-md rounded-lg p-6">
      {isLoading ? (
        <div className="flex flex-col items-center py-12">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Connecting...</p>
        </div>
      ) : !web3auth?.connected && !userInfo ? (
        <div className="flex flex-col items-center py-12">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-md">
              {error}
              <button
                onClick={retryInit}
                className="mt-2 text-xs bg-red-600 text-white py-1 px-2 rounded hover:bg-red-700"
              >
                Retry Connection
              </button>
            </div>
          )}
          <button
            onClick={login}
            disabled={isLoading || !web3auth}
            className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            Connect Wallet or Login
          </button>
        </div>
      ) : (
        <div className="w-full flex flex-col items-center gap-6 p-6 bg-white rounded-lg shadow-md">
          {error && (
            <div className="w-full p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 mb-4">
              {error}
              {error.includes('Failed to connect to Web3Auth servers') && (
                <button 
                  onClick={retryInit}
                  className="ml-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Auth buttons */}
          <div className="w-full flex flex-col items-center gap-4">
            {!userInfo ? (
              <button
                onClick={login}
                disabled={isLoading || !web3auth}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors w-full max-w-xs"
              >
                {isLoading ? 'Connecting...' : 'Connect Wallet or Login'}
              </button>
            ) : (
              <div className="w-full flex flex-col items-center gap-4">
                {/* User info */}
                <div className="w-full flex flex-col items-center bg-gray-50 p-4 rounded-lg border border-gray-200">
                  {userInfo.profileImage && (
                    <div className="relative w-16 h-16 rounded-full overflow-hidden mb-2">
                      <Image 
                        src={userInfo.profileImage} 
                        alt="Profile" 
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  
                  <h3 className="font-medium text-lg">{userInfo.name || 'Anonymous User'}</h3>
                  {userInfo.email && <p className="text-sm text-gray-500">{userInfo.email}</p>}
                  
                  {userInfo.walletAddress && (
                    <div className="mt-2 bg-gray-100 p-2 rounded-md text-sm w-full max-w-xs overflow-hidden text-center">
                      <p className="text-xs text-gray-500 mb-1">Wallet Address:</p>
                      <p className="font-mono text-xs truncate text-gray-800">{userInfo.walletAddress}</p>
                    </div>
                  )}
                  
                  <button
                    onClick={logOut}
                    disabled={isLoading}
                    className="mt-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm"
                  >
                    Disconnect
                  </button>
                </div>
                
                {/* Admin Actions */}
                <div className="w-full flex flex-col items-center gap-3">
                  {/* Mint button */}
                  <button
                    onClick={handleMintNFT}
                    disabled={isMinting || isGenerating || !userInfo?.walletAddress}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-medium text-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors w-full max-w-xs"
                  >
                    {isMinting ? 'Minting on Blockchain...' : isGenerating ? 'Generating Art...' : 'Mint New Dog NFT'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Loading indicator */}
          {(isLoading || isMinting || isGenerating) && (
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              <p>
                {isLoading ? 'Initializing...' : 
                 isMinting ? 'Minting your NFT on the blockchain...' : 
                 isGenerating ? 'Generating your NFT art...' : 'Loading...'}
              </p>
            </div>
          )}

          {/* Result display */}
          {result && (
            <div className={`w-full p-6 rounded-lg border ${result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <h3 className={`text-xl font-semibold mb-3 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.success ? 'Success!' : 'Error'}
              </h3>
              
              <p className="mb-4">{result.message}</p>
              
              {result.errorDetails && (
                <div className="mt-2 mb-4 p-3 bg-gray-100 rounded-md text-sm text-gray-700 overflow-auto max-h-40">
                  <p className="font-medium">Error Details:</p>
                  <pre className="whitespace-pre-wrap">{result.errorDetails}</pre>
                </div>
              )}
              
              {result.success && result.imageUrl && (
                <div className="mt-6 flex flex-col items-center">
                  <div className="relative w-full max-w-md aspect-square border border-gray-200 rounded-lg overflow-hidden">
                    <Image
                      src={result.imageUrl}
                      alt={`NFT #${result.tokenId}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      style={{ objectFit: 'contain' }}
                      priority
                    />
                  </div>
                  
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <p className="text-sm text-gray-600">
                      NFT #{result.tokenId}
                    </p>
                    
                    <div className="flex items-center gap-2">
                      {getStatusBadge(result.minioStatus)}
                    </div>
                  </div>
                  
                  <button
                    onClick={handleMintNFT}
                    disabled={isMinting || isGenerating}
                    className="mt-6 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isMinting || isGenerating ? 'Processing...' : 'Mint Another'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 