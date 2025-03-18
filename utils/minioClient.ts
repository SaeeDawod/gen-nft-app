import * as Minio from 'minio';
import fs from 'fs-extra';
import path from 'path';

// MinIO configuration type
export interface MinioConfig {
  enabled: boolean;
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucketName: string;
}

/**
 * Initialize a MinIO client using the provided configuration
 */
export function initializeMinioClient(config: MinioConfig): Minio.Client | null {
  if (!config.enabled) {
    return null;
  }
  
  // Verify we have all required credentials
  if (!config.endPoint || !config.accessKey || !config.secretKey) {
    console.warn('Missing MinIO credentials. Upload will be skipped.');
    return null;
  }
  
  try {
    // Make sure we don't have trailing slashes on the endpoint
    const cleanEndpoint = config.endPoint.replace(/\/+$/, '');
    
    // Create MinIO client - keep it simple like the working script
    const minioClient = new Minio.Client({
      endPoint: cleanEndpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey
    });
    
    return minioClient;
  } catch (error) {
    console.error('Error initializing MinIO client:', error);
    return null;
  }
}

/**
 * Upload a file to MinIO
 */
export async function uploadToMinio(
  minioClient: Minio.Client, 
  filePath: string, 
  targetKey: string, 
  bucketName: string,
  endpoint: string  // Pass the endpoint to use for URL generation
): Promise<string | null> {
  try {
    // Determine the content type based on file extension
    let contentType = 'application/octet-stream';
    if (filePath.endsWith('.png')) {
      contentType = 'image/png';
    } else if (filePath.endsWith('.json')) {
      contentType = 'application/json';
    }
    
    // Check if bucket exists, create it if not
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName);
      console.log(`Created bucket: ${bucketName}`);
    }
    
    // Upload file
    await minioClient.fPutObject(
      bucketName,
      targetKey,
      filePath,
      { 'Content-Type': contentType }
    );
    
    console.log(`Uploaded ${filePath} to ${bucketName}/${targetKey}`);
    
    // Use the passed endpoint parameter for URL construction
    return `https://${endpoint}/${bucketName}/${targetKey}`;
  } catch (error) {
    console.error(`Error uploading ${filePath}:`, error);
    return null;
  }
}

/**
 * Test connection to MinIO by trying to list buckets
 */
async function testMinioConnection(minioClient: Minio.Client): Promise<boolean> {
  try {
    // Simple connection test - just like the working script
    await minioClient.listBuckets();
    console.log("✅ Successfully connected to MinIO server");
    return true;
  } catch (error) {
    console.error(`Error connecting to MinIO server:`, error);
    return false;
  }
}

/**
 * Upload the NFT image and metadata to MinIO
 */
export async function uploadNFTToMinio(
  config: MinioConfig,
  imagePath: string,
  metadataPath: string
): Promise<boolean> {
  console.log(`\nAttempting to connect to MinIO at: ${config.endPoint} (Port: ${config.port})`);
  
  const minioClient = initializeMinioClient(config);
  
  if (!minioClient) {
    console.log('MinIO client not initialized or uploads disabled. Skipping upload.');
    return false;
  }
  
  // Test connection
  const connectionSuccess = await testMinioConnection(minioClient);
  if (!connectionSuccess) {
    console.error(`❌ Error connecting to MinIO server`);
    console.error("Please check your MinIO configuration, especially endpoint and port.");
    console.error("Common issues:");
    console.error("1. Make sure you're using the API endpoint, not the user interface endpoint");
    console.error(`2. Check if port ${config.port} is correct for your API endpoint`);
    console.error("3. Verify your access key and secret key");
    
    console.log("⚠️ MinIO upload skipped. NFT was saved locally only.");
    return false;
  }
  
  try {
    console.log(`\nUploading files to MinIO bucket: ${config.bucketName}`);
    
    // Upload image
    const imageFilename = path.basename(imagePath);
    const imageUrl = await uploadToMinio(
      minioClient,
      imagePath,
      `images/${imageFilename}`,
      config.bucketName,
      config.endPoint  // Pass the endpoint for URL generation
    );
    
    // Check if we need to update the metadata file with the correct absolute URL
    try {
      const metadataContent = await fs.readJson(metadataPath);
      
      // If the metadata has a relative image path, update it to absolute URL
      if (metadataContent.image && !metadataContent.image.startsWith('http')) {
        metadataContent.image = `https://${config.endPoint}/${config.bucketName}/images/${imageFilename}`;
        await fs.writeJson(metadataPath, metadataContent, { spaces: 2 });
        console.log('Updated metadata with absolute image URL');
      }
    } catch (err) {
      console.warn('Could not update metadata with absolute URL:', err);
    }
    
    // Upload metadata
    const metadataFilename = path.basename(metadataPath);
    const metadataUrl = await uploadToMinio(
      minioClient,
      metadataPath,
      `metadata/${metadataFilename}`,
      config.bucketName,
      config.endPoint  // Pass the endpoint for URL generation
    );
    
    console.log('Upload complete!');
    console.log(`Your NFT image should be available at: ${imageUrl}`);
    console.log(`Your NFT metadata should be available at: ${metadataUrl}`);
    return true;
  } catch (error) {
    console.error('Error uploading files to MinIO:', error);
    console.log("⚠️ MinIO upload failed. NFT was saved locally only.");
    return false;
  }
}

/**
 * Find the highest NFT number in the output directory
 */
export async function getLastNFTNumber(outputDir: string): Promise<number> {
  const imagesDir = path.join(outputDir, 'images');
  
  try {
    // Ensure the directory exists
    await fs.ensureDir(imagesDir);
    
    // Read the directory
    const files = await fs.readdir(imagesDir);
    
    // Filter for PNG files and extract numbers
    const nftNumbers = files
      .filter((file: string) => file.endsWith('.png'))
      .map((file: string) => {
        const numberStr = file.replace('.png', '');
        return parseInt(numberStr, 10);
      })
      .filter((num: number) => !isNaN(num));
    
    if (nftNumbers.length === 0) {
      return 0; // No NFTs yet
    }
    
    // Return the highest number
    return Math.max(...nftNumbers);
  } catch (error) {
    console.error('Error getting last NFT number:', error);
    return 0;
  }
} 