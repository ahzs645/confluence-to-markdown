// modules/converter.js
/**
 * Main converter module that orchestrates the conversion process
 * UPDATED version with improved layout and table handling
 */

const path = require('path');
const fs = require('fs/promises');
const htmlParser = require('./html-parser');
const markdownGenerator = require('./markdown-generator');
const fileSystem = require('./file-system');
const utilities = require('./utilities');

/**
 * Process a single HTML file and convert it to Markdown
 * @param {string} inputFilePath Path to input HTML file
 * @param {string} outputFilePath Path to output Markdown file
 * @returns {Promise<void>}
 */
async function processFile(inputFilePath, outputFilePath) {
  try {
    console.log(`Processing: ${inputFilePath}`);
    
    // Read and parse HTML file
    const document = await htmlParser.parseFile(inputFilePath);
    
    // Convert to Markdown
    const markdown = await markdownGenerator.generateMarkdown(document);
    
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    
    // Write markdown to file
    await fs.writeFile(outputFilePath, markdown, 'utf8');
    
    // Process attachments
    const attachmentsInfo = htmlParser.extractAttachmentInfo(document);
    if (attachmentsInfo.size > 0) {
      await fileSystem.processAttachments(
        path.dirname(inputFilePath),
        path.dirname(outputFilePath),
        attachmentsInfo
      );
    }
    
    console.log(`Converted: ${outputFilePath}`);
  } catch (err) {
    console.error(`Error processing file ${inputFilePath}:`, err);
    throw err;
  }
}

/**
 * Process a directory of HTML files recursively
 * @param {string} inputDir Input directory
 * @param {string} outputDir Output directory
 * @returns {Promise<void>}
 */
async function processDirectory(inputDir, outputDir) {
  try {
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // Get all files in directory
    const entries = await fs.readdir(inputDir, { withFileTypes: true });
    
    // Process each entry
    for (const entry of entries) {
      const fullInputPath = path.join(inputDir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip special directories
        if (['attachments', 'images'].includes(entry.name)) {
          continue;
        }
        
        // Process subdirectory
        const subOutputDir = path.join(outputDir, entry.name);
        await processDirectory(fullInputPath, subOutputDir);
      } else if (entry.name.endsWith('.html')) {
        // Process HTML file
        const outputFilePath = path.join(
          outputDir,
          entry.name.replace(/\.html$/, '.md')
        );
        
        await processFile(fullInputPath, outputFilePath);
      }
    }
  } catch (err) {
    console.error(`Error processing directory ${inputDir}:`, err);
    throw err;
  }
}

/**
 * Post-process all markdown files to fix any remaining issues
 * @param {string} outputDir Directory containing markdown files
 * @returns {Promise<void>}
 */
async function postProcessMarkdownFiles(outputDir) {
  try {
    console.log('Starting post-processing of markdown files...');
    
    const processDir = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await processDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          // Read file
          let content = await fs.readFile(fullPath, 'utf8');
          
          // Apply post-processing fixes
          content = utilities.cleanupMarkdown(content);
          
          // Fix broken tables and improve formatting
          content = utilities.fixBrokenTables(content);
          
          // Write back to file
          await fs.writeFile(fullPath, content, 'utf8');
          
          console.log(`Post-processed: ${fullPath}`);
        }
      }
    };
    
    await processDir(outputDir);
    console.log('Post-processing complete');
  } catch (err) {
    console.error(`Error post-processing markdown files:`, err);
    throw err;
  }
}

module.exports = {
  processFile,
  processDirectory,
  postProcessMarkdownFiles
};