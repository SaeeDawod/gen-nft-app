import { NextResponse } from 'next/server';
import { initializeMinioClient } from '@/utils/minioClient';
import { Readable } from 'stream';
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

// Convert stream to buffer
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Basic placeholder fallback image when nothing else is available
async function getPlaceholderImage(): Promise<Buffer> {
  try {
    // Try to use existing placeholder from assets
    const placeholderPath = path.join(process.cwd(), 'public', 'assets', 'placeholder', 'placeholder.png');
    const fileExists = await fs.stat(placeholderPath).catch(() => false);
    
    if (fileExists) {
      return await fs.readFile(placeholderPath);
    }
  } catch (error) {
    console.error('Failed to load placeholder image:', error);
  }
  
  // If all fails, return a tiny 1x1 pixel
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x60, 0x00,
    0x00, 0x00, 0x04, 0x00, 0x01, 0xE8, 0x5B, 0x9E, 0x4D, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
}

// Helper function to check for image in local public folder - simplified
async function getLocalNFTImage(tokenId: string): Promise<Buffer | null> {
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
      // Return 404 instead of fallback
      return new NextResponse('Token ID is required', { status: 404 });
    }

    console.log(`Attempting to fetch image for NFT #${tokenId} from database only`);
    
    // Try MinIO/S3 only - no local files or fallbacks
    const config = getMinioConfig();
    const minioClient = initializeMinioClient(config);
    
    if (!minioClient) {
      // Return error instead of fallback
      return new NextResponse('Database connection failed', { status: 500 });
    }
    
    // Try standard path first
    let buffer: Buffer | null = null;
    let foundInMinio = false;
    
    // Define possible paths to check in order
    const paths = [
      `images/${tokenId}.png`,  // Standard path
      `metadata/images/${tokenId}.png`, // Alternative path
      `collections/images/${tokenId}.png` // Another possible path
    ];
    
    // Try each path
    for (const objectPath of paths) {
      try {
        console.log(`Trying MinIO path: ${config.bucketName}/${objectPath}`);
        const dataStream = await minioClient.getObject(config.bucketName, objectPath);
        buffer = await streamToBuffer(dataStream);
        console.log(`Successfully found image at: ${objectPath}`);
        foundInMinio = true;
        break; // Exit loop once found
      } catch (pathError) {
        // Continue to next path
      }
    }
    
    if (foundInMinio && buffer) {
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-cache' // Don't cache to ensure fresh data
        }
      });
    }
    
    // If image not found in MinIO/S3, return 404
    console.log(`No image found for NFT #${tokenId} in database`);
    return new NextResponse('NFT image not found', { status: 404 });
  } catch (error) {
    console.error('Error in NFT image API route:', error);
    return new NextResponse('Server error', { status: 500 });
  }
} 