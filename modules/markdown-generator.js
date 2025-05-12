// modules/markdown-generator.js - COMPREHENSIVE FIX V5 (Shared processedElements set)
/**
 * Module for generating Markdown content from parsed HTML
 * Using a single shared processedElements set across all top-level processing stages.
 */

const htmlParser = require("./html-parser");
const elementProcessors = require("./element-processors");
const contentProcessor = require("./content-processor");
const utilities = require("./utilities");
const prettier = require("prettier");

/**
 * Generate a complete Markdown document from an HTML document
 * @param {Document} document JSDOM document
 * @returns {Promise<string>} Markdown content
 */
async function generateMarkdown(document) {
  try {
    const title = htmlParser.extractTitle(document);
    const lastModified = htmlParser.extractLastModified(document);
    
    let markdown = `---\ntitle: "${utilities.escapeYaml(title)}"\nlastModified: "${utilities.escapeYaml(lastModified)}"\n---\n\n# ${title}\n\n`;
    
    // Use a single, shared processedElements set for the entire document processing.
    const processedElements = new Set(); 
    
    const pageMetadata = document.querySelector(".page-metadata");
    if (pageMetadata) {
      console.log("markdown-generator: Processing page metadata...");
      const metadataContent = elementProcessors.processMetadata(pageMetadata, document, processedElements, "METADATA_SECTION");
      if (metadataContent) markdown += metadataContent;
      console.log("markdown-generator: Finished processing page metadata.");
    }
    
    // The main content element should be processed *before* the history table if the history table might be *inside* it.
    // However, Confluence usually places history table outside the primary editable content area.
    // Let's find main content first, process it, then process history if it hasn't been caught by main content.

    console.log("markdown-generator: Attempting to find main content element using htmlParser.findMainContent...");
    const mainContentElement = htmlParser.findMainContent(document);
    
    if (mainContentElement) {
        console.log(`markdown-generator: Main content element FOUND. NodeName: ${mainContentElement.nodeName}, ID: '${mainContentElement.id || ""}', Class: '${mainContentElement.className || ""}'`);
        console.log(`markdown-generator: Number of childNodes in mainContentElement: ${mainContentElement.childNodes.length}`);
        
        if (mainContentElement.childNodes.length > 0) {
            console.log("markdown-generator: Iterating through mainContentElement.childNodes...");
            for (let i = 0; i < mainContentElement.childNodes.length; i++) {
                const childNode = mainContentElement.childNodes[i];
                const childNodeId = childNode.id || "NO_ID";
                const childNodeClass = childNode.className && typeof childNode.className === "string" ? childNode.className : (childNode.className && childNode.className.baseVal ? childNode.className.baseVal : "NO_CLASS");
                
                console.log(`markdown-generator: [MAIN_CONTENT_CHILD ${i+1}/${mainContentElement.childNodes.length}] NodeName: ${childNode.nodeName}, NodeType: ${childNode.nodeType}, ID: '${childNodeId}', Class: '${childNodeClass}', Text (first 50): '${(childNode.textContent || "").trim().substring(0,50)}...'`);
                
                if (processedElements.has(childNode)) {
                    console.log(`markdown-generator: [MAIN_CONTENT_CHILD ${i+1}] SKIPPING - already processed.`);
                    continue;
                }

                let childMarkdown = "";
                try {
                    console.log(`markdown-generator: [MAIN_CONTENT_CHILD ${i+1}] Calling processElementContent with parentPath: MAIN_CONTENT_ROOT`);
                    childMarkdown = contentProcessor.processElementContent(childNode, document, processedElements, elementProcessors, "MAIN_CONTENT_ROOT");
                    console.log(`markdown-generator: [MAIN_CONTENT_CHILD ${i+1}] Returned from processElementContent. Markdown length: ${childMarkdown.length}`);
                } catch (e) {
                    console.error(`markdown-generator: [MAIN_CONTENT_CHILD ${i+1}] Error during processElementContent for NodeName: ${childNode.nodeName}, ID: '${childNodeId}', Class: '${childNodeClass}'. Error: ${e.message}`, e.stack);
                }
                markdown += childMarkdown;
            }
            console.log("markdown-generator: Finished iterating through mainContentElement.childNodes.");
        } else {
            console.log("markdown-generator: mainContentElement has NO childNodes to process.");
        }
    } else {
        console.log("markdown-generator: Main content element was NOT found by htmlParser.findMainContent.");
    }

    const historyTable = htmlParser.findHistoryTable(document);
    if (historyTable && !processedElements.has(historyTable)) { // Check if not already processed as part of main content
      console.log("markdown-generator: Processing history table (if not already processed)...");
      const historyContent = elementProcessors.processHistoryTable(historyTable, document, processedElements, "HISTORY_SECTION"); 
      if (historyContent) markdown += historyContent;
      console.log("markdown-generator: Finished processing history table.");
    } else if (historyTable && processedElements.has(historyTable)) {
        console.log("markdown-generator: History table was already processed (likely as part of main content).");
    }

    const attachmentsSection = document.querySelector("#attachments");
    if (attachmentsSection && !processedElements.has(attachmentsSection)) {
      console.log("markdown-generator: Processing attachments section (if not already processed)...");
      const attachmentsContent = elementProcessors.processAttachmentsSection(attachmentsSection, document, processedElements, "ATTACHMENTS_SECTION");
      if (attachmentsContent) markdown += "\n\n" + attachmentsContent;
      console.log("markdown-generator: Finished processing attachments section.");
    } else if (attachmentsSection && processedElements.has(attachmentsSection)) {
        console.log("markdown-generator: Attachments section was already processed.");
    }
    
    markdown = utilities.cleanupMarkdown(markdown);
    markdown = utilities.fixBrokenTables(markdown);
    
    try {
      markdown = await prettier.format(markdown, { 
        parser: "markdown",
        printWidth: 120,
        proseWrap: "preserve"
      });
    } catch (err) {
      console.warn("Prettier formatting failed (markdown-generator.js):", err.message);
    }
    
    return markdown.trim();
  } catch (err) {
    console.error("Error in generateMarkdown:", err.message, err.stack);
    throw err;
  }
}

module.exports = {
  generateMarkdown
};

