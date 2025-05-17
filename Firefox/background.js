let port = null;
let latestResult = null;

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
    return `Given this DOM tree from a webpage, analyze the structure and identify:
1. Primary content sections (articles, main content areas)
2. Navigation elements
3. Interactive controls
4. Important metadata

Return CSS selectors that precisely capture these elements, avoiding overly broad matches.
For each selector, specify:
- name: A descriptive label
- css: The CSS selector
- maxItems: Maximum number of items to extract (to prevent runaway matches)

Current DOM tree (simplified):
${JSON.stringify(snapshot, null, 2)}

Respond with a JSON object containing:
{
  "selectors": [
    {"name": "string", "css": "string", "maxItems": number},
    ...
  ],
  "groups": {
    "Page": ["selector_name1", "selector_name2", ...]
  }
}`;
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
browser.runtime.onMessage.addListener(async (msg, sender) => {
    console.log('Received message:', msg.type, 'from:', sender);
    try {
        if (msg.type === 'pingLLM') {
            console.log('Testing LLM connection...');
            // For the test connection, use a simpler API call without json_object format
            const { apiKey } = await browser.storage.local.get('apiKey');
            console.log('Test connection - API key:', apiKey ? 'Present' : 'Missing');
            if (!apiKey) throw new Error('API key not set');

            console.log('Making test API request...');
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

            console.log('Test API response status:', resp.status);
            if (!resp.ok) {
                const error = await resp.text();
                console.error('Test API error response:', error);
                throw new Error(`API error: ${error}`);
            }

            const data = await resp.json();
            console.log('Test API response data:', data);
            const content = data.choices[0].message.content.toLowerCase().trim();
            const result = content === 'ok' || content === 'ok.';
            console.log('Test connection result:', result, 'content:', content);
            return result;
        }
        
        if (msg.type === 'classifyDOM') {
            console.log('Classifying DOM...');
            const prompt = buildPrompt(msg.snapshot);
            const result = await fetchLLM(prompt);
            console.log('Classification result:', result);
            return result;
        }

        if (msg.type === 'openViewer') {
            console.log('Opening viewer with data:', msg.data);
            // Store the latest result
            latestResult = msg.data;
            
            // Open the viewer in a new tab
            const viewerUrl = browser.runtime.getURL('ui/viewer.html');
            await browser.tabs.create({ url: viewerUrl });
            return true;
        }

        if (msg.type === 'getLatest') {
            console.log('Getting latest result:', latestResult);
            return latestResult;
        }
    } catch (e) {
        console.error('Error in message handler:', e);
        return null;
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
