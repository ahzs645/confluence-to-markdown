// modules/markdown-generator.js
/**
 * @file Module for generating Markdown content from parsed HTML.
 * This module orchestrates the conversion of a JSDOM document into a complete Markdown document,
 * including frontmatter, breadcrumbs, main content, and attachments.
 */

const path = require("path");
const htmlParser = require("./html-parser");
const elementProcessors = require("./element-processors");
const contentProcessor = require("./content-processor");
const utilities = require("./utilities");
const prettier = require("prettier");

/**
 * Generates the Markdown frontmatter block.
 * @param {string} title - The title of the page. Content will be YAML escaped.
 * @param {string} lastModified - The last modified date string. Content will be YAML escaped.
 * @param {Array<{text: string, href: string}>} breadcrumbs - Array of breadcrumb objects. Text and href will be YAML escaped.
 * @param {string} createdBy - The name of the page creator. Content will be YAML escaped.
 * @param {string} createdDate - The page creation date string. Content will be YAML escaped.
 * @returns {string} The Markdown frontmatter string.
 */
function generateFrontmatter(title, lastModified, breadcrumbs, createdBy, createdDate) {
  let frontmatter = `---\n`;
  frontmatter += `title: "${utilities.escapeYaml(title)}"\n`;
  if (createdBy) frontmatter += `created_by: "${utilities.escapeYaml(createdBy)}"\n`;
  if (createdDate) frontmatter += `created_date: "${utilities.escapeYaml(createdDate)}"\n`;
  frontmatter += `last_modified: "${utilities.escapeYaml(lastModified)}"\n`;

  if (breadcrumbs && breadcrumbs.length > 0) {
    frontmatter += `breadcrumbs:\n`;
    for (const crumb of breadcrumbs) {
      let href = crumb.href.split('?')[0]; // Strip URI parameters
      const filename = path.basename(href);
      if (href !== '#' && !href.startsWith('http')) href = `./${filename}`; // Relative path for internal links
      frontmatter += `  - title: "${utilities.escapeYaml(crumb.text)}"\n`;
      frontmatter += `    url: "${utilities.escapeYaml(href)}"\n`;
    }
  }
  frontmatter += `---\n\n`;
  return frontmatter;
}

/**
 * Generates the visible breadcrumb navigation string for Markdown (e.g., "> Page1 > Page2").
 * Links are made relative for local navigation.
 * @param {Array<{text: string, href: string}>} breadcrumbs - Array of breadcrumb objects.
 * @returns {string} The Markdown string for visible breadcrumbs, or an empty string if no breadcrumbs are provided.
 */
function generateVisibleBreadcrumbs(breadcrumbs) {
  if (!breadcrumbs || breadcrumbs.length === 0) return "";
  
  let breadcrumbNav = '> ';
  breadcrumbNav += breadcrumbs.map(crumb => {
    let href = crumb.href.split('?')[0]; // Strip URI parameters
    const filename = path.basename(href);
    if (href !== '#' && !href.startsWith('http')) href = `./${filename}`; // Relative path
    return `[${crumb.text}](${href})`;
  }).join(' > ');
  return breadcrumbNav + '\n\n';
}

/**
 * Processes the main content element of the HTML document and converts it to Markdown.
 * It iterates through the child nodes of the `mainContentElement` and uses the `localContentProcessor`
 * (which is expected to be `contentProcessor.processElementContent`) to convert each child.
 * @param {Element | null} mainContentElement - The main content container element from JSDOM. Can be null if not found.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed to avoid re-processing.
 * @param {Object<string, function>} localElementProcessors - An object containing element-specific processor functions (e.g., from `element-processors.js`).
 * @param {Object<string, function>} localContentProcessor - An object containing the main `processElementContent` function (from `content-processor.js`).
 * @returns {string} Markdown representation of the main content, or an empty string if `mainContentElement` is null.
 */
function processMainContent(mainContentElement, document, processedElements, localElementProcessors, localContentProcessor) {
  if (!mainContentElement) {
    console.log("[REGRESSION_DEBUG] markdown-generator.js: Main content element NOT FOUND in processMainContent.");
    return "";
  }
  
  let markdown = "";
  console.log(`[REGRESSION_DEBUG] markdown-generator.js: processMainContent - Main content element: ${mainContentElement.nodeName}, ID: '${mainContentElement.id || ""}', Class: '${mainContentElement.className || ""}'`);
  console.log(`[REGRESSION_DEBUG] markdown-generator.js: processMainContent - Child nodes: ${mainContentElement.childNodes.length}`);

  for (let i = 0; i < mainContentElement.childNodes.length; i++) {
    const childNode = mainContentElement.childNodes[i];
    // Basic info logging for each child
    // console.log(`[REGRESSION_DEBUG] markdown-generator.js: [MAIN_CONTENT_CHILD ${i+1}] NodeName: ${childNode.nodeName}, NodeType: ${childNode.nodeType}`);
                
    if (processedElements.has(childNode)) {
      // console.log(`[REGRESSION_DEBUG] markdown-generator.js: [MAIN_CONTENT_CHILD ${i+1}] SKIPPING - already processed.`);
      continue;
    }
    try {
      // console.log(`[REGRESSION_DEBUG] markdown-generator.js: [MAIN_CONTENT_CHILD ${i+1}] Calling localContentProcessor.processElementContent...`);
      markdown += localContentProcessor.processElementContent(childNode, document, processedElements, localElementProcessors, "MAIN_CONTENT_ROOT");
    } catch (e) {
      console.error(`[REGRESSION_DEBUG] markdown-generator.js: Error in processMainContent for NodeName: ${childNode.nodeName}. Error: ${e.message}`, e.stack);
    }
  }
  return markdown;
}

/**
 * Generates the Markdown for the attachments section based on the specified option.
 * - 'visible': Creates a Markdown list of attachments.
 * - 'xml': Creates XML-like tags for attachments (for potential external processing).
 * - 'hidden': Returns an empty string.
 * @param {Map<string, {filename: string, href: string}>} attachmentsInfo - A map of attachment information, where keys are attachment IDs or unique names,
 *                                                                       and values are objects containing `filename` and `href`.
 * @param {string} attachmentOption - Option for attachment visibility ('visible', 'hidden', 'xml').
 * @returns {string} The Markdown (or XML-commented) string for the attachments section, or an empty string if attachments are hidden or not present.
 */
function generateAttachmentsMarkdown(attachmentsInfo, attachmentOption) {
  if (attachmentOption === "hidden" || !attachmentsInfo || attachmentsInfo.size === 0) {
    console.log(`[REGRESSION_DEBUG] markdown-generator.js: Attachments processing skipped (Option: ${attachmentOption}, Count: ${attachmentsInfo ? attachmentsInfo.size : 0})`);
    return "";
  }

  let markdown = "";
  console.log(`[REGRESSION_DEBUG] markdown-generator.js: Processing attachments with option: ${attachmentOption}, Count: ${attachmentsInfo.size}`);
  
  if (attachmentOption === "visible") {
    markdown += "\n\n## Attachments\n\n";
    const bulletImageRelPath = "images/bullet_blue.gif"; // Consider making this configurable or removing if not always available
    for (const attachment of attachmentsInfo.values()) {
      const filename = attachment.filename || "unknown.file";
      let attachmentRelPath = attachment.href.replace(/\\/g, "/");
      if (!attachmentRelPath.startsWith('./') && !attachmentRelPath.startsWith('../') && !attachmentRelPath.startsWith('http')) {
        attachmentRelPath = `./${attachmentRelPath}`;
      }
      markdown += `![](${bulletImageRelPath}) [${filename}](${attachmentRelPath})\n`;
    }
  } else if (attachmentOption === "xml") {
    markdown += "\n\n<!-- Attachments -->\n";
    for (const attachment of attachmentsInfo.values()) {
      const safeFilename = (attachment.filename || "unknown.file").replace(/"/g, "&quot;");
      const safeHref = (attachment.href || "#").replace(/"/g, "&quot;").replace(/\\/g, "/");
      markdown += `<attachment filename="${safeFilename}" local_path="${safeHref}" />\n`;
    }
  }
  return markdown;
}

/**
 * Generates a complete Markdown document from a JSDOM HTML document.
 * This function orchestrates the extraction of metadata, generation of frontmatter,
 * visible breadcrumbs, main content conversion, history table processing, and attachment linking.
 * Finally, it cleans up and formats the generated Markdown using Prettier.
 * @param {Document} document - The JSDOM document object representing the parsed HTML page.
 * @param {string} [attachmentOption="visible"] - Option for attachment visibility ('visible', 'hidden', 'xml').
 * @param {string} mdFilePath - Absolute path to the target output Markdown file (used for context, e.g. image paths, though not directly written to by this function).
 * @param {string} rootOutputDir - Absolute path to the root output directory for the entire conversion (used for context).
 * @returns {Promise<string>} A promise that resolves to the complete, formatted Markdown content as a string.
 * @throws Will re-throw errors encountered during parsing or generation.
 */
async function generateMarkdown(document, attachmentOption = "visible", mdFilePath, rootOutputDir) {
  console.log("[REGRESSION_DEBUG] markdown-generator.js: generateMarkdown START");
  try {
    const title = htmlParser.extractTitle(document);
    const lastModified = htmlParser.extractLastModified(document);
    const breadcrumbs = htmlParser.extractBreadcrumbs(document);
    
    const pageMetadataElement = document.querySelector(".page-metadata");
    let createdBy = "";
    let createdDate = "";
    if (pageMetadataElement) {
      const metadataContent = pageMetadataElement.textContent.trim();
      const authorMatch = metadataContent.match(/Created by\s+(.*?)(?:,|\s+last)/i);
      if (authorMatch && authorMatch[1]) createdBy = authorMatch[1].trim();
      const createdDateMatch = metadataContent.match(/on\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4})/i);
      if (createdDateMatch && createdDateMatch[1]) createdDate = createdDateMatch[1].trim();
    }

    let markdown = generateFrontmatter(title, lastModified, breadcrumbs, createdBy, createdDate);
    markdown += generateVisibleBreadcrumbs(breadcrumbs);
    markdown += `# ${title}\n\n`; // Page title in Markdown body

    const processedElements = new Set(); 
    
    // Process page metadata element itself to mark its content as processed if it's distinct
    // from main content, but don't add its output to markdown as it's in frontmatter.
    if (pageMetadataElement) {
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Marking page metadata element as processed.");
      // This call is primarily to add pageMetadataElement and its children to processedElements
      contentProcessor.processElementContent(pageMetadataElement, document, processedElements, elementProcessors, "METADATA_SECTION_MARKER");
    }
    
    const mainContentElement = htmlParser.findMainContent(document);
    markdown += processMainContent(mainContentElement, document, processedElements, elementProcessors, contentProcessor);

    const historyTableElement = htmlParser.findHistoryTable(document);
    if (historyTableElement && !processedElements.has(historyTableElement)) {
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Processing history table...");
      // Note: processHistoryTable is part of elementProcessors and expects 'processors' object.
      // Here, elementProcessors itself is that object for top-level calls.
      const historyContent = elementProcessors.processHistoryTable(historyTableElement, document, processedElements, elementProcessors, "HISTORY_SECTION"); 
      if (historyContent) markdown += historyContent;
      processedElements.add(historyTableElement); // Ensure table is marked processed
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Finished processing history table.");
    }

    const allAttachments = htmlParser.extractAttachmentInfo(document);
    markdown += generateAttachmentsMarkdown(allAttachments, attachmentOption);
    
    console.log("[REGRESSION_DEBUG] markdown-generator.js: Cleaning up and formatting final markdown...");
    markdown = utilities.cleanupMarkdown(markdown);
    markdown = utilities.fixBrokenTables(markdown);
    
    try {
      markdown = await prettier.format(markdown, { 
        parser: "markdown", printWidth: 120, proseWrap: "preserve" 
      });
    } catch (err) {
      console.warn("[REGRESSION_DEBUG] Prettier formatting failed (markdown-generator.js):", err.message);
    }
    console.log("[REGRESSION_DEBUG] markdown-generator.js: generateMarkdown END");
    return markdown.trim();
  } catch (err) {
    console.error("[REGRESSION_DEBUG] Error in generateMarkdown:", err.message, err.stack);
    throw err; // Re-throw to be caught by the caller
  }
}

module.exports = {
  generateMarkdown,
  // Export new functions if they are intended to be used externally or for testing
  generateFrontmatter,
  generateVisibleBreadcrumbs,
  processMainContent,
  generateAttachmentsMarkdown
};
