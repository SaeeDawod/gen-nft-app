import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs-extra';
import path from 'path';

// Define types for NFT generation
export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
  timestamp: string;
}

interface LayerConfig {
  name: string;
  folder: string;
  required: boolean;
}

interface NFTConfig {
  collectionName: string;
  description: string;
  width: number;
  height: number;
  outputDir: string;
  layers: LayerConfig[];
  s3Endpoint?: string;  // Add optional S3 endpoint for URL generation
  s3BucketName?: string;  // Add optional bucket name for URL generation
}

interface LayerAttribute {
  name: string;
  trait: string;
  path: string;
}

// Default configuration
export const DEFAULT_CONFIG: NFTConfig = {
  collectionName: "Dog NFT Collection",
  description: "A collection of unique dog NFTs with timestamps",
  width: 1000,
  height: 1000,
  outputDir: "./public/output",
  layers: [
    {
      name: "Background",
      folder: "./public/assets/layers/backgrounds",
      required: true
    },
    {
      name: "Subject",
      folder: "./public/assets/layers/subjects",
      required: true
    }
  ]
};

/**
 * Get all available images for a layer
 */
export function getImagesForLayer(layerConfig: LayerConfig): LayerAttribute[] {
  let images: LayerAttribute[] = [];
  
  // Check if the layer folder exists
  if (!fs.existsSync(layerConfig.folder)) {
    console.log(`Warning: Folder does not exist: ${layerConfig.folder}`);
    return images;
  }

  // Get all image files in the folder
  const files = fs.readdirSync(layerConfig.folder)
    .filter(file => file.toLowerCase().endsWith(".png"));
  
  // Process each file
  files.forEach(file => {
    const fileName = file.replace(/\.[^/.]+$/, ""); // Remove file extension
    
    // Add the image to our collection
    images.push({
      name: layerConfig.name,
      trait: fileName,
      path: path.join(layerConfig.folder, file)
    });
  });
  
  return images;
}

/**
 * Create a random combination of layers for the NFT
 */
export function createRandomCombination(config: NFTConfig): LayerAttribute[] {
  let combination: LayerAttribute[] = [];
  
  // Go through each layer
  for (const layer of config.layers) {
    const images = getImagesForLayer(layer);
    
    // Skip if there are no images and the layer isn't required
    if (images.length === 0) {
      if (layer.required) {
        throw new Error(`Layer "${layer.name}" is required but has no images`);
      }
      continue;
    }
    
    // Randomly select an image
    const selectedImage = images[Math.floor(Math.random() * images.length)];
    
    // Add to our combination
    combination.push(selectedImage);
  }
  
  return combination;
}

/**
 * Add a timestamp to the canvas
 */
export function addTimestampToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): string {
  const timestamp = new Date().toISOString();
  
  // Configure text styling
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3;
  ctx.font = '30px Arial';
  ctx.textAlign = 'center';
  
  // Draw the text with a stroke for better visibility on any background
  ctx.strokeText(timestamp, width / 2, 50);
  ctx.fillText(timestamp, width / 2, 50);
  
  return timestamp;
}

/**
 * Generate a dog NFT with timestamp
 */
export async function generateNFT(tokenId: number, config = DEFAULT_CONFIG): Promise<{
  imagePath: string;
  metadataPath: string;
  metadata: NFTMetadata;
}> {
  console.log(`Generating NFT #${tokenId}...`);
  
  // Create output directories if they don't exist
  fs.ensureDirSync(path.join(config.outputDir, 'images'));
  fs.ensureDirSync(path.join(config.outputDir, 'metadata'));
  
  // Create the canvas
  const canvas = createCanvas(config.width, config.height);
  const ctx = canvas.getContext('2d');
  
  // Draw white background as default
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, config.width, config.height);
  
  // Get random combination of layers
  const attributes = createRandomCombination(config);
  
  // Draw each layer
  for (const layer of attributes) {
    try {
      const image = await loadImage(layer.path);
      ctx.drawImage(image, 0, 0, config.width, config.height);
    } catch (error) {
      console.error(`Error loading image ${layer.path}:`, error);
    }
  }
  
  // Add timestamp to the NFT
  const timestamp = addTimestampToCanvas(ctx, config.width, config.height);
  
  // Save the image
  const outputImagePath = path.join(config.outputDir, 'images', `${tokenId}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputImagePath, buffer);
  
  // Determine the image URL - either relative or absolute
  let imageUrl = `${tokenId}.png`;
  
  // If S3 endpoint is provided, create a full URL
  if (config.s3Endpoint && config.s3BucketName) {
    // Create absolute URL for image
    imageUrl = `https://${config.s3Endpoint}/${config.s3BucketName}/images/${tokenId}.png`;
  }
  
  // Create metadata
  const metadata: NFTMetadata = {
    name: `${config.collectionName} #${tokenId}`,
    description: config.description,
    image: imageUrl,
    attributes: attributes.map(attr => ({
      trait_type: attr.name,
      value: attr.trait
    })),
    timestamp: timestamp
  };
  
  // Save metadata
  const outputMetadataPath = path.join(config.outputDir, 'metadata', `${tokenId}.json`);
  fs.writeFileSync(outputMetadataPath, JSON.stringify(metadata, null, 2));
  
  console.log(`Completed NFT #${tokenId}`);
  
  return {
    imagePath: outputImagePath,
    metadataPath: outputMetadataPath,
    metadata
  };
} 