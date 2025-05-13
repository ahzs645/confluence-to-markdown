// modules/converter.js
/**
 * Main converter module that orchestrates the conversion process
 * UPDATED version with improved layout and table handling
 */

const path = require("path");
const fs = require("fs/promises");
const htmlParser = require("./html-parser");
const markdownGenerator = require("./markdown-generator");
const fileSystem = require("./file-system");
const utilities = require("./utilities");

/**
 * Process a single HTML file and convert it to Markdown
 * @param {string} inputFilePath Path to input HTML file
 * @param {string} outputFilePath Path to output Markdown file
 * @param {string} attachmentOption Option for attachment visibility (
visible
, 
hidden
, or 
xml
)
 * @param {string} rootOutputDir The root output directory for the entire conversion process
 * @returns {Promise<void>}
 */
async function processFile(inputFilePath, outputFilePath, attachmentOption, rootOutputDir) {
  try {
    console.log(`Processing: ${inputFilePath} with attachment option: ${attachmentOption}`);
    
    // Read and parse HTML file
    const document = await htmlParser.parseFile(inputFilePath);
    
    // Convert to Markdown, passing the attachment option, output file path, and root output dir
    const markdown = await markdownGenerator.generateMarkdown(document, attachmentOption, outputFilePath, rootOutputDir);
    
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
    
    // Write markdown to file
    await fs.writeFile(outputFilePath, markdown, "utf8");
    
    // Process attachments (copying files - this part is independent of the markdown generation style)
    const attachmentsInfo = htmlParser.extractAttachmentInfo(document);
    if (attachmentsInfo.size > 0) {
      await fileSystem.processAttachments(
        path.dirname(inputFilePath), // This assumes attachments are relative to the HTML file's dir
        path.dirname(outputFilePath), // This assumes attachments are copied relative to the MD file's dir
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
 * @param {string} attachmentOption Option for attachment visibility
 * @returns {Promise<void>}
 */
async function processDirectory(inputDir, outputDir, attachmentOption) {
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
        if (["attachments", "images"].includes(entry.name)) {
          continue;
        }
        
        // Process subdirectory
        const subOutputDir = path.join(outputDir, entry.name);
        // Pass the main outputDir as rootOutputDir for correct relative path calculations
        await processDirectory(fullInputPath, subOutputDir, attachmentOption, outputDir);
      } else if (entry.name.endsWith(".html")) {
        // Process HTML file
        const outputFilePath = path.join(
          outputDir,
          entry.name.replace(/\.html$/, ".md")
        );
        // Pass the main outputDir as rootOutputDir
        await processFile(fullInputPath, outputFilePath, attachmentOption, outputDir);
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
    console.log("Starting post-processing of markdown files...");
    
    const processDir = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await processDir(fullPath);
        } else if (entry.name.endsWith(".md")) {
          // Read file
          let content = await fs.readFile(fullPath, "utf8");
          
          // Apply post-processing fixes
          content = utilities.cleanupMarkdown(content);
          
          // Fix broken tables and improve formatting
          content = utilities.fixBrokenTables(content);
          
          // Write back to file
          await fs.writeFile(fullPath, content, "utf8");
          
          console.log(`Post-processed: ${fullPath}`);
        }
      }
    };
    
    await processDir(outputDir);
    console.log("Post-processing complete");
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
