import { MinioConfig } from './minioClient';

// Load environment variables
if (typeof window === 'undefined') {
  // This is server-side, we can directly import dotenv
  require('dotenv').config();
}

// Get the MinIO configuration from environment variables
export function getMinioConfig(): MinioConfig {
  // Get port as number, defaulting to 9000 for MinIO/S3 standard port
  const portStr = process.env.S3_API_PORT || '';
  const port = portStr ? parseInt(portStr, 10) : 9000;
  
  // Determine SSL based on port (usually 443 is SSL, 9000 isn't)
  const useSSL = port === 443;
  
  return {
    enabled: true,
    endPoint: process.env.S3_ENDPOINT || '',
    port: port,
    useSSL: useSSL,
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    bucketName: process.env.S3_BUCKET_NAME || 'nft-collection'
  };
}

// Validate the MinIO configuration
export function validateMinioConfig(config: MinioConfig): boolean {
  if (!config.endPoint) {
    console.error('Missing S3_ENDPOINT environment variable');
    return false;
  }
  if (!config.accessKey) {
    console.error('Missing S3_ACCESS_KEY environment variable');
    return false;
  }
  if (!config.secretKey) {
    console.error('Missing S3_SECRET_KEY environment variable');
    return false;
  }
  
  // Additional validation
  if (isNaN(config.port) || config.port <= 0) {
    console.error('Invalid S3_API_PORT - must be a positive number');
    return false;
  }
  
  return true;
} 