let port = null;
let latestResult = null;
let llmPorts = new Set();  // Track active LLM ports

console.log('Background script loaded');

function connectNative() {
  if (!port) {
    port = browser.runtime.connectNative('com.myext.llmbridge');
    port.onDisconnect.addListener(() => { port = null; });
  }
  return port;
}

function sendNative(message) {
  return new Promise((resolve) => {
    const p = connectNative();
    function handler(response) {
      p.onMessage.removeListener(handler);
      resolve(response);
    }
    p.onMessage.addListener(handler);
    p.postMessage(message);
  });
}

// Build prompt for DOM classification
function buildPrompt(snapshot) {
  return `Given this simplified DOM tree, classify nodes into the functional
categories listed below and produce precise CSS selectors for each one.

Functional categories
- main-text
- main-table
- main-widget
- contextual
- nav
- controls
- branding
- comments
- utility

Ignore categories
- ignore-ad
- ignore-tracker
- ignore-decorative
- ignore-cookie-banner
- ignore-popover
- ignore-skeleton
- ignore-placeholder
- ignore-print-only
- ignore-offscreen

Return a JSON object:

{
  "selectors": [
    { "name": "<category>", "css": "<selector>", "maxItems": <integer> },
    …
  ],
  "groups": {
    "Page": [ "<category1>", "<category2>", … ]   // reading order, top-to-bottom
  }
}

Rules
1. Use the exact category names shown above.  
2. Omit any category that does not appear in the page.  
3. Selectors must cover only the intended nodes and avoid overly broad matches.  
4. Set maxItems to the expected count or a safe upper bound for each selector.  
5. Prefer stable attributes over dynamic class names when possible.

Current DOM tree (truncated):
${JSON.stringify(snapshot, null, 2)}

Respond with the JSON object only.`;
}

// Make LLM API call
async function fetchLLM(prompt) {
    console.log('Fetching LLM with prompt:', prompt);
    const { apiKey } = await browser.storage.local.get('apiKey');
    console.log('API key retrieved:', apiKey ? 'Present' : 'Missing');
    if (!apiKey) throw new Error('API key not set');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
        console.log('Making API request to OpenAI...');
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo-preview',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            }),
            signal: controller.signal
        });

        console.log('API response status:', resp.status);
        if (!resp.ok) {
            const error = await resp.text();
            console.error('API error response:', error);
            throw new Error(`API error: ${error}`);
        }

        const data = await resp.json();
        console.log('API response data:', data);
        return JSON.parse(data.choices[0].message.content);
    } catch (e) {
        console.error('Error in fetchLLM:', e);
        throw e;
    } finally {
        clearTimeout(timeoutId);
    }
}

// Message router
browser.runtime.onConnect.addListener((port) => {
    console.log('New connection:', port.name);
    if (port.name === 'llm') {
        llmPorts.add(port);
        
        port.onMessage.addListener(async (msg) => {
            console.log('Received LLM port message:', msg.type);
            try {
                if (msg.type === 'pingLLM') {
                    console.log('Testing LLM connection...');
                    const { apiKey } = await browser.storage.local.get('apiKey');
                    if (!apiKey) throw new Error('API key not set');

                    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: 'gpt-4-turbo-preview',
                            messages: [{ role: 'user', content: 'Say exactly: ok' }],
                            temperature: 0.1
                        })
                    });

                    if (!resp.ok) {
                        const error = await resp.text();
                        throw new Error(`API error: ${error}`);
                    }

                    const data = await resp.json();
                    const content = data.choices[0].message.content.toLowerCase().trim();
                    const result = content === 'ok' || content === 'ok.';
                    port.postMessage({ type: 'pingLLM', result });
                }
                
                if (msg.type === 'classifyDOM') {
                    console.log('Classifying DOM...');
                    const prompt = buildPrompt(msg.snapshot);
                    const result = await fetchLLM(prompt);
                    console.log('Classification result:', result);
                    port.postMessage({ type: 'classifyDOM', result });
                }

                if (msg.type === 'openViewer') {
                    console.log('Opening viewer with data:', msg.data);
                    latestResult = msg.data;
                    const viewerUrl = browser.runtime.getURL('ui/viewer.html');
                    await browser.tabs.create({ url: viewerUrl });
                    port.postMessage({ type: 'openViewer', success: true });
                }

                if (msg.type === 'getLatest') {
                    console.log('Getting latest result:', latestResult);
                    port.postMessage({ type: 'getLatest', result: latestResult });
                }
            } catch (e) {
                console.error('Error in LLM port handler:', e);
                port.postMessage({ type: 'error', error: e.message });
            } finally {
                // Clean up the port after handling the message
                port.disconnect();
                llmPorts.delete(port);
            }
        });

        port.onDisconnect.addListener(() => {
            console.log('LLM port disconnected');
            llmPorts.delete(port);
        });
    }
});

// Handle toolbar button click
browser.action.onClicked.addListener((tab) => {
    console.log('Toolbar button clicked for tab:', tab.id);
    browser.tabs.sendMessage(tab.id, { type: 'runCleaner' });
});

// expose result to viewer
window.getLatest = function() {
    console.log('Getting latest result');
    return latestResult;
};

console.log('Background script initialization complete');
