// modules/file-system.js
/**
 * Module for handling file system operations
 */

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

/**
 * Copy assets (images and attachments) from input to output directory
 * @param {string} inputDir Input directory
 * @param {string} outputDir Output directory
 * @returns {Promise<void>}
 */
async function copyAssets(inputDir, outputDir) {
  try {
    console.log('Copying assets...');
    
    // Copy images
    await copyImages(inputDir, outputDir);
    
    // Copy attachments directory if it exists
    const attachmentsDir = path.join(inputDir, 'attachments');
    if (fs.existsSync(attachmentsDir)) {
      await copyDirectory(
        attachmentsDir,
        path.join(outputDir, 'attachments')
      );
    }
    
    console.log('Assets copied successfully');
  } catch (err) {
    console.error('Error copying assets:', err);
    throw err;
  }
}

/**
 * Copy images from input directory to output/images
 * @param {string} inputDir Input directory
 * @param {string} outputDir Output directory
 * @returns {Promise<void>}
 */
async function copyImages(inputDir, outputDir) {
  try {
    // Create images directory in output
    const outImagesDir = path.join(outputDir, 'images');
    await fsPromises.mkdir(outImagesDir, { recursive: true });
    
    // Copy bullet_blue.gif if it exists
    const bulletPath = path.join(inputDir, 'images', 'bullet_blue.gif');
    if (fs.existsSync(bulletPath)) {
      await fsPromises.copyFile(bulletPath, path.join(outImagesDir, 'bullet_blue.gif'));
    }
    
    // Recursively find and copy all images
    await findAndCopyImages(inputDir, outImagesDir);
    
    console.log('Images copied successfully');
  } catch (err) {
    console.error('Error copying images:', err);
    throw err;
  }
}

/**
 * Recursively find and copy images from input directory
 * @param {string} dir Directory to search
 * @param {string} outputImagesDir Output images directory
 * @returns {Promise<void>}
 */
async function findAndCopyImages(dir, outputImagesDir) {
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip the output directory to avoid loops
        if (fullPath !== outputImagesDir && !fullPath.startsWith(outputImagesDir)) {
          await findAndCopyImages(fullPath, outputImagesDir);
        }
      } else if (isImageFile(entry.name)) {
        // Copy image file
        await fsPromises.copyFile(
          fullPath,
          path.join(outputImagesDir, entry.name)
        ).catch(err => {
          console.warn(`Warning: Could not copy image ${entry.name}:`, err.message);
        });
      }
    }
  } catch (err) {
    console.error(`Error processing directory ${dir}:`, err);
    // Continue with other directories
  }
}

/**
 * Check if a file is an image based on extension
 * @param {string} filename Filename to check
 * @returns {boolean} Whether the file is an image
 */
function isImageFile(filename) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
  const ext = path.extname(filename).toLowerCase();
  return imageExtensions.includes(ext);
}

/**
 * Copy a directory recursively
 * @param {string} src Source directory
 * @param {string} dest Destination directory
 * @returns {Promise<void>}
 */
async function copyDirectory(src, dest) {
  try {
    // Create destination directory
    await fsPromises.mkdir(dest, { recursive: true });
    
    // Read source directory
    const entries = await fsPromises.readdir(src, { withFileTypes: true });
    
    // Process each entry
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        await copyDirectory(srcPath, destPath);
      } else {
        // Copy file
        await fsPromises.copyFile(srcPath, destPath);
      }
    }
  } catch (err) {
    console.error(`Error copying directory ${src}:`, err);
    throw err;
  }
}

/**
 * Process attachments for a file
 * @param {string} inputDir Input directory
 * @param {string} outputDir Output directory
 * @param {Map} attachmentsInfo Map of attachment information
 * @returns {Promise<void>}
 */
async function processAttachments(inputDir, outputDir, attachmentsInfo) {
  try {
    if (attachmentsInfo.size === 0) return;
    
    // Create attachments directory
    const attachmentsDir = path.join(outputDir, 'attachments');
    await fsPromises.mkdir(attachmentsDir, { recursive: true });
    
    // Copy each attachment
    for (const [id, attachment] of attachmentsInfo.entries()) {
      // Skip if no container ID
      if (!attachment.containerId) continue;
      
      // Create container directory
      const containerDir = path.join(attachmentsDir, attachment.containerId);
      await fsPromises.mkdir(containerDir, { recursive: true });
      
      // Source path
      const sourcePath = path.join(
        inputDir,
        'attachments',
        attachment.containerId,
        id + path.extname(attachment.filename)
      );
      
      // Check if source exists
      if (fs.existsSync(sourcePath)) {
        // Copy file
        const destPath = path.join(
          containerDir,
          id + path.extname(attachment.filename)
        );
        
        await fsPromises.copyFile(sourcePath, destPath);
        
        console.log(`Copied attachment: ${attachment.filename}`);
      } else {
        console.warn(`Warning: Could not find attachment source: ${sourcePath}`);
      }
    }
    
    console.log('Attachments processed successfully');
  } catch (err) {
    console.error('Error processing attachments:', err);
    throw err;
  }
}

module.exports = {
  copyAssets,
  copyImages,
  copyDirectory,
  processAttachments
};