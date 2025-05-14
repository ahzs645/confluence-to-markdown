// modules/element-processors.js
/**
 * Specialized processors for different HTML element types
 * Added TOC link and header ID generation.
 */

const path = require("path");
const contentProcessor = require("./content-processor"); // Will be populated by module system
const utilities = require("./utilities"); // For slugify

// --- Utility functions for table processing ---
function isHistoryTable(table) {
  if (!table) return false;
  if (table.id === "page-history-container" || (table.classList && table.classList.contains("tableview"))) return true;
  const headers = Array.from(table.querySelectorAll("th, thead td")).map(th => th.textContent.trim().toLowerCase());
  if ((headers.includes("version") || headers.includes("v.")) && (headers.includes("changed by") || headers.includes("published"))) return true;
  let parent = table.parentElement;
  while (parent) {
    if (parent.id && (parent.id.includes("history") || parent.id.includes("version"))) return true;
    if (parent.classList && (parent.classList.contains("history") || parent.classList.contains("expand-content"))) return true;
    parent = parent.parentElement;
  }
  return false;
}

function isLayoutTable(table, document) {
  if (!table) return false;
  if (table.classList && (table.classList.contains("layout") || table.classList.contains("contentLayoutTable") || table.classList.contains("layout-table"))) return true;
  if (table.closest && (table.closest(".contentLayout2") || table.closest(".columnLayout") || table.closest(".section") || table.closest(".panelContent"))) {
    if (table.getAttribute("border") === "0" || (!table.hasAttribute("border") && table.style.borderStyle === "none")) {
        const firstCell = table.querySelector("td");
        if (firstCell && firstCell.querySelector("div, table, ul, ol, p, h1, h2, h3, h4, h5, h6")) return true;
    }
  }
  if (table.getAttribute("border") === "0") return true;
  const trs = table.querySelectorAll("tr");
  if (trs.length === 1) {
    const tds = trs[0].querySelectorAll("td");
    if (tds.length === 1 && tds[0].querySelector("div, table, ul, ol, p")) return true;
  }
  if (table.classList && table.classList.contains("wysiwyg-macro")) return true;

  return false;
}

// --- Main Element Processors ---

function processMetadata(metadataElement, document, processedElements, parentPath) {
  if (!metadataElement || processedElements.has(metadataElement)) return "";
  const currentPath = `${parentPath || "METADATA_ROOT"} > METADATA${metadataElement.id ? "#"+metadataElement.id : ""}${metadataElement.className ? "."+metadataElement.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "";
  for (const child of metadataElement.childNodes) {
    markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
  }
  return markdown.trim() ? `\n<!-- Page Metadata Processed -->\n${markdown.trim()}\n<!-- End Page Metadata -->\n\n` : "";
}

function processAttachmentsSection(attachmentsElement, document, processedElements, parentPath) {
  if (!attachmentsElement || processedElements.has(attachmentsElement)) return "";
  const currentPath = `${parentPath || "ATTACHMENTS_ROOT"} > ATTACHMENTS_SECTION${attachmentsElement.id ? "#"+attachmentsElement.id : ""}`;
  let markdown = "\n### Attachments\n\n";
  const links = attachmentsElement.querySelectorAll("a");
  for (const link of links) {
    if (processedElements.has(link)) continue;
    const href = link.getAttribute("href");
    let text = link.textContent.trim();
    if (href && text) {
        const attachmentName = link.getAttribute("data-attachment-name");
        if (attachmentName) text = attachmentName;
        markdown += `- [${text}](${href})\n`;
        processedElements.add(link);
    } else if (href) {
        markdown += `- [${href}](${href})\n`;
        processedElements.add(link);
    }
  }
  return markdown.trim().length > "### Attachments".length ? markdown + "\n\n" : "";
}

function processPanel(panelDiv, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > PANEL${panelDiv.id ? "#"+panelDiv.id : ""}${panelDiv.className ? "."+panelDiv.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "";
  const panelTitleElement = panelDiv.querySelector(".panelHeader, .panel-header, .aui-message-header");
  const panelContentElement = panelDiv.querySelector(".panelContent, .panel-body, .aui-message-content");

  if (panelTitleElement) {
    let titleText = "";
    for(const child of panelTitleElement.childNodes) {
        titleText += contentProcessor.processElementContent(child, document, processedElements, module.exports, `${currentPath} > TITLE`);
    }
    if (titleText.trim()) {
        markdown += `**${titleText.trim()}**\n\n`;
    }
  }

  const targetElementForChildren = panelContentElement || panelDiv;
  for (const child of targetElementForChildren.childNodes) {
      if (child === panelTitleElement && panelContentElement) continue;
      markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, `${currentPath} > ${panelContentElement ? "CONTENT" : "CHILD"}`);
  }

  if (markdown.trim()) {
    return `> ${markdown.trim().replace(/\n/g, "\n> ")}\n\n`;
  }
  return "";
}

function processLayout(layoutDiv, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > LAYOUT${layoutDiv.id ? "#"+layoutDiv.id : ""}${layoutDiv.className ? "."+layoutDiv.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "";

  for (let i = 0; i < layoutDiv.childNodes.length; i++) {
    const child = layoutDiv.childNodes[i];
    let childMarkdown = contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
    markdown += childMarkdown;
  }
  return markdown;
}

function processDiv(div, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > DIV${div.id ? "#"+div.id : ""}${div.className ? "."+div.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "";

  if (div.classList.contains("toc-macro")) {
    for (const child of div.childNodes) {
      markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
    }
  } else if (div.classList.contains("expand-content")) {
    for (const child of div.childNodes) {
      markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
    }
  } else if (div.classList.contains("panel") || div.classList.contains("aui-message") || div.classList.contains("confluence-information-macro")) {
    markdown += processPanel(div, document, processedElements, currentPath);
  } else if (div.classList.contains("contentLayout") || 
             div.classList.contains("columnLayout") || 
             div.classList.contains("section") || 
             div.classList.contains("cell") || 
             div.classList.contains("innerCell") || 
             div.classList.contains("layout-column") || 
             div.classList.contains("contentLayout2")) { 
    markdown += processLayout(div, document, processedElements, currentPath);
  }
  else { 
    for (const child of div.childNodes) {
      markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
    }
  }
  return markdown;
}

function isComplexCell(cell) {
  return (
    cell.querySelector('h1, h2, h3, ul, ol, img, .panel, .confluence-information-macro')
  );
}

function processLayoutTableContent(table, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > LAYOUT_TABLE_CONTENT${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "";
  try {
    const htmlRows = Array.from(table.rows);
    for (const tr of htmlRows) {
        const htmlCells = Array.from(tr.cells);
        for (const td of htmlCells) {
            for (const child of td.childNodes) {
                markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
            }
            markdown += "\n"; 
        }
    }
    return markdown.trim() ? markdown + "\n" : "";
  } catch (err) {
    console.error(`Error processing layout table content (Path: ${currentPath}):`, err);
    return "";
  }
}

function processHistoryTable(table, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > HISTORY_TABLE${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "\n### Page History\n\n";
  try {
    const displayHeadersList = ["Version", "Published", "Changed By", "Comment"];
    const numTableColumns = displayHeadersList.length;
    const tbody = table.querySelector("tbody");
    const rowsToProcess = tbody ? Array.from(tbody.querySelectorAll("tr")) : Array.from(table.querySelectorAll("tr")).slice(1); // Skip header row if no tbody
    if (rowsToProcess.length === 0) return "";

    markdown += "| " + displayHeadersList.join(" | ") + " |\n";
    markdown += "|" + Array(numTableColumns).fill("---").join("|") + "|\n";

    for (const tr of rowsToProcess) {
      if (processedElements.has(tr)) continue;
      const cells = Array.from(tr.querySelectorAll("td"));
      if (cells.length < 3) continue; // Expect at least Version, Published, Changed By

      // Version Cell (index 0)
      let versionText = cells[0].textContent.trim();
      const versionLinkElement = cells[0].querySelector("a");
      if (versionLinkElement) {
        const versionHref = versionLinkElement.getAttribute("href") || "";
        const linkText = versionLinkElement.textContent.trim(); 
        versionText = `[${linkText || versionText}](${versionHref})`;
      } else {
        // Keep plain text if no link
        versionText = versionText.replace(/\n/g, " ").replace(/\|/g, "\\|");
      }

      // Published Cell (index 1)
      const publishedText = (cells[1].textContent.trim() || "").replace(/\n/g, " ").replace(/\|/g, "\\|");

      // Changed By Cell (index 2)
      let changedByText = "";
      const userIconElement = cells[2].querySelector("img.userLogo");
      const userNameElement = cells[2].querySelector(".page-history-contributor-name a, .page-history-contributor-name span.unknown-user");
      
      if (userIconElement) {
        let iconSrc = userIconElement.getAttribute("src") || "";
        if (iconSrc && !iconSrc.startsWith("http") && !iconSrc.startsWith("/") && !iconSrc.startsWith("./")) {
            iconSrc = `./${iconSrc}`; // Ensure relative path for local images
        }
        const iconAlt = userIconElement.getAttribute("alt") || "User icon";
        changedByText += `![${iconAlt}](${iconSrc}) `;
      }
      if (userNameElement) {
        const userName = userNameElement.textContent.trim();
        if (userNameElement.tagName === "A") {
            const userHref = userNameElement.getAttribute("href") || "";
            changedByText += `[${userName}](${userHref})`;
        } else {
            changedByText += userName;
        }
      } else {
        changedByText += (cells[2].textContent.trim() || "").replace(/\n/g, " ").replace(/\|/g, "\\|");
      }
      changedByText = changedByText.trim();

      // Comment Cell (index 3, optional)
      const commentText = (cells.length > 3 ? cells[3].textContent.trim() : "").replace(/\n/g, " ").replace(/\|/g, "\\|");
      
      const rowData = [versionText, publishedText, changedByText, commentText];
      markdown += "| " + rowData.join(" | ") + " |\n";
      processedElements.add(tr);
    }
    return markdown + "\n";
  } catch (err) {
    console.error(`Error processing history table (Path: ${currentPath}):`, err);
    return "";
  }
}

/**
 * Check if a table cell contains complex content that can't be properly rendered in a Markdown table
 * @param {Element} cell The cell to check
 * @returns {boolean} True if complex cell
 */
function isComplexCell(cell) {
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
  const content = cell.textContent.trim();
  if (content.includes('\n\n')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a table contains complex content that can't be properly rendered in a Markdown table
 * @param {Element} table The table to check
 * @returns {boolean} True if complex table
 */
function isComplexTable(table) {
  if (!table) return false;
  
  // Check each cell
  const cells = table.querySelectorAll('td, th');
  for (const cell of cells) {
    if (isComplexCell(cell)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Process a table element and convert it to Markdown
 * @param {Element} table Table element
 * @param {Document} document JSDOM document
 * @param {Set} processedElements Already processed elements
 * @param {string} parentPath For debugging: path of parent elements
 * @returns {string} Markdown content
 */
function processTable(table, document, processedElements, parentPath) { 
  const currentTablePath = `${parentPath || "TABLE_ROOT"} > TABLE${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  try {
    // Special table types
    if (isHistoryTable(table)) {
      return processHistoryTable(table, document, processedElements, currentTablePath);
    }
    if (isLayoutTable(table, document)) {
      return processLayoutTableContent(table, document, processedElements, currentTablePath);
    }
    
    // Check if this is a complex table that should be rendered as sections
    const isComplex = isComplexTable(table);
    
    // For complex tables, process as sections to preserve content
    if (isComplex) {
      return processTableAsSections(table, document, processedElements, currentTablePath);
    }
    
    // Process regular table that can be converted to Markdown format
    const allTableRows = [];
    let maxCols = 0;
    const htmlRows = Array.from(table.rows);
    
    for (const tr of htmlRows) {
      if (processedElements.has(tr)) continue;
      processedElements.add(tr);
      
      const currentRowCells = [];
      const htmlCells = Array.from(tr.cells);
      let currentCellIndex = 0;
      
      for (const td_th of htmlCells) {
        processedElements.add(td_th);
        const colspan = parseInt(td_th.getAttribute("colspan") || "1", 10);
        
        // Use processSimpleCellContent for all cells in a regular table
        const cellContent = processSimpleCellContent(td_th, document, new Set(processedElements), module.exports, `${currentTablePath} > TR > ${(td_th.tagName || "CELL")}`);
        currentRowCells[currentCellIndex] = cellContent || " ";
        
        for (let k = 1; k < colspan; k++) {
          currentCellIndex++;
          currentRowCells[currentCellIndex] = " "; 
        }
        currentCellIndex++;
      }
      
      if (currentRowCells.length > 0) {
        allTableRows.push({ 
          type: tr.querySelectorAll("th").length > 0 ? "header" : "data", 
          cells: currentRowCells 
        });
        maxCols = Math.max(maxCols, currentRowCells.length);
      }
    }
    
    if (allTableRows.length === 0 || maxCols === 0) {
        return "";
    }
    
    // Ensure all rows have the same number of columns
    for (const rowObj of allTableRows) {
      while (rowObj.cells.length < maxCols) {
        rowObj.cells.push(" ");
      }
    }
    
    // Generate the Markdown table
    let markdown = "\n";
    let headerProcessed = false;
    
    for (let i = 0; i < allTableRows.length; i++) {
      const rowObj = allTableRows[i];
      if (rowObj.cells.every(c => (c || "").trim() === "")) continue;
      
      markdown += "| " + rowObj.cells.join(" | ") + " |\n";
      
      // Add header separator after the first row or actual header row
      if ((rowObj.type === "header" || i === 0) && !headerProcessed && allTableRows.length > 1) {
        markdown += "|" + Array(maxCols).fill("---").join("|") + "|\n";
        headerProcessed = true;
      }
    }
    
    return markdown.trim() ? markdown + "\n\n" : "";
  } catch (err) {
    console.error(`Error processing table (Path: ${currentTablePath}):`, err);
    return "";
  }
}

/**
 * Process a complex table as Markdown sections with improved formatting
 * @param {Element} table The complex table to process
 * @param {Document} document JSDOM document
 * @param {Set} processedElements Set of already processed elements
 * @param {string} parentPath Parent path for debugging
 * @returns {string} Markdown with sections
 */
function processTableAsSections(table, document, processedElements, parentPath) {
  const currentPath = `${parentPath || "TABLE_AS_SECTIONS_ROOT"} > TABLE_AS_SECTIONS${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "\n";
  
  try {
    const rows = Array.from(table.rows);
    
    for (const row of rows) {
      if (processedElements.has(row)) continue;
      processedElements.add(row);
      
      const cells = Array.from(row.cells);
      if (cells.length === 0) continue;
      
      // Process the row as a section
      // First cell becomes the section heading
      const firstCell = cells[0];
      
      // Process the first cell for heading
      let sectionTitle = "";
      for (const child of firstCell.childNodes) {
        sectionTitle += contentProcessor.processElementContent(child, document, new Set(processedElements), module.exports, `${currentPath} > SECTION_TITLE`);
      }
      
      // Clean up the title - normalize heading format
      sectionTitle = sectionTitle.trim();
      
      // Fix duplicated # characters that might appear in headings
      sectionTitle = sectionTitle.replace(/^#+\s*#+\s+/, '## ');
      sectionTitle = sectionTitle.replace(/^#+\s+/, '## '); // Standardize to ## heading level
      
      if (!sectionTitle.startsWith('#')) {
        sectionTitle = `## ${sectionTitle}`;
      }
      
      // Add the section title if not empty
      if (sectionTitle && sectionTitle !== "##") {
        markdown += `${sectionTitle}\n\n`;
      }
      
      // Process additional cells in the row to get their full content
      for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell || !cell.childNodes || cell.childNodes.length === 0) continue;
        
        // Process cell content preserving all formatting
        let cellContent = "";
        for (const child of cell.childNodes) {
          cellContent += contentProcessor.processElementContent(child, document, new Set(processedElements), module.exports, `${currentPath} > SECTION_CONTENT`);
        }
        
        // Cleanup the cell content
        cellContent = cleanupSectionContent(cellContent);
        
        if (cellContent.trim()) {
          markdown += cellContent.trim() + "\n\n";
        }
      }
    }
    
    return markdown;
  } catch (err) {
    console.error(`Error processing table as sections (Path: ${currentPath}):`, err);
    return "";
  }
}

/**
 * Clean up section content to fix common formatting issues
 * @param {string} content The markdown content to clean up
 * @returns {string} Cleaned up content
 */
function cleanupSectionContent(content) {
  let cleaned = content;
  
  // Fix nested list indentation
  cleaned = cleaned.replace(/^(\s*[-*])\s+[-*]\s+/gm, '$1   * ');
  
  // Fix bullet points with headings
  cleaned = cleaned.replace(/^(\s*[-*])\s+(#{1,6})\s+/gm, '$1 **');
  cleaned = cleaned.replace(/^(\s*[-*]\s+)#{1,6}(.+?)$/gm, '$1**$2**');
  
  // Fix headings appearing directly after bullet points
  cleaned = cleaned.replace(/^(\s*[-*].+\n)(#+\s+)/gm, '$1\n$2');
  
  // Remove extra # characters
  cleaned = cleaned.replace(/^#+\s*#+\s+/gm, '### ');
  
  // Fix duplicated bullet points
  cleaned = cleaned.replace(/^(\s*)[-*]\s+[-*]\s+/gm, '$1- ');
  
  // Fix spacing in lists
  cleaned = cleaned.replace(/^-\s+/gm, '- ');
  
  // Fix headings inside bullets
  cleaned = cleaned.replace(/^(\s*[-*]\s+)(?=.*? \*\*)/gm, '$1');
  
  return cleaned;
}

/**
 * Process simple cell content for regular Markdown tables
 * @param {Element} cell The cell to process
 * @param {Document} document JSDOM document
 * @param {Set} processedElements Set of already processed elements
 * @param {Object} processors Module containing processor functions
 * @param {string} parentPath Parent path for debugging
 * @returns {string} Simplified cell content for Markdown tables
 */
function processSimpleCellContent(cell, document, processedElements, processors, parentPath) {
  if (!cell) return "";
  
  // Create a new Set for cell content to avoid interference with parent table structure
  const cellProcessedElements = new Set(processedElements); 
  let content = "";
  
  // Extract text content for simpler cells
  for (const child of cell.childNodes) {
    if (child.nodeType === 3) { // Text node
      content += child.textContent;
    } else if (child.nodeType === 1) { // Element node
      if (child.tagName === 'BR') {
        content += " ";
      } else if (child.tagName === 'A') {
        const href = child.getAttribute('href') || "";
        const text = child.textContent.trim();
        content += `[${text}](${href})`;
      } else if (child.tagName === 'STRONG' || child.tagName === 'B') {
        content += `**${child.textContent.trim()}**`;
      } else if (child.tagName === 'EM' || child.tagName === 'I') {
        content += `*${child.textContent.trim()}*`;
      } else if (child.tagName === 'CODE') {
        content += `\`${child.textContent.trim()}\``;
      } else {
        content += child.textContent;
      }
    }
  }
  
  // Clean up the content for Markdown tables
  content = content.trim()
    .replace(/\s+/g, " ")     // Collapse whitespace
    .replace(/\|/g, "\\|")    // Escape pipe characters
    .replace(/\n/g, " ");     // Remove newlines
  
  return content;
}

/**
 * Create a simplified text representation of complex cell content
 * @param {Element} cell The cell with complex content
 * @returns {string} Simplified text representation
 */
function simplifyComplexCellContent(cell) {
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

function processHeader(header, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > ${header.tagName}${header.id ? "#"+header.id : ""}${header.className ? "."+header.className.trim().replace(/\s+/g, ".") : ""}`;
  let markdown = "";
  const level = parseInt(header.tagName.substring(1), 10);
  let headerTextContent = "";
  for (const child of header.childNodes) {
    headerTextContent += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
  }
  headerTextContent = headerTextContent.trim();
  if (!headerTextContent) return "";

  const existingId = header.id;
  const slug = existingId || utilities.slugify(headerTextContent);
  if (slug && !header.id) {
      header.id = slug; 
  }
  const idAttribute = header.id ? ` {#${header.id}}` : "";
  markdown += `${ "#".repeat(level)} ${headerTextContent}${idAttribute}\n\n`;
  return markdown;
}

function processLink(link, document, processedElements, processElementContentFunc, parentPath) {
  const currentPath = `${parentPath} > A${link.id ? "#"+link.id : ""}${link.className ? "."+link.className.trim().replace(/\s+/g, ".") : ""}`;
  let text = "";
  for (const child of link.childNodes) {
    if (child.nodeType === 1 && child.tagName === "IMG") {
        text += processImage(child, `${currentPath} > IMG_IN_LINK`);
    } else {
        text += processElementContentFunc(child, document, processedElements, module.exports, currentPath);
    }
  }
  text = text.trim();
  let href = link.getAttribute("href") || "";

  if (href.startsWith("#") && text) { // Internal page link / TOC link
    const targetId = href.substring(1);
    const targetElement = document.getElementById(targetId);
    if (targetElement && (targetElement.tagName.match(/^H[1-6]$/) || targetElement.closest("[data-macro-name=\"toc\"]"))) {
        // It is a TOC link or a link to a header. Ensure slugified href.
        const headerTextForSlug = targetElement.textContent.trim();
        const slugifiedHref = utilities.slugify(headerTextForSlug || targetId);
        href = `#${slugifiedHref}`; 
    } else if (targetElement) {
        // Link to other elements, ensure their ID is set if not already
        if (!targetElement.id) targetElement.id = targetId;
        href = `#${targetElement.id}`; // Use the actual ID
    }
  }
  
  if (!text && href) text = href;
  if (!text) return ""; 

  return `[${text}](${href})`;
}

function processImage(img, parentPath) {
  const currentPath = `${parentPath} > IMG${img.id ? "#"+img.id : ""}`;
  let src = img.getAttribute("src") || "";
  const alt = img.getAttribute("alt") || "image";
  const title = img.getAttribute("title") || "";

  // If src is a relative path like "images/foo.png" or "attachments/...", make it explicitly relative ./ 
  if (src && !src.startsWith("http") && !src.startsWith("/") && !src.startsWith("./")) {
    src = `./${src}`;
  }
  
  let markdown = `![${alt}](${src}${title ? ` "${title}"` : ""})`;
  
  // If the image is the only content of a link, the link processor might handle it.
  // Here we just return the image markdown.
  // If it is wrapped in <p><img></p>, it should become its own line.
  // Check if parent is a P and img is the only significant child
  if (img.parentElement && img.parentElement.tagName === "P") {
    const p = img.parentElement;
    let onlySignificantChild = true;
    for(const child of p.childNodes) {
        if (child === img) continue;
        if (child.nodeType === 3 && child.textContent.trim() !== "") { // Non-empty text node
            onlySignificantChild = false;
            break;
        }
        if (child.nodeType === 1) { // Other element node
            onlySignificantChild = false;
            break;
        }
    }
    if (onlySignificantChild) {
        return markdown + "\n\n"; // Add newlines to separate it if it's alone in a paragraph
    }
  }
  return markdown;
}

module.exports = {
  processMetadata,
  processAttachmentsSection,
  processPanel,
  processLayout,
  processDiv,
  processTable,
  processTableAsSections,
  cleanupSectionContent,
  processSimpleCellContent,
  isComplexTable,
  isComplexCell,
  processLayoutTableContent,
  processHistoryTable,
  processHeader,
  processLink,
  processImage,
  isHistoryTable, 
  isLayoutTable 
};

