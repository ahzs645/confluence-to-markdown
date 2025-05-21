// modules/content-processor.js - COMPREHENSIVE FIX V8 (Revised processedElements handling)
/**
 * @fileoverview Shared content processing functions.
 * This module provides the core logic for recursively processing HTML elements
 * and converting them into Markdown. It handles various element types and ensures
 * that elements are not processed multiple times. It also includes utilities for
 * handling specific scenarios like table cell content and ignoring irrelevant elements.
 */

const path = require("path");

/**
 * Recursively processes an HTML element and its children, converting them to Markdown.
 * This is the central function for content conversion. It identifies the element type
 * and dispatches to the appropriate handler in the `processors` object.
 * It also manages a set of `processedElements` to avoid infinite loops and redundant processing.
 *
 * @param {Node} element - The HTML DOM Node (Element, TextNode, etc.) to process.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of already processed DOM nodes.
 * @param {Object<string, function>} processors - An object mapping element tag names (or types) to processor functions.
 *                                                These functions are responsible for converting specific elements to Markdown.
 *                                                It's expected to contain functions like `processDiv`, `processTable`, etc.,
 *                                                and also `processElementContent` itself for recursive calls.
 * @param {string} [parentPath="ROOT"] - A string representing the path of parent elements, used for debugging and context.
 * @returns {string} The Markdown representation of the processed element and its children. Returns an empty string
 *                   if the element is null, should be ignored, or has already been processed.
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
        markdown += processors.processDiv(element, document, processedElements, processors, currentPath);
        break;
      case "TABLE":
        markdown += processors.processTable(element, document, processedElements, processors, currentPath);
        break;
      case "P":
        markdown += processors.processParagraphElement(element, document, processedElements, processors, currentPath);
        break;
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6":
        markdown += processors.processHeader(element, document, processedElements, processors, currentPath);
        break;
      case "UL":
        markdown += processors.processUnorderedListElement(element, document, processedElements, processors, currentPath);
        break;
      case "OL":
        markdown += processors.processOrderedListElement(element, document, processedElements, processors, currentPath);
        break;
      case "LI":
        markdown += processors.processListItemElement(element, document, processedElements, processors, currentPath);
        break;
      case "A":
        markdown += processors.processLink(element, document, processedElements, processors, currentPath);
        break;
      case "IMG":
        markdown += processors.processImage(element, document, processedElements, processors, currentPath);
        break;
      case "STRONG": case "B":
        markdown += processors.processStrongOrBoldElement(element, document, processedElements, processors, currentPath);
        break;
      case "EM": case "I":
        markdown += processors.processEmphasisOrItalicElement(element, document, processedElements, processors, currentPath);
        break;
      case "CODE":
        markdown += processors.processCodeElement(element, document, processedElements, processors, currentPath);
        break;
      case "PRE":
        markdown += processors.processPreformattedElement(element, document, processedElements, processors, currentPath);
        break;
      case "BR":
        markdown += processors.processBreakElement(element, document, processedElements, processors, currentPath);
        break;
      case "HR":
        markdown += processors.processHorizontalRuleElement(element, document, processedElements, processors, currentPath);
        break;
      case "SPAN":
        markdown += processors.processSpanElement(element, document, processedElements, processors, currentPath);
        break;
      default:
        markdown += processors.processDefaultElement(element, document, processedElements, processors, currentPath);
    }
    console.log(`processElementContent [${currentPath}]: END for ${tagName}, accumulated markdown length: ${markdown.length}`);
    return markdown;
  }
  
  console.log(`processElementContent [${currentPath}]: END (not Text or Element node)`);
  return "";
}

/**
 * Cleans and formats the content of a table cell for Markdown table representation.
 * If the cell contains complex content (e.g., nested tables, block elements),
 * it uses `processors.simplifyComplexCellContent`. Otherwise, it processes the
 * cell's content recursively and then cleans it for Markdown table compatibility
 * (e.g., removes newlines, escapes pipe characters).
 *
 * @param {Element} cell - The HTML TD or TH element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of already processed DOM nodes, passed to recursive calls.
 * @param {Object<string, function>} processors - An object containing processor functions, including
 *                                                `isComplexTableCell` and `simplifyComplexCellContent`.
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {string} The cleaned and formatted Markdown content of the cell.
 */
function cleanCellContent(cell, document, processedElements, processors, parentPath) {
  if (!cell) return "";
  
  // Check if the cell contains complex content
  // Use the versions from the processors object, which should come from element-processors.js
  if (processors.isComplexTableCell(cell)) {
    // For complex cells, return simplified representation
    return processors.simplifyComplexCellContent(cell);
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
 * Checks if a table cell contains complex content that cannot be easily rendered
 * within a standard Markdown table cell (e.g., nested tables, block elements, multiple paragraphs).
 * This version is local to content-processor and might be used if `processors.isComplexTableCell` isn't available,
 * though the intention is usually to use the one from the `processors` object.
 *
 * @param {Element} cell - The HTML TD or TH element to check.
 * @returns {boolean} True if the cell is considered complex, false otherwise.
 */
function isComplexTableCell(cell) {
  if (!cell) return false;
  
  // Check for headings, images, lists, tables, panels, etc.
  if (cell.querySelector('h1, h2, h3, h4, h5, h6, img, ul, ol, table, .panel, .confluence-information-macro')) {
    return true;
  }
  
  // Check for multiple paragraphs
  const paragraphs = cell.querySelectorAll('p');
  //if (paragraphs.length > 1) {
  //  return true;
  //}
  
  // Check for content with multiple line breaks that would need to be preserved
  if (cell.innerHTML && cell.innerHTML.includes('<br') && cell.innerHTML.split('<br').length > 2) {
    return true;
  }
  
  return false;
}

/**
 * Creates a simplified textual representation of complex cell content.
 * This is used when `isComplexTableCell` determines that a cell's content
 * is too complex for direct Markdown table rendering. It provides a placeholder
 * or summary (e.g., "[Image]", "[List with 5 items]").
 * This version is local to content-processor.
 *
 * @param {Element} cell - The complex HTML TD or TH element.
 * @returns {string} A simplified string representation of the cell's content.
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

/**
 * Determines if an HTML element should be ignored during processing.
 * This function checks for various conditions:
 * - Null or non-element nodes.
 * - Comment nodes.
 * - Specific tag names (SCRIPT, STYLE, NOSCRIPT, BUTTON).
 * - Elements with `aria-hidden="true"`.
 * - Elements with `display:none` or `visibility:hidden` styles.
 * - Elements matching globally excluded class names or IDs.
 * - Elements not within the "MAIN_CONTENT_ROOT" path (unless explicitly processed earlier).
 *
 * @param {Node} element - The HTML DOM Node to check.
 * @param {string} currentPath - The debug path of the current element.
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {boolean} True if the element should be ignored, false otherwise.
 */
function shouldBeIgnored(element, currentPath, parentPath) {
  if (!element || !element.tagName) return true; // Also handles non-Element nodes if tagName is primary interest
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

  // If an element has not been ignored by any of the global rules above,
  // check its path context. Elements not within MAIN_CONTENT_ROOT are generally ignored.
  if (!parentPath.includes("MAIN_CONTENT_ROOT")) {
    console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Element is NOT in MAIN_CONTENT_ROOT (path: ${parentPath}), ignoring.`);
    return true; 
  }

  // If it's in MAIN_CONTENT_ROOT and not caught by any rule above, then don't ignore it.
  console.log(`shouldBeIgnored [${currentPath} from ${parentPath}]: Element is in MAIN_CONTENT_ROOT (path: ${parentPath}) and not globally excluded, NOT ignoring.`);
  return false;
}

module.exports = {
  cleanCellContent,
  isComplexTableCell, 
  simplifyComplexCell,  
  processElementContent, 
  shouldBeIgnored,
};



