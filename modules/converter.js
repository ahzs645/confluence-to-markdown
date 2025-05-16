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
 * Process a directory of HTML files recursively with breadcrumb-based structure
 * @param {string} inputDir Input directory
 * @param {string} outputDir Output directory
 * @param {string} attachmentOption Option for attachment visibility
 * @returns {Promise<void>}
 */
async function processDirectory(inputDir, outputDir, attachmentOption) {
  try {
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    // First pass: Analyze all HTML files and extract breadcrumbs
    const breadcrumbMap = new Map();
    const filesToProcess = [];
    
    const analyzeEntries = async (dir, relativePath = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullInputPath = path.join(dir, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          // Skip special directories
          if (["attachments", "images"].includes(entry.name)) {
            continue;
          }
          
          // Analyze subdirectory
          await analyzeEntries(fullInputPath, entryRelativePath);
        } else if (entry.name.endsWith(".html")) {
          // Extract breadcrumbs for this file
          try {
            const document = await htmlParser.parseFile(fullInputPath);
            const breadcrumbs = htmlParser.extractBreadcrumbs(document);
            
            // Store the file for processing with its breadcrumbs
            filesToProcess.push({
              inputPath: fullInputPath,
              relativePath: entryRelativePath,
              breadcrumbs
            });
            
            breadcrumbMap.set(fullInputPath, breadcrumbs);
          } catch (e) {
            console.error(`Error analyzing breadcrumbs for ${fullInputPath}:`, e);
            // Still add the file for processing without breadcrumbs
            filesToProcess.push({
              inputPath: fullInputPath,
              relativePath: entryRelativePath,
              breadcrumbs: []
            });
          }
        }
      }
    };
    
    // Analyze all files
    await analyzeEntries(inputDir);
    
    // Second pass: Process each file and create appropriate directories
    for (const file of filesToProcess) {
      // Determine output path based on breadcrumbs
      let outputPath = '';
      
      if (file.breadcrumbs && file.breadcrumbs.length > 0) {
        // Create a path based on breadcrumbs (excluding the last one which is the current page)
        const pathSegments = file.breadcrumbs.slice(0, -1).map(crumb => 
          utilities.sanitizeFilename(crumb.text)
        );
        
        // Join the breadcrumb-based path with the output directory
        outputPath = path.join(outputDir, ...pathSegments);
      } else {
        // Use the original relative path if no breadcrumbs
        outputPath = path.join(outputDir, path.dirname(file.relativePath));
      }
      
      // Ensure the directory exists
      await fs.mkdir(outputPath, { recursive: true });
      
      // Determine the output filename
      const baseName = path.basename(file.inputPath, '.html');
      const outputFilePath = path.join(outputPath, `${baseName}.md`);
      
      // Process the file
      await processFile(file.inputPath, outputFilePath, attachmentOption, outputDir);
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
          try {
            // Read file
            let content = await fs.readFile(fullPath, "utf8");
            
            // Apply standard cleanup - now includes the specialized cleanup logic
            content = utilities.cleanupMarkdown(content);
            
            // Fix broken tables and improve formatting
            content = utilities.fixBrokenTables(content);
            
            // Write back to file
            await fs.writeFile(fullPath, content, "utf8");
            
            console.log(`Post-processed: ${fullPath}`);
          } catch (err) {
            console.error(`Error processing file ${fullPath}:`, err);
            // Continue with other files instead of failing the entire process
          }
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