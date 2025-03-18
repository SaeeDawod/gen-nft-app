import { NextResponse } from 'next/server';
import { initializeMinioClient } from '@/utils/minioClient';
import fs from 'fs/promises';
import path from 'path';

// Helper function to get MinIO config from environment variables
function getMinioConfig() {
  return {
    enabled: true,
    endPoint: process.env.S3_ENDPOINT || '',
    port: parseInt(process.env.S3_API_PORT || '443', 10),
    useSSL: true,
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    bucketName: process.env.S3_BUCKET_NAME || 'nft-collection',
  };
}

// Convert stream to string
async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

// Generate fallback metadata when none exists
function generateFallbackMetadata(tokenId: string) {
  return {
    name: `NFT #${tokenId}`,
    description: "This NFT metadata is not available. No data found.",
    image: `/api/nft-image/${tokenId}`,
    attributes: [
      {
        trait_type: "Status",
        value: "Not Found"
      }
    ],
    timestamp: new Date().toISOString()
  };
}

// Helper function to check for metadata in local public folder
async function getLocalNFTMetadata(tokenId: string): Promise<any | null> {
  // Skip local file system check and always return null
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: { tokenId: string } }
) {
  try {
    const tokenId = params.tokenId;
    
    if (!tokenId) {
      return NextResponse.json({ error: 'Token ID is required' }, { status: 404 });
    }
    
    console.log(`Attempting to fetch metadata for NFT #${tokenId} from database only`);

    // Fetch directly from MinIO/S3 only
    const config = getMinioConfig();
    const minioClient = initializeMinioClient(config);
    
    if (!minioClient) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }
    
    // Try different possible paths for metadata
    const paths = [
      `metadata/${tokenId}.json`,  // Standard path
      `${tokenId}.json`,           // Root path
      `collections/metadata/${tokenId}.json` // Collection path
    ];
    
    let metadata: any = null;
    let foundInMinio = false;
    
    // Try each path
    for (const objectPath of paths) {
      try {
        console.log(`Trying MinIO metadata path: ${config.bucketName}/${objectPath}`);
        const dataStream = await minioClient.getObject(config.bucketName, objectPath);
        
        // Convert stream to string and parse JSON
        const jsonString = await streamToString(dataStream);
        metadata = JSON.parse(jsonString);
        console.log(`Successfully found metadata at: ${objectPath}`);
        foundInMinio = true;
        break; // Exit loop once found
      } catch (pathError) {
        // Continue to next path
      }
    }
    
    if (foundInMinio && metadata) {
      // Process the image URL to use our image proxy
      if (metadata.image) {
        metadata.image = `/api/nft-image/${tokenId}`;
      }
      
      return NextResponse.json(metadata, {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache', // Don't cache to ensure fresh data
        },
      });
    }
    
    // If not found in MinIO/S3, return 404
    console.log(`No metadata found for NFT #${tokenId} in database`);
    return NextResponse.json({ error: 'NFT metadata not found' }, { status: 404 });
  } catch (error) {
    console.error('Error in NFT metadata API route:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 