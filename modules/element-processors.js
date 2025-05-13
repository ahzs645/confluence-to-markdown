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

function processTable(table, document, processedElements, parentPath) { 
  const currentTablePath = `${parentPath || "TABLE_ROOT"} > TABLE${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  try {
    if (isHistoryTable(table)) {
      return processHistoryTable(table, document, processedElements, currentTablePath);
    }
    if (isLayoutTable(table, document)) {
      return processLayoutTableContent(table, document, processedElements, currentTablePath);
    }
    const allTableRows = [];
    let maxCols = 0;
    const htmlRows = Array.from(table.rows);
    for (const tr of htmlRows) {
      if (processedElements.has(tr)) continue;
      const currentRowCells = [];
      const htmlCells = Array.from(tr.cells);
      let currentCellIndex = 0;
      for (const td_th of htmlCells) {
        const colspan = parseInt(td_th.getAttribute("colspan") || "1", 10);
        const cellContent = contentProcessor.cleanCellContent(td_th, document, new Set(processedElements), module.exports, `${currentTablePath} > TR > ${(td_th.tagName || "CELL")}`);
        currentRowCells[currentCellIndex] = cellContent || " ";
        for (let k = 1; k < colspan; k++) {
          currentCellIndex++;
          currentRowCells[currentCellIndex] = " "; 
        }
        currentCellIndex++;
      }
      if (currentRowCells.length > 0) {
        allTableRows.push({ type: tr.querySelectorAll("th").length > 0 ? "header" : "data", cells: currentRowCells });
        maxCols = Math.max(maxCols, currentRowCells.length);
      }
    }
    if (allTableRows.length === 0 || maxCols === 0) {
        return "";
    }
    for (const rowObj of allTableRows) {
      while (rowObj.cells.length < maxCols) {
        rowObj.cells.push(" ");
      }
    }
    let markdown = "\n";
    let headerProcessed = false;
    for (let i = 0; i < allTableRows.length; i++) {
      const rowObj = allTableRows[i];
      if (rowObj.cells.every(c => (c || "").trim() === "")) continue;
      markdown += "| " + rowObj.cells.join(" | ") + " |\n";
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
  processLayoutTableContent,
  processHistoryTable,
  processHeader,
  processLink,
  processImage,
  isHistoryTable, 
  isLayoutTable 
};

