// modules/utilities.js
/**
 * @file Utility functions for the HTML to Markdown converter.
 * Provides functions for string manipulation, filename sanitization, slug generation,
 * Markdown cleanup, table fixing, and other miscellaneous tasks.
 */

// --- General String & Path Utilities ---

/**
 * Escapes special characters in a string for safe inclusion in YAML.
 * Handles common YAML special characters and ensures quotes and newlines are properly treated.
 * @param {string} text - The text to escape.
 * @returns {string} The escaped text. Returns the original text if it's not a string or if an error occurs.
 */
function escapeYaml(text) {
  if (typeof text !== 'string') return text; 
  try {
    let cleaned = text;
    // Unescape common pre-escaped characters first to avoid double escaping.
    cleaned = cleaned.replace(/\\\[/g, '[').replace(/\\\]/g, ']');
    cleaned = cleaned.replace(/\\([&%{}])/g, '$1');
    
    cleaned = cleaned.replace(/"/g, '\\"'); // Escape double quotes
    cleaned = cleaned.replace(/\n/g, ' ');   // Replace newlines with spaces for single-line YAML
    // Escape characters that have special meaning in YAML.
    cleaned = cleaned.replace(/([:|>\-*#&?![\]{}',@`])/g, '\\$1');
    
    return cleaned;
  } catch (err) {
    console.error('Error escaping YAML:', err);
    return text; 
  }
}

/**
 * Checks if a string is empty or contains only whitespace.
 * @param {string} str - The string to check.
 * @returns {boolean} True if the string is empty or whitespace-only, false otherwise.
 */
function isEmpty(str) {
  return !str || /^\s*$/.test(str);
}

/**
 * Sanitizes a filename by replacing illegal characters and spaces.
 * Replaces common illegal filesystem characters with hyphens and spaces with underscores.
 * @param {string} filename - The filename to sanitize.
 * @returns {string} The sanitized filename. Returns an empty string if input is falsy.
 */
function sanitizeFilename(filename) {
  if (!filename) return '';
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-') 
    .replace(/\s+/g, '_')          
    .replace(/-+/g, '-')           
    .replace(/_+/g, '_')           
    .trim();
}

/**
 * Generates a URL-friendly slug from a string.
 * Converts to lowercase, removes non-alphanumeric characters (allowing hyphens), 
 * and replaces spaces/multiple hyphens with single hyphens.
 * @param {string} text - The text to slugify.
 * @returns {string} The generated slug. Returns an empty string if input is falsy.
 */
function slugify(text) {
  if (!text) return '';
  return text
    .toString() 
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')    
    .replace(/\s+/g, '-')        
    .replace(/-+/g, '-')         
    .trim()                      
    .replace(/^-+|-+$/g, '');   
}

// --- Markdown Content Processing Utilities ---

/**
 * Cleans up metadata content by removing problematic characters.
 * Useful for preparing metadata strings before inclusion in frontmatter or other structured data.
 * @param {string} metadataText - The metadata text to clean.
 * @returns {string} The cleaned metadata text. Returns empty string if input is falsy.
 */
function cleanupMetadataContent(metadataText) {
  if (!metadataText) return '';
  return metadataText
    .replace(/\/\s+/g, ' ')      
    .replace(/\s+—>/g, ' -->')   
    .replace(/\s+->/g, ' ->')    
    .replace(/\s+>/g, ' >')      
    .trim();
}


// --- Markdown Cleanup Helper Functions ---

/** 
 * @private 
 * First pass of markdown cleanup: Fixes specific Confluence question heading formats and list-like headings. 
 */
function _cleanupPass1_FixQuestionAndListHeadings(markdown) {
  let result = markdown;
  result = result.replace(/^## - ### /gm, '- ### ');
  result = result.replace(/^# - ### /gm, '- ### ');
  result = result.replace(/^#{1,6} - /gm, '- ');
  return result;
}

/** 
 * @private 
 * Second pass of markdown cleanup: Normalizes heading patterns. 
 */
function _cleanupPass2_NormalizeHeadingPatterns(markdown) {
  let result = markdown;
  for (let i = 0; i < 3; i++) { 
    result = result.replace(/^# # ([^\n]+)$/gm, '## $1');
    result = result.replace(/^# ## ([^\n]+)$/gm, '## $1');
    result = result.replace(/^## # ([^\n]+)$/gm, '## $1');
    result = result.replace(/^(#+)\s+(#+)\s+/gm, '$1 ');
  }
  return result;
}

/** 
 * @private 
 * Third pass of markdown cleanup: Removes Confluence-specific markup and adjusts heading levels. 
 */
function _cleanupPass3_RemoveConfluenceMarkupAndAdjustHeadings(markdown) {
  let result = markdown;
  result = result.replace(/\s+{#.*?}$/gm, ''); 
  result = result.replace(/^# ([A-Z][^#\n]+?)$/gm, '## $1'); 
  result = result.replace(/^(#{3,6})\s*(?=[^\s#])/gm, '$1 '); 
  return result;
}

/** 
 * @private 
 * Fourth pass of markdown cleanup: Standard Markdown syntax tweaks. 
 */
function _cleanupPass4_StandardMarkdownTweaks(markdown) {
  let result = markdown;
  result = result.replace(/\r\n/g, '\n'); 
  result = result.replace(/\n{3,}/g, '\n\n'); 
  result = result.replace(/```([^`\n]*)\n\n+/g, '```$1\n');
  result = result.replace(/^(#+) --/gm, '$1 '); 
  result = result.replace(/^0+$/gm, ''); 
  result = result.replace(/title: "([^"]*)"/g, (match, title) => `title: "${title.replace(/\\"/g, '"')}"`);
  result = result.replace(/^(#+)([^\s#])/gm, '$1 $2'); 
  return result;
}

/** 
 * @private 
 * Fifth pass of markdown cleanup: Fixes list, link, table, and HTML formatting issues. 
 */
function _cleanupPass5_ListLinkTableHtmlFixes(markdown) {
  let result = markdown;
  result = result.replace(/^- - /gm, '  - ');
  result = result.replace(/^- # /gm, '- ');   
  result = result.replace(/^(\s*[-*+].*)\n\n+(?=\s*[-*+])/gm, '$1\n');
  result = result.replace(/([^\n])(\n#{1,6} )/g, '$1\n\n$2');
  result = result.replace(/(>.*\n)\n+(?=>)/g, '$1');
  result = result.replace(/>\s*\n>\s*\n/g, '>\n>\n'); 
  result = result.replace(/<\/details>\s*<details>/g, '</details>\n\n<details>');
  result = result.replace(/\(\.\/images\//g, '(images/');
  result = result.replace(/<([a-z][a-z0-9]*)\b[^>]*>\s*<\/\1>/gi, '');
  result = result.replace(/\|\s*\|/g, '| |');
  result = result.replace(/^-{1,2}$/gm, '---');
  result = result.replace(/(\n---\n)\n+---\n/g, '$1');
  result = result.replace(/\[([^\]]*\[[^\]]*\][^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
    if (text.includes('[') && text.includes(']') && !text.includes('![')) {
      return text.replace(/\\([\[\]()#])/g, '$1'); 
    }
    return match;
  });
  result = result.replace(/^(\s*[-*+])\s*$/gm, '$1 ');
  return result;
}

/** 
 * @private 
 * Sixth pass of markdown cleanup: Decodes common HTML entities. 
 */
function _cleanupPass6_DecodeHtmlEntities(markdown) {
  let result = markdown;
  result = result.replace(/&nbsp;/g, ' ');
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&apos;/g, "'");
  return result;
}

/** 
 * @private 
 * Final cleanup pass: Catch all remaining formatting artifacts. 
 */
function _cleanupPassFinal_CatchAll(markdown) {
    let result = markdown;
    result = result.replace(/^# # /gm, '## '); 
    result = result.replace(/^## - ### /gm, '- ### ');
    result = result.replace(/(?<!\*)\*(?!\*)\s*$/gm, ''); 
    result = result.replace(/> - \*\*(.*?)\*\* \*/g, '> - **$1**'); 
    result = result.replace(/(\*\* \S+)\s+\*(?!\*)/gm, '$1');      
    return result;
}

/**
 * Cleans and standardizes Markdown content through multiple passes.
 * Applies a series of regex replacements to fix common issues from HTML conversion,
 * especially from Confluence HTML.
 * @param {string} markdown - The raw Markdown content.
 * @returns {string} The cleaned and standardized Markdown content. Returns original on error or if input is not a string.
 */
function cleanupMarkdown(markdown) {
  if (typeof markdown !== 'string' || !markdown) return markdown; 
  try {
    let result = markdown;
    result = _cleanupPass1_FixQuestionAndListHeadings(result);
    result = _cleanupPass2_NormalizeHeadingPatterns(result);
    result = _cleanupPass3_RemoveConfluenceMarkupAndAdjustHeadings(result);
    result = _cleanupPass4_StandardMarkdownTweaks(result);
    result = _cleanupPass5_ListLinkTableHtmlFixes(result);
    result = _cleanupPass6_DecodeHtmlEntities(result);
    result = _cleanupPassFinal_CatchAll(result);
    return result.trim();
  } catch (err) {
    console.error('Error cleaning up markdown:', err);
    return markdown; 
  }
}


// --- Table Processing Utilities ---

/**
 * Cleans up tables with excessive or duplicated delimiter rows.
 * @param {string} markdown - Markdown content.
 * @returns {string} Markdown with cleaned table delimiter rows. Returns original if input is falsy.
 */
function cleanupExcessiveDelimiters(markdown) {
  if (!markdown) return '';
  const manyDelimitersPattern = /^(\|(:?[\s-]*?\:?\|)+)\n(\1\n)+/gm; 
  return markdown.replace(manyDelimitersPattern, '$1\n'); 
}

/**
 * Splits a Markdown table row string into an array of cell contents.
 * Handles escaped pipe characters `\|` within cells.
 * @param {string} row - The table row string (e.g., "| cell1 | cell\\|2 |").
 * @returns {string[]} An array of cell content strings, with escaped pipes restored and content trimmed.
 * Returns an empty array if the row is not a valid table row string.
 */
function splitTableRow(row) {
  if (!row || !row.startsWith('|') || !row.endsWith('|')) return [];
  const content = row.substring(1, row.length - 1); 
  return content.split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, '|').trim());
}

/**
 * @private
 * Adjusts a row (array of cells) to a target number of columns.
 * Pads with empty strings if shorter, truncates if longer.
 * @param {string[]} cells - Array of cell contents.
 * @param {number} targetColumnCount - The desired number of columns.
 * @returns {string[]} The adjusted array of cell contents.
 */
function _adjustRowToColumnCountInternal(cells, targetColumnCount) {
    const currentLength = cells.length;
    if (currentLength === targetColumnCount) return cells;
    if (currentLength < targetColumnCount) {
        return cells.concat(Array(targetColumnCount - currentLength).fill(''));
    }
    return cells.slice(0, targetColumnCount); 
}

/**
 * @private
 * Generates a Markdown table separator row string (e.g., "| --- | --- |").
 * @param {number} numColumns - The number of columns for the separator.
 * @returns {string} The Markdown table separator row. Returns empty if numColumns is zero or negative.
 */
function _generateTableSeparatorInternal(numColumns) {
    if (numColumns <= 0) return "";
    return '|' + Array(numColumns).fill(' --- ').join('|') + '|';
}

/**
 * Fixes common structural issues in Markdown tables.
 * This includes ensuring consistent column counts across rows,
 * adding missing header separators, and removing redundant separators.
 * Uses helper functions for clarity and modularity.
 * @param {string} markdown - The Markdown content potentially containing tables.
 * @returns {string} Markdown with tables structurally fixed. Returns original on error or if input is empty.
 */
function fixBrokenTables(markdown) {
  if (!markdown) return markdown; 
  try {
    let result = cleanupExcessiveDelimiters(markdown); 
    const lines = result.split('\n');
    const fixedLines = [];
    let inTable = false;
    let numColumns = 0;
    let headerProcessedForCurrentTable = false;

    for (let i = 0; i < lines.length; i++) {
      const currentLineTrimmed = lines[i].trim(); 
      const originalLine = lines[i]; 

      if (currentLineTrimmed.startsWith('|') && currentLineTrimmed.endsWith('|')) {
        const cells = splitTableRow(currentLineTrimmed); 
        
        if (!inTable) { 
          inTable = true;
          headerProcessedForCurrentTable = false;
          numColumns = cells.length;
          if (numColumns === 0 && currentLineTrimmed === "||") { 
            fixedLines.push("| |"); 
            numColumns = 1; 
          } else if (numColumns === 0) { 
              fixedLines.push(originalLine); 
              inTable = false; 
              continue;
          }
          fixedLines.push(currentLineTrimmed); 
        } else { 
          if (cells.every(cell => /^\s*-{3,}\s*$/.test(cell))) { 
            if (!headerProcessedForCurrentTable) {
              fixedLines.push(_generateTableSeparatorInternal(numColumns));
              headerProcessedForCurrentTable = true;
            }
          } else { 
            if (!headerProcessedForCurrentTable && numColumns > 0) {
              fixedLines.push(_generateTableSeparatorInternal(numColumns));
              headerProcessedForCurrentTable = true;
            }
            const adjustedCells = _adjustRowToColumnCountInternal(cells, numColumns);
            fixedLines.push('| ' + adjustedCells.join(' | ') + ' |'); 
          }
        }
      } else { 
        if (inTable) { 
          if (fixedLines.length > 0 && fixedLines[fixedLines.length - 1].trim() !== "" && originalLine.trim() !== "") {
            fixedLines.push(''); 
          }
        }
        inTable = false;
        headerProcessedForCurrentTable = false; 
        numColumns = 0;
        fixedLines.push(originalLine); 
      }
    }
    return fixedLines.join('\n');
  } catch (err) {
    console.error('Error fixing broken tables:', err);
    return markdown; 
  }
}


// --- Asset & Link Path Utilities ---

/**
 * Extracts all unique image paths (Markdown `![alt](path)` and HTML `<img src="path">`) from Markdown content.
 * @param {string} markdown - The Markdown content.
 * @returns {string[]} An array of unique image paths found. Returns empty array on error or if input is falsy.
 */
function extractImagePaths(markdown) {
  if (!markdown) return [];
  try {
    const imagePaths = new Set();
    const mdImageRegex = /!\[.*?\]\(([^)\s]+)(?:\s[^)]*)?\)/g; 
    let match;
    while ((match = mdImageRegex.exec(markdown)) !== null) imagePaths.add(match[1]);
    
    const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi; 
    while ((match = htmlImageRegex.exec(markdown)) !== null) imagePaths.add(match[1]);
    
    return Array.from(imagePaths);
  } catch (err) {
    console.error('Error extracting image paths:', err);
    return [];
  }
}

/**
 * Updates image paths in Markdown content based on a provided mapping.
 * Handles both Markdown `![alt](path)` and HTML `<img src="path">` formats.
 * @param {string} markdown - The Markdown content.
 * @param {Map<string, string>} imageMap - A map where keys are original image paths and values are new image paths.
 * @returns {string} Markdown content with updated image paths. Returns original if no map, empty map, or error.
 */
function fixImagePaths(markdown, imageMap) {
  if (!markdown || !imageMap || imageMap.size === 0) return markdown;
  try {
    let result = markdown;
    for (const [originalPath, newPath] of imageMap.entries()) {
      const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mdImageRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedPath}\\)`, 'g');
      result = result.replace(mdImageRegex, `![$1](${newPath})`);
      const htmlImageRegex = new RegExp(`<img([^>]*)src=["']${escapedPath}["']([^>]*)>`, 'gi');
      result = result.replace(htmlImageRegex, `<img$1src="${newPath}"$2>`);
    }
    return result;
  } catch (err) {
    console.error('Error fixing image paths:', err);
    return markdown;
  }
}

/**
 * Updates internal link paths in Markdown content based on a provided mapping.
 * Handles both Markdown `[text](path)` and HTML `<a href="path">` formats.
 * Excludes image Markdown `![alt](path)` from being treated as a link using negative lookbehind.
 * @param {string} markdown - The Markdown content.
 * @param {Map<string, string>} linkMap - A map where keys are original link paths and values are new link paths.
 * @returns {string} Markdown content with updated internal link paths. Returns original if no map, empty map, or error.
 */
function fixInternalLinks(markdown, linkMap) {
  if (!markdown || !linkMap || linkMap.size === 0) return markdown;
  try {
    let result = markdown;
    for (const [originalPath, newPath] of linkMap.entries()) {
      const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mdLinkRegex = new RegExp(`(?<!\\!)\\[([^\\]]*)\\]\\(${escapedPath}\\)`, 'g');
      result = result.replace(mdLinkRegex, `[$1](${newPath})`);
      const htmlLinkRegex = new RegExp(`<a([^>]*)href=["']${escapedPath}["']([^>]*)>`, 'gi');
      result = result.replace(htmlLinkRegex, `<a$1href="${newPath}"$2>`);
    }
    return result;
  } catch (err) {
    console.error('Error fixing internal links:', err);
    return markdown;
  }
}

module.exports = {
  escapeYaml,
  isEmpty,
  sanitizeFilename,
  slugify,
  cleanupMarkdown,
  fixBrokenTables,
  extractImagePaths,
  fixImagePaths,
  fixInternalLinks,
  cleanupMetadataContent,
  cleanupExcessiveDelimiters, 
  splitTableRow,
};