const path = require('path');
const fs = require('fs-extra');
const fsNative = require('fs');
const { sanitizeAssetPath, toPosix } = require('./utils');

function createAssetManager({ htmlDir }) {
  const missingAssets = new Set();
  const assetExtensionCache = new Map();
  const attachmentSourceCache = new Map();

  const resetCaches = () => {
    missingAssets.clear();
    assetExtensionCache.clear();
    attachmentSourceCache.clear();
  };

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
      const relativePath = ensureRelative(targetPath);
      return `[${text}](${relativePath}${hash || ''})`;
    });

    return output;
  }

  return {
    adjustMarkdownPaths,
    resetCaches
  };
}

module.exports = {
  createAssetManager
};
