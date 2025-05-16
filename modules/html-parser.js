// modules/html-parser.js - COMPREHENSIVE FIX
/**
 * Module for parsing HTML content and extracting document structure
 * Completely overhauled to properly handle Confluence content
 */

const { JSDOM } = require('jsdom');
const fs = require('fs/promises');
const path = require('path');

/**
 * Parse an HTML file and return a JSDOM document
 * @param {string} filePath Path to HTML file
 * @returns {Promise<Document>} JSDOM document
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
 * Extract the document title from parsed HTML
 * @param {Document} document JSDOM document
 * @returns {string} Document title
 */
function extractTitle(document) {
  // Try different elements where title might be found
  const titleElement = document.querySelector('#title-text') || 
                      document.querySelector('.pagetitle') ||
                      document.querySelector('#title-heading .page-title') ||
                      document.querySelector('#title-heading') ||
                      document.querySelector('h1');
  
  let title = '';
  if (titleElement) {
    // Get text from the title element, or from its child #title-text if present
    const titleTextElement = titleElement.querySelector('#title-text');
    title = titleTextElement ? titleTextElement.textContent.trim() : titleElement.textContent.trim();
    
    // Remove any prefix like "CIS Integrated Healthcare : "
    title = title.replace(/^.*\s*:\s*/, '');
  } else if (document.title) {
    title = document.title.trim().replace(/^.*\s*:\s*/, '');
  } else {
    title = 'Untitled Page';
  }
  
  // Decode HTML entities
  const txt = document.createElement('textarea');
  txt.innerHTML = title;
  title = txt.value;
  
  return title;
}

/**
 * Extract the last modified date from parsed HTML
 * @param {Document} document JSDOM document
 * @returns {string} Last modified date
 */
function extractLastModified(document) {
  // Try all possible selectors for last modified info
  const selectors = [
    '.last-modified', 
    '.page-metadata .editor',
    '.page-metadata'
  ];
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Check if we're looking at the page-metadata container
      if (selector === '.page-metadata') {
        // Extract the text that contains "last updated by"
        const text = element.textContent.trim();
        const match = text.match(/last updated by\s+(.*?)(?:\s+on\s+(.*))?$/i);
        if (match) {
          return match[1].trim();
        }
      } else {
        return element.textContent.trim();
      }
    }
  }
  
  return '';
}

/**
 * Find the main content element in parsed HTML
 * @param {Document} document JSDOM document
 * @returns {Element} Main content element
 */
function findMainContent(document) {
  // First try to find the specific content container used in Confluence
  const contentOptions = [
    '#main-content',
    '#content .wiki-content',
    '.wiki-content',
    '#content',
    '.view',
    'body'
  ];

  for (const selector of contentOptions) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  // Fallback to the body if nothing else found
  return document.body;
}

/**
 * Find all panels in the document
 * @param {Document} document JSDOM document
 * @returns {Element[]} Array of panel elements
 */
function findPanels(document) {
  // Get all panels - Confluence uses various selectors for panels
  const panelSelectors = [
    '.panel',
    '.confluence-information-macro',
    '.aui-message',
    '.admonition',
    '.expand-container'
  ];
  
  const panels = [];
  
  for (const selector of panelSelectors) {
    const elements = document.querySelectorAll(selector);
    panels.push(...Array.from(elements));
  }
  
  return panels;
}

/**
 * Find tables in the document
 * @param {Document} document JSDOM document
 * @returns {Element[]} Array of table elements
 */
function findTables(document) {
  return Array.from(document.querySelectorAll('table'));
}

/**
 * Find the history table specifically
 * @param {Document} document JSDOM document
 * @returns {Element|null} History table element
 */
function findHistoryTable(document) {
  // Look for various types of history tables
  const historySelectors = [
    '#page-history-container',
    '.tableview',
    'table.pageHistory',
    'table#page-history'
  ];
  
  // Try direct selectors first
  for (const selector of historySelectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  
  // Try to find by nearby text
  const historyHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const heading of historyHeadings) {
    if (heading.textContent.toLowerCase().includes('history') || 
        heading.textContent.toLowerCase().includes('version')) {
      // Look for a table following this heading
      let nextElement = heading.nextElementSibling;
      while (nextElement) {
        if (nextElement.tagName === 'TABLE') {
          return nextElement;
        }
        // If we encounter another heading, stop searching
        if (/^H[1-6]$/.test(nextElement.tagName)) break;
        nextElement = nextElement.nextElementSibling;
      }
    }
  }
  
  // Look for tables with "Version" and "Changed By" columns
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const headers = Array.from(table.querySelectorAll('th, thead td'))
      .map(cell => cell.textContent.trim().toLowerCase());
    
    // Check if this table has version history headers
    if ((headers.includes('version') || headers.includes('v.')) && 
        (headers.includes('changed by') || headers.includes('author') || 
         headers.includes('published') || headers.includes('modified'))) {
      return table;
    }
  }
  
  // Look for a table inside an expander with "history" in the title
  const expanders = document.querySelectorAll('.expand-container');
  for (const expander of expanders) {
    const controlText = expander.querySelector('.expand-control-text');
    if (controlText && controlText.textContent.toLowerCase().includes('history')) {
      const table = expander.querySelector('table');
      if (table) return table;
    }
  }
  
  return null;
}

/**
 * Extract attachment information from parsed HTML
 * @param {Document} document JSDOM document
 * @returns {Map<string, object>} Map of attachment ID to attachment info
 */
function extractAttachmentInfo(document) {
  const attachments = new Map();
  
  try {
    // Find all attachment links
    const attachmentLinks = document.querySelectorAll('a[data-linked-resource-type="attachment"]');
    
    for (const link of attachmentLinks) {
      const id = link.getAttribute('data-linked-resource-id');
      const filename = link.textContent.trim();
      const containerId = link.getAttribute('data-linked-resource-container-id');
      const href = link.getAttribute('href');
      
      if (id && filename) {
        attachments.set(id, {
          id,
          filename,
          containerId,
          href: href || `attachments/${containerId}/${id}${path.extname(filename)}`
        });
      }
    }
    
    // Also collect image attachments
    const imageLinks = document.querySelectorAll('img[data-linked-resource-type="attachment"]');
    
    for (const img of imageLinks) {
      const id = img.getAttribute('data-linked-resource-id');
      const src = img.getAttribute('src');
      
      if (id && src && !attachments.has(id)) {
        const filename = path.basename(src);
        const containerId = img.getAttribute('data-linked-resource-container-id');
        
        attachments.set(id, {
          id,
          filename,
          containerId,
          href: `attachments/${containerId}/${id}${path.extname(filename)}`
        });
      }
    }
    
    // Also look for images in attachments folder
    const regularImages = document.querySelectorAll('img[src^="attachments/"]');
    for (const img of regularImages) {
      const src = img.getAttribute('src');
      if (src) {
        const matches = src.match(/attachments\/(\d+)\/(\d+)/);
        if (matches && matches[1] && matches[2]) {
          const containerId = matches[1];
          const id = matches[2];
          const filename = path.basename(src);
          
          if (!attachments.has(id)) {
            attachments.set(id, {
              id,
              filename,
              containerId,
              href: src
            });
          }
        }
      }
    }
    
    // Get attachments from the greybox section if present
    const greybox = document.querySelector('.greybox');
    if (greybox) {
      const attachmentLinks = greybox.querySelectorAll('a');
      for (const link of attachmentLinks) {
        const href = link.getAttribute('href');
        const filename = link.textContent.trim();
        
        if (href && filename) {
          // Try to parse the ID from the href
          const matches = href.match(/\/(\d+)\/(\d+)/);
          if (matches && matches[1] && matches[2]) {
            const containerId = matches[1];
            const id = matches[2];
            
            if (!attachments.has(id)) {
              attachments.set(id, {
                id,
                filename,
                containerId,
                href
              });
            }
          }
        }
      }
    }
    
    return attachments;
  } catch (err) {
    console.error('Error extracting attachment info:', err);
    return new Map();
  }
}

/**
 * Find all content sections in the document
 * @param {Document} document JSDOM document
 * @returns {Map<string, Element>} Map of section IDs to elements
 */
function findContentSections(document) {
  const sections = new Map();
  
  // Look for section headers
  const headers = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  
  for (const header of headers) {
    const id = header.id || header.textContent.trim().toLowerCase().replace(/\s+/g, '-');
    
    // Collect all content until the next header of the same or higher level
    const level = parseInt(header.tagName.substring(1), 10);
    let content = document.createElement('div');
    let currentNode = header.nextSibling;
    
    while (currentNode) {
      // Stop at the next header of the same or higher level
      if (currentNode.nodeType === 1 && 
          /^H[1-6]$/.test(currentNode.tagName) && 
          parseInt(currentNode.tagName.substring(1), 10) <= level) {
        break;
      }
      
      // Clone and add the node to our content
      content.appendChild(currentNode.cloneNode(true));
      currentNode = currentNode.nextSibling;
    }
    
    // Add the section to our map
    sections.set(id, {
      header,
      content,
      level
    });
  }
  
  return sections;
}

/**
 * Find layouts in the document
 * @param {Document} document JSDOM document
 * @returns {Element[]} Array of layout elements
 */
function findLayouts(document) {
  // Confluence uses several layout class names
  const layoutSelectors = [
    '.contentLayout',
    '.columnLayout',
    '.layout',
    '.section'
  ];
  
  const layouts = [];
  
  for (const selector of layoutSelectors) {
    const elements = document.querySelectorAll(selector);
    layouts.push(...Array.from(elements));
  }
  
  return layouts;
}

/**
 * Find all cells within layouts
 * @param {Document} document JSDOM document
 * @returns {Element[]} Array of cell elements
 */
function findCells(document) {
  return Array.from(document.querySelectorAll('.cell, .innerCell, .columnMacro'));
}

/**
 * Determine if an element should be excluded from the output
 * @param {Element} element Element to check
 * @returns {boolean} True if element should be dropped
 */
function shouldBeDropped(element) {
  if (!element || !element.tagName) return true;
  
  // Skip navigation, breadcrumbs, etc.
  const excludeClasses = [
    'breadcrumb-section',
    'footer',
    'aui-nav',
    'pageSection',
    'pageSectionHeader',
    'hidden'
  ];
  
  // Skip specific IDs
  const excludeIds = [
    'breadcrumbs',
    'footer',
    'navigation',
    'sidebar',
    'page-sidebar'
  ];
  
  // Check class names
  if (element.className && typeof element.className === 'string') {
    const classNames = element.className.split(' ');
    for (const cls of classNames) {
      if (excludeClasses.includes(cls)) {
        return true;
      }
    }
  }
  
  // Check IDs
  if (element.id && excludeIds.includes(element.id)) {
    return true;
  }
  
  return false;
}

/**
 * Extract all images from the document
 * @param {Document} document JSDOM document
 * @returns {Element[]} Array of image elements
 */
function extractImages(document) {
  return Array.from(document.querySelectorAll('img'));
}

/**
 * Extract and preserve breadcrumbs from Confluence HTML
 * @param {Document} document The JSDOM document
 * @returns {Array} Array of breadcrumb items with text and href
 */
function extractBreadcrumbs(document) {
  const breadcrumbs = [];
  const breadcrumbItems = document.querySelectorAll('#breadcrumbs li');
  
  if (breadcrumbItems && breadcrumbItems.length > 0) {
    for (const item of breadcrumbItems) {
      const link = item.querySelector('a');
      if (link) {
        breadcrumbs.push({
          text: link.textContent.trim(),
          href: link.getAttribute('href')
        });
      }
    }
  }
  
  return breadcrumbs;
}

module.exports = {
  extractBreadcrumbs,
  parseFile,
  extractTitle,
  extractLastModified,
  findMainContent,
  findPanels,
  findTables,
  findHistoryTable,
  extractAttachmentInfo,
  findContentSections,
  findLayouts,
  findCells,
  shouldBeDropped,
  extractImages
};