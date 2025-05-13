// modules/markdown-generator.js
/**
 * Module for generating Markdown content from parsed HTML
 */

const path = require("path");
const htmlParser = require("./html-parser");
const elementProcessors = require("./element-processors");
const contentProcessor = require("./content-processor");
const utilities = require("./utilities");
const prettier = require("prettier");

/**
 * Generate a complete Markdown document from an HTML document
 * @param {Document} document JSDOM document
 * @param {string} attachmentOption Option for attachment visibility (
visible
, 
hidden
, or 
xml
)
 * @param {string} mdFilePath Absolute path to the output markdown file
 * @param {string} rootOutputDir Absolute path to the root output directory for the conversion process
 * @returns {Promise<string>} Markdown content
 */
async function generateMarkdown(document, attachmentOption = "visible", mdFilePath, rootOutputDir) {
  console.log("[REGRESSION_DEBUG] markdown-generator.js: generateMarkdown START");
  try {
    const title = htmlParser.extractTitle(document);
    const lastModified = htmlParser.extractLastModified(document);
    
    let markdown = `---\ntitle: "${utilities.escapeYaml(title)}"\nlastModified: "${utilities.escapeYaml(lastModified)}"\n---\n\n# ${title}\n\n`;
    
    const processedElements = new Set(); 
    
    const pageMetadata = document.querySelector(".page-metadata");
    if (pageMetadata) {
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Processing page metadata...");
      const metadataContent = elementProcessors.processMetadata(pageMetadata, document, processedElements, "METADATA_SECTION");
      if (metadataContent) markdown += metadataContent;
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Finished processing page metadata.");
    }
    
    console.log("[REGRESSION_DEBUG] markdown-generator.js: Attempting to find main content element...");
    const mainContentElement = htmlParser.findMainContent(document);
    if (mainContentElement) {
        console.log(`[REGRESSION_DEBUG] markdown-generator.js: Main content element FOUND. NodeName: ${mainContentElement.nodeName}, ID: '${mainContentElement.id || ""}', Class: '${mainContentElement.className || ""}'`);
        console.log(`[REGRESSION_DEBUG] markdown-generator.js: Number of childNodes in mainContentElement: ${mainContentElement.childNodes.length}`);
        if (mainContentElement.childNodes.length > 0) {
            console.log("[REGRESSION_DEBUG] markdown-generator.js: Iterating through mainContentElement.childNodes...");
            for (let i = 0; i < mainContentElement.childNodes.length; i++) {
                const childNode = mainContentElement.childNodes[i];
                const childNodeId = childNode.id || "NO_ID";
                const childNodeClass = childNode.className && typeof childNode.className === "string" ? childNode.className : (childNode.className && childNode.className.baseVal ? childNode.className.baseVal : "NO_CLASS");
                console.log(`[REGRESSION_DEBUG] markdown-generator.js: [MAIN_CONTENT_CHILD ${i+1}/${mainContentElement.childNodes.length}] NodeName: ${childNode.nodeName}, NodeType: ${childNode.nodeType}, ID: '${childNodeId}', Class: '${childNodeClass}', Text (first 50): '${(childNode.textContent || "").trim().substring(0,50)}...'`);
                
                if (processedElements.has(childNode)) {
                    console.log(`[REGRESSION_DEBUG] markdown-generator.js: [MAIN_CONTENT_CHILD ${i+1}] SKIPPING - already in processedElements.`);
                    continue;
                }
                let childMarkdown = "";
                try {
                    console.log(`[REGRESSION_DEBUG] markdown-generator.js: [MAIN_CONTENT_CHILD ${i+1}] Calling contentProcessor.processElementContent...`);
                    childMarkdown = contentProcessor.processElementContent(childNode, document, processedElements, elementProcessors, "MAIN_CONTENT_ROOT");
                    console.log(`[REGRESSION_DEBUG] markdown-generator.js: [MAIN_CONTENT_CHILD ${i+1}] Returned from contentProcessor.processElementContent. Markdown length: ${childMarkdown.length}. Added to main markdown.`);
                } catch (e) {
                    console.error(`[REGRESSION_DEBUG] markdown-generator.js: Error during processElementContent for NodeName: ${childNode.nodeName}. Error: ${e.message}`, e.stack);
                }
                markdown += childMarkdown;
            }
            console.log("[REGRESSION_DEBUG] markdown-generator.js: Finished iterating through mainContentElement.childNodes.");
        } else {
          console.log("[REGRESSION_DEBUG] markdown-generator.js: mainContentElement has NO childNodes.");
        }
    } else {
        console.log("[REGRESSION_DEBUG] markdown-generator.js: Main content element NOT FOUND.");
    }

    const historyTable = htmlParser.findHistoryTable(document);
    if (historyTable && !processedElements.has(historyTable)) {
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Processing history table...");
      const historyContent = elementProcessors.processHistoryTable(historyTable, document, processedElements, "HISTORY_SECTION"); 
      if (historyContent) markdown += historyContent;
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Finished processing history table.");
    }

    // Attachment processing based on attachmentOption
    if (attachmentOption !== "hidden") {
      console.log(`[REGRESSION_DEBUG] markdown-generator.js: Processing attachments with option: ${attachmentOption}`);
      const allAttachments = htmlParser.extractAttachmentInfo(document);
      if (allAttachments && allAttachments.size > 0) {
        console.log(`[REGRESSION_DEBUG] markdown-generator.js: Found ${allAttachments.size} attachments.`);
        if (attachmentOption === "visible") {
          markdown += "\n\n## Attachments\n\n";
          const bulletImageRelPath = path.normalize(path.relative(path.dirname(mdFilePath), path.join(rootOutputDir, "images", "bullet_blue.gif"))).replace(/\\/g, "/");
          for (const attachment of allAttachments.values()) {
            const filename = attachment.filename || "unknown.file";
            const attachmentRelPath = `./${attachment.href}`.replace(/\\/g, "/");
            markdown += `![](${bulletImageRelPath}) [${filename}](${attachmentRelPath})\n`;
          }
        } else if (attachmentOption === "xml") {
          markdown += "\n\n<!-- Attachments -->\n";
          for (const attachment of allAttachments.values()) {
            const safeFilename = (attachment.filename || "unknown.file").replace(/"/g, "&quot;");
            const safeHref = (attachment.href || "#").replace(/"/g, "&quot;");
            markdown += `<attachment filename="${safeFilename}" local_path="${safeHref}" />\n`;
          }
        }
      } else {
        console.log("[REGRESSION_DEBUG] markdown-generator.js: No attachments found to process.");
      }
    }
    
    console.log("[REGRESSION_DEBUG] markdown-generator.js: Cleaning up and formatting final markdown...");
    markdown = utilities.cleanupMarkdown(markdown);
    markdown = utilities.fixBrokenTables(markdown);
    
    try {
      markdown = await prettier.format(markdown, { 
        parser: "markdown",
        printWidth: 120,
        proseWrap: "preserve"
      });
    } catch (err) {
      console.warn("[REGRESSION_DEBUG] Prettier formatting failed (markdown-generator.js):", err.message);
    }
    console.log("[REGRESSION_DEBUG] markdown-generator.js: generateMarkdown END");
    return markdown.trim();
  } catch (err) {
    console.error("[REGRESSION_DEBUG] Error in generateMarkdown:", err.message, err.stack);
    throw err;
  }
}

module.exports = {
  generateMarkdown
};

