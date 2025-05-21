// modules/html-parser.js
/**
 * @fileoverview This module is responsible for parsing HTML files and extracting
 * structured information such as title, metadata, main content, attachments,
 * breadcrumbs, and various specific HTML elements like tables and panels.
 * It uses JSDOM for parsing HTML content.
 */

const { JSDOM } = require('jsdom');
const fs = require('fs/promises');
const path = require('path');

/**
 * Parses an HTML file from the given file path and returns a JSDOM document object.
 * @async
 * @param {string} filePath - The absolute or relative path to the HTML file.
 * @returns {Promise<Document>} A promise that resolves to a JSDOM `Document` object.
 * @throws {Error} If reading the file or parsing the HTML content fails.
 */
async function parseFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const dom = new JSDOM(content);
    return dom.window.document;
  } catch (err) {
    console.error(`Error parsing HTML file ${filePath}:`, err);
    throw err;
  }
}

/**
 * Extracts the document title from a JSDOM document.
 * It tries a series of selectors, prioritizing Confluence-specific title elements,
 * then common heading elements (`<h1>`), and finally the HTML `<title>` tag.
 * Also cleans common prefixes and decodes HTML entities.
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {string} The extracted and cleaned document title, or "Untitled Page" if no title can be determined.
 */
function extractTitle(document) {
  const titleSelectors = [
    '#title-text', // Confluence specific
    '.pagetitle',  // Common class for page titles
    '#title-heading .page-title', // Confluence specific
    '#title-heading', // Confluence specific
    'h1' // Generic H1
  ];
  
  let title = '';
  for (const selector of titleSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      title = element.querySelector('#title-text') ? element.querySelector('#title-text').textContent.trim() : element.textContent.trim();
      break;
    }
  }

  if (!title && document.title) {
    title = document.title.trim();
  }
  
  // Clean common prefixes (e.g., from Confluence exports)
  title = title.replace(/^.*\s*:\s*/, '');
  if (!title) title = 'Untitled Page';
  
  // Decode HTML entities that might be present
  const textarea = document.createElement('textarea');
  textarea.innerHTML = title;
  return textarea.value;
}

/**
 * Extracts the last modified date or author information from a JSDOM document.
 * It searches for elements matching a predefined list of selectors commonly used
 * for this information (e.g., `.last-modified`, `.page-metadata`).
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {string} The text content representing the last modified information,
 *                   or an empty string if not found.
 */
function extractLastModified(document) {
  const selectors = [
    '.last-modified',          // Common class
    '.page-metadata .editor',  // Confluence specific
    '.page-metadata time',     // More specific metadata time element
    '.page-metadata'           // General metadata container
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      if (selector === '.page-metadata') { // Special handling for generic container
        const text = element.textContent.trim();
        const match = text.match(/last updated by\s+(.*?)(?:\s+on\s+(.*))?$/i); // Try to find specific text pattern
        if (match && match[1]) return match[1].trim(); // Return user/date part
      } else {
        return element.textContent.trim();
      }
    }
  }
  return ''; // Not found
}

/**
 * Finds the main content container element within a JSDOM document.
 * It iterates through a list of common selectors used for identifying main content areas
 * (e.g., `#main-content`, `.wiki-content`, `main`).
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Element} The first matching main content element found, or `document.body` as a fallback
 *                    if no specific main content container is identified.
 */
function findMainContent(document) {
  const contentSelectors = [
    '#main-content',             // Common ID for main content
    '.wiki-content',             // Confluence specific
    '#content .wiki-content',    // More specific Confluence
    '#content',                  // Generic content ID
    'main',                      // HTML5 main element
    '.main-container',           // Common class
    '.view',                     // Another common class
    'article'                    // HTML5 article element
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  console.warn("No specific main content element found, falling back to document.body.");
  return document.body; // Fallback
}

// --- Attachment Extraction Helpers ---

/**
 * @private
 * Extracts attachments that are explicitly linked using `data-linked-resource-type="attachment"`
 * attributes on `<a>`, `<div>`, or `<img>` tags. Populates the provided `attachments` map.
 * @param {Document} document - The JSDOM `Document` object.
 * @param {Map<string, {id: string, filename: string, containerId: string|null, href: string}>} attachments - The map to populate with extracted attachment information.
 *        Keys are attachment IDs, values are objects with attachment details.
 */
function extractLinkedResourceAttachments(document, attachments) {
  const attachmentLinks = document.querySelectorAll('a[data-linked-resource-type="attachment"], div[data-linked-resource-type="attachment"]'); // Also check divs with this data attribute
  for (const link of attachmentLinks) {
    const id = link.getAttribute('data-linked-resource-id');
    // For divs, filename might be in data-linked-resource-default-alias, for <a> it's textContent
    const filename = link.tagName === 'DIV' ? link.getAttribute('data-linked-resource-default-alias') : link.textContent.trim();
    const containerId = link.getAttribute('data-linked-resource-container-id');
    let href = link.getAttribute('href'); // May be null for divs

    if (!href && link.tagName === 'DIV' && filename) { // Construct href for DIVs if not present
        href = `attachments/${containerId}/${id}/${filename}`; // A common pattern
    }
    
    if (id && filename && href && !attachments.has(id)) {
      attachments.set(id, {
        id, filename, containerId,
        href: href.startsWith('http') ? href : path.normalize(href).replace(/\\/g, '/') // Normalize and ensure forward slashes
      });
    }
  }

  const imageLinks = document.querySelectorAll('img[data-linked-resource-type="attachment"]');
  for (const img of imageLinks) {
    const id = img.getAttribute('data-linked-resource-id');
    const src = img.getAttribute('src');
    if (id && src && !attachments.has(id)) {
      const filename = path.basename(src);
      const containerId = img.getAttribute('data-linked-resource-container-id');
      attachments.set(id, {
        id, filename, containerId,
        href: src.startsWith('http') ? src : path.normalize(src).replace(/\\/g, '/')
      });
    }
  }
}

/**
 * @private
 * Extracts attachments embedded as images (`<img>` tags) where the `src` attribute
 * points to a path typically containing "attachments/". Populates the provided `attachments` map.
 * It attempts to heuristically derive an ID and container ID from the image `src` path.
 * @param {Document} document - The JSDOM `Document` object.
 * @param {Map<string, {id: string, filename: string, containerId: string|null, href: string}>} attachments - The map to populate with extracted attachment information.
 */
function extractImageSrcAttachments(document, attachments) {
  const regularImages = document.querySelectorAll('img[src*="attachments/"]'); // More general match
  for (const img of regularImages) {
    const src = img.getAttribute('src');
    if (src) {
      const filename = path.basename(src);
      // Try to derive an ID. This is heuristic.
      // Example: attachments/12345/67890/image.png -> id=67890, containerId=12345
      // Example: attachments/image.png -> id=filename
      const parts = src.split('/');
      let id = filename; // Default id to filename if no numeric ID found
      let containerId = null; 
      const attachmentsIndex = parts.indexOf('attachments');
      if (attachmentsIndex !== -1 && attachmentsIndex + 2 < parts.length && /^\d+$/.test(parts[attachmentsIndex+1]) && /^\d+$/.test(parts[attachmentsIndex+2])) {
          containerId = parts[attachmentsIndex+1];
          id = parts[attachmentsIndex+2];
      } else if (attachmentsIndex !== -1 && attachmentsIndex + 1 < parts.length && /^\d+$/.test(parts[attachmentsIndex+1])) {
          id = parts[attachmentsIndex+1]; // If only one numeric part after /attachments/
      }


      if (!attachments.has(id)) { // Add if ID (derived or filename) is not already there
        attachments.set(id, {
          id, filename, containerId,
          href: src.startsWith('http') ? src : path.normalize(src).replace(/\\/g, '/')
        });
      }
    }
  }
}

/**
 * @private
 * Extracts attachments from links found within elements having the class "greybox".
 * This is a common pattern in Confluence pages for listing attachments.
 * Populates the provided `attachments` map.
 * @param {Document} document - The JSDOM `Document` object.
 * @param {Map<string, {id: string, filename: string, containerId: string|null, href: string}>} attachments - The map to populate with extracted attachment information.
 */
function extractGreyboxAttachments(document, attachments) {
  const greyboxes = document.querySelectorAll('.greybox'); // Confluence specific for attachment lists
  for (const greybox of greyboxes) {
    const greyboxLinks = greybox.querySelectorAll('a[href*="attachments/"]');
    for (const link of greyboxLinks) {
      const href = link.getAttribute('href');
      const filename = link.textContent.trim() || path.basename(href);
      if (href && filename) {
        // Try to parse a unique ID from href, fallback to filename
        const parts = href.split('/');
        let id = filename;
        const attachmentsIndex = parts.indexOf('attachments');
         if (attachmentsIndex !== -1 && attachmentsIndex + 2 < parts.length && /^\d+$/.test(parts[attachmentsIndex+1]) && /^\d+$/.test(parts[attachmentsIndex+2])) {
            id = parts[attachmentsIndex+2]; // Use the numeric ID if available
        }

        if (!attachments.has(id)) {
          attachments.set(id, {
            id, filename,
            containerId: (attachmentsIndex !== -1 && attachmentsIndex + 1 < parts.length && /^\d+$/.test(parts[attachmentsIndex+1])) ? parts[attachmentsIndex+1] : null,
            href: href.startsWith('http') ? href : path.normalize(href).replace(/\\/g, '/')
          });
        }
      }
    }
  }
}

/**
 * Extracts attachment information from various common patterns in a JSDOM document.
 * This function aggregates results from several helper functions, each targeting specific ways
 * attachments are embedded or linked in HTML (e.g., Confluence-specific attributes, image paths, "greybox" lists).
 * Paths are normalized, and efforts are made to assign unique IDs to attachments.
 * @param {Document} document - The JSDOM `Document` object to parse for attachments.
 * @returns {Map<string, {id: string, filename: string, containerId: (string|null), href: string}>}
 *          A map where keys are unique attachment identifiers (often derived IDs or filenames) and
 *          values are objects containing `id`, `filename`, `containerId` (if available), and `href`.
 */
function extractAttachmentInfo(document) {
  const attachments = new Map();
  try {
    extractLinkedResourceAttachments(document, attachments);
    extractImageSrcAttachments(document, attachments);
    extractGreyboxAttachments(document, attachments);

    // Add other common patterns if needed, e.g. Confluence specific span.confluence-embedded-file
    const embeddedFiles = document.querySelectorAll('span.confluence-embedded-file a, div.confluence-embedded-file a');
    for (const link of embeddedFiles) {
        const href = link.getAttribute('href');
        const filename = link.getAttribute('data-filename') || link.textContent.trim() || path.basename(href);
        if (href && filename) {
            const id = path.basename(href, path.extname(href)) + '-' + filename; // Create a more unique ID
            if (!attachments.has(id)) {
                 attachments.set(id, {
                    id, filename, containerId: null, // containerId might not be available here
                    href: href.startsWith('http') ? href : path.normalize(href).replace(/\\/g, '/')
                });
            }
        }
    }

  } catch (err) {
    console.error('Error extracting attachment info:', err);
    // Return what has been collected so far, or an empty map
  }
  return attachments;
}

// --- Other Extraction Functions ---

/**
 * Finds all elements in the document that are likely "panel" components
 * (e.g., info boxes, note panels, warning panels).
 * It queries for a list of common CSS selectors used for such panels.
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Element[]} An array of JSDOM `Element` objects identified as panels.
 */
function findPanels(document) {
  const panelSelectors = ['.panel', '.confluence-information-macro', '.aui-message', '.admonition', '.expand-container'];
  const panels = [];
  for (const selector of panelSelectors) {
    panels.push(...Array.from(document.querySelectorAll(selector)));
  }
  return panels;
}

/**
 * Finds all `<table>` elements in the JSDOM document.
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Element[]} An array of all `<table>` elements found in the document.
 */
function findTables(document) {
  return Array.from(document.querySelectorAll('table'));
}

/**
 * Attempts to find a page history table within the JSDOM document.
 * It uses a combination of specific IDs/class selectors and heuristics, such as
 * looking for tables near headings containing "History" or "Version", or tables
 * with characteristic column headers (e.g., "Version", "Changed By").
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Element|null} The identified history table `Element`, or `null` if no suitable table is found.
 */
function findHistoryTable(document) {
  const historySelectors = ['#page-history-container', '.tableview', 'table.pageHistory', 'table#page-history'];
  for (const selector of historySelectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  // Heuristic: find tables near headings like "History" or "Version"
  const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const heading of headings) {
    const headingText = heading.textContent.toLowerCase();
    if (headingText.includes('history') || headingText.includes('version')) {
      let nextElement = heading.nextElementSibling;
      while (nextElement) {
        if (nextElement.tagName === 'TABLE') return nextElement;
        if (/^H[1-6]$/.test(nextElement.tagName)) break; // Stop if another heading is encountered
        nextElement = nextElement.nextElementSibling;
      }
    }
  }
  // Heuristic: find tables with specific column headers
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const headers = Array.from(table.querySelectorAll('th, thead td')).map(cell => cell.textContent.trim().toLowerCase());
    if ((headers.includes('version') || headers.includes('v.')) && (headers.includes('changed by') || headers.includes('author') || headers.includes('published') || headers.includes('modified'))) {
      return table;
    }
  }
  // Heuristic: find tables inside "expand" elements with "history" in title
  const expanders = document.querySelectorAll('.expand-container');
  for (const expander of expanders) {
    const controlText = expander.querySelector('.expand-control-text');
    if (controlText && controlText.textContent.toLowerCase().includes('history')) {
      const tableInExpander = expander.querySelector('table');
      if (tableInExpander) return tableInExpander;
    }
  }
  return null;
}

/**
 * Extracts content sections from the document, assuming sections are demarcated by heading elements (H1-H6).
 * Each section includes the header element itself and all subsequent sibling content until the next
 * header of the same or higher level.
 * Note: This function's utility might be limited if main content is processed more holistically.
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Map<string, {header: Element, content: Element, level: number}>}
 *          A map where keys are section IDs (derived from header ID or slugified text) and values are
 *          objects containing the `header` element, a `div` element (`content`) with cloned content
 *          of the section, and the heading `level`.
 */
function findContentSections(document) {
  const sections = new Map();
  const headers = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const header of headers) {
    const id = header.id || header.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    const level = parseInt(header.tagName.substring(1), 10);
    const contentElement = document.createElement('div'); // Container for content under this header
    let currentNode = header.nextSibling;
    while (currentNode) {
      if (currentNode.nodeType === 1 && /^H[1-6]$/.test(currentNode.tagName) && parseInt(currentNode.tagName.substring(1), 10) <= level) {
        break; // Stop at next header of same or higher level
      }
      contentElement.appendChild(currentNode.cloneNode(true));
      currentNode = currentNode.nextSibling;
    }
    if (id && !sections.has(id)) { // Avoid duplicate IDs, first one wins
        sections.set(id, { header, content: contentElement, level });
    }
  }
  return sections;
}

/**
 * Finds elements in the document that are likely used as layout containers
 * (e.g., for columns, sections).
 * It queries for a list of common CSS selectors used for such layout elements.
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Element[]} An array of JSDOM `Element` objects identified as layout containers.
 */
function findLayouts(document) {
  const layoutSelectors = ['.contentLayout', '.columnLayout', '.layout', '.section', '.cell', '.innerCell']; // Added cell/innerCell as they can be layout containers
  const layouts = [];
  for (const selector of layoutSelectors) {
    layouts.push(...Array.from(document.querySelectorAll(selector)));
  }
  return layouts;
}

/**
 * Finds elements that typically function as cells within layouts or tables.
 * This includes `<td>`, `<th>` elements, as well as `<div>` elements with common
 * cell-like class names (e.g., `.cell`, `.layout-column`).
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Element[]} An array of JSDOM `Element` objects identified as cells.
 */
function findCells(document) {
  // Includes table cells and div-based layout cells
  return Array.from(document.querySelectorAll('td, th, .cell, .innerCell, .layout-cell, .layout-column'));
}

/**
 * Determines if a given HTML element should be dropped (i.e., excluded) from processing and conversion.
 * Exclusion criteria include specific class names (e.g., 'footer', 'hidden', 'noprint'),
 * specific IDs (e.g., 'breadcrumbs', 'sidebar'), and elements with `style.display === 'none'`.
 * @param {Element} element - The HTML `Element` to check.
 * @returns {boolean} True if the element meets any of the exclusion criteria, false otherwise.
 *                    Also returns true if the input `element` is null or has no `tagName`.
 */
function shouldBeDropped(element) {
  if (!element || !element.tagName) return true; // Drop non-elements or nulls
  const excludeClasses = ['breadcrumb-section', 'footer', 'aui-nav', 'pageSectionHeader', 'hidden', 'navigation-section', 'noprint'];
  const excludeIds = ['breadcrumbs', 'footer', 'navigation', 'sidebar', 'page-sidebar', 'header-aui'];
  
  if (element.className && typeof element.className === 'string') {
    const classNames = element.className.split(' ');
    if (classNames.some(cls => excludeClasses.includes(cls))) return true;
  }
  if (element.id && excludeIds.includes(element.id)) return true;
  // Example: Drop elements that are visually hidden by Confluence styles, if not covered by display:none in content-processor
  if (element.style && element.style.display === 'none') return true; 
  
  return false;
}

/**
 * Extracts all `<img>` elements from the JSDOM document.
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Element[]} An array of all `<img>` elements found in the document.
 */
function extractImages(document) {
  return Array.from(document.querySelectorAll('img'));
}

/**
 * Extracts breadcrumb navigation data from the JSDOM document.
 * It searches for list items (`<li>`) within common breadcrumb container selectors
 * (e.g., `#breadcrumbs`, `.breadcrumb-section`, `.aui-breadcrumb`).
 * For each item, it extracts the link text and a normalized `href`.
 * @param {Document} document - The JSDOM `Document` object.
 * @returns {Array<{text: string, href: string}>} An array of breadcrumb objects,
 *          each containing the `text` and `href` of a breadcrumb link.
 *          Returns an empty array if no breadcrumbs are found.
 */
function extractBreadcrumbs(document) {
  const breadcrumbs = [];
  const breadcrumbSelectors = ['#breadcrumbs li', '.breadcrumb-section ol li', '.aui-breadcrumb li']; // Added AUI breadcrumbs
  
  for (const selector of breadcrumbSelectors) {
      const items = document.querySelectorAll(selector);
      if (items.length > 0) {
          for (const item of items) {
            const link = item.querySelector('a');
            const text = link ? link.textContent.trim() : item.textContent.trim();
            let href = link ? link.getAttribute('href') || '#' : '#';

            if (href !== '#') { // Normalize if not a placeholder link
                if (href.startsWith('/')) href = `.${href}`; // Relative from root
                else if (!href.startsWith('http') && !href.startsWith('./') && !href.startsWith('../')) href = `./${href}`; // Assume relative to current dir
            }
            if (text) breadcrumbs.push({ text, href });
          }
          if (breadcrumbs.length > 0) break; // Use first found set of breadcrumbs
      }
  }
  return breadcrumbs;
}

module.exports = {
  parseFile,
  extractTitle,
  extractLastModified,
  findMainContent,
  extractAttachmentInfo,
  // Exporting new helper functions for attachments if they might be useful externally or for testing
  extractLinkedResourceAttachments,
  extractImageSrcAttachments,
  extractGreyboxAttachments,
  // Other utility functions
  extractBreadcrumbs,
  findPanels,
  findTables,
  findHistoryTable,
  findContentSections,
  findLayouts,
  findCells,
  shouldBeDropped,
  extractImages
};