'use client';

import { useState } from 'react';
import Image from 'next/image';
import { generateAndUploadNFT } from '@/app/actions';
import type { GenerationResult } from '@/app/actions';

export default function NFTGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const handleGenerateNFT = async () => {
    try {
      setIsGenerating(true);
      setResult(null);
      
      const result = await generateAndUploadNFT();
      setResult(result);
    } catch (error) {
      console.error('Error generating NFT:', error);
      setResult({
        success: false,
        message: `Something went wrong: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setIsGenerating(false);
    }
  };

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

  const getMinioLinks = (result: GenerationResult) => {
    if (!result.success || result.minioStatus !== 'success') return null;
    
    // Use the MinIO URLs directly from the server if available
    const imageLink = result.minioImageUrl || `https://${process.env.NEXT_PUBLIC_S3_ENDPOINT || 'api-s3-42715.gke-japan.settlemint.com'}/${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'nft-collection'}/images/${result.tokenId}.png`;
    const metadataLink = result.minioMetadataUrl || `https://${process.env.NEXT_PUBLIC_S3_ENDPOINT || 'api-s3-42715.gke-japan.settlemint.com'}/${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'nft-collection'}/metadata/${result.tokenId}.json`;
    
    return (
      <div className="flex flex-col gap-2 mt-4 text-sm">
        <p className="font-medium">View your NFT online:</p>
        <div className="flex flex-wrap gap-3">
          <a 
            href={imageLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            View Image
          </a>
          <a 
            href={metadataLink} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            View Metadata
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <button
        onClick={handleGenerateNFT}
        disabled={isGenerating}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? 'Generating...' : 'Generate New Dog NFT'}
      </button>

      {isGenerating && (
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          <p>Generating your NFT, please wait...</p>
        </div>
      )}

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
                  {result.fromBlockchain && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                      From Blockchain
                    </span>
                  )}
                </p>
                
                <div className="flex items-center gap-2">
                  {getStatusBadge(result.minioStatus)}
                  
                  {result.minioStatus === 'failed' && (
                    <button
                      onClick={handleGenerateNFT}
                      className="text-xs px-2 py-1 border border-blue-200 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      Retry Upload
                    </button>
                  )}
                </div>
                
                {/* Add the MinIO links here */}
                {result.minioStatus === 'success' && getMinioLinks(result)}
              </div>
              
              <button
                onClick={handleGenerateNFT}
                className="mt-6 px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Generate Another
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 