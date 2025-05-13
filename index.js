#!/usr/bin/env node

/**
 * Entry point for the Confluence to Markdown converter
 * Usage: node index.js inputdir outdir [--attachments <visible|hidden|xml>]
 */

const path = require('path');
const fs = require('fs');
const fileSystem = require('./modules/file-system');
const converter = require('./modules/converter');

// Default attachment option
let attachmentOption = 'visible';
let inputdir, outputdir;

// Parse command line arguments
const args = process.argv.slice(2);
const attachmentFlagIndex = args.findIndex(arg => arg === '--attachments');

if (attachmentFlagIndex !== -1) {
  if (args.length < attachmentFlagIndex + 2) {
    console.error('Error: --attachments flag requires a value (visible, hidden, or xml).');
    process.exit(1);
  }
  attachmentOption = args[attachmentFlagIndex + 1].toLowerCase();
  if (!['visible', 'hidden', 'xml'].includes(attachmentOption)) {
    console.error('Error: Invalid value for --attachments. Must be one of: visible, hidden, xml.');
    process.exit(1);
  }
  // Remove the flag and its value from args to get inputdir and outputdir
  args.splice(attachmentFlagIndex, 2);
}

if (args.length !== 2) {
  console.error(
    `Syntax: ${process.argv[0] || 'node'} ${process.argv[1] || 'index.js'} inputdir outdir [--attachments <visible|hidden|xml>]`,
  );
  process.exit(1);
}

[inputdir, outputdir] = args;

// Validate input directory
if (!fs.existsSync(inputdir)) {
  console.error(`Error: Input directory "${inputdir}" does not exist.`);
  process.exit(1);
}

// Create output directory if it doesn't exist
if (!fs.existsSync(outputdir)) {
  try {
    fs.mkdirSync(outputdir, { recursive: true });
  } catch (err) {
    console.error(`Error: Cannot create output directory "${outputdir}": ${err.message}`);
    process.exit(1);
  }
}

// Main execution
const run = async () => {
  try {
    console.log('=========================================');
    console.log('Confluence to Markdown Converter');
    console.log('=========================================');
    console.log(`Input directory: ${path.resolve(inputdir)}`);
    console.log(`Output directory: ${path.resolve(outputdir)}`);
    console.log(`Attachment option: ${attachmentOption}`);
    console.log('=========================================');
    console.log('Starting conversion...');

    // Process the directory, passing the attachment option
    await converter.processDirectory(inputdir, outputdir, attachmentOption);
    
    // Copy images and attachments
    // Note: copyAssets might need to be aware of the inputDir to correctly locate ./images/bullet_blue.gif if it's not in the root of each HTML's dir
    // For now, assuming bullet_blue.gif is handled by the existing copyImages logic or placed in the output/images by the user/script.
    await fileSystem.copyAssets(inputdir, outputdir);
    
    // Post-process markdown files to fix any remaining issues
    await converter.postProcessMarkdownFiles(outputdir);
    
    console.log('=========================================');
    console.log('Conversion complete!');
    console.log('=========================================');
  } catch (err) {
    console.error('Error during processing:', err);
    console.error(err.stack);
    process.exit(1);
  }
};

run();
