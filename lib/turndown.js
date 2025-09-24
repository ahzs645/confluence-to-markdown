const TurndownService = require('turndown');
const { gfm } = require('@guyplusplus/turndown-plugin-gfm');
const { sanitizeAssetPath } = require('./utils');

function createTurndownService() {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });

  gfm(service);

  service.addRule('confluenceEmoticon', {
    filter(node) {
      return node.nodeName === 'IMG' && node.className && node.className.includes('emoticon');
    },
    replacement(content, node) {
      const shortname = node.getAttribute('data-emoji-shortname');
      const fallback = node.getAttribute('data-emoji-fallback');
      return shortname || fallback || node.getAttribute('alt') || '';
    }
  });

  service.addRule('removeCSSBlocks', {
    filter(node) {
      return node.nodeName === 'STYLE' ||
        (node.nodeName === '#comment' && node.textContent.includes('CDATA'));
    },
    replacement() {
      return '';
    }
  });

  service.addRule('removeConfluenceMacros', {
    filter(node) {
      return node.className && (
        node.className.includes('toc-macro') ||
        node.className.includes('confluence-information-macro') ||
        node.className.includes('expand-container') ||
        node.className.includes('expand-control') ||
        node.className.includes('aui-button')
      );
    },
    replacement(content) {
      return content;
    }
  });

  service.addRule('cleanUserLinks', {
    filter(node) {
      return node.nodeName === 'A' && node.className && node.className.includes('confluence-userlink');
    },
    replacement(content) {
      return content;
    }
  });

  service.addRule('fixAttachmentPaths', {
    filter(node) {
      return node.nodeName === 'IMG' && node.getAttribute('src') &&
        node.getAttribute('src').startsWith('attachments/');
    },
    replacement(content, node) {
      const src = node.getAttribute('src');
      const alt = node.getAttribute('alt') || '';
      const sanitizedSrc = sanitizeAssetPath(src);
      return `![${alt}](${sanitizedSrc || src})`;
    }
  });

  service.addRule('summary', {
    filter: 'summary',
    replacement() {
      return '';
    }
  });

  service.addRule('details', {
    filter(node) {
      return node.nodeName === 'DETAILS';
    },
    replacement(content, node) {
      let summaryText = '';
      if (typeof node.querySelector === 'function') {
        const summaryNode = node.querySelector('summary');
        if (summaryNode) {
          summaryText = summaryNode.textContent ? summaryNode.textContent.trim() : '';
        }
      }
      const summaryLine = summaryText ? `<summary>${summaryText}</summary>` : '<summary>Details</summary>';
      const body = content.replace(/^\n+|\n+$/g, '');
      return `<details>\n${summaryLine}\n${body}\n</details>`;
    }
  });

  return service;
}

module.exports = {
  createTurndownService
};
