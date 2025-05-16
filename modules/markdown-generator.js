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
    
    // Add breadcrumb extraction
    const breadcrumbs = htmlParser.extractBreadcrumbs(document);
    
    // Extract metadata for frontmatter
    const pageMetadata = document.querySelector(".page-metadata");
    let createdBy = "";
    let createdDate = "";
    
    if (pageMetadata) {
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Extracting detailed metadata...");
      const metadataContent = pageMetadata.textContent.trim();
      
      // Extract author information
      const authorMatch = metadataContent.match(/Created by\s+(.*?)(?:,|\s+last)/i);
      if (authorMatch && authorMatch[1]) {
        createdBy = authorMatch[1].trim();
      }
      
      // Extract created date
      const createdDateMatch = metadataContent.match(/on\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}|[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4})/i);
      if (createdDateMatch && createdDateMatch[1]) {
        createdDate = createdDateMatch[1].trim();
      }
    }
    
    // Generate enhanced frontmatter
    let frontmatter = `---\n`;
    frontmatter += `title: "${utilities.escapeYaml(title)}"\n`;
    
    if (createdBy) {
      frontmatter += `created_by: "${utilities.escapeYaml(createdBy)}"\n`;
    }
    
    if (createdDate) {
      frontmatter += `created_date: "${utilities.escapeYaml(createdDate)}"\n`;
    }
    
    frontmatter += `last_modified: "${utilities.escapeYaml(lastModified)}"\n`;
    
    // Add breadcrumb data to frontmatter
    if (breadcrumbs && breadcrumbs.length > 0) {
      frontmatter += `breadcrumbs:\n`;
      for (const crumb of breadcrumbs) {
        frontmatter += `  - title: "${utilities.escapeYaml(crumb.text)}"\n`;

        // Clean up the URL for the YAML
        let href = crumb.href;

        // Strip any URI parameters
        href = href.split('?')[0];

        // Extract just the filename
        const filename = path.basename(href);

        // For internal links, use just the filename
        if (href !== '#' && !href.startsWith('http')) {
          href = `./${filename}`;
        }

        frontmatter += `    url: "${utilities.escapeYaml(href)}"\n`;
      }
    }
    
    frontmatter += `---\n\n`;
    
    // Build the markdown content
    let markdown = frontmatter;
    
    // Add visible breadcrumbs navigation
    if (breadcrumbs && breadcrumbs.length > 0) {
      markdown += '> ';
      markdown += breadcrumbs.map(crumb => {
        // Make sure the href is relative and points to a valid location
        let href = crumb.href;

        // Strip any URI parameters from the end of the href
        href = href.split('?')[0];

        // Extract just the filename without directory structure
        const filename = path.basename(href);

        // For internal links within the site, just use the filename without path
        if (href !== '#' && !href.startsWith('http')) {
          href = `./${filename}`;
        }

        return `[${crumb.text}](${href})`;
      }).join(' > ');
      markdown += '\n\n';
    }
    
    markdown += `# ${title}\n\n`;
    
    const processedElements = new Set(); 
    
    // Process page metadata in a cleaner way, but exclude it from the main markdown since we're using frontmatter
    if (pageMetadata) {
      console.log("[REGRESSION_DEBUG] markdown-generator.js: Processing page metadata...");
      // The metadata is already in frontmatter, so we're only extracting it here
      // but not adding to markdown since it would be duplicate
      elementProcessors.processMetadata(pageMetadata, document, processedElements, "METADATA_SECTION");
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
          
          // bullet image path
          const bulletImageRelPath = "images/bullet_blue.gif";
          
          for (const attachment of allAttachments.values()) {
            const filename = attachment.filename || "unknown.file";
            
            // Ensure the attachment path is properly relative
            let attachmentRelPath = attachment.href;
            if (!attachmentRelPath.startsWith('./') && !attachmentRelPath.startsWith('../')) {
              attachmentRelPath = `./${attachmentRelPath}`;
            }
            
            attachmentRelPath = attachmentRelPath.replace(/\\/g, "/");
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
