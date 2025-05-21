// modules/element-processors.js
/**
 * @file Specialized processors for different HTML element types.
 * This module contains functions to convert specific HTML elements into Markdown.
 * It handles various complexities like different types of tables, divs, lists,
 * and inline formatting elements.
 */

const path = require("path");
const utilities = require("./utilities"); // For slugify

// To avoid circular dependencies, the main `processElementContent` function
// (from content-processor.js) is passed around in the `processors` object.

// --- HEADER, LINK, IMAGE ---

/**
 * Processes H1-H6 header elements.
 * Generates a Markdown header with an ID slugified from its content if no ID exists.
 * Handles H1-H6 elements.
 * @param {Element} header - The HTML header element (e.g., H1, H2).
 * @param {Document} document - The JSDOM document object associated with the HTML.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed to prevent infinite loops.
 * @param {Object<string, function>} processors - An object containing other processing functions, including `processElementContent` for recursion.
 * @param {string} currentPath - The debug path indicating the element's position in the DOM tree.
 * @returns {string} The Markdown representation of the header, including an ID attribute if generated.
 */
function processHeader(header, document, processedElements, processors, currentPath) {
  console.log(`processHeader [${currentPath}]: Processing ${header.tagName}.`);
  let markdown = "";
  const level = parseInt(header.tagName.substring(1), 10);
  let headerTextContent = "";
  for (const child of header.childNodes) {
    // Ensure child elements that contribute to header text are also marked as processed if they are elements
    headerTextContent += processors.processElementContent(child, document, processedElements, processors, currentPath);
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

/**
 * Processes A (anchor) link elements.
 * Converts HTML anchor (`<a>`) elements to Markdown links.
 * It processes the link text (which can include other elements like images) recursively.
 * It attempts to resolve internal links, potentially slugifying fragment identifiers.
 * @param {Element} link - The HTML anchor element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the link element.
 * @returns {string} The Markdown link string `[text](href)`, or just `text` if `href` is missing.
 */
function processLink(link, document, processedElements, processors, currentPath) {
  console.log(`processLink [${currentPath}]: Processing A.`);
  const processElementContentFunc = processors.processElementContent;
  let text = "";
  for (const child of link.childNodes) {
    if (child.nodeType === 1 && child.tagName === "IMG") {
        text += processors.processImage(child, document, processedElements, processors, `${currentPath} > IMG_IN_LINK`);
    } else {
        text += processElementContentFunc(child, document, processedElements, processors, currentPath);
    }
  }
  text = text.trim();
  let href = link.getAttribute("href") || "";

  if (href.startsWith("#") && text) {
    const targetId = href.substring(1);
    const targetElement = document.getElementById(targetId);
    if (targetElement && (targetElement.tagName.match(/^H[1-6]$/) || targetElement.closest("[data-macro-name=\"toc\"]"))) {
        const headerTextForSlug = targetElement.textContent.trim();
        const slugifiedHref = utilities.slugify(headerTextForSlug || targetId);
        href = `#${slugifiedHref}`; 
    } else if (targetElement) {
        if (!targetElement.id) targetElement.id = targetId; // Ensure target has an ID
        href = `#${targetElement.id}`;
    }
  }
  
  if (!text && href) text = href; // Use href as text if text is empty
  if (!text) return ""; // If no text and no href (effectively), return empty

  return `[${text}](${href})`;
}

/**
 * Processes IMG image elements.
 * Converts HTML image (`<img>`) elements to Markdown image syntax `![alt](src "title")`.
 * It normalizes relative image paths and handles cases where an image is the sole content of a paragraph.
 * @param {Element} img - The HTML image element.
 * @param {Document} document - The JSDOM document object (used for context, e.g., checking parent elements).
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions (used for consistency, though not directly called in this specific function).
 * @param {string} currentPath - The debug path for the image element.
 * @returns {string} The Markdown image string.
 */
function processImage(img, document, processedElements, processors, currentPath) {
  console.log(`processImage [${currentPath}]: Processing IMG.`);
  let src = img.getAttribute("src") || "";
  const alt = img.getAttribute("alt") || "image"; // Default alt text
  const title = img.getAttribute("title") || "";

  if (src && !src.startsWith("http") && !src.startsWith("/") && !src.startsWith("./")) {
    src = `./${src}`; // Ensure relative paths are correctly prefixed
  }
  
  let markdown = `![${alt}](${src}${title ? ` "${title}"` : ""})`;
  
  // If image is the sole significant content of a paragraph, add newlines for better formatting
  if (img.parentElement && img.parentElement.tagName === "P") {
    const p = img.parentElement;
    let onlySignificantChild = true;
    for(const child of p.childNodes) {
        if (child === img) continue;
        if (child.nodeType === 3 && child.textContent.trim() !== "") { // Non-empty text node
            onlySignificantChild = false; break;
        }
        if (child.nodeType === 1 && child.tagName !== 'BR') { // Other significant element node
            onlySignificantChild = false; break;
        }
    }
    if (onlySignificantChild) {
        return markdown + "\n\n";
    }
  }
  return markdown;
}

// --- DIV PROCESSING ---

/**
 * Processes DIV elements.
 * Processes HTML `<div>` elements.
 * This function acts as a dispatcher based on the `div`'s classes, routing to more specialized
 * functions like `processPanel` or `processLayoutDiv`. For generic divs or specific types like
 * `toc-macro` and `expand-content`, it recursively processes child nodes.
 * @param {Element} div - The HTML `<div>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the div element.
 * @returns {string} The Markdown representation of the div's content.
 */
function processDiv(div, document, processedElements, processors, currentPath) {
  console.log(`processDiv [${currentPath}]: Processing DIV.`);
  let markdown = "";

  // Specific div types based on classes
  if (div.classList.contains("panel") || div.classList.contains("aui-message") || div.classList.contains("confluence-information-macro")) {
    markdown += processPanel(div, document, processedElements, processors, currentPath);
  } else if (div.classList.contains("contentLayout") || 
             div.classList.contains("columnLayout") || 
             div.classList.contains("section") || 
             div.classList.contains("cell") || 
             div.classList.contains("innerCell") || 
             div.classList.contains("layout-column") || 
             div.classList.contains("contentLayout2")) { 
    markdown += processLayoutDiv(div, document, processedElements, processors, currentPath); // Renamed for clarity
  } else if (div.classList.contains("toc-macro") || div.classList.contains("expand-content")) {
    // Generic content iteration for these wrapper-like divs
    for (const child of div.childNodes) {
      markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
    }
  } else { 
    // Default DIV processing: iterate children
    for (const child of div.childNodes) {
      markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
    }
  }
  return markdown;
}

/**
 * Processes "panel" divs (typically used for notes, warnings, info boxes in Confluence).
 * Formats the panel content as a Markdown blockquote. If a panel title is present,
 * it's rendered as bold text before the blockquote content.
 * @param {Element} panelDiv - The HTML `<div>` element representing the panel.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent element, used to construct the current path.
 * @returns {string} The Markdown blockquote representation of the panel, or an empty string if the panel is empty.
 */
function processPanel(panelDiv, document, processedElements, processors, parentPath) {
  const currentPath = `${parentPath} > PANEL${panelDiv.id ? "#"+panelDiv.id : ""}${panelDiv.className && typeof panelDiv.className === 'string' ? "."+panelDiv.className.trim().replace(/\s+/g, ".") : (panelDiv.className && panelDiv.className.baseVal ? "."+panelDiv.className.baseVal.trim().replace(/\s+/g, ".") : "")}`;
  console.log(`processPanel [${currentPath}]: Processing panel-like DIV.`);
  let markdown = "";
  const panelTitleElement = panelDiv.querySelector(".panelHeader, .panel-header, .aui-message-header");
  const panelContentElement = panelDiv.querySelector(".panelContent, .panel-body, .aui-message-content");

  if (panelTitleElement) {
    let titleText = "";
    for(const child of panelTitleElement.childNodes) {
        titleText += processors.processElementContent(child, document, processedElements, processors, `${currentPath} > TITLE`);
    }
    if (titleText.trim()) {
        markdown += `**${titleText.trim()}**\n\n`; // Panel title as bold text
    }
  }

  const targetElementForChildren = panelContentElement || panelDiv;
  for (const child of targetElementForChildren.childNodes) {
      if (child === panelTitleElement && panelContentElement) continue; // Avoid double processing title if structure is Panel > Header + Content
      markdown += processors.processElementContent(child, document, processedElements, processors, `${currentPath} > ${panelContentElement ? "CONTENT" : "CHILD"}`);
  }

  if (markdown.trim()) {
    // Format as a blockquote
    return `> ${markdown.trim().replace(/\n/g, "\n> ")}\n\n`;
  }
  return "";
}

/**
 * Processes layout-related `<div>` elements (e.g., columns, sections in Confluence).
 * It recursively processes the child nodes of the layout div and concatenates their Markdown output.
 * A newline is added between content from different child elements within the layout for better separation.
 * @param {Element} layoutDiv - The HTML `<div>` element used for layout.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent element, used to construct the current path.
 * @returns {string} The concatenated Markdown representation of the layout div's children.
 */
function processLayoutDiv(layoutDiv, document, processedElements, processors, parentPath) {
  const currentPath = `${parentPath} > LAYOUT_DIV${layoutDiv.id ? "#"+layoutDiv.id : ""}${layoutDiv.className && typeof layoutDiv.className === 'string' ? "."+layoutDiv.className.trim().replace(/\s+/g, ".") : (layoutDiv.className && layoutDiv.className.baseVal ? "."+layoutDiv.className.baseVal.trim().replace(/\s+/g, ".") : "")}`;
  console.log(`processLayoutDiv [${currentPath}]: Processing layout-like DIV.`);
  let markdown = "";
  for (let i = 0; i < layoutDiv.childNodes.length; i++) {
    const child = layoutDiv.childNodes[i];
    markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
    // Add a newline between content from different cells/columns in a layout for better separation
    if (i < layoutDiv.childNodes.length -1 && markdown.trim() && !markdown.endsWith("\n\n")) {
        markdown += "\n";
    }
  }
  return markdown;
}

// --- TABLE PROCESSING ---

// ** Table Helper Functions **

/**
 * Checks if a given HTML table element is likely a "history" table (e.g., page version history).
 * It uses a combination of ID, class names, and header content analysis to make this determination.
 * @param {Element} table - The HTML `<table>` element to check.
 * @returns {boolean} True if the table is identified as a history table, false otherwise.
 */
function isHistoryTable(table) {
  if (!table) return false;
  if (table.id === "page-history-container" || (table.classList && table.classList.contains("tableview"))) return true; // Confluence specific
  const headers = Array.from(table.querySelectorAll("th, thead td")).map(th => th.textContent.trim().toLowerCase());
  if ((headers.includes("version") || headers.includes("v.")) && (headers.includes("changed by") || headers.includes("published"))) return true;
  let parent = table.parentElement;
  while (parent) { // Check parent hierarchy for history clues
    if (parent.id && (parent.id.includes("history") || parent.id.includes("version"))) return true;
    if (parent.classList && (parent.classList.contains("history") || parent.classList.contains("expand-content"))) return true;
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Checks if a given HTML table element is likely a "layout" table, i.e., used for page formatting
 * rather than displaying tabular data.
 * Criteria include specific class names, presence within known layout containers,
 * border attributes, and cell content structure.
 * @param {Element} table - The HTML `<table>` element to check.
 * @param {Document} document - The JSDOM document object (unused in current implementation but kept for signature consistency).
 * @returns {boolean} True if the table is identified as a layout table, false otherwise.
 */
function isLayoutTable(table, document) {
  if (!table) return false;
  if (table.classList && (table.classList.contains("layout") || table.classList.contains("contentLayoutTable") || table.classList.contains("layout-table"))) return true;
  // Check if table is inside known layout container classes
  if (table.closest && (table.closest(".contentLayout2") || table.closest(".columnLayout") || table.closest(".section") || table.closest(".panelContent"))) {
    // Layout tables often have border="0" or no border style, and contain block elements in cells
    if (table.getAttribute("border") === "0" || (!table.hasAttribute("border") && table.style.borderStyle === "none")) {
        const firstCell = table.querySelector("td");
        if (firstCell && firstCell.querySelector("div, table, ul, ol, p, h1, h2, h3, h4, h5, h6")) return true;
    }
  }
  if (table.getAttribute("border") === "0") return true; // Another common sign
  // Single row, single cell tables with block content are often layouts
  const trs = table.querySelectorAll("tr");
  if (trs.length === 1) {
    const tds = trs[0].querySelectorAll("td");
    if (tds.length === 1 && tds[0].querySelector("div, table, ul, ol, p")) return true;
  }
  if (table.classList && table.classList.contains("wysiwyg-macro")) return true; // Confluence specific
  return false;
}

/**
 * Checks if a table cell (`<td>` or `<th>`) contains complex content that would
 * not render well in a standard Markdown table cell.
 * Complex content includes block elements like headers, lists, other tables, panels,
 * code blocks, multiple paragraphs, or very long text content.
 * @param {Element} cell - The HTML `<td>` or `<th>` element.
 * @returns {boolean} True if the cell contains complex content, false otherwise.
 */
function isComplexTableCell(cell) {
  if (!cell) return false;
  if (cell.querySelector('h1, h2, h3, h4, h5, h6, img, ul, ol, table, pre, blockquote, .panel, .confluence-information-macro')) {
    return true;
  }
  // Multiple distinct paragraphs also make a cell complex for standard markdown
  if (cell.querySelectorAll('p').length > 1) return true; 
  if (cell.innerHTML.includes('<br>') && cell.innerHTML.split('<br').length > 2) return true; // Multiple explicit line breaks
  if (cell.textContent.trim().length > 150) return true; // Very long content
  return false;
}

/**
 * Checks if an entire HTML table is "complex" by determining if any of its cells
 * contain complex content (as defined by `isComplexTableCell`).
 * @param {Element} table - The HTML `<table>` element.
 * @returns {boolean} True if the table contains at least one complex cell, false otherwise.
 */
function isComplexTable(table) {
  if (!table) return false;
  const cells = table.querySelectorAll('td, th');
  for (const cell of cells) {
    if (isComplexTableCell(cell)) {
      return true;
    }
  }
  return false;
}

// ** Table Content Processors **

/**
 * Processes the content of a table identified as a "layout table".
 * It iterates through its rows and cells, recursively processing the content of each cell
 * and concatenating the results. A newline is typically added after each cell's content
 * to separate blocks of content that were arranged using the table for layout.
 * @param {Element} table - The HTML `<table>` element identified as a layout table.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {string} The concatenated Markdown representation of the content within the layout table.
 */
function processLayoutTableContent(table, document, processedElements, processors, parentPath) {
  const currentPath = `${parentPath} > LAYOUT_TABLE_CONTENT${table.id ? "#"+table.id : ""}`;
  console.log(`processLayoutTableContent [${currentPath}]: Processing layout table.`);
  let markdown = "";
  try {
    const htmlRows = Array.from(table.rows);
    for (const tr of htmlRows) {
        const htmlCells = Array.from(tr.cells);
        for (const td of htmlCells) {
            for (const child of td.childNodes) {
                markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
            }
            markdown += "\n"; // Add a newline after each cell's content in a layout table
        }
    }
    return markdown.trim() ? markdown + "\n" : "";
  } catch (err) {
    console.error(`Error processing layout table content (Path: ${currentPath}):`, err);
    return "";
  }
}

/**
 * Processes a table identified as a "history table" (e.g., page version history)
 * and converts it into a structured Markdown table.
 * It specifically looks for columns like "Version", "Published", "Changed By", and "Comment".
 * @param {Element} table - The HTML `<table>` element identified as a history table.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {string} A Markdown-formatted table representing the page history, or an empty string if processing fails or table is empty.
 */
function processHistoryTable(table, document, processedElements, processors, parentPath) {
  const currentPath = `${parentPath} > HISTORY_TABLE${table.id ? "#"+table.id : ""}`;
  console.log(`processHistoryTable [${currentPath}]: Processing history table.`);
  let markdown = "\n### Page History\n\n";
  try {
    const displayHeadersList = ["Version", "Published", "Changed By", "Comment"];
    markdown += "| " + displayHeadersList.join(" | ") + " |\n";
    markdown += "|" + Array(displayHeadersList.length).fill("---").join("|") + "|\n";

    const tbody = table.querySelector("tbody");
    const rowsToProcess = tbody ? Array.from(tbody.querySelectorAll("tr")) : Array.from(table.querySelectorAll("tr")).slice(1); 
    if (rowsToProcess.length === 0) return "";

    for (const tr of rowsToProcess) {
      if (processedElements.has(tr)) continue;
      const cells = Array.from(tr.querySelectorAll("td"));
      if (cells.length < 3) continue; 

      let versionText = cells[0].textContent.trim();
      const versionLinkElement = cells[0].querySelector("a");
      if (versionLinkElement) {
        versionText = `[${versionLinkElement.textContent.trim() || versionText}](${versionLinkElement.getAttribute("href") || ""})`;
      } else {
        versionText = versionText.replace(/\n/g, " ").replace(/\|/g, "\\|");
      }

      const publishedText = (cells[1].textContent.trim() || "").replace(/\n/g, " ").replace(/\|/g, "\\|");
      
      let changedByText = "";
      const userIconElement = cells[2].querySelector("img.userLogo");
      const userNameElement = cells[2].querySelector(".page-history-contributor-name a, .page-history-contributor-name span.unknown-user");
      if (userIconElement) {
        let iconSrc = userIconElement.getAttribute("src") || "";
        if (iconSrc && !iconSrc.startsWith("http") && !iconSrc.startsWith("/") && !iconSrc.startsWith("./")) iconSrc = `./${iconSrc}`;
        changedByText += `![${userIconElement.getAttribute("alt") || "User icon"}](${iconSrc}) `;
      }
      if (userNameElement) {
        const userName = userNameElement.textContent.trim();
        changedByText += (userNameElement.tagName === "A") ? `[${userName}](${userNameElement.getAttribute("href") || ""})` : userName;
      } else {
        changedByText += (cells[2].textContent.trim() || "").replace(/\n/g, " ").replace(/\|/g, "\\|");
      }
      changedByText = changedByText.trim();

      const commentText = (cells.length > 3 ? cells[3].textContent.trim() : "").replace(/\n/g, " ").replace(/\|/g, "\\|");
      
      markdown += `| ${[versionText, publishedText, changedByText, commentText].join(" | ")} |\n`;
      processedElements.add(tr);
    }
    return markdown + "\n";
  } catch (err) {
    console.error(`Error processing history table (Path: ${currentPath}):`, err);
    return "";
  }
}

/**
 * Processes a table deemed "complex" (by `isComplexTable`) by converting its rows into
 * sections of Markdown content rather than a standard Markdown table.
 * Typically, the first cell of each row is treated as a heading (defaulting to H2 if not already a heading),
 * and subsequent cells in that row have their content appended as paragraphs or blocks under that heading.
 * @param {Element} table - The HTML `<table>` element identified as complex.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {string} Markdown content representing the table's data as a series of sections.
 */
function processTableAsSections(table, document, processedElements, processors, parentPath) {
  const currentPath = `${parentPath} > TABLE_AS_SECTIONS${table.id ? "#"+table.id : ""}`;
  console.log(`processTableAsSections [${currentPath}]: Processing table as sections.`);
  let markdown = "\n";
  try {
    const rows = Array.from(table.rows);
    for (const row of rows) {
      if (processedElements.has(row)) continue;
      processedElements.add(row);
      const cells = Array.from(row.cells);
      if (cells.length === 0) continue;

      const firstCell = cells[0];
      let sectionTitle = "";
      for (const child of firstCell.childNodes) {
        sectionTitle += processors.processElementContent(child, document, new Set(processedElements), processors, `${currentPath} > SECTION_TITLE`);
      }
      sectionTitle = sectionTitle.trim().replace(/^#+\s*#+\s+/, '## ').replace(/^#+\s+/, '## ');
      if (!sectionTitle.startsWith('#') && sectionTitle.length > 0) sectionTitle = `## ${sectionTitle}`; // Make it a H2 if not already a heading
      if (sectionTitle && sectionTitle !== "##") markdown += `${sectionTitle}\n\n`;

      for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        if (!cell || !cell.childNodes || cell.childNodes.length === 0) continue;
        let cellContent = "";
        for (const child of cell.childNodes) {
          cellContent += processors.processElementContent(child, document, new Set(processedElements), processors, `${currentPath} > SECTION_CONTENT`);
        }
        cellContent = cleanupSectionContent(cellContent);
        if (cellContent.trim()) markdown += cellContent.trim() + "\n\n";
      }
    }
    return markdown;
  } catch (err) {
    console.error(`Error processing table as sections (Path: ${currentPath}):`, err);
    return "";
  }
}

/**
 * Processes the content of a standard table cell (`<td>` or `<th>`) for inclusion in a Markdown table.
 * It aims to extract and simplify the cell's content, handling basic inline HTML elements
 * (like `<a>`, `<strong>`, `<em>`, `<code>`, `<br>`) and converting them to their Markdown equivalents.
 * More complex structures within cells would typically lead to the table being processed by `processTableAsSections`.
 * @param {Element} cell - The HTML `<td>` or `<th>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed (passed for consistency, though cell content processing is usually self-contained).
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent table cell.
 * @returns {string} The cleaned and formatted Markdown content suitable for a table cell.
 */
function processTableCellContent(cell, document, processedElements, processors, parentPath) {
  const currentPath = `${parentPath} > CELL_CONTENT`;
  // console.log(`processTableCellContent [${currentPath}]: Processing cell.`);
  if (!cell) return "";
  try {
    // For standard table cells, we simplify content aggressively.
    // Complex content should have been routed to processTableAsSections.
    let content = "";
    for (const child of cell.childNodes) {
      if (child.nodeType === 3) { // Text node
        content += child.textContent;
      } else if (child.nodeType === 1) { // Element node
        // Basic inline formatting
        if (child.tagName === 'BR') content += " ";
        else if (child.tagName === 'A') {
          const href = child.getAttribute('href') || "";
          const text = child.textContent.trim();
          content += `[${text}](${href})`;
        } else if (child.tagName === 'STRONG' || child.tagName === 'B') content += `**${child.textContent.trim()}**`;
        else if (child.tagName === 'EM' || child.tagName === 'I') content += `*${child.textContent.trim()}*`;
        else if (child.tagName === 'CODE') content += `\`${child.textContent.trim()}\``;
        else if (child.tagName === 'P' && child.textContent.trim()) { // Paragraphs inside cells
            if (content.trim() && !content.endsWith(" ")) content += " "; // Add space if needed
            content += child.textContent.trim(); // Add paragraph text, then a space
             if (content.trim()) content += " ";
        }
        else content += child.textContent.trim(); // Default to text content for other inline elements
      }
    }
    return content.trim().replace(/\s+/g, " ").replace(/\|/g, "\\|");
  } catch (err) {
    console.error(`Error processing table cell content (Path: ${currentPath}):`, err);
    return "";
  }
}

/**
 * Main processor for TABLE elements.
 * Main processor for HTML `<table>` elements.
 * It first determines the type of table (history, layout, or complex data table).
 * Based on the type, it dispatches to a specialized table processing function:
 * - `processHistoryTable` for version history tables.
 * - `processLayoutTableContent` for tables used for page layout.
 * - `processTableAsSections` for complex data tables that are better represented as sections.
 * - Otherwise, it processes the table as a standard Markdown table, handling headers, rows, and cells (including colspans).
 * @param {Element} table - The HTML `<table>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {string} The Markdown representation of the table.
 */
function processTable(table, document, processedElements, processors, parentPath) { 
  const currentTablePath = `${parentPath || "TABLE_ROOT"} > TABLE${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`processTable [${currentTablePath}]: Determining table type.`);
  try {
    if (isHistoryTable(table)) {
      return processHistoryTable(table, document, processedElements, processors, currentTablePath);
    }
    if (isLayoutTable(table, document)) {
      return processLayoutTableContent(table, document, processedElements, processors, currentTablePath);
    }
    if (isComplexTable(table)) {
      return processTableAsSections(table, document, processedElements, processors, currentTablePath);
    }
    
    // Process as a standard Markdown table
    console.log(`processTable [${currentTablePath}]: Processing as standard Markdown table.`);
    const allTableRows = [];
    const htmlRows = Array.from(table.rows);
    let maxCols = 0;

    for (const tr of htmlRows) { // Calculate max columns considering colspans
      let colCount = 0;
      for (const cell of Array.from(tr.cells)) colCount += parseInt(cell.getAttribute("colspan") || "1", 10);
      maxCols = Math.max(maxCols, colCount);
    }
    if (maxCols === 0 && htmlRows.length > 0) { // If no colspans, count cells in first row
        if(htmlRows[0].cells.length > 0) maxCols = htmlRows[0].cells.length;
    }
    if (maxCols === 0) return ""; // No columns, likely an empty or malformed table
    
    for (const tr of htmlRows) {
      if (processedElements.has(tr)) continue;
      // processedElements.add(tr); // Row itself is not added, its cells are.
      
      const currentRowCells = [];
      const htmlCells = Array.from(tr.cells);
      let currentCellIndex = 0; // Tracks column index considering previous colspans in the row

      for (const td_th of htmlCells) {
        if (processedElements.has(td_th)) { // Skip if cell processed individually (should not happen with current logic)
            currentCellIndex += parseInt(td_th.getAttribute("colspan") || "1", 10);
            continue;
        }
        // We create a new Set for processedElements for each cell to contain its processing scope.
        // This is important because processTableCellContent might call processElementContent internally.
        const cellSpecificProcessed = new Set(processedElements); 
        // Add the cell itself to this specific set to avoid it processing itself if it somehow calls back.
        cellSpecificProcessed.add(td_th);

        const cellContent = processTableCellContent(td_th, document, cellSpecificProcessed, processors, currentTablePath);
        const safeContent = safeTableCellContent(cellContent);
        
        const colspan = parseInt(td_th.getAttribute("colspan") || "1", 10);
        currentRowCells[currentCellIndex] = safeContent;
        for (let k = 1; k < colspan; k++) { // Fill spanned cells
          currentCellIndex++;
          currentRowCells[currentCellIndex] = ""; // Represent spanned cell as empty string for now. Markdown doesn't have colspan.
        }
        currentCellIndex++;
      }
      // Pad row with empty strings if it has fewer cells than maxCols (due to rowspan from previous rows, or just irregular table)
      while(currentRowCells.length < maxCols) currentRowCells.push(""); 
      
      if (currentRowCells.some(c => c.trim() !== "")) { // Only add row if it has some content
          allTableRows.push({ type: tr.querySelectorAll("th").length > 0 ? "header" : "data", cells: currentRowCells.slice(0, maxCols) });
      }
    }
    if (allTableRows.length === 0) return "";
    
    let markdown = "\n";
    let headerProcessed = false;
    for (let i = 0; i < allTableRows.length; i++) {
      const rowObj = allTableRows[i];
      markdown += "| " + rowObj.cells.join(" | ") + " |\n";
      if ((rowObj.type === "header" || i === 0) && !headerProcessed && allTableRows.length > (i + 1) /* Check if there's a next row */) {
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

// ** Utility Table Functions (used by processTable and its sub-processors) **

/**
 * Makes table cell content safe for inclusion in a Markdown table.
 * This involves trimming whitespace, replacing newline characters with spaces (as Markdown table cells are single-line),
 * and escaping pipe characters (`|`) which have special meaning in Markdown tables.
 * @param {string} content - The raw string content of a table cell.
 * @returns {string} The processed and "safe" cell content. Returns a single space if content is falsy to maintain table structure.
 */
function safeTableCellContent(content) {
  if (!content) return " "; // Return a space for empty cells to maintain table structure
  return content.trim().replace(/\n+/g, " ").replace(/\|/g, "\\|"); // Replace newlines with space, escape pipes
}

/**
 * Simplifies complex cell content to a brief textual representation.
 * Used when a cell's content (as determined by `isComplexTableCell`) is too complex
 * for direct inclusion in a standard Markdown table cell. It provides a concise textual placeholder
 * or summary (e.g., "**Heading Text**", "[image]", "[List: 3 items]", "[Table]", "[Panel content]", or truncated text).
 * @param {Element} cell - The HTML `<td>` or `<th>` element deemed to have complex content.
 * @returns {string} A simplified string representation of the cell's content.
 */
function simplifyComplexCellContent(cell) {
  const headings = cell.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length > 0) return `**${headings[0].textContent.trim()}**`;
  const images = cell.querySelectorAll('img');
  if (images.length > 0) return `[${images[0].getAttribute('alt') || 'image'}]`;
  const lists = cell.querySelectorAll('ul, ol');
  if (lists.length > 0) return `[List: ${lists[0].querySelectorAll('li').length} items]`;
  const tables = cell.querySelectorAll('table');
  if (tables.length > 0) return '[Table]';
  const panels = cell.querySelectorAll('.panel, .confluence-information-macro');
  if (panels.length > 0) return '[Panel content]';
  let text = cell.textContent.trim().replace(/\s+/g, ' ');
  if (text.length > 50) text = text.substring(0, 47) + '...';
  return text || "[Complex Content]";
}

/**
 * Cleans up Markdown content that has been generated within sections (typically from `processTableAsSections`).
 * This function applies various regex replacements to fix common formatting issues such as:
 * - Incorrectly nested list item indentation.
 * - Headings or duplicated bullet points appearing within list items.
 * - Spacing around list markers and headings.
 * @param {string} content - The Markdown content of a section to be cleaned.
 * @returns {string} The cleaned Markdown content for the section.
 */
function cleanupSectionContent(content) {
  let cleaned = content;
  cleaned = cleaned.replace(/^(\s*[-*])\s+[-*]\s+/gm, '$1   * '); // Nested list spacing
  cleaned = cleaned.replace(/^(\s*[-*])\s+(#{1,6})\s+/gm, '$1 **'); // Heading in list item
  cleaned = cleaned.replace(/^(\s*[-*]\s+)#{1,6}(.+?)$/gm, '$1**$2**');
  cleaned = cleaned.replace(/^(\s*[-*].+\n)(#+\s+)/gm, '$1\n$2'); // Heading after list item
  cleaned = cleaned.replace(/^#+\s*#+\s+/gm, '### '); // Normalize multiple hashes in headings
  cleaned = cleaned.replace(/^(\s*)[-*]\s+[-*]\s+/gm, '$1- '); // Duplicate bullet points
  cleaned = cleaned.replace(/^-\s+/gm, '- '); // List spacing
  return cleaned;
}


// --- LIST PROCESSING ---

/**
 * Processes HTML `<ul>` (unordered list) elements.
 * Iterates over `<li>` children, processing each one and formatting it as a Markdown list item.
 * Handles multi-line list items by indenting subsequent lines.
 * @param {Element} element - The HTML `<ul>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the list element.
 * @returns {string} The Markdown representation of the unordered list.
 */
function processUnorderedListElement(element, document, processedElements, processors, currentPath) {
  console.log(`processUnorderedListElement [${currentPath}]: Processing UL.`);
  let markdown = "";
  for (const li of element.children) {
    if (li.tagName === "LI") {
      let itemContent = processors.processElementContent(li, document, processedElements, processors, currentPath);
      itemContent = itemContent.trim();
      // Handle multi-line list items correctly by indenting subsequent lines
      if (itemContent.includes("\n")) {
        const lines = itemContent.split("\n");
        markdown += `- ${lines.shift()}\n`; // First line
        for (const line of lines) {
          markdown += line.trim() ? `  ${line}\n` : "\n"; // Indent subsequent lines
        }
      } else {
        markdown += `- ${itemContent}\n`;
      }
    }
  }
  return markdown + "\n"; // Add an extra newline after the list
}

/**
 * Processes HTML `<ol>` (ordered list) elements.
 * Iterates over `<li>` children, processing each one and formatting it as a numbered Markdown list item.
 * Handles multi-line list items by indenting subsequent lines.
 * @param {Element} element - The HTML `<ol>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the list element.
 * @returns {string} The Markdown representation of the ordered list.
 */
function processOrderedListElement(element, document, processedElements, processors, currentPath) {
  console.log(`processOrderedListElement [${currentPath}]: Processing OL.`);
  let markdown = "";
  let i = 1;
  for (const li of element.children) {
    if (li.tagName === "LI") {
      let itemContent = processors.processElementContent(li, document, processedElements, processors, currentPath);
      itemContent = itemContent.trim();
      if (itemContent.includes("\n")) {
        const lines = itemContent.split("\n");
        markdown += `${i}. ${lines.shift()}\n`; // First line
        for (const line of lines) {
          markdown += line.trim() ? `   ${line}\n` : "\n"; // Indent subsequent lines (3 spaces for OL)
        }
      } else {
        markdown += `${i}. ${itemContent}\n`;
      }
      i++;
    }
  }
  return markdown + "\n"; // Add an extra newline after the list
}

/**
 * Processes HTML `<li>` (list item) elements.
 * Recursively processes the content of the list item. The actual list marker (`- ` or `1. `)
 * and indentation for multi-line items are handled by the parent `<ul>` or `<ol>` processor.
 * @param {Element} element - The HTML `<li>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the list item element.
 * @returns {string} The Markdown representation of the list item's content.
 */
function processListItemElement(element, document, processedElements, processors, currentPath) {
  console.log(`processListItemElement [${currentPath}]: Processing LI.`);
  let markdown = "";
  for (const child of element.childNodes) {
    markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
  }
  // Content is trimmed by the UL/OL processor
  return markdown;
}

// --- BASIC FORMATTING ---

/**
 * Processes HTML `<strong>` and `<b>` (bold) elements.
 * Wraps the recursively processed content of the element with Markdown bold syntax (`**content**`).
 * @param {Element} element - The HTML `<strong>` or `<b>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the element.
 * @returns {string} The Markdown bold representation of the element's content.
 */
function processStrongOrBoldElement(element, document, processedElements, processors, currentPath) {
  console.log(`processStrongOrBoldElement [${currentPath}]: Processing ${element.tagName}.`);
  let text = "";
  for (const child of element.childNodes) {
    text += processors.processElementContent(child, document, processedElements, processors, currentPath);
  }
  return `**${text}**`;
}

/**
 * Processes HTML `<em>` and `<i>` (italic/emphasis) elements.
 * Wraps the recursively processed content of the element with Markdown italic syntax (`*content*`).
 * @param {Element} element - The HTML `<em>` or `<i>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the element.
 * @returns {string} The Markdown italic representation of the element's content.
 */
function processEmphasisOrItalicElement(element, document, processedElements, processors, currentPath) {
  console.log(`processEmphasisOrItalicElement [${currentPath}]: Processing ${element.tagName}.`);
  let text = "";
  for (const child of element.childNodes) {
    text += processors.processElementContent(child, document, processedElements, processors, currentPath);
  }
  return `*${text}*`;
}

/**
 * Processes CODE elements.
 * Handles inline HTML `<code>` elements and `<code>` elements within `<pre>` blocks.
 * If the `<code>` element is a direct child of a `<pre>` element, its text content is returned as is
 * (to be wrapped by the `<pre>` processor). Otherwise, it's treated as inline code
 * and formatted using Confluence-style monospace notation (`\\[code\\]`).
 * @param {Element} element - The HTML `<code>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the element.
 * @returns {string} The Markdown representation of the code element.
 */
function processCodeElement(element, document, processedElements, processors, currentPath) {
  console.log(`processCodeElement [${currentPath}]: Processing CODE.`);
  let codeText = "";
  // For CODE elements, typically just take textContent directly.
  for (const child of element.childNodes) { 
    codeText += child.textContent;
  }
  // If inside a PRE block, don't add backticks, PRE handler will do it.
  if (element.parentElement && element.parentElement.tagName.toUpperCase() === "PRE") {
    return codeText;
  } else {
    // Using Confluence-style monospace notation for inline code
    return `\\[${codeText}\\]`; 
  }
}

/**
 * Processes PRE (preformatted text) elements.
 * Converts HTML `<pre>` (preformatted text) elements to a Confluence-style code block macro.
 * It extracts the text content of the `<pre>` element. If a language is specified
 * (e.g., via a `data-language` attribute or a `language-xyz` class on the `<pre>` or a child `<code>`),
 * it's included in the macro.
 * @param {Element} element - The HTML `<pre>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the element.
 * @returns {string} A Confluence-style Markdown code block macro `\\[\\[\\[lang\ncontent\n\\]\\]\\]`.
 */
function processPreformattedElement(element, document, processedElements, processors, currentPath) {
  console.log(`processPreformattedElement [${currentPath}]: Processing PRE.`);
  // For PRE, it often contains a CODE child. We want the text content of PRE itself.
  let preText = element.textContent; 
  const languageClass = element.className.match(/language-(\S+)/);
  const language = element.getAttribute("data-language") || (languageClass ? languageClass[1] : "");
  // Using Confluence-style code block macro notation
  return `\\[\\[\\[${language}\n${preText.trim()}\n\\]\\]\\]\n\n`;
}

/**
 * Processes HTML `<br>` (line break) elements.
 * Converts a `<br>` tag into a Markdown newline character.
 * Note: Standard Markdown often requires two spaces before a newline for a hard line break,
 * but a single newline is often sufficient for block flow or is handled by subsequent formatting.
 * @param {Element} element - The HTML `<br>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the element.
 * @returns {string} A newline character (`\n`).
 */
function processBreakElement(element, document, processedElements, processors, currentPath) {
  console.log(`processBreakElement [${currentPath}]: Processing BR.`);
  return "\n"; // Standard markdown for <br> is two spaces then newline, or just ensure a new line.
                   // Here, a simple newline might be enough if markdown processor handles it.
                   // For more explicit <br> -> <space><space>\n, this would need adjustment.
                   // Given current usage, a single \n is often what's desired for block flow.
}

/**
 * Processes HTML `<hr>` (horizontal rule) elements.
 * Converts an `<hr>` tag into a Markdown horizontal rule (`---`) surrounded by newlines.
 * @param {Element} element - The HTML `<hr>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the element.
 * @returns {string} A Markdown horizontal rule string (`\n---\n\n`).
 */
function processHorizontalRuleElement(element, document, processedElements, processors, currentPath) {
  console.log(`processHorizontalRuleElement [${currentPath}]: Processing HR.`);
  return "\n---\n\n";
}

// --- OTHER PROCESSORS ---

/**
 * Processes HTML `<p>` (paragraph) elements.
 * Recursively processes the content of the paragraph and ensures it's followed by two newlines
 * in Markdown for proper paragraph separation, if it contains non-whitespace content.
 * @param {Element} element - The HTML `<p>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the paragraph element.
 * @returns {string} The Markdown representation of the paragraph, or an empty string if the paragraph is empty.
 */
function processParagraphElement(element, document, processedElements, processors, currentPath) {
  console.log(`processParagraphElement [${currentPath}]: Processing P.`);
  let paragraphContent = "";
  for (const child of element.childNodes) {
    paragraphContent += processors.processElementContent(child, document, processedElements, processors, currentPath);
  }
  // Ensure paragraphs are separated by a blank line
  return paragraphContent.trim() ? paragraphContent.trim() + "\n\n" : "";
}

/**
 * Processes SPAN elements.
 * Processes HTML `<span>` elements.
 * It handles specific Confluence span classes:
 * - Spans with class `highlight` are treated as bold text (`**content**`).
 * - Spans with class `status-macro` (Confluence status lozenge) are formatted with monospace/macro style (`\\[content\\]`).
 * For other `<span>` elements, it defaults to recursively processing their children, effectively treating them as passthrough.
 * @param {Element} element - The HTML `<span>` element.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the span element.
 * @returns {string} The Markdown representation based on the span type or its content.
 */
function processSpanElement(element, document, processedElements, processors, currentPath) {
  console.log(`processSpanElement [${currentPath}]: Processing SPAN.`);
  let markdown = "";
  // Example: Confluence "highlight" span class could become bold or some other marker
  if (element.classList && element.classList.contains("highlight")) { 
    let highlightText = "";
    for (const child of element.childNodes) {
      highlightText += processors.processElementContent(child, document, processedElements, processors, currentPath);
    }
    markdown = `**${highlightText}**`; // Render as bold
  } else if (element.classList && element.classList.contains("status-macro")) { // Confluence status macro
    let statusText = element.textContent.trim();
    markdown = `\\[${statusText}\\]`; // Render as monospace or custom macro
  } else {
    // Default span processing: iterate children (treat as passthrough)
    console.log(`processSpanElement [${currentPath}]: Processing generic SPAN.`);
    for (const child of element.childNodes) {
      markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
    }
  }
  return markdown;
}

/**
 * Processes elements that don't have a specific handler (default case).
 * Processes HTML elements that do not have a specific handler in the `processElementContent` switch statement.
 * This function serves as a fallback, recursively processing the children of the given element
 * and concatenating their Markdown output.
 * @param {Element} element - The HTML element to process.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} currentPath - The debug path for the element.
 * @returns {string} The concatenated Markdown representation of the element's children.
 */
function processDefaultElement(element, document, processedElements, processors, currentPath) {
  console.log(`processDefaultElement [${currentPath}]: Processing DEFAULT case for ${element.tagName}.`);
  let markdown = "";
  for (const child of element.childNodes) {
    markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
  }
  return markdown;
}

/**
 * Processes page metadata elements (typically found in Confluence HTML).
 * The content of the metadata element is recursively processed, cleaned up by `utilities.cleanupMetadataContent`,
 * and then wrapped in HTML comments to denote it as processed page metadata.
 * This metadata is often extracted for frontmatter separately, so this serves more as a marker or fallback.
 * @param {Element} metadataElement - The HTML element containing page metadata.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions.
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {string} A string containing the processed metadata wrapped in HTML comments, or an empty string if no metadata content.
 */
function processMetadata(metadataElement, document, processedElements, processors, parentPath) {
  if (!metadataElement || processedElements.has(metadataElement)) return "";
  const currentPath = `${parentPath || "METADATA_ROOT"} > METADATA`;
  console.log(`processMetadata [${currentPath}]: Processing metadata.`);
  let markdown = "";
  for (const child of metadataElement.childNodes) {
    markdown += processors.processElementContent(child, document, processedElements, processors, currentPath);
  }
  const cleanedMetadata = utilities.cleanupMetadataContent(markdown.trim());
  return cleanedMetadata ? `\n<!-- Page Metadata Processed -->\n${cleanedMetadata}\n<!-- End Page Metadata -->\n\n` : "";
}

/**
 * Processes an HTML section identified as containing page attachments.
 * It looks for anchor (`<a>`) tags within this section, extracts their `href` and text content
 * (prioritizing `data-attachment-name` if available), and formats them as a Markdown list.
 * @param {Element} attachmentsElement - The HTML element that contains the list of attachments.
 * @param {Document} document - The JSDOM document object.
 * @param {Set<Node>} processedElements - A set of DOM nodes that have already been processed.
 * @param {Object<string, function>} processors - An object containing other processing functions (used for consistency, though not directly called for complex child processing here).
 * @param {string} parentPath - The debug path of the parent element.
 * @returns {string} A Markdown formatted list of attachments under an "### Attachments" heading, or an empty string if no attachments are found.
 */
function processAttachmentsSection(attachmentsElement, document, processedElements, processors, parentPath) {
  if (!attachmentsElement || processedElements.has(attachmentsElement)) return "";
  const currentPath = `${parentPath || "ATTACHMENTS_ROOT"} > ATTACHMENTS_SECTION`;
  console.log(`processAttachmentsSection [${currentPath}]: Processing attachments.`);
  let markdown = "\n### Attachments\n\n";
  const links = attachmentsElement.querySelectorAll("a");
  let foundAttachments = false;
  for (const link of links) {
    if (processedElements.has(link)) continue;
    const href = link.getAttribute("href");
    let text = link.textContent.trim();
    if (href) {
        const attachmentName = link.getAttribute("data-attachment-name") || path.basename(href); // Use data-attr or filename
        text = attachmentName || text || href; // Fallback for text
        markdown += `- [${text}](${href})\n`;
        processedElements.add(link);
        foundAttachments = true;
    }
  }
  return foundAttachments ? markdown + "\n" : ""; // Only return if attachments were found
}

// --- MODULE EXPORTS ---

module.exports = {
  // Main element processors (renamed and consolidated)
  processDiv,
  processTable,
  processHeader,
  processLink,
  processImage,
  processParagraphElement,
  processUnorderedListElement,
  processOrderedListElement,
  processListItemElement,
  processStrongOrBoldElement,
  processEmphasisOrItalicElement,
  processCodeElement,
  processPreformattedElement,
  processBreakElement,
  processHorizontalRuleElement,
  processSpanElement,
  processDefaultElement,
  
  // Specialized processors & helpers that might be called directly or are part of the public API of this module
  processMetadata,
  processAttachmentsSection,
  processPanel,      // Helper for processDiv, but potentially useful standalone
  processLayoutDiv,  // Helper for processDiv
  
  // Table processing helpers (some might be used by other modules if they deal with tables)
  processLayoutTableContent,
  processHistoryTable,
  processTableAsSections,
  processTableCellContent,   // Main cell processor for standard tables
  safeTableCellContent,      // Utility for cleaning cell content
  isComplexTableCell,      // Utility to check cell complexity (this was the one from content-processor originally)
  simplifyComplexCellContent, // Utility to simplify complex cells
  isComplexTable,          // Utility to check table complexity
  isHistoryTable,          // Utility to identify history tables
  isLayoutTable,           // Utility to identify layout tables
  cleanupSectionContent    // Utility for cleaning content from table-as-sections
};
