const fs = require('fs-extra');
const fsNative = require('fs');
const path = require('path');
const TurndownService = require('turndown');
const gfm = require('@guyplusplus/turndown-plugin-gfm').gfm;

// Initialize turndown service with GFM support
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined'
});

// Add GFM (GitHub Flavored Markdown) support
gfm(turndownService);

function sanitizeAssetPath(rawPath) {
  if (!rawPath) {
    return '';
  }

  const entitiesHandled = rawPath.replace(/&amp;/g, '&');
  const fragmentSplit = entitiesHandled.split('#')[0];
  const querySplit = fragmentSplit.split('?')[0];
  const slashNormalized = querySplit.replace(/\\/g, '/').replace(/\/{2,}/g, '/').trim();

  if (!slashNormalized) {
    return '';
  }

  try {
    return decodeURIComponent(slashNormalized);
  } catch (error) {
    return slashNormalized;
  }
}

// Add custom rules for Confluence-specific elements
turndownService.addRule('confluenceEmoticon', {
  filter: function (node) {
    return node.nodeName === 'IMG' && node.className && node.className.includes('emoticon');
  },
  replacement: function (content, node) {
    const shortname = node.getAttribute('data-emoji-shortname');
    const fallback = node.getAttribute('data-emoji-fallback');
    return shortname || fallback || node.getAttribute('alt') || '';
  }
});

// Remove CSS/CDATA blocks
turndownService.addRule('removeCSSBlocks', {
  filter: function (node) {
    return node.nodeName === 'STYLE' ||
           (node.nodeName === '#comment' && node.textContent.includes('CDATA'));
  },
  replacement: function () {
    return '';
  }
});

// Remove confluence-specific macro containers that add noise
turndownService.addRule('removeConfluenceMacros', {
  filter: function (node) {
    return node.className && (
      node.className.includes('toc-macro') ||
      node.className.includes('confluence-information-macro') ||
      node.className.includes('expand-container') ||
      node.className.includes('expand-control') ||
      node.className.includes('aui-button')
    );
  },
  replacement: function (content) {
    // Keep the content but remove the wrapper
    return content;
  }
});

// Clean up user links and make them simple text
turndownService.addRule('cleanUserLinks', {
  filter: function (node) {
    return node.nodeName === 'A' && node.className && node.className.includes('confluence-userlink');
  },
  replacement: function (content) {
    return content; // Just return the text content, remove the link
  }
});

// Convert attachment image paths to relative paths
turndownService.addRule('fixAttachmentPaths', {
  filter: function (node) {
    return node.nodeName === 'IMG' && node.getAttribute('src') &&
           node.getAttribute('src').startsWith('attachments/');
  },
  replacement: function (content, node) {
    const src = node.getAttribute('src');
    const alt = node.getAttribute('alt') || '';
    const sanitizedSrc = sanitizeAssetPath(src);
    return `![${alt}](${sanitizedSrc || src})`;
  }
});

// Directories
const htmlDir = '/Users/ahzs645/Downloads/CIH';
const mdDir = '/Users/ahzs645/Downloads/CIH-markdown';
const notesDir = path.join(mdDir, 'notes');
const missingAssets = new Set();
const assetExtensionCache = new Map();
const attachmentSourceCache = new Map();

function detectExtensionFromSignature(buffer, bytesRead) {
  if (!bytesRead) {
    return null;
  }

  const slice = buffer.subarray(0, bytesRead);

  const startsWith = (signature) => {
    if (slice.length < signature.length) {
      return false;
    }
    for (let i = 0; i < signature.length; i += 1) {
      if (slice[i] !== signature[i]) {
        return false;
      }
    }
    return true;
  };

  const ascii = (start, end) => slice.toString('ascii', start, end);

  if (startsWith([0xff, 0xd8, 0xff])) {
    return '.jpg';
  }
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return '.png';
  }
  const header6 = ascii(0, Math.min(6, slice.length));
  if (header6 === 'GIF87a' || header6 === 'GIF89a') {
    return '.gif';
  }
  if (startsWith([0x42, 0x4d])) {
    return '.bmp';
  }
  if (startsWith([0x25, 0x50, 0x44, 0x46])) {
    return '.pdf';
  }
  if (startsWith([0x49, 0x49, 0x2a, 0x00]) || startsWith([0x4d, 0x4d, 0x00, 0x2a])) {
    return '.tif';
  }
  if (startsWith([0x1f, 0x8b, 0x08])) {
    return '.gz';
  }
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    const asciiChunk = slice.toString('ascii', 0, bytesRead);
    if (asciiChunk.includes('[Content_Types].xml')) {
      if (asciiChunk.includes('word/')) {
        return '.docx';
      }
      if (asciiChunk.includes('ppt/')) {
        return '.pptx';
      }
      if (asciiChunk.includes('xl/')) {
        return '.xlsx';
      }
    }
    return '.zip';
  }
  if (slice.length >= 8 && ascii(0, 4) === 'RIFF') {
    const riffType = ascii(8, 12);
    if (riffType === 'WEBP') {
      return '.webp';
    }
    if (riffType === 'WAVE') {
      return '.wav';
    }
    if (riffType === 'AVI ') {
      return '.avi';
    }
  }
  if (slice.length >= 12 && ascii(4, 8) === 'ftyp') {
    return '.mp4';
  }
  if (ascii(0, Math.min(5, slice.length)).trim().startsWith('<?xml')) {
    return '.xml';
  }
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0])) {
    const asciiChunk = slice.toString('ascii', 0, bytesRead);
    if (asciiChunk.includes('WordDocument')) {
      return '.doc';
    }
    if (asciiChunk.includes('Workbook')) {
      return '.xls';
    }
    if (asciiChunk.includes('PowerPoint')) {
      return '.ppt';
    }
    return '.doc';
  }
  if (startsWith([0x4f, 0x67, 0x67, 0x53])) {
    return '.ogg';
  }
  if (ascii(0, Math.min(4, slice.length)) === 'fLaC') {
    return '.flac';
  }

  return null;
}

function detectExtensionSync(sourcePath) {
  try {
    const fd = fsNative.openSync(sourcePath, 'r');
    try {
      const buffer = Buffer.alloc(512);
      const bytesRead = fsNative.readSync(fd, buffer, 0, buffer.length, 0);
      return detectExtensionFromSignature(buffer, bytesRead);
    } finally {
      fsNative.closeSync(fd);
    }
  } catch (error) {
    return null;
  }
}

/**
 * Clean up HTML content before conversion
 */
function cleanupHtml(html) {
  // Remove CSS blocks that contain CDATA
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove CDATA comments
  html = html.replace(/\/\*<!\[CDATA\[[\s\S]*?\]\]>\*\//g, '');

  // Remove other CSS artifacts
  html = html.replace(/div\.rbtoc\d+[^}]*\{[^}]*\}/g, '');

  // Convert breadcrumb links from .html to .md
  html = html.replace(/href="([^"]*\.html)"/g, (match, url) => {
    if (url === 'index.html') {
      return 'href="index.md"';
    }
    return `href="${url.replace('.html', '.md')}"`;
  });

  // Remove Confluence-specific data attributes that add noise
  html = html.replace(/\s*data-[a-z-]+=["'][^"']*["']/gi, '');

  // Clean up confluence macro containers
  html = html.replace(/<div[^>]*class="[^"]*confluence-information-macro[^"]*"[^>]*>/gi, '<div class="info-box">');
  html = html.replace(/<div[^>]*class="[^"]*expand-container[^"]*"[^>]*>/gi, '<div class="expandable">');

  // Remove empty paragraphs and line breaks that create formatting issues
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*&nbsp;\s*<\/p>/g, '');

  return html;
}


function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function stripHtmlTags(str) {
  return str ? str.replace(/<[^>]+>/g, '') : '';
}

function extractBreadcrumbs(html) {
  const match = html.match(/<ol[^>]*id="breadcrumbs"[^>]*>([\s\S]*?)<\/ol>/i);
  if (!match) {
    return [];
  }
  const list = match[1];
  const results = [];
  const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(list)) !== null) {
    const textValue = decodeEntities(stripHtmlTags(linkMatch[1])).trim();
    if (textValue) {
      results.push(textValue);
    }
  }
  return results;
}

function sanitizeForPath(name) {
  if (!name) {
    return null;
  }
  const normalized = decodeEntities(stripHtmlTags(name)).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const replaced = normalized.replace(/&/g, 'and');
  let slug = replaced
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) {
    slug = 'section';
  }
  return slug;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function adjustMarkdownPaths(markdown, currentMeta, metadataByMd, mediaRoot) {
  const currentDir = currentMeta.targetDir;
  const assetRegex = /(!?\[[^\]]*\]\()((?:\.\.\/)*)(attachments|images)\/([^\)]+)\)/g;
  const attachmentCopies = new Map();

  const ensureRelative = (targetPath) => {
    let relativePath = toPosix(path.relative(currentDir, targetPath));
    if (!relativePath.startsWith('.')) {
      relativePath = `./${relativePath}`;
    }
    return relativePath;
  };

  let output = markdown.replace(assetRegex, (match, prefix, _up, folder, rest) => {
    const normalizedRest = sanitizeAssetPath(rest);

    if (!normalizedRest) {
      return match;
    }

    const safeRest = path.posix.normalize(normalizedRest);
    if (safeRest === '..' || safeRest.startsWith('../')) {
      return match;
    }

    if (folder === 'images') {
      const sharedPath = path.join(mediaRoot, 'images', safeRest);
      if (!fs.existsSync(sharedPath)) {
        const missingKey = `${currentMeta.mdFile}:${folder}/${safeRest}`;
        if (!missingAssets.has(missingKey)) {
          missingAssets.add(missingKey);
          console.warn(`⚠️  Missing asset for ${currentMeta.mdFile}: ${folder}/${safeRest}`);
        }
      }
      const relativePath = ensureRelative(path.join(mediaRoot, 'images', safeRest));
      return `${prefix}${relativePath})`;
    }

    if (folder === 'attachments') {
      const sourceRel = `${folder}/${safeRest}`;
      let finalRest = safeRest;

      const parsed = path.posix.parse(safeRest);
      if (!parsed.ext) {
        let detectedExt = assetExtensionCache.get(sourceRel);
        if (detectedExt === undefined) {
          const sourcePath = path.join(htmlDir, sourceRel);
          detectedExt = detectExtensionSync(sourcePath) || '';
          assetExtensionCache.set(sourceRel, detectedExt);
        }

        if (detectedExt) {
          const suffix = detectedExt.startsWith('.') ? detectedExt : `.${detectedExt}`;
          const dirPrefix = parsed.dir ? `${parsed.dir}/` : '';
          finalRest = `${dirPrefix}${parsed.name}${suffix}`;
        }
      }

      const destPath = path.join(currentDir, '_media', folder, finalRest);
      attachmentCopies.set(destPath, sourceRel);
      const relativePath = ensureRelative(destPath);
      return `${prefix}${relativePath})`;
    }

    return match;
  });

  for (const [destPath, sourceRel] of attachmentCopies.entries()) {
    const sourcePath = path.join(htmlDir, sourceRel);
    try {
      await fs.ensureDir(path.dirname(destPath));
      await fs.copy(sourcePath, destPath);
    } catch (err) {
      const missingKey = `${currentMeta.mdFile}:${sourceRel}`;
      if (err.code === 'ENOENT') {
        let resolvedSource = attachmentSourceCache.get(sourceRel);
        if (resolvedSource === undefined) {
          resolvedSource = await resolveAttachmentSource(sourceRel);
          attachmentSourceCache.set(sourceRel, resolvedSource);
        }

        if (resolvedSource && resolvedSource !== sourcePath) {
          try {
            await fs.ensureDir(path.dirname(destPath));
            await fs.copy(resolvedSource, destPath);
            continue;
          } catch (fallbackErr) {
            console.warn(`⚠️  Unable to copy fallback asset for ${currentMeta.mdFile}: ${sourceRel} (${fallbackErr.message})`);
          }
        }
      }

      if (!missingAssets.has(missingKey)) {
        missingAssets.add(missingKey);
        console.warn(`⚠️  Missing asset for ${currentMeta.mdFile}: ${sourceRel} (${err.message})`);
      }
    }
  }

  const linkPattern = /\[([^\]]+)\]\(([^\)]+\.md)(#[^\)]+)?\)/g;
  output = output.replace(linkPattern, (match, text, linkTarget, hash = '') => {
    const trimmed = linkTarget.trim();
    if (/^(https?:|mailto:)/i.test(trimmed)) {
      return match;
    }
    if (trimmed.startsWith('#')) {
      return match;
    }
    const normalizedLink = trimmed.replace(/^\.\/?/, '').replace(/^\//, '');
    const targetName = path.basename(normalizedLink);
    const targetMeta = metadataByMd.get(targetName);
    if (!targetMeta) {
      return match;
    }
    const targetPath = targetMeta.outputPath;
    let relativePath = ensureRelative(targetPath);
    return `[${text}](${relativePath}${hash || ''})`;
  });

  return output;
}

async function resolveAttachmentSource(sourceRel) {
  const initialPath = path.join(htmlDir, sourceRel);
  if (await fs.pathExists(initialPath)) {
    return initialPath;
  }

  const parsed = path.posix.parse(sourceRel);
  const dirPosix = parsed.dir || '';
  const baseDir = path.join(htmlDir, dirPosix);
  const expectedName = parsed.name;

  if (!expectedName) {
    return null;
  }

  const extensionlessCandidate = path.join(baseDir, expectedName);
  if (await fs.pathExists(extensionlessCandidate)) {
    return extensionlessCandidate;
  }

  try {
    const entries = await fs.readdir(baseDir);
    for (const entry of entries) {
      if (entry === parsed.base) {
        continue;
      }

      const entryParsed = path.parse(entry);
      if (entryParsed.name === expectedName) {
        const candidate = path.join(baseDir, entry);
        if (await fs.pathExists(candidate)) {
          return candidate;
        }
      }
    }
  } catch (dirError) {
    return null;
  }

  return null;
}



function fixMarkdownTables(markdown) {
  const lines = markdown.split('\n');
  const fixed = [];
  let i = 0;
  const dividerPattern = /^[\s\|\-:]+$/;

  const cleanCell = (cell) => cell
    .replace(/\u00a0/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

  const formatRow = (cells) => `| ${cells.join(' | ')} |`;

  while (i < lines.length) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (
      line && line.trim().startsWith('|') &&
      nextLine && nextLine.trim().startsWith('|') &&
      dividerPattern.test(nextLine)
    ) {
      const columnCount = Math.max(0, nextLine.split('|').length - 2);
      if (columnCount === 0) {
        fixed.push(line);
        i++;
        continue;
      }

      const headerCells = line.split('|').slice(1, -1).map(cleanCell);
      fixed.push(formatRow(headerCells.map(cell => (cell.length ? cell : ''))));

      const dividerCells = nextLine.split('|').slice(1, -1).map(cell => {
        const trimmed = cell.trim();
        if (!trimmed) {
          return '---';
        }
        const leftAlign = trimmed.startsWith(':');
        const rightAlign = trimmed.endsWith(':');
        const dashCount = trimmed.replace(/[^-]/g, '').length;
        const dashes = '-'.repeat(Math.max(dashCount, 3));
        return `${leftAlign ? ':' : ''}${dashes}${rightAlign ? ':' : ''}`;
      });
      fixed.push(formatRow(dividerCells));

      i += 2;
      let cellBuffer = [];

      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const parts = lines[i].split('|').slice(1, -1);
        for (const part of parts) {
          cellBuffer.push(part);
          if (cellBuffer.length === columnCount) {
            const cleanedCells = cellBuffer.map(cleanCell);
            if (cleanedCells.some(cell => cell.length > 0)) {
              fixed.push(formatRow(cleanedCells.map(cell => (cell.length ? cell : ''))));
            }
            cellBuffer = [];
          }
        }
        i++;
      }
      cellBuffer = [];
      continue;
    }

    fixed.push(line);
    i++;
  }

  return fixed.join('\n');
}



/**
 * Post-process markdown to clean up remaining artifacts
 */
function cleanupMarkdown(markdown, options = {}) {
  const { fixNH = false } = options;

  // Remove empty lines that create spacing issues
  markdown = markdown.replace(/\n\s*\n\s*\n/g, '\n\n');

  // Remove confluence-specific text patterns
  markdown = markdown.replace(/\*\*Click here to expand\.\.\.\*\*/g, '');
  markdown = markdown.replace(/\*\*Background colour : [A-Za-z]+\*\*/g, '');

  // Fix attachment links - keep bullet icons but clean up the format
  // Pattern: ![](images/icons/bullet_blue.gif) [filename](path) (type)
  markdown = markdown.replace(/!\[\]\(([^)]*bullet[^)]*\.gif)\)\s*\[([^\]]+)\]\(([^)]+)\)\s*\([^)]+\)/g, '![]($1) [$2]($3)');

  // Remove "Document generated by Confluence" footer
  markdown = markdown.replace(/Document generated by Confluence.*$/gm, '');
  markdown = markdown.replace(/\[Atlassian\]\(https?:\/\/www\.atlassian\.com\/?\)/g, '');

  // Drop empty comment sections left from Confluence exports
  markdown = markdown.replace(/\n## Comments:\n(?:\n?\|.*\|\n?)+/g, '\n');

  markdown = fixMarkdownTables(markdown);

  if (fixNH) {
    markdown = markdown.replace(/\\\[NH\\\]/g, '[NH]');
  }

  // Clean up breadcrumb formatting - make it a simple list
  const lines = markdown.split('\n');
  let inBreadcrumbs = false;
  const cleanedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect breadcrumb section (numbered list at the beginning)
    if (line.match(/^\d+\.\s+\[.*\]\(.*\.md\)$/)) {
      if (!inBreadcrumbs) {
        cleanedLines.push('## Navigation');
        cleanedLines.push('');
        inBreadcrumbs = true;
      }
      // Convert numbered list to bullet list for breadcrumbs
      cleanedLines.push(line.replace(/^\d+\.\s+/, '- '));
    } else if (inBreadcrumbs && line.trim() === '') {
      cleanedLines.push('');
      inBreadcrumbs = false;
    } else if (!inBreadcrumbs) {
      cleanedLines.push(line);
    }
  }

  return cleanedLines.join('\n').trim() + '\n';
}

async function convertHtmlToMarkdown({ limit = null, fixNH = false } = {}) {
  try {
    await fs.ensureDir(mdDir);
    await fs.remove(notesDir);
    await fs.ensureDir(notesDir);

    const mediaRoot = path.join(notesDir, '_media');
    const imagesSource = path.join(htmlDir, 'images');

    await fs.remove(mediaRoot);
    await fs.ensureDir(mediaRoot);

    missingAssets.clear();
    console.log('ℹ️  Attachments will be copied into per-note _media folders as they are referenced.');

    try {
      if (await fs.pathExists(imagesSource)) {
        await fs.copy(imagesSource, path.join(mediaRoot, 'images'));
      } else {
        console.log('ℹ️  No images folder found; skipping copy.');
      }
    } catch (error) {
      console.warn(`⚠️  Unable to copy images: ${error.message}`);
    }

    const files = await fs.readdir(htmlDir);
    const htmlFiles = files.filter(file => file.endsWith('.html'));
    const filesToProcess = limit ? htmlFiles.slice(0, limit) : htmlFiles;

    console.log(`🔄 Converting ${filesToProcess.length} HTML files to Markdown...`);

    const metadataMap = new Map();
    const metadataByMd = new Map();

    for (const file of filesToProcess) {
      const htmlPath = path.join(htmlDir, file);
      const html = await fs.readFile(htmlPath, 'utf8');
      const breadcrumbs = extractBreadcrumbs(html);
      const breadcrumbSlugs = breadcrumbs.map(sanitizeForPath).filter(Boolean);
      const mdFile = file.replace('.html', '.md');
      const targetDir = breadcrumbSlugs.length ? path.join(notesDir, ...breadcrumbSlugs) : notesDir;

      const meta = {
        breadcrumbs,
        breadcrumbSlugs,
        targetDir,
        mdFile,
        html
      };

      meta.outputPath = path.join(targetDir, mdFile);

      metadataMap.set(file, meta);
      metadataByMd.set(mdFile, meta);
    }

    let successCount = 0;
    let errorCount = 0;

    for (const file of filesToProcess) {
      const meta = metadataMap.get(file);
      if (!meta) {
        continue;
      }

      try {
        await fs.ensureDir(meta.targetDir);

        const cleanedHtml = cleanupHtml(meta.html);
        let markdown = turndownService.turndown(cleanedHtml);
        markdown = cleanupMarkdown(markdown, { fixNH });
        markdown = await adjustMarkdownPaths(markdown, meta, metadataByMd, mediaRoot);

        await fs.writeFile(meta.outputPath, markdown);

        const relativeOutput = toPosix(path.relative(notesDir, meta.outputPath)) || path.basename(meta.outputPath);
        console.log(`✓ Converted: ${file} → ${relativeOutput}`);
        successCount++;
      } catch (err) {
        console.error(`✗ Error converting ${file}: ${err.message}`);
        errorCount++;
      } finally {
        meta.html = null;
      }
    }

    console.log('\n🎉 Conversion complete!');
    console.log(`📊 Results: ${successCount} successful, ${errorCount} errors`);
    console.log(`📂 Markdown output: ${notesDir}`);

  } catch (error) {
    console.error('💥 Fatal error:', error);
  }
}


// Run conversion
// Usage examples:
//   node convert-html-to-md-improved.js                  // convert all files
//   node convert-html-to-md-improved.js 10               // convert first 10 files
//   node convert-html-to-md-improved.js --fix-nh         // convert all and normalize [NH]
//   node convert-html-to-md-improved.js --limit=25 --fix-nh
const args = process.argv.slice(2);
let limit = null;
let fixNH = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if (/^\d+$/.test(arg)) {
    limit = parseInt(arg, 10);
    continue;
  }

  if (arg === '--limit' && i + 1 < args.length && /^\d+$/.test(args[i + 1])) {
    limit = parseInt(args[i + 1], 10);
    i += 1;
    continue;
  }

  if (arg.startsWith('--limit=')) {
    const value = arg.split('=')[1];
    if (value && /^\d+$/.test(value)) {
      limit = parseInt(value, 10);
    }
    continue;
  }

  if (arg === '--fix-nh') {
    fixNH = true;
    continue;
  }

  console.warn(`⚠️  Ignoring unrecognized argument: ${arg}`);
}



convertHtmlToMarkdown({ limit, fixNH });
