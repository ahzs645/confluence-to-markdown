#!/usr/bin/env node

/**
 * Debug script for the Confluence to Markdown converter
 * Processes a single HTML file and shows before/after post-processing
 * Now extracts all content and saves images properly
 * 
 * Usage: node debug-converter.js input-file.html
 */

const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const prettier = require('prettier');
const https = require('https');
const http = require('http');
const url = require('url');

// Import modules
const htmlParser = require('./modules/html-parser');
const markdownGenerator = require('./modules/markdown-generator');
const contentProcessor = require('./modules/content-processor');
const elementProcessors = require('./modules/element-processors');
const utilities = require('./modules/utilities');

// Check for command line arguments
if (process.argv.length !== 3) {
  console.error(
    `Syntax: ${process.argv[0] || 'node'} ${
      process.argv[1] || 'debug-converter.js'
    } input-file.html`,
  );
  process.exit(1);
}

const inputFilePath = process.argv[2];

// Validate input file
if (!fs.existsSync(inputFilePath)) {
  console.error(`Error: Input file "${inputFilePath}" does not exist.`);
  process.exit(1);
}

/**
 * Debug function to count all elements by tag in the document
 * @param {Document} document JSDOM document
 * @returns {Object} Counts by tag
 */
function countElementsByTag(document) {
  const counts = {};
  const elements = document.querySelectorAll('*');
  
  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    counts[tag] = (counts[tag] || 0) + 1;
  }
  
  return counts;
}

/**
 * Debug function to find all classes used in the document
 * @param {Document} document JSDOM document
 * @returns {Object} Map of class names to counts
 */
function findAllClasses(document) {
  const classes = {};
  const elements = document.querySelectorAll('*[class]');
  
  for (const element of elements) {
    const classList = element.className.split(/\s+/).filter(Boolean);
    for (const cls of classList) {
      classes[cls] = (classes[cls] || 0) + 1;
    }
  }
  
  return classes;
}

/**
 * Extracts and saves images from the HTML to a local folder
 * @param {Document} document The parsed HTML document
 * @param {string} outputBasePath The base path for saving images
 * @returns {Promise<Map<string, string>>} Map of original image URLs to local paths
 */
async function extractAndSaveImages(document, outputBasePath) {
  const imageMap = new Map();
  const imageDir = path.join(path.dirname(outputBasePath), 'images');
  
  // Create images directory if it doesn't exist
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }
  
  // Find all images in the document
  const images = document.querySelectorAll('img');
  console.log(`Found ${images.length} images in the document`);
  
  for (const img of images) {
    try {
      let src = img.getAttribute('src');
      if (!src) continue;
      
      // Skip images that are already in the map
      if (imageMap.has(src)) continue;
      
      // Convert relative URLs to absolute if they start with /
      if (src.startsWith('/') && !src.startsWith('//')) {
        src = `https://confluence.northernhealth.ca${src}`;
      }
      
      // Handle data URLs (embedded images)
      if (src.startsWith('data:')) {
        const matches = src.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const ext = matches[1];
          const data = matches[2];
          const filename = `embedded-${Date.now()}.${ext}`;
          const outputPath = path.join(imageDir, filename);
          
          fs.writeFileSync(outputPath, Buffer.from(data, 'base64'));
          imageMap.set(src, `images/${filename}`);
          console.log(`Saved embedded image to ${outputPath}`);
        }
        continue;
      }
      
      // For attachments or specific paths, save the image
      let filename = path.basename(src).split('?')[0]; // Remove query params
      
      // If filename has no extension, add .png
      if (!path.extname(filename)) {
        filename += '.png';
      }
      
      const outputPath = path.join(imageDir, filename);
      
      // Check if it's a local file reference (attachments)
      if (src.startsWith('attachments/')) {
        // Try to find the file in nearby directories
        const sourcePaths = [
          path.join(path.dirname(inputFilePath), src),
          path.join(path.dirname(inputFilePath), '..', src)
        ];
        
        let copied = false;
        for (const sourcePath of sourcePaths) {
          if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, outputPath);
            imageMap.set(src, `images/${filename}`);
            console.log(`Copied local image from ${sourcePath} to ${outputPath}`);
            copied = true;
            break;
          }
        }
        
        if (!copied) {
          console.warn(`Local image not found: ${src}`);
        }
      } else if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
        // For external URLs, download the image
        if (src.startsWith('//')) {
          src = `https:${src}`;
        }
        
        try {
          // Use URL to determine filename if needed
          const parsedUrl = new URL(src);
          let urlFilename = path.basename(parsedUrl.pathname).split('?')[0];
          
          // If no extension, try to use the original filename
          if (!path.extname(urlFilename)) {
            urlFilename = filename;
          }
          
          const imgOutputPath = path.join(imageDir, urlFilename);
          
          // Download and save the image
          await downloadImage(src, imgOutputPath);
          imageMap.set(src, `images/${urlFilename}`);
          console.log(`Downloaded image from ${src} to ${imgOutputPath}`);
        } catch (downloadErr) {
          console.warn(`Failed to download image from ${src}: ${downloadErr.message}`);
        }
      }
    } catch (err) {
      console.error(`Error processing image ${img.getAttribute('src')}:`, err);
    }
  }
  
  return imageMap;
}

/**
 * Downloads an image from a URL and saves it to a file
 * @param {string} imageUrl The URL of the image to download
 * @param {string} outputPath The path to save the image to
 * @returns {Promise<void>}
 */
function downloadImage(imageUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith('https') ? https : http;
    const request = protocol.get(imageUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: Status code ${response.statusCode}`));
        return;
      }
      
      const file = fs.createWriteStream(outputPath);
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });
    
    request.on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Delete partially downloaded file
      reject(err);
    });
    
    request.end();
  });
}

/**
 * Update image references in markdown to use local paths
 * @param {string} markdown The markdown content
 * @param {Map<string, string>} imageMap Map of original image URLs to local paths
 * @returns {string} Updated markdown content
 */
function updateImageReferences(markdown, imageMap) {
  let updatedMarkdown = markdown;
  
  for (const [originalSrc, localPath] of imageMap.entries()) {
    // Escape special characters for regex
    const escapedSrc = originalSrc.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    
    // Replace image references in Markdown
    const imgRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedSrc}([^)]*)\\)`, 'g');
    updatedMarkdown = updatedMarkdown.replace(imgRegex, `![$1](${localPath}$2)`);
    
    // Also replace HTML img tags
    const htmlImgRegex = new RegExp(`<img([^>]*)src=["']${escapedSrc}["']([^>]*)>`, 'g');
    updatedMarkdown = updatedMarkdown.replace(htmlImgRegex, `<img$1src="${localPath}"$2>`);
  }
  
  return updatedMarkdown;
}

// Main execution
const debug = async () => {
  try {
    console.log('=========================================');
    console.log('Confluence to Markdown Converter - DEBUG MODE');
    console.log('=========================================');
    console.log(`Input file: ${path.resolve(inputFilePath)}`);
    
    // Setup output directory based on input file name
    const baseName = path.basename(inputFilePath, path.extname(inputFilePath));
    const debugDir = `${baseName}-debug`;
    
    // Create debug directory
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    // Parse the HTML content
    const content = fs.readFileSync(inputFilePath, 'utf8');
    const dom = new JSDOM(content);
    const document = dom.window.document;
    
    // Collect debug information
    const elementCounts = countElementsByTag(document);
    const classesUsed = findAllClasses(document);
    
    const debugInfo = {
      inputFile: path.resolve(inputFilePath),
      elementCounts,
      classesUsed,
      panels: document.querySelectorAll('.panel, .confluence-information-macro').length,
      tables: document.querySelectorAll('table').length,
      images: document.querySelectorAll('img').length,
      layouts: document.querySelectorAll('.contentLayout, .columnLayout').length
    };
    
    // Save debug info
    fs.writeFileSync(
      path.join(debugDir, 'element-analysis.json'), 
      JSON.stringify(debugInfo, null, 2), 
      'utf8'
    );
    
    // Extract and save images
    console.log('Extracting and saving images...');
    const imageMap = await extractAndSaveImages(document, path.join(debugDir, 'output'));
    console.log(`Extracted ${imageMap.size} images`);
    
    // Generate markdown using our full process
    console.log('Generating markdown...');
    const markdown = await markdownGenerator.generateMarkdown(document);
    
    // Update image references in the markdown
    const updatedMarkdown = updateImageReferences(markdown, imageMap);
    
    // Save the markdown output
    const outputPath = path.join(debugDir, `${baseName}.md`);
    fs.writeFileSync(outputPath, updatedMarkdown, 'utf8');
    console.log(`Markdown saved to: ${outputPath}`);
    
    // Also save a raw HTML file for easier inspection
    const htmlOutputPath = path.join(debugDir, `${baseName}-source.html`);
    fs.writeFileSync(htmlOutputPath, content, 'utf8');
    console.log(`Source HTML saved to: ${htmlOutputPath}`);
    
    // Save a simplified HTML version
    const mainContent = htmlParser.findMainContent(document);
    const simpleHtml = mainContent ? mainContent.outerHTML : document.body.outerHTML;
    const simpleHtmlPath = path.join(debugDir, `${baseName}-main-content.html`);
    fs.writeFileSync(simpleHtmlPath, simpleHtml, 'utf8');
    console.log(`Main content HTML saved to: ${simpleHtmlPath}`);
    
    // Generate a basic comparison report
    const comparisonReport = `
# Markdown Conversion Report

## Basic Statistics
- **Original HTML size**: ${(content.length / 1024).toFixed(2)} KB
- **Generated Markdown size**: ${(updatedMarkdown.length / 1024).toFixed(2)} KB
- **Images extracted**: ${imageMap.size}
- **Elements processed**: ${Object.values(elementCounts).reduce((a, b) => a + b, 0)}

## Element Counts
${Object.entries(elementCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([tag, count]) => `- **${tag}**: ${count}`)
  .join('\n')}

## Most Common Classes
${Object.entries(classesUsed)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([cls, count]) => `- **${cls}**: ${count}`)
  .join('\n')}

## Special Elements
- **Panels**: ${debugInfo.panels}
- **Tables**: ${debugInfo.tables}
- **Images**: ${debugInfo.images}
- **Layouts**: ${debugInfo.layouts}
`;
    
    const reportPath = path.join(debugDir, 'conversion-report.md');
    fs.writeFileSync(reportPath, comparisonReport, 'utf8');
    console.log(`Conversion report saved to: ${reportPath}`);
    
    console.log('=========================================');
    console.log('Debug process complete!');
    console.log(`All output files are in: ${path.resolve(debugDir)}`);
    console.log('=========================================');
  } catch (err) {
    console.error('Error during debugging:', err);
    console.error(err.stack);
    process.exit(1);
  }
};

debug();