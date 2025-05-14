// modules/utilities.js - COMPREHENSIVE FIX
/**
 * Utility functions for the converter
 * Completely overhauled for better handling of all markdown elements
 */

/**
 * Enhanced cleanupMarkdown function with specific patterns for Confluence document structure
 * @param {string} markdown Markdown content to clean up
 * @returns {string} Cleaned markdown content
 */
function cleanupMarkdown(markdown) {
  if (!markdown) return '';
  
  try {
    let result = markdown;
    
    // FIRST PASS: FIX SPECIFIC PATTERNS FOR QUESTION HEADINGS
    // =====================================================
    
    // Most important pattern: Fix "## - ### Question X.Y" format
    result = result.replace(/^## - ### /gm, '- ### ');
    
    // Also fix "# - ### Question X.Y" format
    result = result.replace(/^# - ### /gm, '- ### ');
    
    // Fix any heading with dash prefix that should be a list item
    result = result.replace(/^#{1,6} - /gm, '- ');
    
    // SECOND PASS: FIX HEADING PATTERNS
    // ===============================
    
    // Use multiple iterations to ensure nested patterns are handled
    for (let i = 0; i < 3; i++) {
      // Fix "# # Heading" pattern (double hashtags with space between)
      result = result.replace(/^# # ([^\n]+)$/gm, '## $1');
      
      // Fix "# ## Heading" pattern 
      result = result.replace(/^# ## ([^\n]+)$/gm, '## $1');
      
      // Fix "## # Heading" pattern
      result = result.replace(/^## # ([^\n]+)$/gm, '## $1');
      
      // Normalize any other combinations of hashtags
      result = result.replace(/^(#+)\s+(#+)\s+/gm, '$1 ');
    }
    
    // THIRD PASS: OTHER SPECIALIZED CLEANUP
    // =====================================
    
    // Remove heading IDs from Confluence
    result = result.replace(/\s+{#.*?}$/gm, '');
    
    // Fix "# Title" to "## Title" for main sections (A-Z first letter)
    result = result.replace(/^# ([A-Z][^#\n]+?)$/gm, '## $1');
    
    // Fix multi-bullet list items that got broken during conversion
    result = result.replace(/^- - /gm, '  - ');
    
    // Clean up unnecessary markers in lists
    result = result.replace(/^- # /gm, '- ');
    
    // Normalize all other heading levels (H3+)
    result = result.replace(/^(#{3,})\s+/gm, '### ');
    
    // FOURTH PASS: STANDARD CLEANUP
    // ===========================
    
    // Fix line endings
    result = result.replace(/\r\n/g, '\n');
    
    // Remove excessive empty lines but preserve content
    result = result.replace(/\n{4,}/g, '\n\n\n');
    
    // Fix double empty lines at the beginning of a code block
    result = result.replace(/```([^`\n]*)\n\n/g, '```$1\n');
    
    // Fix double dashes in headings (sometimes appears in processed content)
    result = result.replace(/^(#+) --/gm, '$1');
    
    // Fix 0 placeholders (used in layout)
    result = result.replace(/^0+$/gm, '');
    
    // Fix escaped double quotes in frontmatter
    result = result.replace(/title: "([^"]*)"/g, (match, title) => {
      return `title: "${title.replace(/\\"/g, '"')}"`;
    });
    
    // Fix spaces after heading markers
    result = result.replace(/^(#+)([^\s])/gm, '$1 $2');
    
    // Fix improper line breaks in lists
    result = result.replace(/^(\s*[-*+].*)\n\n(?=\s*[-*+])/gm, '$1\n');
    
    // Fix missing line breaks after paragraphs
    result = result.replace(/([^\n])(\n#{1,6} )/g, '$1\n\n$2');
    
    // Fix consecutive blockquotes
    result = result.replace(/(>.*\n)\n(?=>)/g, '$1');
    
    // Fix space between detail tags
    result = result.replace(/<\/details>\s*<details>/g, '</details>\n\n<details>');
    
    // Fix admonition/blockquote formatting
    result = result.replace(/>\s*\n>\s*\n/g, '>\n>\n');
    
    // Normalize relative image paths
    result = result.replace(/\(\.\/images\//g, '(images/');
    
    // Remove empty HTML tags
    result = result.replace(/<([a-z]+)>\s*<\/\1>/g, '');
    
    // Fix blank table cells
    result = result.replace(/\|\s*\|/g, '| |');
    
    // Fix broken horizontal rules (ensure at least 3 dashes)
    result = result.replace(/^-{1,2}$/gm, '---');
    
    // Remove duplicate horizontal rules
    result = result.replace(/(\n---\n)\n---\n/g, '$1');
    
    // Fix broken links that have markdown inside square brackets
    result = result.replace(/\[([^\]]*\[[^\]]*\][^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
      // If the link text contains markdown links, just use the raw text
      if (text.includes('[') && text.includes(']')) {
        return text;
      }
      return match;
    });
    
    // Fix HTML entities
    result = result.replace(/&nbsp;/g, ' ');
    result = result.replace(/&amp;/g, '&');
    result = result.replace(/&lt;/g, '<');
    result = result.replace(/&gt;/g, '>');
    
    // Fix list item formatting
    result = result.replace(/^(\s*[-*+])\s*$/gm, '$1 ');
    
    // FINAL CLEANUP PASS - catch any remaining issues
    // =============================================
    
    // Final check for any remaining patterns that might have been missed
    result = result.replace(/^# # /gm, '## ');
    result = result.replace(/^## - ### /gm, '- ### ');
    
    return result;
  } catch (err) {
    console.error('Error cleaning up markdown:', err);
    return markdown;
  }
}

function specializedMarkdownCleanup(markdown) {
  if (!markdown) return '';
  
  try {
    let result = markdown;
    
    // Apply fixes in a specific order for optimal results
    const patterns = [
      // 1. Remove heading IDs from Confluence
      [/\s+{#.*?}$/gm, ''],
      
      // 2. Fix duplicate hashtags in headings (e.g. "# # Heading")
      [/^(#+)\s+#+\s+/gm, '$1 '],
      
      // 3. Convert main section headings to level 2
      [/^# ([A-Z][^#\n]+?)$/gm, '## $1'],
      
      // 4. Fix "# - ### Question X.Y" patterns to list items with headings
      [/^# - ### (.*?)$/gm, '- ### $1'],
      
      // 5. Fix multi-bullet list items that got broken during conversion
      [/^- - /gm, '  - '],
      
      // 6. Clean up unnecessary markers in lists
      [/^- # /gm, '- '],
      
      // 7. Normalize all other heading levels (H3+)
      [/^(#{3,})\s+/gm, '### ']
    ];
    
    // Apply each pattern in sequence
    for (const [pattern, replacement] of patterns) {
      result = result.replace(pattern, replacement);
    }
    
    return result;
  } catch (err) {
    console.error('Error in specializedMarkdownCleanup:', err);
    return markdown;
  }
}

/**
 * Fix table structure issues
 * @param {string} markdown Markdown content
 * @returns {string} Fixed markdown
 */
function fixBrokenTables(markdown) {
  if (!markdown) return '';
  
  try {
    // Split the content into lines for processing
    const lines = markdown.split('\n');
    const fixedLines = [];
    
    // Track if we're in a table
    let inTable = false;
    let tableStartLine = -1;
    let tableHeader = '';
    let hasTableHeaderRow = false;
    let numColumns = 0;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i];
      
      // Check if this line starts a table
      if (!inTable && currentLine.trim().startsWith('|') && currentLine.trim().endsWith('|')) {
        inTable = true;
        tableStartLine = i;
        tableHeader = currentLine;
        numColumns = (currentLine.match(/\|/g) || []).length - 1;
        fixedLines.push(currentLine);
        
        // Check if the next line is a separator
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          if (nextLine.includes('---') && nextLine.includes('|')) {
            // Next line is a separator, use it
            hasTableHeaderRow = true;
            i++;
            fixedLines.push(nextLine);
          } else {
            // Next line is not a separator, generate one
            hasTableHeaderRow = true;
            let separator = '|';
            for (let j = 0; j < numColumns; j++) {
              separator += ' --- |';
            }
            fixedLines.push(separator);
          }
        } else {
          // If we're at the end of the file, add a separator
          hasTableHeaderRow = true;
          let separator = '|';
          for (let j = 0; j < numColumns; j++) {
            separator += ' --- |';
          }
          fixedLines.push(separator);
        }
      }
      // Check if we're in a table and this line continues it
      else if (inTable && currentLine.trim().startsWith('|') && currentLine.trim().endsWith('|')) {
        // Ensure the line has the correct number of columns
        const columnCount = (currentLine.match(/\|/g) || []).length - 1;
        
        if (columnCount === numColumns) {
          // Line has correct number of columns
          fixedLines.push(currentLine);
        } else if (columnCount < numColumns) {
          // Line has too few columns, add empty ones
          let fixedLine = currentLine;
          for (let j = columnCount; j < numColumns; j++) {
            if (fixedLine.endsWith('|')) {
              fixedLine += ' |';
            } else {
              fixedLine += ' | |';
            }
          }
          fixedLines.push(fixedLine);
        } else {
          // Line has too many columns, truncate
          let parts = currentLine.split('|');
          let fixedLine = parts.slice(0, numColumns + 2).join('|');
          fixedLines.push(fixedLine);
        }
      }
      // Check if we're exiting a table
      else if (inTable && (!currentLine.trim().startsWith('|') || !currentLine.trim().endsWith('|'))) {
        inTable = false;
        tableHeader = '';
        hasTableHeaderRow = false;
        numColumns = 0;
        
        // Add an empty line after the table if there isn't one already
        if (currentLine.trim() !== '') {
          fixedLines.push('');
        }
        
        fixedLines.push(currentLine);
      }
      // Not in a table, just add the line
      else {
        fixedLines.push(currentLine);
      }
    }
    
    return fixedLines.join('\n');
  } catch (err) {
    console.error('Error fixing broken tables:', err);
    // If there's an error, return the original markdown unchanged
    return markdown;
  }
}

/**
 * Escape special characters in YAML
 * @param {string} text Text to escape
 * @returns {string} Escaped text
 */
function escapeYaml(text) {
  if (!text) return '';
  
  try {
    return text
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/[:\[\]{}|>&#@`%]/g, match => `\\${match}`); // Escape YAML special chars
  } catch (err) {
    console.error('Error escaping YAML:', err);
    return text;
  }
}

/**
 * Check if a string is empty or contains only whitespace
 * @param {string} str String to check
 * @returns {boolean} Whether the string is empty
 */
function isEmpty(str) {
  return !str || /^\s*$/.test(str);
}

/**
 * Sanitize a filename
 * @param {string} filename Filename to sanitize
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename) return '';
  
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-') // Replace illegal characters
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Replace multiple dashes with a single dash
    .trim();
}

/**
 * Generate a slug from text
 * @param {string} text Text to convert to a slug
 * @returns {string} URL-friendly slug
 */
function slugify(text) {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Replace multiple dashes with a single dash
    .trim()
    .replace(/^-+|-+$/g, ''); // Trim dashes from start and end
}

/**
 * Extract all images referenced in markdown
 * @param {string} markdown Markdown content
 * @returns {string[]} Array of image paths
 */
function extractImagePaths(markdown) {
  if (!markdown) return [];
  
  try {
    const imagePaths = new Set();
    
    // Match Markdown image syntax: ![alt](src)
    const mdImageRegex = /!\[.*?\]\(([^)]+)\)/g;
    let match;
    while ((match = mdImageRegex.exec(markdown)) !== null) {
      if (match[1]) {
        imagePaths.add(match[1]);
      }
    }
    
    // Match HTML image tags: <img src="...">
    const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
    while ((match = htmlImageRegex.exec(markdown)) !== null) {
      if (match[1]) {
        imagePaths.add(match[1]);
      }
    }
    
    return Array.from(imagePaths);
  } catch (err) {
    console.error('Error extracting image paths:', err);
    return [];
  }
}

/**
 * Fix image paths in markdown
 * @param {string} markdown Markdown content
 * @param {Map<string, string>} imageMap Map of original to new image paths
 * @returns {string} Updated markdown
 */
function fixImagePaths(markdown, imageMap) {
  if (!markdown || !imageMap) return markdown;
  
  try {
    let result = markdown;
    
    for (const [originalPath, newPath] of imageMap.entries()) {
      // Escape special characters for regex
      const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace in markdown image format
      const mdImageRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedPath}\\)`, 'g');
      result = result.replace(mdImageRegex, `![$1](${newPath})`);
      
      // Replace in HTML image tags
      const htmlImageRegex = new RegExp(`<img([^>]*)src=["']${escapedPath}["']([^>]*)>`, 'g');
      result = result.replace(htmlImageRegex, `<img$1src="${newPath}"$2>`);
    }
    
    return result;
  } catch (err) {
    console.error('Error fixing image paths:', err);
    return markdown;
  }
}

/**
 * Fix internal links in markdown
 * @param {string} markdown Markdown content
 * @param {Map<string, string>} linkMap Map of original to new link paths
 * @returns {string} Updated markdown
 */
function fixInternalLinks(markdown, linkMap) {
  if (!markdown || !linkMap) return markdown;
  
  try {
    let result = markdown;
    
    for (const [originalPath, newPath] of linkMap.entries()) {
      // Escape special characters for regex
      const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace in markdown link format
      const mdLinkRegex = new RegExp(`\\[([^\\]]*)\\]\\(${escapedPath}\\)`, 'g');
      result = result.replace(mdLinkRegex, `[$1](${newPath})`);
      
      // Replace in HTML a tags
      const htmlLinkRegex = new RegExp(`<a([^>]*)href=["']${escapedPath}["']([^>]*)>`, 'g');
      result = result.replace(htmlLinkRegex, `<a$1href="${newPath}"$2>`);
    }
    
    return result;
  } catch (err) {
    console.error('Error fixing internal links:', err);
    return markdown;
  }
}

module.exports = {
  cleanupMarkdown,
  fixBrokenTables,
  escapeYaml,
  isEmpty,
  sanitizeFilename,
  slugify,
  extractImagePaths,
  fixImagePaths,
  fixInternalLinks
};