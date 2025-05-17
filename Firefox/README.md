# LLM Content Extractor

A Firefox WebExtension that uses an LLM to intelligently extract and restyle relevant page content. The extension works by analyzing the DOM structure, identifying important content sections, and presenting them in a clean, organized view.

## Features

- Intelligent content extraction using GPT-4
- Clean, modern UI with theme support (Light/Dark/Sepia)
- Export options (JSON/HTML)
- Native messaging integration for LLM processing
- Responsive design that works on all screen sizes

## Installation

### Development Mode

1. Clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" in the sidebar
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from the extension directory

### Native Helper Setup

1. Install Python 3.8 or later
2. Create a virtual environment:
   ```bash
   cd native_helper
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Create a `keys.py` file in the `native_helper` directory:
   ```python
   # OpenAI API key
   OPENAI_API_KEY = "your_api_key_here"  # Replace with your actual API key
   ```
   Note: This file is git-ignored for security. Never commit your actual API key.
4. Register the native messaging host:
   ```bash
   # Windows (run as administrator):
   reg add "HKCU\Software\Mozilla\NativeMessagingHosts\com.myext.llmbridge" /ve /t REG_SZ /d "C:\path\to\extension\native_helper\llmbridge.json" /f
   ```

## Usage

1. Click the extension icon in the toolbar while on any webpage
2. The extension will analyze the page content
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
├── viewer.html          # Content viewer UI
├── viewer.css           # Viewer styles
├── viewer.js            # Viewer logic
└── native_helper/       # Native messaging host
    ├── helper.py        # Python helper with LLM integration
    ├── llmbridge.json   # Native messaging manifest
    └── requirements.txt # Python dependencies
```

### Building

1. Make sure all dependencies are installed
2. Test the extension in development mode
3. Use `web-ext build` to create a production build

### Testing

- Unit tests: `npm test`
- Integration tests: `npm run test:integration`
- Manual testing: Load as temporary add-on

## Security & Privacy

- The extension only processes page content locally
- No data is stored permanently
- OpenAI API calls are made through the native helper
- API keys are stored in a git-ignored `keys.py` file
- PII is stripped before LLM processing

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Acknowledgments

- OpenAI for providing the GPT-4 API
- Mozilla for the WebExtension platform
- All contributors and testers
