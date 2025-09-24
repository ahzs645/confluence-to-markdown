const path = require('path');
const fs = require('fs-extra');
const { createTurndownService } = require('./turndown');
const {
  cleanupHtml,
  extractBreadcrumbs,
  extractTitle,
  extractPageMetadata
} = require('./html');
const { cleanupMarkdown } = require('./markdown');
const {
  sanitizeForPath,
  ensureUniqueSlug,
  deriveIdentifierSlug,
  toPosix,
  stripTitlePrefix
} = require('./utils');
const { createAssetManager } = require('./assets');

function normalizeDate(rawValue) {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.replace(/\.$/, '').trim();
  if (!trimmed) {
    return null;
  }

  const attempts = [
    new Date(`${trimmed} UTC`),
    new Date(trimmed)
  ];

  for (const date of attempts) {
    if (!Number.isNaN(date.getTime())) {
      return {
        raw: trimmed,
        iso: date.toISOString().slice(0, 10)
      };
    }
  }

  return {
    raw: trimmed,
    iso: null
  };
}

function escapeYamlValue(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function buildFrontMatter(pageMetadata) {
  if (!pageMetadata) {
    return '';
  }

  const lines = [];

  if (pageMetadata.createdBy) {
    lines.push(`created_by: "${escapeYamlValue(pageMetadata.createdBy)}"`);
  }

  if (pageMetadata.lastUpdatedBy) {
    lines.push(`last_updated_by: "${escapeYamlValue(pageMetadata.lastUpdatedBy)}"`);
  }

  if (pageMetadata.lastUpdatedOnRaw) {
    const normalized = normalizeDate(pageMetadata.lastUpdatedOnRaw);
    const dateValue = normalized && (normalized.iso || normalized.raw);
    if (dateValue) {
      lines.push(`last_updated_on: "${escapeYamlValue(dateValue)}"`);
    }
  }

  if (!lines.length) {
    return '';
  }

  return `---\n${lines.join('\n')}\n---\n\n`;
}

async function convertHtmlToMarkdown(options = {}, config = {}) {
  const {
    limit = null,
    fixNH = false,
    includeNavigation = true,
    onlyFiles = null,
    titlePrefixToRemove = null,
    convertExpanders = false
  } = options;

  const {
    htmlDir,
    mdDir
  } = config;

  if (!htmlDir || !mdDir) {
    throw new Error('htmlDir and mdDir must be provided to convertHtmlToMarkdown');
  }

  const notesDir = path.join(mdDir, 'notes');
  const turndownService = createTurndownService();
  const assetManager = createAssetManager({ htmlDir });

  try {
    await fs.ensureDir(mdDir);
    await fs.remove(notesDir);
    await fs.ensureDir(notesDir);

    const mediaRoot = path.join(notesDir, '_media');
    const imagesSource = path.join(htmlDir, 'images');

    await fs.remove(mediaRoot);
    await fs.ensureDir(mediaRoot);

    assetManager.resetCaches();
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
    let htmlFiles = files.filter(file => file.endsWith('.html'));

    if (onlyFiles && onlyFiles.size) {
      const normalizedOnly = new Set();
      for (const item of onlyFiles) {
        if (typeof item === 'string' && item.trim()) {
          const value = item.trim().endsWith('.html') ? item.trim() : `${item.trim()}.html`;
          normalizedOnly.add(value);
        }
      }

      const missing = [...normalizedOnly].filter(name => !htmlFiles.includes(name));
      if (missing.length) {
        console.warn(`⚠️  Requested files not found: ${missing.join(', ')}`);
      }

      htmlFiles = htmlFiles.filter(file => normalizedOnly.has(file));
    }

    const filesToProcess = limit ? htmlFiles.slice(0, limit) : htmlFiles;

    console.log(`🔄 Converting ${filesToProcess.length} HTML files to Markdown...`);

    const metadataMap = new Map();
    const metadataByMd = new Map();
    const usedSlugs = new Set();

    for (const file of filesToProcess) {
      const htmlPath = path.join(htmlDir, file);
      const html = await fs.readFile(htmlPath, 'utf8');
      const breadcrumbs = extractBreadcrumbs(html);
      const breadcrumbSlugs = breadcrumbs.map(sanitizeForPath).filter(Boolean);
      const rawTitle = extractTitle(html);
      const strippedTitle = stripTitlePrefix(rawTitle, titlePrefixToRemove);
      const pageTitle = strippedTitle || rawTitle;
      const pageMetadata = extractPageMetadata(html);
      const preferredSlug = sanitizeForPath(pageTitle);
      const identifierSlug = deriveIdentifierSlug(file);
      const slug = ensureUniqueSlug(preferredSlug, identifierSlug, usedSlugs);
      const mdFile = `${slug}.md`;
      const originalMdFile = file.replace('.html', '.md');
      const targetDir = breadcrumbSlugs.length ? path.join(notesDir, ...breadcrumbSlugs) : notesDir;

      const meta = {
        breadcrumbs,
        breadcrumbSlugs,
        targetDir,
        mdFile,
        originalMdFile,
        slug,
        title: pageTitle,
        html,
        pageMetadata
      };

      meta.outputPath = path.join(targetDir, mdFile);

      metadataMap.set(file, meta);
      metadataByMd.set(mdFile, meta);
      if (originalMdFile !== mdFile) {
        metadataByMd.set(originalMdFile, meta);
      }
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

        const cleanedHtml = cleanupHtml(meta.html, { convertExpanders });
        let markdown = turndownService.turndown(cleanedHtml);
        markdown = cleanupMarkdown(markdown, {
          fixNH,
          includeNavigation,
          titlePrefixToRemove
        });
        markdown = await assetManager.adjustMarkdownPaths(markdown, meta, metadataByMd, mediaRoot);

        const frontMatter = buildFrontMatter(meta.pageMetadata);
        if (frontMatter) {
          markdown = `${frontMatter}${markdown}`;
        }

        await fs.writeFile(meta.outputPath, markdown);

        const relativeOutput = toPosix(path.relative(notesDir, meta.outputPath)) || path.basename(meta.outputPath);
        console.log(`✓ Converted: ${file} → ${relativeOutput}`);
        successCount += 1;
      } catch (err) {
        console.error(`✗ Error converting ${file}: ${err.message}`);
        errorCount += 1;
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

module.exports = {
  convertHtmlToMarkdown
};
