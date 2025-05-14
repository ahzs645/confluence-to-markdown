// modules/content-processor.js - COMPREHENSIVE FIX V8 (Revised processedElements handling)
/**
 * Shared content processing functions to avoid circular dependencies
 * Complete overhaul for proper handling of all content elements
 * processElementContent now consistently adds element to processedElements before dispatching.
 */

const path = require("path");

/**
 * Clean and format cell content for Markdown tables, handling complex content
 * @param {Element} cell The table cell
 * @param {Document} document JSDOM document
 * @param {Set} processedElements Set of already processed elements
 * @param {Object} processors Module containing processor functions
 * @param {string} parentPath Parent path for debugging
 * @returns {string} Cleaned cell content
 */
function processElementContent(element, document, processedElements, processors, parentPath = "ROOT") {
  if (!element || !element.nodeType) return "";
  const currentPath = `${parentPath} > ${element.tagName || "TEXT_NODE"}${element.id ? "#"+element.id : ""}${element.className && typeof element.className === "string" ? "."+element.className.trim().replace(/\s+/g, ".") : (element.className && element.className.baseVal ? "."+element.className.baseVal.trim().replace(/\s+/g, ".") : "")}`;
  // console.log(`processElementContent [${currentPath}]: START`);

  if (element.nodeType === 3) { // Text node
    console.log(`processElementContent [${currentPath}]: Processing Text Node: "${element.textContent.trim().substring(0,30)}..."`);
    return element.textContent;
  }
  
  if (element.nodeType === 1) { // Element node
    if (shouldBeIgnored(element, currentPath, parentPath)) {
      console.log(`processElementContent [${currentPath}]: Ignoring element based on shouldBeIgnored.`);
      if (!processedElements.has(element)) processedElements.add(element); // Add ignored elements too to avoid re-check
      return "";
    }

    if (processedElements.has(element)) {
      console.log(`processElementContent [${currentPath}]: Element ALREADY PROCESSED, skipping.`);
      return "";
    }
    console.log(`processElementContent [${currentPath}]: Adding to processedElements and processing Element Node.`);
    processedElements.add(element); // Add current element to processed set BEFORE dispatching

    const tagName = element.tagName.toUpperCase();
    let markdown = "";

    switch (tagName) {
      case "DIV":
        console.log(`processElementContent [${currentPath}]: Calling processDiv.`);
        markdown += processors.processDiv(element, document, processedElements, currentPath);
        break;
      case "TABLE":
        console.log(`processElementContent [${currentPath}]: Calling processTable.`);
        markdown += processors.processTable(element, document, processedElements, currentPath);
        break;
      case "P":
        console.log(`processElementContent [${currentPath}]: Processing P.`);
        let paragraphContent = "";
        for (const child of element.childNodes) {
          paragraphContent += processElementContent(child, document, processedElements, processors, currentPath);
        }
        if (paragraphContent.trim()) {
          markdown += paragraphContent.trim() + "\n\n";
        }
        break;
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6":
        // Direct the heading processing to the specialized header processor
        // This avoids double processing that leads to "# # Heading" patterns
        console.log(`processElementContent [${currentPath}]: Calling processHeader for ${tagName}.`);
        markdown += processors.processHeader(element, document, processedElements, currentPath);
        break;
      case "UL":
        console.log(`processElementContent [${currentPath}]: Processing UL.`);
        for (const li of element.children) {
            if (li.tagName === "LI") { // processElementContent will handle processed check for li
                let itemContent = processElementContent(li, document, processedElements, processors, currentPath);
                itemContent = itemContent.trim();
                if (itemContent.includes("\n")) {
                    const lines = itemContent.split("\n");
                    const firstLine = lines.shift();
                    markdown += `- ${firstLine}\n`;
                    for (const line of lines) {
                        markdown += line.trim() ? `  ${line}\n` : "\n";
                    }
                } else {
                    markdown += `- ${itemContent}\n`;
                }
            }
        }
        markdown += "\n";
        break;
      case "OL":
        console.log(`processElementContent [${currentPath}]: Processing OL.`);
        let i = 1;
        for (const li of element.children) {
            if (li.tagName === "LI") { // processElementContent will handle processed check for li
                let itemContent = processElementContent(li, document, processedElements, processors, currentPath);
                itemContent = itemContent.trim();
                if (itemContent.includes("\n")) {
                    const lines = itemContent.split("\n");
                    const firstLine = lines.shift();
                    markdown += `${i}. ${firstLine}\n`;
                    for (const line of lines) {
                        markdown += line.trim() ? `   ${line}\n` : "\n";
                    }
                } else {
                    markdown += `${i}. ${itemContent}\n`;
                }
                i++;
            }
        }
        markdown += "\n";
        break;
      case "LI":
        console.log(`processElementContent [${currentPath}]: Processing LI.`);
        for (const child of element.childNodes) {
          markdown += processElementContent(child, document, processedElements, processors, currentPath);
        }
        break;
      case "A":
        console.log(`processElementContent [${currentPath}]: Calling processLink.`);
        markdown += processors.processLink(element, document, processedElements, processElementContent, currentPath);
        break;
      case "IMG":
        console.log(`processElementContent [${currentPath}]: Calling processImage.`);
        markdown += processors.processImage(element, currentPath);
        break;
      case "STRONG": case "B":
        console.log(`processElementContent [${currentPath}]: Processing ${tagName}.`);
        let boldText = "";
        for (const child of element.childNodes) {
          boldText += processElementContent(child, document, processedElements, processors, currentPath);
        }
        markdown += `**${boldText}**`;
        break;
      case "EM": case "I":
        console.log(`processElementContent [${currentPath}]: Processing ${tagName}.`);
        let italicText = "";
        for (const child of element.childNodes) {
          italicText += processElementContent(child, document, processedElements, processors, currentPath);
        }
        markdown += `*${italicText}*`;
        break;
      case "CODE":
        console.log(`processElementContent [${currentPath}]: Processing CODE.`);
        let codeText = "";
        for (const child of element.childNodes) {
          // For CODE, we might want raw text content, not recursively processed markdown
          codeText += child.textContent; // Simpler for code
        }
        if (element.parentElement && element.parentElement.tagName.toUpperCase() === "PRE") {
            markdown += codeText;
        } else {
            markdown += `\\[${codeText}\\]`;
        }
        break;
      case "PRE":
        console.log(`processElementContent [${currentPath}]: Processing PRE.`);
        let preText = "";
        // For PRE, get text content, often contains a CODE child
        preText = element.textContent; // Simpler for preformatted text
        const language = element.getAttribute("data-language") || element.className.match(/language-(\S+)/)?.[1] || "";
        markdown += `\\[\\[\\[${language}\n${preText.trim()}\n\\]\\]\\]\n\n`;
        break;
      case "BR":
        console.log(`processElementContent [${currentPath}]: Processing BR.`);
        markdown += "\n";
        break;
      case "HR":
        console.log(`processElementContent [${currentPath}]: Processing HR.`);
        markdown += "\n---\n\n";
        break;
      case "SPAN":
        console.log(`processElementContent [${currentPath}]: Processing SPAN.`);
        if (element.classList && element.classList.contains("highlight")) {
          let highlightText = "";
          for (const child of element.childNodes) {
            highlightText += processElementContent(child, document, processedElements, processors, currentPath);
          }
          markdown += `**${highlightText}**`;
        } else if (element.classList && element.classList.contains("status-macro")) {
          let statusText = element.textContent.trim();
          markdown += `\\[${statusText}\\]`;
        } else {
          console.log(`processElementContent [${currentPath}]: Processing generic SPAN.`);
          for (const child of element.childNodes) {
            markdown += processElementContent(child, document, processedElements, processors, currentPath);
          }
        }
        break;
      default:
        console.log(`processElementContent [${currentPath}]: Processing DEFAULT case for ${tagName}, iterating children.`);
        for (const child of element.childNodes) {
          markdown += processElementContent(child, document, processedElements, processors, currentPath);
        }
    }
    console.log(`processElementContent [${currentPath}]: END for ${tagName}, accumulated markdown length: ${markdown.length}`);
    return markdown;
  }
  
  console.log(`processElementContent [${currentPath}]: END (not Text or Element node)`);
  return "";
}

function cleanCellContent(cell, document, processedElements, processors, parentPath) {
  if (!cell) return "";
  
  // Check if the cell contains complex content
  if (isComplexTableCell(cell)) {
    // For complex cells, return simplified representation
    return simplifyComplexCell(cell);
  }
  
  // For simple cells, process content with better formatting
  const cellProcessedElements = new Set(processedElements); 
  let content = "";
  
  for (const child of cell.childNodes) {
    content += processElementContent(child, document, cellProcessedElements, processors, `${parentPath} > CELL_CHILD`);
  }
  
  // Clean up the content for Markdown tables
  content = content.trim()
    .replace(/\n/g, " ")      // Replace newlines with spaces
    .replace(/\s+/g, " ")     // Collapse whitespace
    .replace(/\|/g, "\\|");   // Escape pipe characters
  
  return content;
}

/**
 * Check if a cell contains complex content that can't be properly rendered in a Markdown table
 * @param {Element} cell The cell to check
 * @returns {boolean} True if complex cell
 */
function isComplexTableCell(cell) {
  if (!cell) return false;
  
  // Check for headings, images, lists, tables, panels, etc.
  if (cell.querySelector('h1, h2, h3, h4, h5, h6, img, ul, ol, table, .panel, .confluence-information-macro')) {
    return true;
  }
  
  // Check for multiple paragraphs
  const paragraphs = cell.querySelectorAll('p');
  if (paragraphs.length > 1) {
    return true;
  }
  
  // Check for content with multiple line breaks that would need to be preserved
  if (cell.innerHTML && cell.innerHTML.includes('<br') && cell.innerHTML.split('<br').length > 2) {
    return true;
  }
  
  return false;
}

/**
 * Create a simplified representation of complex cell content
 * @param {Element} cell The complex cell
 * @returns {string} Simplified representation
 */
function simplifyComplexCell(cell) {
  // Handle headings - extract text and preserve as a strong text
  const headings = cell.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length > 0) {
    return `**${headings[0].textContent.trim()}**`;
  }
  
  // Handle images - indicate [image] with alt text if available
  const images = cell.querySelectorAll('img');
  if (images.length > 0) {
    const alt = images[0].getAttribute('alt') || 'image';
    return `[${alt}]`;
  }
  
  // Handle lists - create a simplified list representation
  const lists = cell.querySelectorAll('ul, ol');
  if (lists.length > 0) {
    const list = lists[0];
    const items = list.querySelectorAll('li');
    if (items.length <= 2) {
      // For short lists, include the items
      return Array.from(items)
        .map(item => `• ${item.textContent.trim()}`)
        .join(' ');
    } else {
      // For longer lists, just indicate the number of items
      return `[List with ${items.length} items]`;
    }
  }
  
  // Handle nested tables - just indicate [table]
  const tables = cell.querySelectorAll('table');
  if (tables.length > 0) {
    return '[Nested table]';
  }
  
  // Handle panels/macros
  const panels = cell.querySelectorAll('.panel, .confluence-information-macro');
  if (panels.length > 0) {
    return '[Panel content]';
  }
  
  // Default: extract text content, collapse whitespace, and limit length
  let text = cell.textContent.trim().replace(/\s+/g, ' ');
  if (text.length > 50) {
    text = text.substring(0, 47) + '...';
  }
  
  return text;
}

function shouldBeIgnored(element, currentPath, parentPath) {
  if (!element || !element.tagName) return true;
  if (element.nodeType === 8) { console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Ignoring COMMENT node.`); return true; }
  
  const tagName = element.tagName.toUpperCase();
  if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT" || tagName === "BUTTON") { console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Ignoring ${tagName} tag.`); return true; }
  if (element.getAttribute("aria-hidden") === "true") { console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Ignoring aria-hidden=true.`); return true; }
  if (element.style && (element.style.display === "none" || element.style.visibility === "hidden")) { console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Ignoring display:none or visibility:hidden.`); return true; }

  const globallyExcludeClasses = ["breadcrumb-section", "footer", "aui-nav", "pageSectionHeader", "hidden", "navigation", "screenreader-only", "hidden-xs", "hidden-sm", "aui-icon", "aui-avatar-inner", "expand-control"];
  const globallyExcludeIds = ["breadcrumbs", "footer", "navigation", "sidebar", "page-sidebar", "header", "actions", "likes-and-labels-container", "page-metadata-secondary"];

  if (element.className && typeof element.className === "string") {
    const classNames = element.className.split(" ");
    if (classNames.some(cls => globallyExcludeClasses.includes(cls))) { console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Ignoring due to global class: ${classNames.find(c => globallyExcludeClasses.includes(c))}`); return true; }
  }
  if (element.id && globallyExcludeIds.includes(element.id)) { console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Ignoring due to global ID: ${element.id}`); return true; }

  if (!parentPath.includes("MAIN_CONTENT_ROOT")) { // Check against MAIN_CONTENT_ROOT from markdown-generator
    // More aggressive exclusions if not in main content.
  } else {
    console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Element is in MAIN_CONTENT_ROOT, NOT ignoring by default rules here.`);
    return false; 
  }

  console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: NOT ignoring (default evaluation).`);
  return false;
}

module.exports = {
  cleanCellContent,
  isComplexTableCell,
  simplifyComplexCell,
  processElementContent,
  cleanCellContent,
  shouldBeIgnored
};



