#!/usr/bin/env node

/**
 * Entry point for the Confluence to Markdown converter
 * Usage: node index.js inputdir outdir
 */

const path = require('path');
const fs = require('fs');
const fileSystem = require('./modules/file-system');
const converter = require('./modules/converter');

// Check for command line arguments
if (process.argv.length !== 4) {
  console.error(
    `Syntax: ${process.argv[0] || 'node'} ${
      process.argv[1] || 'index.js'
    } inputdir outdir`,
  );
  process.exit(1);
}

const [inputdir, outputdir] = process.argv.slice(2);

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
    console.log('=========================================');
    console.log('Starting conversion...');

    // Process the directory
    await converter.processDirectory(inputdir, outputdir);
    
    // Copy images and attachments
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