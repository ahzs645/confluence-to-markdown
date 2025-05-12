# Confluence HTML to Markdown Converter

## Overview

This project is a Node.js-based command-line tool designed to convert HTML files exported from Confluence into Markdown format. It aims to preserve as much of the original content and structure as possible, including text formatting, tables, lists, links, images, and certain Confluence-specific macros.

## Features

- Converts Confluence HTML files or directories of HTML files to Markdown.
- Extracts page metadata (title, author, last modified date).
- Handles common HTML elements: headings, paragraphs, lists (ordered and unordered), links, images, and tables.
- Processes Confluence-specific layout elements like `contentLayout2`, `columnLayout`, `panel`, and `section` to maintain page structure.
- Converts Confluence "Panel" macros into Markdown blockquotes.
- Extracts and formats the "Page History" table.
- Attempts to clean and simplify HTML for better Markdown output.
- Provides debug logging for troubleshooting.

## Setup

1.  Ensure you have Node.js and npm (Node Package Manager) installed on your system.
2.  Download or clone the project files to a local directory.
3.  Navigate to the project directory (e.g., `confluence_converter_js`) in your terminal.
4.  Install the necessary dependencies by running:
    ```bash
    npm install
    ```

## Usage

The script can be run from the command line using Node.js.

```bash
node index.js <input_path> <output_directory>
```

**Arguments:**

-   `<input_path>`: This can be either:
    -   A path to a single HTML file.
    -   A path to a directory containing one or more HTML files. If a directory is provided, the script will attempt to convert all `.html` files within that directory.
-   `<output_directory>`: The directory where the generated Markdown files will be saved. The script will create a corresponding `.md` file for each successfully converted HTML file in this directory.

**Example (single file):**

```bash
node index.js /path/to/your/confluence_page.html /path/to/output_markdown_files/
```

**Example (directory):**

```bash
node index.js /path/to/your/confluence_export_directory/ /path/to/output_markdown_files/
```

**Output:**

-   Markdown files (`.md`) will be created in the specified `<output_directory>`.
-   Debug logs will be printed to the console. You can redirect this to a file if needed:
    ```bash
    node index.js <input_path> <output_directory> > debug_log.txt 2>&1
    ```

## Supported Confluence Elements & Macros

The converter currently has explicit or implicit support for the following:

-   **Page Metadata:** Extracts title, author, and last modification details and includes them as frontmatter and/or text at the beginning of the Markdown file.
-   **Headings (H1-H6):** Converted to Markdown headings (`#`, `##`, etc.).
-   **Paragraphs:** Converted to standard Markdown paragraphs.
-   **Lists:** Ordered (`<ol>`) and unordered (`<ul>`) lists are converted to their Markdown equivalents.
-   **Links (`<a>`):** Converted to Markdown links `[text](url)`.
-   **Images (`<img>`):** Converted to Markdown images `![alt_text](src_url "title")`. Image paths are typically kept relative; ensure the image files are accessible from the Markdown file's location or update paths as needed.
-   **Tables (`<table>`):**
    -   **Standard Data Tables:** Converted to GitHub Flavored Markdown tables.
    -   **Page History Table:** Specifically identified and formatted as a Markdown table under a "Page History" heading.
    -   **Layout Tables:** Tables used purely for layout purposes (e.g., borderless tables containing other block elements) are processed by extracting their content sequentially.
-   **Layout DIVs and Sections:** Elements like `div.contentLayout2`, `div.columnLayout`, `div.section`, `div.cell`, `div.innerCell` are traversed to extract their content, attempting to maintain the flow of information.
-   **Panel Macros:** Confluence panels (often `div.panel` or `div.confluence-information-macro`) are converted into Markdown blockquotes (`>`). The panel title, if present, is usually bolded before the blockquote content.
-   **Text Formatting:** Basic formatting like **bold** (`<strong>`, `<b>`), *italic* (`<em>`, `<i>`), and line breaks (`<br>`) are generally handled.
-   **Code Blocks:** Basic support for `pre` and `code` tags, often converting them to fenced code blocks.

## Known Limitations & Potential Future Improvements

-   **Complex Macros:** Highly complex or custom Confluence macros may not be fully supported and might be rendered as plain text or simplified. Specific handlers would need to be written for each unsupported macro.
-   **Embedded Objects/Media:** Support for embedded videos, complex diagrams (e.g., Gliffy, Draw.io), or other rich media objects might be limited.
-   **CSS Styling:** Inline styles and CSS classes are generally not translated into Markdown equivalents, as Markdown is focused on structure rather than presentation.
-   **Image/Attachment Paths:** The script assumes attachments and images are in paths relative to the HTML or a common structure. Post-conversion, paths might need adjustment based on how the Markdown and assets are hosted.
-   **Error Handling:** While basic error handling is in place, very malformed HTML could cause issues.
-   **Performance:** For extremely large HTML files or a vast number of files, performance could be a consideration.

This README provides a general guide. The converter's behavior can be further understood by examining the JavaScript modules, particularly `element-processors.js` and `content-processor.js`.
