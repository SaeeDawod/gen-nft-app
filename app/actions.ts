'use server';

import { generateNFT, DEFAULT_CONFIG } from '@/utils/nftGenerator';
import { getLastNFTNumber } from '@/utils/minioClient';
import { uploadNFTToMinio } from '@/utils/minioClient';
import { getMinioConfig, validateMinioConfig } from '@/utils/config';
import path from 'path';
import fs from 'fs-extra';

// Add headers from environment variables
const API_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.API_KEY || ''}`,
  'X-App-ID': process.env.APP_ID || ''
};

// Get SettleMint API URL from environment variables
const SETTLEMINT_API_URL = process.env.NEXT_PUBLIC_SETTLEMINT_API_URL || '';

// Get NFT contract address from environment variables
const NFT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';

// Get auth token from environment
const AUTH_TOKEN = process.env.NEXT_PUBLIC_SETTLEMINT_TOKEN || '';

export interface GenerationResult {
  success: boolean;
  message: string;
  tokenId?: number;
  imageUrl?: string;
  minioStatus?: 'success' | 'failed' | 'skipped';
  errorDetails?: string;
  folderName?: string;
  minioImageUrl?: string;
  minioMetadataUrl?: string;
  fromBlockchain?: boolean;
}

// Add this function to generate MinIO URLs
function getMinioUrls(
  config: ReturnType<typeof getMinioConfig>,
  tokenId: number,
  folderPath: string = ''
): { imageUrl: string; metadataUrl: string } {
  // Create the base path, with optional folder
  const basePath = folderPath 
    ? `${config.bucketName}/${folderPath}`
    : config.bucketName;
    
  return {
    imageUrl: `https://${config.endPoint}/${basePath}/images/${tokenId}.png`,
    metadataUrl: `https://${config.endPoint}/${basePath}/metadata/${tokenId}.json`,
  };
}

/**
 * Generate a new dog NFT with timestamp and upload to MinIO
 */
export async function generateAndUploadNFT(): Promise<GenerationResult> {
  try {
    // Get the MinIO configuration
    const minioConfig = getMinioConfig();
    
    // Validate the configuration
    const configValid = validateMinioConfig(minioConfig);
    let minioStatus: 'success' | 'failed' | 'skipped' = configValid ? 'failed' : 'skipped';
    let errorDetails = '';
    let fromBlockchain = false;
    
    console.log(`MinIO configuration valid: ${configValid}`);
    if (configValid) {
      console.log(`Using MinIO endpoint: ${minioConfig.endPoint}:${minioConfig.port}, SSL: ${minioConfig.useSSL}`);
    }
    
    // Try to get the token ID from the blockchain first
    let nextTokenId;
    
    // Use the API endpoint to get total supply - following the app's consistent pattern
    try {
      console.log(`Fetching total supply from blockchain...`);

      // Using values from environment variables - exactly like in admin page
      const response = await fetch(`${SETTLEMINT_API_URL}/erc-721/${NFT_CONTRACT_ADDRESS}/total-supply`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': AUTH_TOKEN
        }
      });

      if (!response.ok) {
        // Try to parse as JSON, but handle non-JSON responses - same error handling as admin page
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
      
      console.log("Total supply result:", result);
      
      // Handle different response formats - could be an object with totalSupply property
      // or could be the number directly
      let totalSupply;
      
      if (typeof result === 'number') {
        // Result is directly the number
        totalSupply = result;
      } else if (result && typeof result === 'object') {
        // Result is an object, check various possible property names
        if (result.totalSupply !== undefined) {
          totalSupply = result.totalSupply;
        } else if (result.total !== undefined) {
          totalSupply = result.total;
        } else if (result.supply !== undefined) {
          totalSupply = result.supply;
        } else if (result.count !== undefined) {
          totalSupply = result.count;
        } else if (result.value !== undefined) {
          totalSupply = result.value;
        }
      }
      
      // Check if we found a valid total supply value
      if (totalSupply !== undefined) {
        // Convert to number if it's a string
        const numericTotalSupply = typeof totalSupply === 'string' 
          ? parseInt(totalSupply, 10) 
          : totalSupply;
          
        // In this contract, the token ID is already pre-incremented during minting
        // so totalSupply equals the highest token ID.
        // Next token ID should be totalSupply + 1
        nextTokenId = numericTotalSupply + 1;
        
        // Log that we're using a value from blockchain API
        console.log(`Using next token ID from blockchain API: ${nextTokenId}`);
        
        // Mark that we're using data from the blockchain
        fromBlockchain = true;
      } else {
        // Log the full response to help with debugging
        console.error("Response does not contain totalSupply. Full response:", JSON.stringify(result));
        throw new Error("Unexpected API response format: missing totalSupply field");
      }
    } catch (error) {
      console.error("Failed to fetch total supply:", error);
      
      // Instead of falling back to local files, return an error with detailed info
      return {
        success: false,
        message: "Failed to get token ID from blockchain",
        errorDetails: error instanceof Error ? error.message : "Could not retrieve total supply from the blockchain. Please check your connection and try again.",
        fromBlockchain: false
      };
    }
    
    // Create a custom config with S3 endpoint information if available
    const customConfig = {
      ...DEFAULT_CONFIG,
      outputDir: path.join(process.cwd(), 'public/output'),
      // Only add these if config is valid
      ...(configValid ? {
        s3Endpoint: minioConfig.endPoint,
        s3BucketName: minioConfig.bucketName
      } : {})
    };
    
    // Generate the NFT with the custom config
    const { imagePath, metadataPath } = await generateNFT(nextTokenId, customConfig);
    
    // Log the metadata content for debugging
    try {
      const metadataContent = fs.readFileSync(metadataPath, 'utf8');
      console.log('=== NEW NFT METADATA ===');
      console.log(metadataContent);
      console.log('========================');
    } catch (readError) {
      console.error('Error reading NFT metadata for logging:', readError);
    }
    
    // Upload to MinIO if configuration is valid
    if (configValid) {
      try {
        console.log('Attempting to upload to MinIO...');
        const uploaded = await uploadNFTToMinio(minioConfig, imagePath, metadataPath);
        minioStatus = uploaded ? 'success' : 'failed';
        
        if (!uploaded) {
          errorDetails = 'MinIO upload failed. Check server logs for details.';
          console.error('MinIO upload failed');
        }
      } catch (uploadError) {
        console.error('Error during MinIO upload:', uploadError);
        minioStatus = 'failed';
        errorDetails = uploadError instanceof Error ? uploadError.message : String(uploadError);
      }
    }
    
    // Return success even if MinIO upload failed, as the local file is still available
    const localMessage = minioStatus === 'success' 
      ? 'and uploaded to MinIO'
      : minioStatus === 'failed' 
        ? '(MinIO upload failed, but saved locally)'
        : '(MinIO upload skipped, saved locally only)';
    
    let minioImageUrl: string | undefined;
    let minioMetadataUrl: string | undefined;
    
    if (minioStatus === 'success') {
      const urls = getMinioUrls(minioConfig, nextTokenId);
      minioImageUrl = urls.imageUrl;
      minioMetadataUrl = urls.metadataUrl;
    }
    
    return {
      success: true,
      message: `NFT #${nextTokenId} generated ${localMessage}!`,
      tokenId: nextTokenId,
      imageUrl: `/output/images/${nextTokenId}.png`,
      minioStatus,
      errorDetails,
      minioImageUrl,
      minioMetadataUrl,
      fromBlockchain
    };
  } catch (error) {
    console.error('Error generating NFT:', error);
    return {
      success: false,
      message: `Error generating NFT: ${error instanceof Error ? error.message : String(error)}`,
      errorDetails: error instanceof Error ? error.stack : undefined
    };
  }
}

/**
 * Create a new collection folder and generate the first NFT for it
 * 
 * @param collectionName - The name of the new collection
 */
export async function createNewCollection(collectionName: string): Promise<GenerationResult> {
  try {
    // Sanitize collection name for folder use
    const folderName = collectionName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    if (!folderName) {
      return {
        success: false,
        message: 'Invalid collection name. Please provide a valid name.',
        errorDetails: 'Collection name resulted in an empty folder name after sanitization.'
      };
    }
    
    // Create collection folder structure
    const baseOutputDir = path.join(process.cwd(), 'public/collections', folderName);
    const outputImagesDir = path.join(baseOutputDir, 'images');
    const outputMetadataDir = path.join(baseOutputDir, 'metadata');
    
    // Ensure directories exist
    await fs.ensureDir(outputImagesDir);
    await fs.ensureDir(outputMetadataDir);
    
    console.log(`Created new collection directory: ${baseOutputDir}`);
    
    // Create customized config for this collection
    const collectionConfig = {
      ...DEFAULT_CONFIG,
      collectionName: collectionName,
      description: `${collectionName} - A unique NFT collection`,
      outputDir: baseOutputDir
    };
    
    // First NFT in the collection is always #1
    const tokenId = 1;
    
    // Generate the NFT with custom config and output location
    const { imagePath, metadataPath } = await generateNFT(tokenId, collectionConfig);
    
    // Log the metadata content for debugging
    try {
      const metadataContent = fs.readFileSync(metadataPath, 'utf8');
      console.log('=== NEW COLLECTION NFT METADATA ===');
      console.log(metadataContent);
      console.log('==================================');
    } catch (readError) {
      console.error('Error reading NFT metadata for logging:', readError);
    }
    
    // Get the MinIO configuration
    const minioConfig = getMinioConfig();
    
    // Validate the configuration
    const configValid = validateMinioConfig(minioConfig);
    let minioStatus: 'success' | 'failed' | 'skipped' = configValid ? 'failed' : 'skipped';
    let errorDetails = '';
    
    // Upload to MinIO if configuration is valid
    if (configValid) {
      try {
        console.log(`Attempting to upload to MinIO in collection: ${folderName}...`);
        
        // Modify MinIO upload to use collection-specific paths
        const customMinioConfig = {
          ...minioConfig,
          // Append collection name to bucket path or use subfolder
          bucketName: `${minioConfig.bucketName}/collections/${folderName}`
        };
        
        const uploaded = await uploadNFTToMinio(customMinioConfig, imagePath, metadataPath);
        minioStatus = uploaded ? 'success' : 'failed';
        
        if (!uploaded) {
          errorDetails = 'MinIO upload failed. Check server logs for details.';
          console.error('MinIO upload failed');
        }
      } catch (uploadError) {
        console.error('Error during MinIO upload:', uploadError);
        minioStatus = 'failed';
        errorDetails = uploadError instanceof Error ? uploadError.message : String(uploadError);
      }
    }
    
    // Return success even if MinIO upload failed, as the local file is still available
    const localMessage = minioStatus === 'success' 
      ? 'and uploaded to MinIO'
      : minioStatus === 'failed' 
        ? '(MinIO upload failed, but saved locally)'
        : '(MinIO upload skipped, saved locally only)';
    
    return {
      success: true,
      message: `New collection "${collectionName}" created with NFT #${tokenId} ${localMessage}!`,
      tokenId: tokenId,
      imageUrl: `/collections/${folderName}/images/${tokenId}.png`,
      minioStatus,
      errorDetails,
      folderName
    };
  } catch (error) {
    console.error('Error creating new collection:', error);
    return {
      success: false,
      message: `Error creating new collection: ${error instanceof Error ? error.message : String(error)}`,
      errorDetails: error instanceof Error ? error.stack : undefined
    };
  }
}

/**
 * Generate a new NFT for an existing collection
 * 
 * @param folderName - The folder name of the collection
 */
export async function generateNFTForCollection(folderName: string): Promise<GenerationResult> {
  try {
    // Verify collection exists
    const baseOutputDir = path.join(process.cwd(), 'public/collections', folderName);
    
    if (!fs.existsSync(baseOutputDir)) {
      return {
        success: false,
        message: `Collection "${folderName}" does not exist.`,
        errorDetails: `Directory not found: ${baseOutputDir}`
      };
    }
    
    // Get the last NFT number in this collection
    const lastTokenId = await getLastNFTNumber(baseOutputDir);
    const nextTokenId = lastTokenId + 1;
    
    // Get the MinIO configuration
    const minioConfig = getMinioConfig();
    
    // Validate the configuration
    const configValid = validateMinioConfig(minioConfig);
    
    // Create customized config for this collection
    const collectionConfig = {
      ...DEFAULT_CONFIG,
      collectionName: folderName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), // Convert back to title case
      description: `Part of the ${folderName.replace(/-/g, ' ')} collection`,
      outputDir: baseOutputDir,
      // Only add these if config is valid
      ...(configValid ? {
        s3Endpoint: minioConfig.endPoint,
        s3BucketName: minioConfig.bucketName
      } : {})
    };
    
    // Generate the NFT with custom config and output location
    const { imagePath, metadataPath } = await generateNFT(nextTokenId, collectionConfig);
    
    // Log the metadata content for debugging
    try {
      const metadataContent = fs.readFileSync(metadataPath, 'utf8');
      console.log('=== NEW COLLECTION NFT METADATA ===');
      console.log(metadataContent);
      console.log('==================================');
    } catch (readError) {
      console.error('Error reading NFT metadata for logging:', readError);
    }
    
    // Get the MinIO configuration
    let minioStatus: 'success' | 'failed' | 'skipped' = configValid ? 'failed' : 'skipped';
    let errorDetails = '';
    
    // Upload to MinIO if configuration is valid
    if (configValid) {
      try {
        console.log(`Attempting to upload to MinIO in collection: ${folderName}...`);
        
        // Modify MinIO upload to use collection-specific paths
        const customMinioConfig = {
          ...minioConfig,
          // Append collection name to bucket path or use subfolder
          bucketName: `${minioConfig.bucketName}/collections/${folderName}`
        };
        
        const uploaded = await uploadNFTToMinio(customMinioConfig, imagePath, metadataPath);
        minioStatus = uploaded ? 'success' : 'failed';
        
        if (!uploaded) {
          errorDetails = 'MinIO upload failed. Check server logs for details.';
          console.error('MinIO upload failed');
        }
      } catch (uploadError) {
        console.error('Error during MinIO upload:', uploadError);
        minioStatus = 'failed';
        errorDetails = uploadError instanceof Error ? uploadError.message : String(uploadError);
      }
    }
    
    // Return success even if MinIO upload failed, as the local file is still available
    const localMessage = minioStatus === 'success' 
      ? 'and uploaded to MinIO'
      : minioStatus === 'failed' 
        ? '(MinIO upload failed, but saved locally)'
        : '(MinIO upload skipped, saved locally only)';
    
    return {
      success: true,
      message: `NFT #${nextTokenId} for collection "${folderName}" generated ${localMessage}!`,
      tokenId: nextTokenId,
      imageUrl: `/collections/${folderName}/images/${nextTokenId}.png`,
      minioStatus,
      errorDetails,
      folderName
    };
  } catch (error) {
    console.error('Error generating NFT for collection:', error);
    return {
      success: false,
      message: `Error generating NFT: ${error instanceof Error ? error.message : String(error)}`,
      errorDetails: error instanceof Error ? error.stack : undefined
    };
  }
} 