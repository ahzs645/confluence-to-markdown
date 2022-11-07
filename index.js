const fsPromises = require('fs/promises');
const { JSDOM } = require('jsdom');
const prettier = require('prettier');

if (process.argv.length !== 4) {
  console.error(
    `Syntax: ${process.argv[0] || 'node'} ${
      process.argv[1] || 'index.js'
    } inputdir outdir`,
  );
  process.exit(1);
}

const [inputdir, outputdir] = process.argv.slice(2);

const getFilepath = (node) =>
  [...(node.querySelector('#breadcrumbs')?.children || [])]?.map((node) =>
    node.textContent.trim(),
  );

const findLang = /brush: (\w+);/;

const startsWithNewline = (str) => /^\s?\n/m.test(str);
const endsWithNewline = (str) => /\n\s?$/m.test(str);
const isOnlyWhitespace = (str) => /^\s+$/m.test(str);

const denylist = ['page-metadata', 'footer', 'breadcrumb-section'];
const shouldBeDropped = (node) =>
  denylist.includes(node.className) || denylist.includes(node.id);

const htmlFileIntoMd = async (mainNode) => {
  const toMarkdownChildren = (nodes) =>
    [...nodes.childNodes].flatMap(toMarkdown).join('');
  const toMarkdown = (node) => {
    if (shouldBeDropped(node)) return [];
    switch (node.nodeName) {
      case '#text':
        //if (isOnlyWhitespace(str)) return [];
        const str = node.textContent;
        return [
          startsWithNewline(str) ? '\n' : '',
          str.trim(),
          endsWithNewline(str) ? '\n' : '',
        ];
      case 'BR':
        return ['\n'];
      case 'P':
        return ['\n', toMarkdownChildren(node), '\n'];
      case 'B':
      case 'STRONG':
        return [' **', toMarkdownChildren(node), '** '];
      case 'I':
        return [' *', toMarkdownChildren(node), '* '];
      // Todo OL should make 1. instead of -
      case 'UL':
      case 'OL':
        return ['\n', toMarkdownChildren(node), '\n'];
      case 'LI':
        return ['- ', toMarkdownChildren(node).trim(), '\n'];
      case 'A':
        return [' [', toMarkdownChildren(node), '](', node.href, ') '];
      case 'CODE':
        return [' `', toMarkdownChildren(node), '` '];
      case 'PRE':
        const [_, lang = ''] =
          findLang.exec(node.dataset.syntaxhighlighterParams) || [];
        return ['\n```', lang, '\n', toMarkdownChildren(node), '\n```\n'];
      case 'H1':
        return ['# ', toMarkdownChildren(node).trim(), '\n'];
      case 'H2':
        return ['## ', toMarkdownChildren(node).trim(), '\n'];
      case 'H3':
        return ['### ', toMarkdownChildren(node).trim()], '\n';
      case 'H4':
        return ['#### ', toMarkdownChildren(node).trim()], '\n';
      case 'H5':
        return ['##### ', toMarkdownChildren(node).trim(), '\n'];
      case 'TABLE':
        const rows = [...node.childNodes[1].childNodes];
        if (rows.length === 0) return [];
        return [
          '\n', // TODO remove
          '\n', // TODO remove
          ...toMarkdown(rows[0]),
          '|',
          ...[...rows[0].childNodes].fill('--').join('|'),
          '|',
          '\n',
          ...rows.slice(1).flatMap((row) => toMarkdown(row)),
          '\n', // TODO remove
          '\n', // TODO remove
        ];
      case 'TR':
        const cells = [...node.childNodes];
        return [
          '| ',
          cells.map((cell) => toMarkdown(cell)).join(' | '),
          ' |',
          '\n',
        ];
      case 'TH':
      case 'TD':
        return toMarkdownChildren(node).trim();
      default:
        return toMarkdownChildren(node);
    }
  };

  let result = toMarkdownChildren(mainNode);
  result = prettier.format(result, { parser: 'markdown' });

  return result;
};

const main = async () => {
  try {
    const files = await fsPromises.readdir(inputdir, { withFileTypes: true });

    const promises = files
      .filter((file) => file.name.endsWith('.html') && !file.isDirectory())
      .map(async (file) => {
        const { window } = await JSDOM.fromFile(file.name);
        const mainNode = window.document.querySelector('#main');

        const md = await htmlFileIntoMd(mainNode);
        if (!md) return;

        const filename = window.document.title.replaceAll('/', '_') + '.md';
        const filepath = getFilepath(mainNode);
        const outputdirPath = ['.', outputdir, ...filepath].join('/');

        await fsPromises.mkdir(outputdirPath, { recursive: true });
        return fsPromises.writeFile(outputdirPath + '/' + filename, md);
      });

    await Promise.all(promises);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

main();
