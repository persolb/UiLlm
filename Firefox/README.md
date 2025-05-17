# Firefox Extraction Extension

This directory contains a proof-of-concept Firefox WebExtension and a native helper used to extract relevant content from web pages using an LLM.

It includes:

- `manifest.json` – extension manifest using MV3
- `background.js` – background service worker driving the extraction loop
- `content.js` – runs in the page to snapshot the DOM and apply selectors
- `viewer.html` and friends – displays the cleaned view
- `native_helper/` – minimal Python helper registered via native messaging

The implementation is intentionally lightweight but follows the architecture described in the project overview.
