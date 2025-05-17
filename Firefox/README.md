# LLM-Aided Page Cleaner

A Firefox WebExtension that uses an LLM to intelligently extract and clean page content. The extension works by analyzing the DOM structure, identifying important content sections, and presenting them in a clean, organized view.

## Features

- Direct LLM integration using OpenAI's API
- Clean, modern UI with theme support (Light/Dark/Sepia)
- Export options (JSON/HTML)
- Secure API key storage
- Responsive design that works on all screen sizes

## Installation

### Development Mode

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Open Firefox Developer Edition and navigate to `about:debugging`
4. Click "This Firefox" in the sidebar
5. Click "Load Temporary Add-on"
6. Select the `manifest.json` file from the extension directory

### API Key Setup

1. Open the extension options page (right-click extension icon → Options)
2. Enter your OpenAI API key
3. Click "Save" and then "Test Connection" to verify

## Usage

1. Click the extension icon in the toolbar while on any webpage
2. The extension will analyze the page content using the LLM
3. A new tab will open with the extracted content
4. Use the theme selector to change the appearance
5. Export the content as JSON or HTML using the buttons

## Development

### Project Structure

```
Firefox/
├── manifest.json          # Extension manifest
├── background.js         # Background service worker
├── content.js           # Content script for DOM interaction
├── package.json         # Project configuration
├── __tests__/          # Test files
│   └── content.test.js  # Content script tests
└── ui/                  # User interface
    ├── options.html     # API key management
    ├── options.js       # Options page logic
    ├── viewer.html      # Content viewer
    ├── viewer.css       # Viewer styles
    └── viewer.js        # Viewer logic
```

### Building

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run tests:
   ```bash
   npm test              # Unit tests
   npm run test:integration  # Integration tests
   ```

3. Start development:
   ```bash
   npm start             # Launches Firefox with the extension
   ```

4. Build for production:
   ```bash
   npm run build         # Creates a production build
   ```

### Testing

- Unit tests use Jest and jsdom
- Integration tests use Playwright
- Manual testing: Load as temporary add-on
- View logs in `about:debugging` → "Inspect"

## Security & Privacy

- API key is stored securely in browser.storage.local
- The key is never exposed to content scripts
- Host permissions are restricted to OpenAI's API
- No data is stored permanently
- Users are advised to review content before sending to the LLM

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Install dependencies and run tests
4. Make your changes
5. Submit a Pull Request

## Acknowledgments

- OpenAI for providing the GPT-4 API
- Mozilla for the WebExtension platform
- All contributors and testers
