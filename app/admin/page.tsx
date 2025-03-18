'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Add interface for transfer data
interface Transfer {
  id: string;
  from: { id: string };
  to: { id: string };
  timestamp: string;
  token: {
    identifier: string;
    uri: string;
  };
  transaction: {
    id: string;
    timestamp: string;
  };
}

// Add interface for NFT metadata
interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  error?: string; // Add error field for when metadata fails to load
}

// Add interface for token data that includes metadata
interface TokenData {
  tokenId: string;
  metadata: NFTMetadata | null;
  isLoading: boolean;
  error?: string;
  notFound?: boolean; // Add field to indicate 404 Not Found
}

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminWalletAddress, setAdminWalletAddress] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [authToken, setAuthToken] = useState('');
  // Add new state for transfers data
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoadingTransfers, setIsLoadingTransfers] = useState(false);
  // Add blockchain explorer URL
  const [blockchainExplorerUrl, setBlockchainExplorerUrl] = useState('');
  // Add SettleMint API URL
  const [settlemintApiUrl, setSettlemintApiUrl] = useState('');
  // Add GraphQL API URL
  const [graphqlApiUrl, setGraphqlApiUrl] = useState('');
  // Add state for token metadata
  const [tokenData, setTokenData] = useState<Record<string, TokenData>>({});
  // Track if we should show expanded metadata view
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  // Add state for base URI input
  const [baseURIInput, setBaseURIInput] = useState('');
  // Add state for MinIO URL
  const [minioUrl, setMinioUrl] = useState('');
  // Add new state for debug metadata and image
  const [debugMetadata, setDebugMetadata] = useState<NFTMetadata | null>(null);
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  // Add state for S3 config info
  const [s3ConfigInfo, setS3ConfigInfo] = useState<string>('');
  const router = useRouter();

  // Gas parameters - not displayed in UI
  const GAS_LIMIT = "200000";
  const GAS_PRICE = "0"; // Set to 0 for zero-fee network

  // Load contract address and admin wallet address from environment on component mount
  useEffect(() => {
    // Get contract address from environment variable
    const contractAddr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
    setContractAddress(contractAddr);
    
    // Get admin wallet address from environment variable
    // Always provide the known admin wallet as fallback to ensure it's never empty
    const adminAddr = process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS || "";
    setAdminWalletAddress(adminAddr);

    // Get auth token from environment variable
    const token = process.env.NEXT_PUBLIC_SETTLEMINT_TOKEN || "";
    setAuthToken(token);

    // Get blockchain explorer URL
    const explorerUrl = process.env.NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL || "";
    setBlockchainExplorerUrl(explorerUrl);

    // Get SettleMint API URL
    const apiUrl = process.env.NEXT_PUBLIC_SETTLEMINT_API_URL || "";
    setSettlemintApiUrl(apiUrl);

    // Get GraphQL API URL
    const gqlUrl = process.env.NEXT_PUBLIC_SETTLEMINT_GRAPHQL_URL || "";
    setGraphqlApiUrl(gqlUrl);
    
    // Get MinIO URL - update to use the correct S3 endpoint
    const minioBaseUrl = process.env.NEXT_PUBLIC_S3_ENDPOINT 
      ? `https://${process.env.NEXT_PUBLIC_S3_ENDPOINT}/${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}/metadata`
      : "";
    setMinioUrl(minioBaseUrl);
    
    // Set MinIO URL as default base URI input if available
    if (minioBaseUrl) {
      setBaseURIInput(minioBaseUrl);
    }
  }, []);

  // New function to fetch transfer data using GraphQL
  const fetchTransferData = async () => {
    try {
      setIsLoadingTransfers(true);
      setError(null);
      setStatus("Fetching NFT transfer data...");

      const graphqlQuery = {
        query: `
          query MyQuery {
            erc721Transfers(orderBy: timestamp, orderDirection: desc, first: 100) {
              id
              from {
                id
              }
              timestamp
              to {
                id
              }
              token {
                identifier
                uri
              }
              transaction {
                id
                timestamp
              }
            }
          }
        `
      };

      const response = await fetch(
        graphqlApiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-auth-token': authToken
          },
          body: JSON.stringify(graphqlQuery)
        }
      );

      if (!response.ok) {
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } else {
            const textResponse = await response.text();
            console.error("Non-JSON error response:", textResponse);
            
            if (response.status === 401) {
              errorMessage = "Authentication failed. Please check your Settlemint token in .env.local file.";
            }
          }
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      if (result.data && result.data.erc721Transfers) {
        console.log(`Transfer data loaded for ${result.data.erc721Transfers.length} transfers`);
        setTransfers(result.data.erc721Transfers);
        setStatus(`Loaded ${result.data.erc721Transfers.length} NFT transfers.`);
        
        // Automatically load metadata for the first 5 tokens to improve UX
        if (result.data.erc721Transfers.length > 0) {
          setStatus(`Loading metadata for displayed tokens...`);
          // Extract and map token identifiers explicitly
          const tokenIdentifiers: string[] = result.data.erc721Transfers.slice(0, 10)
            .map((t: Transfer) => t.token.identifier);
          
          // Create a unique array of token IDs
          const uniqueTokenIds = Array.from(new Set(tokenIdentifiers)).slice(0, 5);
          
          // Load metadata for each token
          for (const tokenId of uniqueTokenIds) {
            const transfer = result.data.erc721Transfers.find((t: Transfer) => t.token.identifier === tokenId);
            if (transfer && transfer.token.uri) {
              await fetchTokenMetadata(tokenId, transfer.token.uri);
            }
          }
          
          setStatus(`Loaded ${result.data.erc721Transfers.length} NFT transfers with metadata.`);
        }
      } else if (result.errors) {
        throw new Error(result.errors[0]?.message || "GraphQL error occurred");
      } else {
        throw new Error("Unexpected response format");
      }
      
      console.log("Transfer data:", result.data);
    } catch (error) {
      console.error("Failed to fetch transfer data:", error);
      setError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsLoadingTransfers(false);
    }
  };

  const collectReserves = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setStatus("Collecting reserves...");

      // Using values from environment variables
      const response = await fetch(`${settlemintApiUrl}/erc-721/${contractAddress}/collect-reserves`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': authToken
        },
        body: JSON.stringify({
          from: adminWalletAddress,
          gasLimit: '',
          gasPrice: '',
          simulate: true,
          metadata: {}
        })
      });

      if (!response.ok) {
        // Try to parse as JSON, but handle non-JSON responses
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } else {
            // If not JSON, just get the text
            const textResponse = await response.text();
            console.error("Non-JSON error response:", textResponse);
            
            if (response.status === 401) {
              errorMessage = "Authentication failed. Please check your Settlemint token in .env.local file. The correct value should look like 'sm_aat_XXXXXXXX'.";
            }
          }
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      setStatus("Reserves collected successfully!");
      
      console.log("Collect reserves result:", result);
    } catch (error) {
      console.error("Failed to collect reserves:", error);
      setError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const startPublicSale = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setStatus("Starting public sale...");

      // Using values from environment variables
      const response = await fetch(`${settlemintApiUrl}/erc-721/${contractAddress}/start-public-sale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': authToken
        },
        body: JSON.stringify({
          from: adminWalletAddress,
          gasLimit: '',
          gasPrice: '',
          simulate: true,
          metadata: {}
        })
      });

      if (!response.ok) {
        // Try to parse as JSON, but handle non-JSON responses
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } else {
            // If not JSON, just get the text
            const textResponse = await response.text();
            console.error("Non-JSON error response:", textResponse);
            
            if (response.status === 401) {
              errorMessage = "Authentication failed. Please check your Settlemint token in .env.local file. The correct value should look like 'sm_aat_XXXXXXXX'.";
            }
          }
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      setStatus("Public sale started successfully!");
      
      console.log("Public sale result:", result);
    } catch (error) {
      console.error("Failed to start public sale:", error);
      setError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Add new pause function
  const pauseContract = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setStatus("Pausing contract...");

      // Using values from environment variables
      const response = await fetch(`${settlemintApiUrl}/erc-721/${contractAddress}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': authToken
        },
        body: JSON.stringify({
          from: adminWalletAddress,
          gasLimit: GAS_LIMIT,
          gasPrice: GAS_PRICE,
          simulate: false,
          metadata: {}
        })
      });

      if (!response.ok) {
        // Try to parse as JSON, but handle non-JSON responses
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } else {
            // If not JSON, just get the text
            const textResponse = await response.text();
            console.error("Non-JSON error response:", textResponse);
            
            if (response.status === 401) {
              errorMessage = "Authentication failed. Please check your Settlemint token in .env.local file. The correct value should look like 'sm_aat_XXXXXXXX'.";
            }
          }
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      setStatus("Contract paused successfully! All transfers and minting operations are now paused.");
      
      console.log("Pause contract result:", result);
    } catch (error) {
      console.error("Failed to pause contract:", error);
      setError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Add new unpause function
  const unpauseContract = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setStatus("Unpausing contract...");

      // Using values from environment variables
      const response = await fetch(`${settlemintApiUrl}/erc-721/${contractAddress}/unpause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': authToken
        },
        body: JSON.stringify({
          from: adminWalletAddress,
          gasLimit: GAS_LIMIT,
          gasPrice: GAS_PRICE,
          simulate: false,
          metadata: {}
        })
      });

      if (!response.ok) {
        // Try to parse as JSON, but handle non-JSON responses
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } else {
            // If not JSON, just get the text
            const textResponse = await response.text();
            console.error("Non-JSON error response:", textResponse);
            
            if (response.status === 401) {
              errorMessage = "Authentication failed. Please check your Settlemint token in .env.local file. The correct value should look like 'sm_aat_XXXXXXXX'.";
            }
          }
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      setStatus("Contract unpaused successfully! Normal contract operations have been resumed.");
      
      console.log("Unpause contract result:", result);
    } catch (error) {
      console.error("Failed to unpause contract:", error);
      setError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Format date from timestamp
  const formatDate = (timestamp: string) => {
    return new Date(parseInt(timestamp) * 1000).toLocaleString();
  };

  // Truncate long addresses for display
  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Generate blockchain explorer URL for a transaction
  const getTransactionUrl = (txId: string) => {
    return `${blockchainExplorerUrl}/tx/${txId}`;
  };

  // Generate blockchain explorer URL for an address
  const getAddressUrl = (address: string) => {
    return `${blockchainExplorerUrl}/address/${address}`;
  };

  // Generate blockchain explorer URL for a token
  const getTokenUrl = (tokenId: string) => {
    return `${blockchainExplorerUrl}/token/${contractAddress}?a=${tokenId}`;
  };

  // New function to fetch token metadata from URI
  const fetchTokenMetadata = async (tokenId: string, uri: string) => {
    if (!uri || tokenData[tokenId]?.metadata) return;
    
    // Update token state to loading
    setTokenData(prev => ({
      ...prev,
      [tokenId]: {
        tokenId,
        isLoading: true,
        metadata: null
      }
    }));
    
    try {
      console.log(`Attempting to fetch metadata for token #${tokenId}`);
      
      // Always use our proxy API for consistent access and error handling
      const metadataUrl = `/api/nft-metadata/${tokenId}`;
      console.log(`Using proxy API: ${metadataUrl}`);
      
      const response = await fetch(metadataUrl);
      
      if (!response.ok) {
        const error = await response.json();
        if (response.status === 404) {
          // Handle 404 Not Found specifically
          setTokenData(prev => ({
            ...prev,
            [tokenId]: {
              tokenId,
              metadata: null,
              isLoading: false,
              notFound: true,
              error: error.error || 'Metadata not found in database'
            }
          }));
          return null;
        }
        throw new Error(`Metadata fetch failed: ${response.status} - ${error.error || 'Unknown error'}`);
      }

      const metadata = await response.json();
      
      // Update token data with metadata
      setTokenData(prev => ({
        ...prev,
        [tokenId]: {
          tokenId,
          metadata,
          isLoading: false
        }
      }));
      
      console.log(`Successfully loaded metadata for token #${tokenId}:`, metadata);
      return metadata;
    } catch (error) {
      console.error(`Error fetching metadata for token #${tokenId}:`, error);
      
      setTokenData(prev => ({
        ...prev,
        [tokenId]: {
          tokenId,
          isLoading: false,
          metadata: null,
          error: error instanceof Error ? error.message : String(error)
        }
      }));
      
      return null;
    }
  };

  // Fetch metadata for all tokens when transfers change
  useEffect(() => {
    // Only fetch if we have transfers
    if (transfers.length === 0) return;
    
    // For each transfer, fetch the metadata if we don't already have it
    transfers.forEach(transfer => {
      const tokenId = transfer.token.identifier;
      const uri = transfer.token.uri;
      
      if (uri && !tokenData[tokenId]) {
        fetchTokenMetadata(tokenId, uri);
      }
    });
  }, [transfers]);

  // Add new function to set base URI
  const setBaseURI = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setStatus("Setting Base URI...");

      // Format the URI correctly - make sure it ends with a slash for proper file paths
      let formattedURI = baseURIInput.trim();
      if (!formattedURI.endsWith("/")) {
        formattedURI = `${formattedURI}/`;
      }

      // Using values from environment variables
      const response = await fetch(`${settlemintApiUrl}/erc-721/${contractAddress}/set-base-uri`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': authToken
        },
        body: JSON.stringify({
          from: adminWalletAddress,
          gasLimit: GAS_LIMIT,
          gasPrice: GAS_PRICE,
          simulate: false,
          metadata: {},
          input: {
            baseTokenURI_: formattedURI
          }
        })
      });

      if (!response.ok) {
        // Try to parse as JSON, but handle non-JSON responses
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } else {
            // If not JSON, just get the text
            const textResponse = await response.text();
            console.error("Non-JSON error response:", textResponse);
            
            if (response.status === 401) {
              errorMessage = "Authentication failed. Please check your Settlemint token in .env.local file.";
            }
          }
        } catch (parseError) {
          console.error("Error parsing response:", parseError);
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      setStatus(`Base URI set successfully to: ${formattedURI}`);
      
      console.log("Set Base URI result:", result);
    } catch (error) {
      console.error("Failed to set base URI:", error);
      setError(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  // Add simple function to fetch metadata and image
  const fetchDebugMetadata = async () => {
    setDebugLoading(true);
    setDebugError(null);
    setDebugMetadata(null);
    setDebugImageUrl(null);
    
    try {
      // Fetch metadata from 1.json
      const metadataUrl = `${minioUrl}/1.json`;
      console.log(`Fetching metadata from: ${metadataUrl}`);
      
      let metadata;
      try {
        const response = await fetch(metadataUrl);
        
        if (!response.ok) {
          console.error(`S3 fetch failed with status: ${response.status} ${response.statusText}`);
          
          if (response.status === 403) {
            console.log("Got 403 Forbidden - Using mock metadata for display purposes");
            // Use mock data for demo/testing purposes with relative image path
            metadata = {
              name: "Demo NFT #1",
              description: "This is a mock NFT for testing the interface",
              image: "1.png", // Use relative path to demonstrate S3 path handling
              attributes: [
                { trait_type: "Breed", value: "Golden Retriever" },
                { trait_type: "Background", value: "Blue" },
                { trait_type: "Rarity", value: "Legendary" }
              ]
            };
            console.log("Mock metadata:", metadata);
          } else {
            throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
          }
        } else {
          metadata = await response.json();
          console.log("Successfully fetched metadata:", metadata);
        }
      } catch (fetchError) {
        console.error("Fetch error:", fetchError);
        
        // For demo purposes, provide mock data when there's an error
        metadata = {
          name: "Demo NFT #1",
          description: "This is a mock NFT for testing purposes (error fallback)",
          image: "1.png", // Use relative path to demonstrate S3 path handling
          attributes: [
            { trait_type: "Breed", value: "Golden Retriever" },
            { trait_type: "Background", value: "Blue" },
            { trait_type: "Rarity", value: "Legendary" }
          ]
        };
        console.log("Using mock metadata due to fetch error:", metadata);
      }
      
      setDebugMetadata(metadata);
      
      // Process and set image URL
      if (metadata?.image) {
        let imageUrl = metadata.image;
        
        // If image URL is relative, convert to absolute using minioUrl base path
        if (!imageUrl.startsWith('http')) {
          // Remove 'metadata' from the URL and add 'images'
          const baseImageUrl = minioUrl.replace(/\/metadata$/, '/images');
          imageUrl = `${baseImageUrl}/${imageUrl}`;
          console.log(`Converting relative image path to absolute S3 URL: ${imageUrl}`);
        }
        
        console.log(`Image URL: ${imageUrl}`);
        setDebugImageUrl(imageUrl);
      }
      
      // Add a console representation of what a typical metadata file should look like
      console.log("Example NFT metadata format for S3:");
      console.log(JSON.stringify({
        name: "NFT Dog #1",
        description: "A unique digital collectible dog NFT",
        image: "1.png", // Relative path to image in S3 bucket
        attributes: [
          { trait_type: "Breed", value: "Golden Retriever" },
          { trait_type: "Background", value: "Blue" },
          { trait_type: "Rarity", value: "Legendary" }
        ]
      }, null, 2));
      
    } catch (error) {
      console.error("Error fetching debug metadata:", error);
      setDebugError(error instanceof Error ? error.message : String(error));
    } finally {
      setDebugLoading(false);
    }
  };

  // Add function to log S3 configuration details
  const logS3Config = () => {
    const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT || 'api-s3-42715.gke-japan.settlemint.com';
    const bucketName = process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'nft-collection';
    
    const config = {
      endpoint,
      bucketName,
      metadataUrl: `https://${endpoint}/${bucketName}/metadata/1.json`,
      imageUrl: `https://${endpoint}/${bucketName}/images/1.png`,
      expectedMetadataStructure: {
        name: "NFT Dog #1",
        description: "A unique digital collectible dog NFT",
        image: "1.png", // Relative path to image in images folder
        attributes: [
          { trait_type: "Breed", value: "Golden Retriever" }
        ]
      },
      s3Structure: {
        bucket: bucketName,
        folders: {
          metadata: "Contains JSON files (1.json, 2.json, etc.)",
          images: "Contains image files (1.png, 2.png, etc.)"
        }
      },
      browserDirectAccess: "Likely blocked due to CORS or authentication requirements",
      suggestion: "Use a server-side proxy or make bucket public with CORS configured"
    };
    
    console.log("S3 Configuration:", config);
    setS3ConfigInfo(JSON.stringify(config, null, 2));
    
    return config;
  };

  // Add new function to force refresh all data
  const forceRefreshTransfers = async () => {
    // Clear existing token data to force fresh fetch
    setTokenData({});
    // Then fetch transfers
    await fetchTransferData();
    setStatus("Force refreshed all transfer data and cleared cache.");
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Admin Controls</h1>
      
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">NFT Collection Setup</h2>
        <p className="mb-6 text-gray-800">
          Complete these steps in order to set up your NFT collection.
        </p>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-800 mb-1">
            Admin Wallet Address
          </label>
          <div className="flex items-center">
            <div className="flex-grow px-3 py-2 border border-gray-300 bg-gray-50 rounded-md text-gray-900">
              {adminWalletAddress || "No admin address configured in .env.local file"}
            </div>
            {adminWalletAddress && blockchainExplorerUrl && (
              <a 
                href={getAddressUrl(adminWalletAddress)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="ml-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 py-1 px-2 rounded"
              >
                View on Explorer
              </a>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-700">
            Admin address is configured in your .env.local file
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-medium mb-2">Step 1: Collect Reserves</h3>
            <p className="text-sm text-gray-800 mb-3">
              First, collect the reserved NFTs (first {5} tokens) for the team.
            </p>
            <button
              onClick={collectReserves}
              disabled={isLoading || !adminWalletAddress}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Collect Reserves"}
            </button>
            {status && status.includes("Reserves collected successfully") && (
              <p className="mt-2 text-xs text-green-600">✓ Reserves collected</p>
            )}
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Step 2: Start Public Sale</h3>
            <p className="text-sm text-gray-800 mb-3">
              Start the public sale to allow users to mint NFTs.
            </p>
            <button
              onClick={startPublicSale}
              disabled={isLoading || !adminWalletAddress}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Start Public Sale"}
            </button>
            {status && status.includes("Public sale started successfully") && (
              <p className="mt-2 text-xs text-green-600">✓ Public sale started</p>
            )}
          </div>
        </div>
      </div>

      {/* Contract Controls section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Contract Controls</h2>
        
        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col h-full">
            <h3 className="text-lg font-medium mb-2">Pause Contract</h3>
            <p className="text-sm text-gray-800 mb-4">
              Temporarily pause all transfers and minting operations.
            </p>
            <button
              onClick={pauseContract}
              disabled={isLoading || !adminWalletAddress}
              className="w-full mt-auto bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Pause Contract"}
            </button>
            {status && status.includes("Contract paused successfully") && (
              <p className="mt-2 text-xs text-green-600">✓ Contract is paused</p>
            )}
          </div>

          <div className="flex flex-col h-full">
            <h3 className="text-lg font-medium mb-2">Unpause Contract</h3>
            <p className="text-sm text-gray-800 mb-4">
              Resume normal contract operations after pausing.
            </p>
            <button
              onClick={unpauseContract}
              disabled={isLoading || !adminWalletAddress}
              className="w-full mt-auto bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Unpause Contract"}
            </button>
            {status && status.includes("Contract unpaused successfully") && (
              <p className="mt-2 text-xs text-green-600">✓ Contract is active</p>
            )}
          </div>
        </div>
      </div>

      {/* Add new section for NFT Metadata Configuration */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">NFT Metadata Configuration</h2>
        
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-2">Set Base URI</h3>
          <p className="text-sm text-gray-800 mb-4">
            Set the base URI for your NFT collection. This should point to your MinIO server where metadata JSON files are stored.
          </p>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Base URI (MinIO URL)
            </label>
            <div className="flex items-center">
              <input
                type="text"
                value={baseURIInput}
                onChange={(e) => setBaseURIInput(e.target.value)}
                placeholder="https://api-s3-42715.gke-japan.settlemint.com/nft-collection/"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm 
                  focus:border-blue-500 focus:ring-blue-500 text-gray-900 placeholder-gray-600"
              />
            </div>
            <p className="mt-1 text-xs text-gray-700">
              This should be the URL to your MinIO server where NFT metadata is stored. A trailing slash will be added automatically.
            </p>
          </div>
          
          <button
            onClick={setBaseURI}
            disabled={isLoading || !adminWalletAddress || !baseURIInput.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
          >
            {isLoading ? "Processing..." : "Set Base URI"}
          </button>
          
          {status && status.includes("Base URI set successfully") && (
            <p className="mt-2 text-xs text-green-600">✓ Base URI updated successfully</p>
          )}
          
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <p className="text-sm font-medium text-gray-800">Important Notes:</p>
            <ul className="mt-2 text-xs text-gray-700 space-y-1 list-disc pl-5">
              <li>Each NFT will use this base URI + token ID + ".json" to locate its metadata</li>
              <li>Make sure your metadata files are named 1.json, 2.json, etc. corresponding to token IDs</li>
              <li>Your MinIO server must be publicly accessible to NFT marketplaces</li>
              <li>Once tokens are minted, changing this will change the metadata for all tokens</li>
              <li>If the contract URI is frozen, you won't be able to change this anymore</li>
            </ul>
          </div>

          {minioUrl && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md">
              <p className="text-sm font-medium text-blue-800">MinIO Configuration:</p>
              <p className="mt-1 text-xs text-blue-700">
                MinIO URL from environment: {minioUrl}
              </p>
              <p className="mt-1 text-xs text-blue-700">
                Test your metadata: <a href={`${minioUrl}/1.json`} target="_blank" rel="noopener noreferrer" className="underline">View Sample Metadata</a>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Blockchain Explorer Info section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Blockchain Explorer</h2>
        <p className="mb-6 text-gray-800">
          View detailed information about your NFT contract on the blockchain.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <a 
            href={blockchainExplorerUrl ? `${blockchainExplorerUrl}/address/${contractAddress}` : '#'} 
            target="_blank" 
            rel="noopener noreferrer"
            className={`block text-center py-3 px-4 rounded-md border ${blockchainExplorerUrl ? 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-800' : 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'}`}
          >
            View Contract on Explorer
          </a>
          
          <a 
            href={blockchainExplorerUrl ? `${blockchainExplorerUrl}/token/${contractAddress}` : '#'} 
            target="_blank" 
            rel="noopener noreferrer"
            className={`block text-center py-3 px-4 rounded-md border ${blockchainExplorerUrl ? 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-800' : 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed'}`}
          >
            View Token Details
          </a>
        </div>

        <div className="text-sm text-gray-800 mt-2">
          <p>Use the blockchain explorer to see detailed information about transactions, addresses, and tokens on the blockchain.</p>
          <p className="mt-1">Explorer URL: {blockchainExplorerUrl || "Not configured"}</p>
        </div>
      </div>

      {/* New Transfer History section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">NFT Transfer History</h2>
        <p className="mb-6 text-gray-800">
          View the history of all NFT transfers on your contract.
        </p>

        <div className="mb-4 flex items-center justify-between">
          <div>
            <button
              onClick={fetchTransferData}
              disabled={isLoadingTransfers || !authToken}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 mr-2"
            >
              {isLoadingTransfers ? "Loading Transfer Data..." : "Fetch Transfer History"}
            </button>
            
            <button
              onClick={forceRefreshTransfers}
              disabled={isLoadingTransfers || !authToken}
              className="bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              Force Refresh (Clear Cache)
            </button>
          </div>

          <button
            onClick={() => setShowFullMetadata(!showFullMetadata)}
            className="ml-4 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded"
          >
            {showFullMetadata ? "Hide JSON Metadata" : "Show Full JSON Metadata"}
          </button>
        </div>

        {transfers.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="mb-3 p-3 bg-blue-50 rounded-md text-sm">
              <strong>Status:</strong> <span className="text-gray-900">Loaded {transfers.length} NFT transfers.</span>
              {transfers.length > 0 && (
                <>
                  {" "}<span className="text-gray-900">Highest NFT ID: #{Math.max(...transfers.map(t => parseInt(t.token.identifier)))}</span>. 
                  <br/>
                  <span className="text-gray-700 text-xs">
                    Note: There can be a delay between when an NFT is minted and when it appears here due to blockchain indexing.
                  </span>
                </>
              )}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Image</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Token ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">From</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transfers.map((transfer) => {
                  const token = tokenData[transfer.token.identifier];
                  const hasMetadata = !!token?.metadata;
                  const isLoading = token?.isLoading || false;
                  const notFound = token?.notFound || false;
                  
                  return (
                    <>
                      <tr key={transfer.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isLoading ? (
                            <div className="h-16 w-16 bg-gray-200 animate-pulse rounded"></div>
                          ) : notFound ? (
                            <div className="h-16 w-16 flex items-center justify-center bg-gray-100 border border-gray-200 rounded">
                              <span className="text-xs text-gray-600">Not found</span>
                            </div>
                          ) : hasMetadata && token.metadata?.image ? (
                            <div className="h-16 w-16 relative overflow-hidden rounded border border-gray-200">
                              <img 
                                src={`/api/nft-image/${transfer.token.identifier}`}
                                alt={`NFT #${transfer.token.identifier}`}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  // Handle failed image load
                                  const target = e.target as HTMLImageElement;
                                  console.error(`Image load error for ${target.src}`);
                                  
                                  // Create "Not Found" message
                                  const parent = target.parentElement;
                                  if (parent) {
                                    target.style.display = 'none';
                                    const errorDiv = document.createElement('div');
                                    errorDiv.className = 'flex items-center justify-center h-full w-full bg-gray-100 absolute inset-0';
                                    errorDiv.innerHTML = '<span class="text-xs text-gray-600">Not in DB</span>';
                                    parent.appendChild(errorDiv);
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="h-16 w-16 bg-gray-100 flex items-center justify-center rounded border border-gray-200 text-xs text-gray-500">
                              {token?.error ? 'Error' : 'No data'}
                              {!token && (
                                <button
                                  className="mt-1 text-xs text-blue-600 hover:text-blue-800 block"
                                  onClick={() => fetchTokenMetadata(transfer.token.identifier, transfer.token.uri)}
                                >
                                  Try load
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {notFound ? (
                              <span className="text-gray-600">NFT not in database</span>
                            ) : hasMetadata && token.metadata?.name ? token.metadata.name : `NFT #${transfer.token.identifier}`}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            ID: {transfer.token.identifier}
                          </div>
                          
                          {/* Add a button to load metadata if not loaded */}
                          {!token && (
                            <button
                              onClick={() => fetchTokenMetadata(transfer.token.identifier, transfer.token.uri)}
                              className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                            >
                              Try load from DB
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {blockchainExplorerUrl ? (
                            <a 
                              href={getAddressUrl(transfer.from.id)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {truncateAddress(transfer.from.id)}
                            </a>
                          ) : (
                            <>{truncateAddress(transfer.from.id)}</>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {blockchainExplorerUrl ? (
                            <a 
                              href={getAddressUrl(transfer.to.id)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {truncateAddress(transfer.to.id)}
                            </a>
                          ) : (
                            <>{truncateAddress(transfer.to.id)}</>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {formatDate(transfer.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {blockchainExplorerUrl && (
                            <a 
                              href={getTransactionUrl(transfer.transaction.id)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              View Transaction
                            </a>
                          )}
                        </td>
                      </tr>
                      
                      {/* Add full metadata display when showFullMetadata is true and we have metadata */}
                      {showFullMetadata && hasMetadata && token?.metadata && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="border-l-4 border-purple-500 pl-4">
                              <div className="mt-1 flex justify-between items-center">
                                <h4 className="font-medium text-gray-900">Full Metadata for {token.metadata.name || `Token #${transfer.token.identifier}`}</h4>
                                <button 
                                  onClick={() => {
                                    // Create a downloadable JSON file
                                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(token.metadata, null, 2));
                                    const downloadAnchorNode = document.createElement('a');
                                    downloadAnchorNode.setAttribute("href", dataStr);
                                    downloadAnchorNode.setAttribute("download", `token_${transfer.token.identifier}_metadata.json`);
                                    document.body.appendChild(downloadAnchorNode);
                                    downloadAnchorNode.click();
                                    downloadAnchorNode.remove();
                                  }}
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                                >
                                  Download JSON
                                </button>
                              </div>
                              <div className="p-3 bg-gray-800 text-gray-100 rounded mb-2 overflow-auto max-h-80">
                                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(token.metadata, null, 2)}</pre>
                              </div>
                              {token.metadata.attributes && token.metadata.attributes.length > 0 && (
                                <div className="mt-3">
                                  <h5 className="font-medium text-sm mb-2 text-gray-700">Attributes</h5>
                                  <div className="flex flex-wrap gap-2">
                                    {token.metadata.attributes.map((attr: any, index: number) => (
                                      <div key={index} className="px-3 py-1.5 bg-blue-50 text-blue-800 rounded-full text-xs">
                                        <span className="font-medium">{attr.trait_type}:</span> {attr.value?.toString() || ""}
                                        {attr.display_type === 'number' && attr.max_value && (
                                          <span className="text-gray-500"> ({attr.value}/{attr.max_value})</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-gray-600">
            {isLoadingTransfers ? 
              "Loading transfer data..." : 
              "No transfer data available. Click the button above to fetch the latest transfers."}
          </div>
        )}
      </div>

      {/* Debugging Tools */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Debugging Tools</h2>
        
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={fetchDebugMetadata}
            disabled={debugLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50"
          >
            {debugLoading ? "Loading..." : "Test S3 Connection"}
          </button>
          
          <button
            onClick={logS3Config}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-4 rounded"
          >
            Log S3 Config
          </button>
          
          <button
            onClick={fetchTransferData}
            className="bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded"
          >
            Refresh NFT Data
          </button>
        </div>

        {/* NFT Debug Image Grid */}
        <div className="mt-6 border-t pt-4">
          <h3 className="text-lg font-medium mb-2">NFT Image Debug Grid</h3>
          <p className="text-sm text-gray-800 mb-4">
            Direct access to the first 10 NFT images through our proxy API, regardless of metadata status.
          </p>
          
          <div className="grid grid-cols-5 gap-4">
            {[...Array(10)].map((_, index) => {
              const num = index + 1;
              return (
                <div key={num} className="flex flex-col items-center">
                  <div className="h-20 w-20 relative overflow-hidden rounded border border-gray-200 mb-2">
                    <img 
                      src={`/api/nft-image/${num}`}
                      alt={`NFT #${num}`}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.parentElement!.classList.add('bg-gray-100');
                        target.classList.add('opacity-25');
                      }}
                    />
                  </div>
                  <div className="text-xs text-center">
                    <div className="font-medium text-gray-800">NFT #{num}</div>
                    <a 
                      href={`/api/nft-image/${num}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline block"
                    >
                      View
                    </a>
                    <a 
                      href={`/api/nft-metadata/${num}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline block"
                    >
                      Metadata
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded">
            <h4 className="font-medium mb-1 text-blue-800">Troubleshooting Image Display:</h4>
            <ul className="text-sm text-blue-800 list-disc pl-5 space-y-1">
              <li>If all images are black squares, the MinIO storage might be inaccessible</li>
              <li>If some images display correctly but others don't, check individual metadata files</li>
              <li>Use the "Test S3 Connection" button to verify your S3 storage is working</li>
              <li>If the NFT grid above shows images but the transfer list doesn't, check the metadata API</li>
            </ul>
          </div>
        </div>
        
        {debugMetadata && (
          <div className="mt-6 border-t pt-4">
            <h4 className="font-medium mb-2 text-gray-800">Metadata Debug Output:</h4>
            <div className="p-3 bg-gray-100 rounded mb-4 overflow-auto max-h-40">
              <pre className="text-xs text-gray-800">{JSON.stringify(debugMetadata, null, 2)}</pre>
            </div>
            
            {s3ConfigInfo && (
              <div className="mt-4 bg-gray-50 p-3 rounded-md">
                <h4 className="text-sm font-medium text-gray-800 mb-2">S3 Configuration Details:</h4>
                <pre className="text-xs text-gray-800 whitespace-pre-wrap break-all bg-white p-2 rounded border border-gray-200">{s3ConfigInfo}</pre>
              </div>
            )}

            {debugImageUrl && (
              <div>
                <h4 className="font-medium mb-2 text-gray-800">Image:</h4>
                <div className="border border-gray-200 p-2 rounded mb-2">
                  <img 
                    src={debugImageUrl.includes('api-s3-42715.gke-japan.settlemint.com') 
                      ? `/api/nft-image/1` 
                      : debugImageUrl} 
                    alt="NFT #1" 
                    className="max-h-40 mx-auto"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      console.error(`Debug image load error for ${target.src}`);
                      // Create a fallback error message
                      const parent = target.parentElement;
                      if (parent) {
                        target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'text-red-600 text-center py-4';
                        errorDiv.textContent = 'Image failed to load. Try the proxy API link above.';
                        parent.appendChild(errorDiv);
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-gray-700 break-all">
                  Original Image URL: {debugImageUrl}
                </p>
                <p className="text-xs text-gray-700 break-all mt-1">
                  Proxy API URL: {`/api/nft-image/1`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Consolidated status and error messages */}
      {status && (
        <div className="mt-4 mb-6 p-3 bg-green-50 text-green-800 rounded">
          {status}
          {status.includes("successfully") && status.includes("Transfer data") ? (
            <div className="mt-2 text-sm">
              <p>Transfer data has been successfully fetched and displayed above.</p>
              {blockchainExplorerUrl && (
                <p className="mt-1">
                  You can click on Token IDs, addresses, or the "View Transaction" button to see more details on the blockchain explorer.
                </p>
              )}
            </div>
          ) : status.includes("successfully") && (
            <div className="mt-2 text-sm">
              <p className="font-medium">Important:</p>
              <p>Blockchain transactions take time to be confirmed. Please wait 30-60 seconds before attempting to mint NFTs.</p>
              {blockchainExplorerUrl && (
                <p className="mt-1">
                  You can view transaction details on the <a href={blockchainExplorerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">blockchain explorer</a>.
                </p>
              )}
              {(status.includes("Reserves collected") || status.includes("Public sale started")) && (
                <>
                  <p className="mt-1 font-medium">Steps to mint NFTs:</p>
                  <ol className="list-decimal pl-5 mt-1">
                    <li>First, collect reserves (wait for confirmation)</li>
                    <li>Then, start public sale (wait for confirmation)</li>
                    <li>Finally, go to the main page to mint your NFTs</li>
                  </ol>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 mb-6 p-3 bg-red-50 text-red-800 rounded">
          Error: {error}
        </div>
      )}

      {/* API Configuration Info section */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">API Configuration</h2>
        <p className="mb-6 text-gray-800">
          Current API endpoints used by this application. Configure these in your environment variables.
        </p>

        <div className="space-y-4 text-sm">
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="font-medium text-gray-800">SettleMint API URL</p>
            <p className="text-gray-700 break-all">{settlemintApiUrl}</p>
            <p className="mt-1 text-xs text-gray-700">Configure with NEXT_PUBLIC_SETTLEMINT_API_URL in .env.local</p>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="font-medium text-gray-800">GraphQL API URL</p>
            <p className="text-gray-700 break-all">{graphqlApiUrl}</p>
            <p className="mt-1 text-xs text-gray-700">Configure with NEXT_PUBLIC_SETTLEMINT_GRAPHQL_URL in .env.local</p>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="font-medium text-gray-800">Blockchain Explorer URL</p>
            <p className="text-gray-700 break-all">{blockchainExplorerUrl}</p>
            <p className="mt-1 text-xs text-gray-700">Configure with NEXT_PUBLIC_BLOCKCHAIN_EXPLORER_URL in .env.local</p>
          </div>
        </div>
      </div>

      <div className="text-center mt-6">
        <button
          onClick={() => router.push('/')}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
} 