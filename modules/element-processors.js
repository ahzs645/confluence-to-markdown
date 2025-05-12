// modules/element-processors.js - COMPREHENSIVE FIX V7 (Adding processLayout and processPanel definitions)
/**
 * Specialized processors for different HTML element types
 * Added processLayout and processPanel definitions to handle children of layout divs like contentLayout2.
 * Enhanced logging in processDiv, processLayout for debugging contentLayout2.
 */

const path = require("path");
const contentProcessor = require("./content-processor"); // Will be populated by module system

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
  const currentPath = `${parentPath || 'METADATA_ROOT'} > METADATA${metadataElement.id ? "#"+metadataElement.id : ""}${metadataElement.className ? "."+metadataElement.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`element-processors.processMetadata [${currentPath}]: START`);
  // processedElements.add(metadataElement); // Caller (processElementContent or markdown-generator) handles adding to set
  let markdown = "";
  for (const child of metadataElement.childNodes) {
    markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
  }
  console.log(`element-processors.processMetadata [${currentPath}]: END, accumulated markdown length: ${markdown.length}`);
  return markdown.trim() ? `\n<!-- Page Metadata Processed -->\n${markdown.trim()}\n<!-- End Page Metadata -->\n\n` : "";
}

function processAttachmentsSection(attachmentsElement, document, processedElements, parentPath) {
  if (!attachmentsElement || processedElements.has(attachmentsElement)) return "";
  const currentPath = `${parentPath || 'ATTACHMENTS_ROOT'} > ATTACHMENTS_SECTION${attachmentsElement.id ? "#"+attachmentsElement.id : ""}`;
  console.log(`element-processors.processAttachmentsSection [${currentPath}]: START`);
  // processedElements.add(attachmentsElement); // Caller handles adding
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
        processedElements.add(link); // Add specific links as they are processed here
    } else if (href) {
        markdown += `- [${href}](${href})\n`;
        processedElements.add(link);
    }
  }
  console.log(`element-processors.processAttachmentsSection [${currentPath}]: END, accumulated markdown length: ${markdown.length}`);
  return markdown.trim().length > "### Attachments".length ? markdown + "\n\n" : "";
}

function processPanel(panelDiv, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > PANEL${panelDiv.id ? "#"+panelDiv.id : ""}${panelDiv.className ? "."+panelDiv.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`element-processors.processPanel [${currentPath}]: START. Number of childNodes: ${panelDiv.childNodes.length}`);
  let markdown = "";
  const panelTitleElement = panelDiv.querySelector('.panelHeader, .panel-header, .aui-message-header');
  const panelContentElement = panelDiv.querySelector('.panelContent, .panel-body, .aui-message-content');

  if (panelTitleElement) {
    console.log(`  element-processors.processPanel [${currentPath}]: Processing panel title.`);
    let titleText = "";
    for(const child of panelTitleElement.childNodes) {
        titleText += contentProcessor.processElementContent(child, document, processedElements, module.exports, `${currentPath} > TITLE`);
    }
    if (titleText.trim()) {
        markdown += `**${titleText.trim()}**\n\n`;
    }
  }

  const targetElementForChildren = panelContentElement || panelDiv;
  console.log(`  element-processors.processPanel [${currentPath}]: Processing children of ${panelContentElement ? 'panelContentElement' : 'panelDiv'}.`);
  for (const child of targetElementForChildren.childNodes) {
      if (child === panelTitleElement && panelContentElement) continue; // Avoid re-processing title if we are iterating panelDiv and title was separate
      const childNodeId = child.id || "NO_ID";
      const childNodeClass = child.className && typeof child.className === "string" ? child.className : (child.className && child.className.baseVal ? child.className.baseVal : "NO_CLASS");
      console.log(`    element-processors.processPanel [${currentPath}]: Processing child - NodeName: ${child.nodeName}, ID: '${childNodeId}', Class: '${childNodeClass}'`);
      markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, `${currentPath} > ${panelContentElement ? 'CONTENT' : 'CHILD'}`);
  }

  console.log(`element-processors.processPanel [${currentPath}]: END, accumulated markdown length: ${markdown.length}`);
  if (markdown.trim()) {
    return `> ${markdown.trim().replace(/\n/g, '\n> ')}\n\n`;
  }
  return "";
}

function processLayout(layoutDiv, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > LAYOUT${layoutDiv.id ? "#"+layoutDiv.id : ""}${layoutDiv.className ? "."+layoutDiv.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`element-processors.processLayout [${currentPath}]: START. Number of childNodes: ${layoutDiv.childNodes.length}`);
  let markdown = "";

  for (let i = 0; i < layoutDiv.childNodes.length; i++) {
    const child = layoutDiv.childNodes[i];
    const childNodeId = child.id || "NO_ID";
    const childNodeClass = child.className && typeof child.className === "string" ? child.className.trim().replace(/\s+/g, ".") : (child.className && child.className.baseVal ? child.className.baseVal.trim().replace(/\s+/g, ".") : "NO_CLASS");
    console.log(`  element-processors.processLayout [${currentPath}]: Processing child ${i+1}/${layoutDiv.childNodes.length} - NodeName: ${child.nodeName}, ID: '${childNodeId}', Class: '.${childNodeClass}', Text (first 30): '${(child.textContent || "").trim().substring(0,30)}...'`);
    markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
  }
  console.log(`element-processors.processLayout [${currentPath}]: END, accumulated markdown length: ${markdown.length}`);
  return markdown;
}

function processDiv(div, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > DIV${div.id ? "#"+div.id : ""}${div.className ? "."+div.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`element-processors.processDiv [${currentPath}]: START. ClassName: ${div.className}`);
  let markdown = "";

  if (div.classList.contains("expand-content")) {
    console.log(`element-processors.processDiv [${currentPath}]: Detected expand-content. Processing children.`);
    for (const child of div.childNodes) {
      markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
    }
  } else if (div.classList.contains("panel") || div.classList.contains("aui-message") || div.classList.contains("confluence-information-macro")) {
    console.log(`element-processors.processDiv [${currentPath}]: Detected panel/macro. Calling processPanel.`);
    markdown += processPanel(div, document, processedElements, currentPath);
  } else if (div.classList.contains("contentLayout") || 
             div.classList.contains("columnLayout") || 
             div.classList.contains("section") || 
             div.classList.contains("cell") || 
             div.classList.contains("innerCell") || 
             div.classList.contains("layout-column") || 
             div.classList.contains("contentLayout2")) { 
    console.log(`element-processors.processDiv [${currentPath}]: Detected layout DIV (Class: ${div.className}). Calling processLayout.`);
    markdown += processLayout(div, document, processedElements, currentPath);
  }
  else { 
    console.log(`element-processors.processDiv [${currentPath}]: Processing as generic DIV, iterating children.`);
    for (const child of div.childNodes) {
      markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
    }
  }
  console.log(`element-processors.processDiv [${currentPath}]: END for ${currentPath}, accumulated markdown length: ${markdown.length}`);
  return markdown;
}

function processTable(table, document, processedElements, parentPath) { 
  const currentTablePath = `${parentPath || 'TABLE_ROOT'} > TABLE${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`element-processors.processTable [${currentTablePath}]: START`);
  try {
    if (isHistoryTable(table)) {
      console.log(`  element-processors.processTable [${currentTablePath}]: Detected as History Table`);
      return processHistoryTable(table, document, processedElements, currentTablePath);
    }
    if (isLayoutTable(table, document)) {
      console.log(`  element-processors.processTable [${currentTablePath}]: Detected as Layout Table`);
      return processLayoutTableContent(table, document, processedElements, currentTablePath);
    }
    console.log(`  element-processors.processTable [${currentTablePath}]: Processing as Standard Data Table`);
    const allTableRows = [];
    let maxCols = 0;
    const htmlRows = Array.from(table.rows);
    for (const tr of htmlRows) {
      if (processedElements.has(tr)) continue;
      // processedElements.add(tr); // Let cell processing handle this if needed, or processElementContent for TR if we had a TR case
      const currentRowCells = [];
      const htmlCells = Array.from(tr.cells);
      let currentCellIndex = 0;
      for (const td_th of htmlCells) {
        const colspan = parseInt(td_th.getAttribute("colspan") || "1", 10);
        // Use a new Set for each cell's content processing, but seeded with current processedElements to respect global state.
        const cellContent = contentProcessor.cleanCellContent(td_th, document, new Set(processedElements), module.exports, `${currentTablePath} > TR > ${(td_th.tagName || 'CELL')}`);
        currentRowCells[currentCellIndex] = cellContent || " ";
        for (let k = 1; k < colspan; k++) {
          currentCellIndex++;
          currentRowCells[currentCellIndex] = " "; // Placeholder for spanned cells
        }
        currentCellIndex++;
      }
      if (currentRowCells.length > 0) {
        allTableRows.push({ type: tr.querySelectorAll("th").length > 0 ? "header" : "data", cells: currentRowCells });
        maxCols = Math.max(maxCols, currentRowCells.length);
      }
    }
    if (allTableRows.length === 0 || maxCols === 0) {
        console.log(`  element-processors.processTable [${currentTablePath}]: END (No rows or columns)`);
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
    console.log(`  element-processors.processTable [${currentTablePath}]: END, accumulated markdown length: ${markdown.length}`);
    return markdown.trim() ? markdown + "\n\n" : "";
  } catch (err) {
    console.error(`Error processing table (Path: ${currentTablePath}):`, err);
    return "";
  }
}

function processLayoutTableContent(table, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > LAYOUT_TABLE_CONTENT${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`element-processors.processLayoutTableContent [${currentPath}]: START`);
  try {
    let markdown = "";
    const htmlRows = Array.from(table.rows);
    for (const tr of htmlRows) {
        const htmlCells = Array.from(tr.cells);
        for (const td of htmlCells) {
            console.log(`  element-processors.processLayoutTableContent [${currentPath}]: Processing cell: ID='${td.id || ""}', Class='${td.className || ""}', Children: ${td.childNodes.length}`);
            for (const child of td.childNodes) {
                console.log(`    element-processors.processLayoutTableContent [${currentPath}] (cell child): NodeName: ${child.nodeName}, NodeType: ${child.nodeType}`);
                markdown += contentProcessor.processElementContent(child, document, processedElements, module.exports, currentPath);
            }
            markdown += "\n"; // Add a newline after each cell's content in a layout table to separate content blocks
        }
    }
    console.log(`element-processors.processLayoutTableContent [${currentPath}]: END, accumulated markdown length: ${markdown.length}`);
    return markdown.trim() ? markdown + "\n" : "";
  } catch (err) {
    console.error(`Error processing layout table content (Path: ${currentPath}):`, err);
    return "";
  }
}

function processHistoryTable(table, document, processedElements, parentPath) {
  const currentPath = `${parentPath} > HISTORY_TABLE${table.id ? "#"+table.id : ""}${table.className ? "."+table.className.trim().replace(/\s+/g, ".") : ""}`;
  console.log(`element-processors.processHistoryTable [${currentPath}]: START`);
  try {
    let markdown = "\n### Page History\n\n";
    const displayHeadersList = ["Version", "Published", "Changed By", "Comment"];
    const numTableColumns = displayHeadersList.length;
    const tbody = table.querySelector("tbody");
    const rowsToProcess = tbody ? Array.from(tbody.querySelectorAll("tr")) : Array.from(table.querySelectorAll("tr"));
    const actualHeaderExistsInRows = rowsToProcess.length > 0 && rowsToProcess[0].querySelectorAll("th").length > 0;
    const allRowsData = [];
    const dataRowStartIndex = actualHeaderExistsInRows ? 1 : 0;
    for (let i = dataRowStartIndex; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const htmlCells = Array.from(row.querySelectorAll("td, th"));
      const rowData = Array(numTableColumns).fill(" ");
      if (htmlCells[0]) {
        const versionLink = htmlCells[0].querySelector("a");
        if (versionLink) {
          rowData[0] = `[${(versionLink.textContent || "").replace(/\s+/g, " ").trim()}](${versionLink.getAttribute("href") || ""})`;
          let fullCellText = "";
          htmlCells[0].childNodes.forEach(node => { if (node !== versionLink) fullCellText += node.textContent; });
          rowData[1] = fullCellText.replace(/\s+/g, " ").trim();
          if (!rowData[1] && htmlCells[0].innerHTML.includes("<br>")) {
            let parts = htmlCells[0].innerHTML.split(/<br\s*\/?>/i);
            if (parts.length > 1) {
              let tempDiv = document.createElement("div");
              tempDiv.innerHTML = parts.find(p => p.includes(versionLink.outerHTML) ? "" : p) || "";
              rowData[1] = (tempDiv.textContent || "").replace(/\s+/g, " ").trim();
            }
          }
        } else {
          rowData[0] = contentProcessor.cleanCellContent(htmlCells[0], document, new Set(processedElements), module.exports, `${currentPath} > TR > CELL_Version`);
        }
      }
      if (htmlCells[1]) {
        const userLink = htmlCells[1].querySelector("a.confluence-userlink");
        rowData[2] = (userLink && userLink.textContent.trim()) ? (userLink.textContent || "").replace(/\s+/g, " ").trim() : contentProcessor.cleanCellContent(htmlCells[1], document, new Set(processedElements), module.exports, `${currentPath} > TR > CELL_ChangedBy`);
      }
      if (htmlCells[2]) {
        rowData[3] = contentProcessor.cleanCellContent(htmlCells[2], document, new Set(processedElements), module.exports, `${currentPath} > TR > CELL_Comment`);
      }
      allRowsData.push(rowData);
    }
    markdown += "| " + displayHeadersList.join(" | ") + " |\n";
    markdown += "|" + Array(numTableColumns).fill("---").join("|") + "|\n";
    for (const data of allRowsData) {
      if (data.some(cellContent => (cellContent || "").trim() !== "")) {
        markdown += "| " + data.map(c => c || " ").join(" | ") + " |\n";
      }
    }
    console.log(`element-processors.processHistoryTable [${currentPath}]: END, accumulated markdown length: ${markdown.length}`);
    return markdown.trim() ? markdown + "\n\n" : "";
  } catch (err) {
    console.error(`Error processing history table (Path: ${currentPath}):`, err);
    return "";
  }
}

function processLink(link, document, processedElements, processElementContentFn, parentPath) {
    const currentPath = `${parentPath} > A${link.id ? "#"+link.id : ""}`;
    console.log(`element-processors.processLink [${currentPath}]: START`);
    let text = "";
    for(const child of link.childNodes) {
        text += processElementContentFn(child, document, processedElements, module.exports, currentPath);
    }
    text = text.trim();
    const href = link.getAttribute("href") || "";
    if (!text && href) text = href; // Use href if text is empty
    console.log(`element-processors.processLink [${currentPath}]: END. Text: '${text}', Href: '${href}'`);
    return `[${text}](${href})`;
}

function processImage(img, parentPath) {
    const currentPath = `${parentPath} > IMG${img.id ? "#"+img.id : ""}`;
    console.log(`element-processors.processImage [${currentPath}]: START`);
    const src = img.getAttribute("src") || "";
    const alt = img.getAttribute("alt") || "image";
    const title = img.getAttribute("title") || "";
    let markdown = `![${alt}](${src}${title ? ` "${title}"` : ""})`;
    console.log(`element-processors.processImage [${currentPath}]: END. Markdown: ${markdown}`);
    return markdown;
}

// Placeholder for processCodeBlock if it's complex, otherwise handled by PRE/CODE in contentProcessor
function processCodeBlock(pre, document, processedElements, parentPath) {
    const currentPath = `${parentPath} > PRE_CODEBLOCK${pre.id ? "#"+pre.id : ""}`;
    console.log(`element-processors.processCodeBlock [${currentPath}]: START (Note: PRE/CODE usually handled by contentProcessor)`);
    let text = pre.textContent || "";
    const lang = pre.getAttribute("data-language") || pre.className.match(/language-(\S+)/)?.[1] || "";
    console.log(`element-processors.processCodeBlock [${currentPath}]: END`);
    return `\n\\[\\[\\[${lang}\n${text.trim()}\n\\]\\]\\]\n\n`;
}

module.exports = {
  processMetadata,
  processAttachmentsSection,
  processDiv,
  processTable,
  processHistoryTable,
  processLink,
  processImage,
  processCodeBlock,
  processPanel,      // Added
  processLayout,     // Added
  processLayoutTableContent
};

