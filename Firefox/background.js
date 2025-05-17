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

// Constants for content processing
const CONTENT_TAGS = new Set([
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
    'article', 'section', 'main', 'div', 'span',
    'li', 'td', 'th', 'caption', 'label', 'button',
    'a', 'strong', 'em', 'b', 'i', 'u', 'mark'
]);

const MAX_TEXT_LENGTH = 500;  // Increased for better context
const MAX_NESTING_DEPTH = 3;  // Reduced to focus on main content

// Clean snapshot by removing unwanted elements and simplifying structure
function cleanSnapshot(snapshot) {
    console.log('Starting cleanSnapshot with input:', snapshot);
    
    // Handle array of nodes by creating a virtual root
    if (Array.isArray(snapshot)) {
        console.log('Converting array of nodes to tree structure');
        const virtualRoot = {
            tag: 'root',
            children: snapshot
        };
        snapshot = virtualRoot;
    }
    
    // Deep clone the snapshot to avoid modifying the original
    const clone = JSON.parse(JSON.stringify(snapshot));
    console.log('Cloned snapshot:', clone);
    
    // Remove unwanted elements and extract content
    function processNode(node) {
        if (!node || !node.tag) return null;
        
        // Skip processing for virtual root
        if (node.tag === 'root') {
            if (node.children) {
                node.children = node.children
                    .map(child => processNode(child))
                    .filter(Boolean);
            }
            return node;
        }
        
        // Check if this is a content-bearing node
        const isContentNode = CONTENT_TAGS.has(node.tag.toLowerCase());
        
        // Skip non-content nodes unless they have content-bearing children
        if (!isContentNode) {
            if (node.children) {
                const processedChildren = node.children
                    .map(child => processNode(child))
                    .filter(Boolean);
                
                // If no content-bearing children, skip this node
                if (processedChildren.length === 0) {
                    return null;
                }
                
                // If this node only has one child, return the child directly
                if (processedChildren.length === 1) {
                    return processedChildren[0];
                }
                
                node.children = processedChildren;
            } else {
                return null;
            }
        }
        
        // Process text content
        if (node.txt) {
            const text = node.txt.trim();
            if (text) {
                // Only keep text if it's a content node or has no children
                if (isContentNode || !node.children || node.children.length === 0) {
                    node.txt = text.length > MAX_TEXT_LENGTH 
                        ? text.substring(0, MAX_TEXT_LENGTH) + '...' 
                        : text;
                } else {
                    node.txt = '';
                }
            }
        }
        
        // Keep only essential attributes
        if (node.attrs) {
            const essentialAttrs = {};
            if (node.attrs.id) essentialAttrs.id = node.attrs.id;
            if (node.attrs.class) essentialAttrs.class = node.attrs.class;
            if (node.attrs.role) essentialAttrs.role = node.attrs.role;
            if (node.attrs.href) essentialAttrs.href = node.attrs.href;
            node.attrs = essentialAttrs;
        }
        
        return node;
    }
    
    const result = processNode(clone);
    console.log('Final cleaned snapshot:', result);
    return result;
}

// Create optimized snapshot of DOM structure
function createSnapshot(snapshot) {
    console.log('Starting createSnapshot with input:', snapshot);
    
    const cleanedSnapshot = cleanSnapshot(snapshot);
    console.log('Cleaned snapshot result:', cleanedSnapshot);
    
    if (!cleanedSnapshot) {
        console.log('Cleaned snapshot is null, returning null');
        return null;
    }
    
    function processNode(node, depth = 0) {
        if (!node || !node.tag) return null;
        
        // Skip processing if beyond max depth
        if (depth > MAX_NESTING_DEPTH) {
            // If we have text content, return just that
            if (node.txt) {
                return {
                    tag: 'text',
                    text: node.txt
                };
            }
            return null;
        }
        
        // Create simplified node representation
        const nodeData = {
            tag: node.tag.toLowerCase(),
            text: node.txt || '',
            children: []
        };
        
        // Add essential attributes
        if (node.attrs) {
            if (Object.keys(node.attrs).length > 0) {
                nodeData.attrs = node.attrs;
            }
        }
        
        // Process children
        if (node.children) {
            node.children.forEach(child => {
                const childData = processNode(child, depth + 1);
                if (childData) {
                    nodeData.children.push(childData);
                }
            });
        }
        
        // If no children and no text, skip this node
        if (nodeData.children.length === 0 && !nodeData.text) {
            return null;
        }
        
        return nodeData;
    }
    
    const result = processNode(cleanedSnapshot);
    console.log('Final processed snapshot:', result);
    
    // If the result is an array (from virtual root), wrap it in a proper tree structure
    if (Array.isArray(result)) {
        return {
            tag: 'content',
            children: result
        };
    }
    
    return result;
}

// Build prompt for DOM classification
function buildPrompt(snapshot) {
    if (!snapshot) {
        throw new Error('Cannot build prompt: snapshot is null or undefined');
    }

    // Validate snapshot structure
    if (!snapshot.tag || !Array.isArray(snapshot.children)) {
        console.error('Invalid snapshot structure:', snapshot);
        throw new Error('Invalid snapshot structure: must have tag and children array');
    }

    return `Given this simplified content structure, classify nodes into the functional
categories listed below and produce precise CSS selectors for each one.

Functional categories
- main-text (primary content, articles, paragraphs)
- main-table (data tables, grids)
- main-widget (interactive elements, forms, buttons)
- contextual (related content, sidebars)
- nav (navigation menus, links)
- controls (buttons, inputs, interactive elements)
- branding (logos, headers, footers)
- comments (user comments, discussions)
- utility (search, filters, tools)

Ignore categories
- ignore-ad (advertisements, sponsored content)
- ignore-tracker (analytics, tracking elements)
- ignore-decorative (icons, decorative images)
- ignore-cookie-banner (cookie notices, consent dialogs)
- ignore-popover (tooltips, popups)
- ignore-skeleton (loading states, placeholders)
- ignore-placeholder (empty containers, spacers)
- ignore-print-only (print-specific content)
- ignore-offscreen (hidden content)

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

Content structure:
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
                    console.log('Received snapshot:', msg.snapshot);
                    
                    // Validate snapshot
                    if (!msg.snapshot || typeof msg.snapshot !== 'object') {
                        console.error('Invalid snapshot received:', msg.snapshot);
                        port.postMessage({ 
                            type: 'error', 
                            error: 'Invalid DOM snapshot received from content script' 
                        });
                        return;
                    }

                    // Create optimized snapshot using the new function
                    const snapshot = createSnapshot(msg.snapshot);
                    console.log('Processed snapshot:', snapshot);
                    
                    if (!snapshot) {
                        console.error('Failed to process snapshot - result is null');
                        port.postMessage({ 
                            type: 'error', 
                            error: 'Failed to process DOM snapshot - no valid content found' 
                        });
                        return;
                    }

                    const prompt = buildPrompt(snapshot);
                    console.log('Generated prompt:', prompt);
                    
                    try {
                        const result = await fetchLLM(prompt);
                        console.log('Classification result:', result);
                        port.postMessage({ type: 'classifyDOM', result });
                    } catch (error) {
                        console.error('LLM processing error:', error);
                        port.postMessage({ 
                            type: 'error', 
                            error: `LLM processing failed: ${error.message}` 
                        });
                    }
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

