# CIH HTML → Markdown Converter

Scripts used to transform the Confluence HTML export into the Obsidian-ready Markdown vault.

## Files

- `convert-html-to-md-improved.js` – main converter that centralizes shared images under `notes/_media/images` and copies per-note attachments into each note's `_media/attachments` directory while fixing links and breadcrumbs.
- `package.json` – npm manifest with required dependencies and a ready-to-run `convert` script.
- `missing-assets.txt` – list of attachment paths that were referenced in the export but not found during the latest conversion run. Restore these under the source `attachments/` tree before re-running.

## Usage

1. Install dependencies:

   ```bash
   npm install
   ```

2. Update the hardcoded `htmlDir` and `mdDir` constants at the top of `convert-html-to-md-improved.js` so they point to your Confluence HTML export and desired Markdown output locations.

3. Run the converter (add `--fix-nh` or `--limit` as needed):

   ```bash
   npm run convert -- --fix-nh
   ```

4. Review `missing-assets.txt` and place any absent files back into the source `attachments/` tree, then rerun the script if required.

The converter clears the target `notes/` tree, rebuilds it using breadcrumb-based folders, rewrites image paths to the shared `_media/images` directory, and copies note-specific attachments alongside each Markdown file.
