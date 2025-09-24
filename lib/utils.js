const path = require('path');

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

function decodeEntities(str) {
  if (!str) {
    return '';
  }
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

function ensureUniqueSlug(preferredSlug, identifierSlug, usedSlugs) {
  const candidates = [];

  if (preferredSlug) {
    candidates.push(preferredSlug);
  }

  if (identifierSlug && identifierSlug !== preferredSlug) {
    candidates.push(identifierSlug);
  }

  if (preferredSlug && identifierSlug && !preferredSlug.endsWith(identifierSlug)) {
    candidates.push(`${preferredSlug}-${identifierSlug}`);
  }

  if (!candidates.length) {
    candidates.push('note');
  }

  for (const candidate of candidates) {
    if (!usedSlugs.has(candidate)) {
      usedSlugs.add(candidate);
      return candidate;
    }
  }

  const base = candidates[0];
  let index = 2;
  let uniqueCandidate = `${base}-${index}`;
  while (usedSlugs.has(uniqueCandidate)) {
    index += 1;
    uniqueCandidate = `${base}-${index}`;
  }
  usedSlugs.add(uniqueCandidate);
  return uniqueCandidate;
}

function deriveIdentifierSlug(fileName) {
  if (!fileName) {
    return null;
  }

  const baseName = path.basename(fileName, path.extname(fileName));
  const numericMatch = baseName.match(/(?:^|[_-])(\d{3,})$/);
  if (numericMatch && numericMatch[1]) {
    const numericSlug = sanitizeForPath(numericMatch[1]);
    if (numericSlug) {
      return numericSlug;
    }
  }

  return sanitizeForPath(baseName);
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function stripTitlePrefix(value, prefix) {
  if (!value) {
    return '';
  }

  if (!prefix) {
    return value;
  }

  const candidates = [prefix];
  const trimmedPrefix = prefix.trim();
  if (trimmedPrefix && trimmedPrefix !== prefix) {
    candidates.push(trimmedPrefix);
  }
  const collapsedPrefix = trimmedPrefix.replace(/\s+/g, ' ');
  if (collapsedPrefix && !candidates.includes(collapsedPrefix)) {
    candidates.push(collapsedPrefix);
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (value.startsWith(candidate)) {
      const remainder = value.slice(candidate.length);
      return remainder.replace(/^\s+/, '');
    }
  }

  return value;
}

module.exports = {
  sanitizeAssetPath,
  decodeEntities,
  stripHtmlTags,
  sanitizeForPath,
  ensureUniqueSlug,
  deriveIdentifierSlug,
  toPosix,
  stripTitlePrefix
};
