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

// Debug mode settings
const DEBUG_MODE = false;  // Toggle debug mode
const DEBUG_COLORS = {
    'main-text': 'rgba(144, 238, 144, 0.3)',    // light green
    'main-widget': 'rgba(144, 238, 144, 0.3)',  // light green
    'branding': 'rgba(255, 255, 0, 0.3)',       // yellow
    'nav': 'rgba(173, 216, 230, 0.3)',          // light blue
    'ignore': 'rgba(255, 0, 0, 0.3)'            // red
};

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

// Create debug overlay with highlighted elements
function createDebugOverlay(selectors) {
    if (!DEBUG_MODE) return;
    
    console.log('Creating debug overlay with selectors:', selectors);
    
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'uillm-debug-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483647;
    `;
    
    // Create highlight elements for each selector
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector.css);
        console.log(`Found ${elements.length} elements for selector:`, selector);
        
        elements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const highlight = document.createElement('div');
            
            // Determine color based on category
            let color = DEBUG_COLORS.ignore;
            if (selector.name.startsWith('ignore-')) {
                color = DEBUG_COLORS.ignore;
            } else if (selector.name === 'main-text' || selector.name === 'main-widget') {
                color = DEBUG_COLORS['main-text'];
            } else if (selector.name === 'branding') {
                color = DEBUG_COLORS.branding;
            } else if (selector.name === 'nav') {
                color = DEBUG_COLORS.nav;
            }
            
            highlight.style.cssText = `
                position: absolute;
                top: ${rect.top + window.scrollY}px;
                left: ${rect.left + window.scrollX}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background-color: ${color};
                border: 1px solid ${color.replace('0.3', '0.8')};
                pointer-events: none;
                z-index: 2147483646;
            `;
            
            // Add tooltip with category and selector
            highlight.title = `${selector.name}\n${selector.css}`;
            
            overlay.appendChild(highlight);
        });
    });
    
    // Add legend
    const legend = document.createElement('div');
    legend.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        padding: 10px;
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 2147483647;
    `;
    
    Object.entries(DEBUG_COLORS).forEach(([category, color]) => {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            align-items: center;
            margin: 5px 0;
        `;
        
        const swatch = document.createElement('div');
        swatch.style.cssText = `
            width: 15px;
            height: 15px;
            background-color: ${color};
            border: 1px solid ${color.replace('0.3', '0.8')};
            margin-right: 8px;
        `;
        
        const label = document.createElement('span');
        label.textContent = category;
        
        item.appendChild(swatch);
        item.appendChild(label);
        legend.appendChild(item);
    });
    
    overlay.appendChild(legend);
    document.body.appendChild(overlay);
    
    // Update positions on scroll and resize
    let updateTimeout;
    function updatePositions() {
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            overlay.remove();
            createDebugOverlay(selectors);
        }, 100);
    }
    
    window.addEventListener('scroll', updatePositions);
    window.addEventListener('resize', updatePositions);
}

// Message router
browser.runtime.onConnect.addListener((port) => {
    console.log('New connection:', port.name);
    if (port.name === 'llm') {
        llmPorts.add(port);
        
        // Store the tab ID when connection is established
        let currentTabId = null;
        
        port.onMessage.addListener(async (msg) => {
            console.log('Received LLM port message:', msg.type);
            try {
                if (msg.type === 'classifyDOM') {
                    // Store the tab ID from the message
                    currentTabId = msg.tabId;
                    console.log('Processing classification for tab:', currentTabId);
                    
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
                        
                        // Create debug overlay if in debug mode
                        if (DEBUG_MODE && result.selectors) {
                            browser.scripting.executeScript({
                                target: { tabId: currentTabId },
                                func: createDebugOverlay,
                                args: [result.selectors]
                            }).catch(error => {
                                console.error('Failed to create debug overlay:', error);
                            });
                        }
                        
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
                    
                    // Skip opening viewer in debug mode
                    if (DEBUG_MODE) {
                        console.log('Debug mode active - skipping viewer');
                        port.postMessage({ type: 'openViewer', success: true, debugMode: true });
                        return;
                    }
                    
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
browser.action.onClicked.addListener(async (tab) => {
    console.log('=== Toolbar Button Clicked ===');
    console.log('Tab ID:', tab.id);
    console.log('Tab URL:', tab.url);
    
    try {
        // First, ensure content script is loaded
        console.log('1. Checking if content script is loaded...');
        try {
            // Try sending a ping message first
            const pingResponse = await browser.tabs.sendMessage(tab.id, { 
                type: 'ping',
                tab: { id: tab.id, url: tab.url }
            });
            console.log('2. Content script is already loaded, ping response:', pingResponse);
            
            // If we got a tab ID back, store it
            if (pingResponse && pingResponse.tabId) {
                console.log('3. Content script confirmed tab ID:', pingResponse.tabId);
            }
        } catch (error) {
            console.log('2. Content script not loaded, injecting...');
            // Inject content script with tab ID in URL
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            console.log('3. Content script injected successfully');
            
            // Wait a moment for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Send initial ping to store tab ID
            const initResponse = await browser.tabs.sendMessage(tab.id, { 
                type: 'ping',
                tab: { id: tab.id, url: tab.url }
            });
            console.log('4. Initial ping response:', initResponse);
        }
        
        // Then send the runCleaner message
        console.log('5. Sending runCleaner message...');
        const response = await browser.tabs.sendMessage(tab.id, { 
            type: 'runCleaner',
            tab: { id: tab.id, url: tab.url }
        });
        console.log('6. runCleaner message sent successfully, response:', response);
    } catch (error) {
        console.error('Error in toolbar button handler:', error);
        // If the error is because the content script is already loaded, try sending the message anyway
        if (error.message.includes('Content script already injected')) {
            try {
                const response = await browser.tabs.sendMessage(tab.id, { 
                    type: 'runCleaner',
                    tab: { id: tab.id, url: tab.url }
                });
                console.log('runCleaner message sent successfully after retry, response:', response);
            } catch (retryError) {
                console.error('Failed to send message even after retry:', retryError);
            }
        }
    }
});

// expose result to viewer
window.getLatest = function() {
    console.log('Getting latest result');
    return latestResult;
};

console.log('Background script initialization complete');

