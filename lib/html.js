const { decodeEntities, stripHtmlTags } = require('./utils');

function cleanupHtml(html, options = {}) {
  const { convertExpanders = false } = options;

  let output = html;

  output = output.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  output = output.replace(/\/\*<!\[CDATA\[[\s\S]*?\]\]>\*\//g, '');
  output = output.replace(/div\.rbtoc\d+[^}]*\{[^}]*\}/g, '');

  output = output.replace(/href="([^"]*\.html)"/g, (match, url) => {
    if (url === 'index.html') {
      return 'href="index.md"';
    }
    return `href="${url.replace('.html', '.md')}"`;
  });

  output = output.replace(/\s*data-[a-z-]+=["'][^"']*["']/gi, '');
  output = output.replace(/<div[^>]*class="[^"]*confluence-information-macro[^"]*"[^>]*>/gi, '<div class="info-box">');

  if (convertExpanders) {
    const expandRegex = /<div[^>]*class="[^"]*expand-container[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*expand-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    output = output.replace(expandRegex, (match, _controlSection, contentSection) => {
      const summaryMatch = match.match(/<span[^>]*class="[^"]*expand-control-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const summaryText = summaryMatch ? decodeEntities(stripHtmlTags(summaryMatch[1])).trim() : '';
      let cleanedContent = contentSection.replace(/^\s+|\s+$/g, '');

      if (summaryText && cleanedContent.startsWith(summaryText)) {
        cleanedContent = cleanedContent.slice(summaryText.length).replace(/^\s+/, '');
      }

      let effectiveSummary = summaryText || 'Details';
      if (/^click here/i.test(effectiveSummary)) {
        effectiveSummary = 'Details';
      }

      return `<details>\n<summary>${effectiveSummary}</summary>\n${cleanedContent}\n</details>`;
    });
  } else {
    output = output.replace(/<div[^>]*class="[^"]*expand-container[^"]*"[^>]*>/gi, '<div class="expandable">');
    output = output.replace(/<div[^>]*class="[^"]*expand-control[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  }

  output = output.replace(/<p>\s*<\/p>/g, '');
  output = output.replace(/<p>\s*&nbsp;\s*<\/p>/g, '');

  return output;
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

function extractTitle(html) {
  if (!html) {
    return '';
  }

  const titleSpanMatch = html.match(/<span[^>]*id=["']title-text["'][^>]*>([\s\S]*?)<\/span>/i);
  if (titleSpanMatch) {
    const value = decodeEntities(stripHtmlTags(titleSpanMatch[1])).trim();
    if (value) {
      return value;
    }
  }

  const titleTagMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleTagMatch) {
    const value = decodeEntities(stripHtmlTags(titleTagMatch[1])).trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function extractPageMetadata(html) {
  if (!html) {
    return {};
  }

  const match = html.match(/<div[^>]*class=["']page-metadata["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!match) {
    return {};
  }

  const text = decodeEntities(stripHtmlTags(match[1])).replace(/\s+/g, ' ').trim();
  if (!text) {
    return {};
  }

  const result = {};
  const lowerText = text.toLowerCase();
  const createdPrefix = 'created by ';

  if (lowerText.startsWith(createdPrefix)) {
    let remainder = text.slice(createdPrefix.length).trim();
    const lowerRemainder = remainder.toLowerCase();
    const marker = ', last updated';
    const markerIndex = lowerRemainder.indexOf(marker);
    let updateClause = '';

    if (markerIndex !== -1) {
      result.createdBy = remainder.slice(0, markerIndex).trim();
      updateClause = remainder.slice(markerIndex + 1).trim();
    } else {
      const onIndex = lowerRemainder.indexOf(' on ');
      if (onIndex !== -1) {
        result.createdBy = remainder.slice(0, onIndex).trim();
        const createdOn = remainder.slice(onIndex + 4).replace(/\.$/, '').trim();
        if (createdOn) {
          result.createdOnRaw = createdOn;
        }
      } else {
        result.createdBy = remainder.replace(/\.$/, '').trim();
      }
    }

    if (updateClause) {
      const lowerUpdate = updateClause.toLowerCase();

      if (lowerUpdate.startsWith('last updated by ')) {
        const withoutPrefix = updateClause.slice('last updated by '.length);
        const onIndex = withoutPrefix.toLowerCase().lastIndexOf(' on ');
        if (onIndex !== -1) {
          result.lastUpdatedBy = withoutPrefix.slice(0, onIndex).trim();
          const datePortion = withoutPrefix.slice(onIndex + 4).replace(/\.$/, '').trim();
          if (datePortion) {
            result.lastUpdatedOnRaw = datePortion;
          }
        } else {
          result.lastUpdatedBy = withoutPrefix.replace(/\.$/, '').trim();
        }
      } else if (lowerUpdate.startsWith('last updated on ')) {
        const datePortion = updateClause.slice('last updated on '.length).replace(/\.$/, '').trim();
        if (datePortion) {
          result.lastUpdatedOnRaw = datePortion;
        }
      } else if (lowerUpdate.startsWith('last updated ')) {
        const onIndex = lowerUpdate.lastIndexOf(' on ');
        if (onIndex !== -1) {
          const datePortion = updateClause.slice(onIndex + 4).replace(/\.$/, '').trim();
          if (datePortion) {
            result.lastUpdatedOnRaw = datePortion;
          }
        }
      }
    }
  }

  return result;
}

module.exports = {
  cleanupHtml,
  extractBreadcrumbs,
  extractTitle,
  extractPageMetadata
};
