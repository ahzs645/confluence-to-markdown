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
 * Processes a single HTML file: parses it, generates Markdown, writes the Markdown file,
 * and handles associated attachments.
 * @async
 * @param {string} inputFilePath - Path to the input HTML file.
 * @param {string} outputFilePath - Path to the output Markdown file.
 * @param {string} attachmentOption - Option for attachment visibility ('visible', 'hidden', 'xml').
 * @param {string} rootOutputDir - The root output directory for the entire conversion process, used for context (e.g., by markdownGenerator).
 * @returns {Promise<void>} A promise that resolves when the file processing is complete.
 * @throws {Error} If any step in processing the file fails.
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
 * @async
 */
/**
 * @private
 * Analyzes HTML files in a directory recursively to extract metadata (like breadcrumbs and parsed document objects)
 * and builds a list of files to be processed.
 * @param {string} inputDir - The root directory to start analyzing HTML files from.
 * @param {object} htmlParserModule - An instance of the html-parser module.
 * @param {object} fsModule - An instance of Node.js 'fs/promises' module.
 * @returns {Promise<Array<{inputPath: string, relativePath: string, document: Document|null, breadcrumbs: Array<{text: string, href: string}>}>>} 
 *          A promise that resolves to an array of file objects. Each object contains the input path,
 *          relative path, the parsed JSDOM `Document` (or `null` if parsing failed), and extracted breadcrumbs.
 * @async
 */
async function _analyzeHtmlFiles(inputDir, htmlParserModule, fsModule) {
  const filesToProcess = [];

  const analyzeEntriesRecursive = async (currentDir, relativePath = '') => {
    const entries = await fsModule.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullInputPath = path.join(currentDir, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        if (["attachments", "images"].includes(entry.name.toLowerCase())) {
          console.log(`Skipping special directory: ${fullInputPath}`);
          continue;
        }
        await analyzeEntriesRecursive(fullInputPath, entryRelativePath);
      } else if (entry.name.endsWith(".html") || entry.name.endsWith(".htm")) {
        try {
          const document = await htmlParserModule.parseFile(fullInputPath);
          const breadcrumbs = htmlParserModule.extractBreadcrumbs(document);
          
          filesToProcess.push({
            inputPath: fullInputPath,
            relativePath: entryRelativePath,
            document, // Pass parsed document to potentially avoid re-parsing
            breadcrumbs 
          });
        } catch (e) {
          console.error(`Error analyzing HTML file ${fullInputPath}:`, e);
          filesToProcess.push({ 
            inputPath: fullInputPath,
            relativePath: entryRelativePath,
            document: null, // Mark as failed parsing
            breadcrumbs: []
          });
        }
      }
    }
  };
  
  await analyzeEntriesRecursive(inputDir);
  return filesToProcess;
}

/**
 * Processes a directory of HTML files recursively, converting them to Markdown.
 * It first analyzes all HTML files to understand their structure and breadcrumbs,
 * then processes each file, organizing the output based on the breadcrumb data.
 * Finally, it runs a post-processing step on all generated Markdown files.
 * @async
 * @param {string} inputDir - The input directory containing HTML files.
 * @param {string} outputDir - The output directory where Markdown files will be saved.
 * @param {string} attachmentOption - Option for attachment visibility ('visible', 'hidden', 'xml').
 * @returns {Promise<void>} A promise that resolves when all files in the directory have been processed.
 * @throws {Error} If a critical error occurs during directory processing.
 */
async function processDirectory(inputDir, outputDir, attachmentOption) {
  try {
    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });
    
    console.log(`Starting analysis of HTML files in: ${inputDir}`);
    const filesToProcess = await _analyzeHtmlFiles(inputDir, htmlParser, fs);
    console.log(`Analysis complete. Found ${filesToProcess.length} HTML files to process.`);
    
    console.log(`Starting processing of ${filesToProcess.length} analyzed files into: ${outputDir}`);
    // Note: rootOutputDir for processFile is the main outputDir for the entire operation.
    await _processAnalyzedFiles(filesToProcess, outputDir, attachmentOption, outputDir, utilities, processFile, fs);
    console.log("Processing of analyzed files complete.");

    console.log(`Starting post-processing of Markdown files in: ${outputDir}`);
    await postProcessMarkdownFiles(outputDir, utilities); 
    console.log("Directory processing complete.");

  } catch (err) {
    console.error(`Error processing directory ${inputDir}:`, err);
    throw err;
  }
}

/**
 * @private
 * Processes a list of analyzed HTML file objects. For each file, it determines the
 * appropriate output path based on breadcrumbs (or relative path as a fallback),
 * creates necessary directories, and then calls the `processFileFunc` to convert the HTML to Markdown.
 * @async
 * @param {Array<{inputPath: string, relativePath: string, document: Document|null, breadcrumbs: Array<{text: string, href: string}>}>} filesToProcess - 
 *        Array of file objects from `_analyzeHtmlFiles`.
 * @param {string} outputDir - The root output directory where Markdown files will be organized.
 * @param {string} attachmentOption - Option for attachment visibility, passed to `processFileFunc`.
 * @param {string} rootOutputDirForFileProcessing - The absolute root output directory for the entire conversion, passed to `processFileFunc`.
 * @param {object} utilitiesModule - An instance of the utilities module (for `sanitizeFilename`).
 * @param {function} processFileFunc - The function to process a single file (typically `processFile`).
 * @param {object} fsModule - An instance of Node.js 'fs/promises' module.
 */
async function _processAnalyzedFiles(filesToProcess, outputDir, attachmentOption, rootOutputDirForFileProcessing, utilitiesModule, processFileFunc, fsModule) {
  for (const file of filesToProcess) {
    if (!file.document) { // Skip files that failed to parse during analysis
        console.warn(`Skipping file due to earlier parsing error: ${file.inputPath}`);
        continue;
    }
    let targetOutputDir = outputDir;
    let baseName = path.basename(file.inputPath, path.extname(file.inputPath)); 

    if (file.breadcrumbs && file.breadcrumbs.length > 0) {
      const pathSegments = file.breadcrumbs
        .slice(0, -1) 
        .map(crumb => utilitiesModule.sanitizeFilename(crumb.text));
      
      if (pathSegments.length > 0) {
        targetOutputDir = path.join(outputDir, ...pathSegments);
      }
      const lastCrumbText = file.breadcrumbs[file.breadcrumbs.length - 1].text;
      if(lastCrumbText && lastCrumbText.trim() !== "") {
         baseName = utilitiesModule.sanitizeFilename(lastCrumbText);
      }
    } else {
      targetOutputDir = path.join(outputDir, path.dirname(file.relativePath));
    }
    
    await fsModule.mkdir(targetOutputDir, { recursive: true });
    const outputFilePath = path.join(targetOutputDir, `${baseName}.md`);
    
    await processFileFunc(file.inputPath, outputFilePath, attachmentOption, rootOutputDirForFileProcessing);
  }
}


/**
 * Post-processes all Markdown files within a given output directory.
 * This involves recursively scanning the directory for `.md` files and applying
 * cleanup functions (e.g., `cleanupMarkdown`, `fixBrokenTables`) from the `utilitiesModule`.
 * @async
 * @param {string} outputDir - The root directory containing the generated Markdown files.
 * @param {object} [utilitiesModule=utilities] - An instance of the utilities module. Defaults to the imported `utilities` module.
 * @returns {Promise<void>} A promise that resolves when all Markdown files have been post-processed.
 * @throws {Error} If reading directories or files fails at a high level. Individual file processing errors are logged but do not stop the entire process.
 */
async function postProcessMarkdownFiles(outputDir, utilitiesModule = utilities) {
  try {
    console.log("Starting post-processing of markdown files...");
    
    const processDirRecursive = async (currentDir) => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await processDirRecursive(fullPath);
        } else if (entry.name.endsWith(".md")) {
          try {
            let content = await fs.readFile(fullPath, "utf8");
            content = utilitiesModule.cleanupMarkdown(content);
            content = utilitiesModule.fixBrokenTables(content);
            await fs.writeFile(fullPath, content, "utf8");
            console.log(`Post-processed: ${fullPath}`);
          } catch (errInner) { 
            console.error(`Error post-processing file ${fullPath}:`, errInner);
          }
        }
      }
    };
    
    await processDirRecursive(outputDir);
    console.log("Post-processing complete");
  } catch (err) {
    console.error(`Error during post-processing markdown files in ${outputDir}:`, err);
    throw err;
  }
}

module.exports = {
  processFile,
  processDirectory,
  postProcessMarkdownFiles,
  // Exposing new helper functions primarily for testing or if they prove useful elsewhere
  _analyzeHtmlFiles 
};