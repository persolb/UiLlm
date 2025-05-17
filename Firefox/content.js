// Add initialization logging at the very top of the file
console.log('=== Content Script Loading ===');
console.log('URL:', window.location.href);
console.log('Document ready state:', document.readyState);

// Store tab ID
let currentTabId = null;

// Get tab ID from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const tabIdParam = urlParams.get('tabId');
if (tabIdParam) {
    currentTabId = parseInt(tabIdParam, 10);
    console.log('Got tab ID from URL:', currentTabId);
}

// Utility functions
function prune(text) {
  return (text || '').trim().slice(0, 32);
}

function walk(node, list) {
  const id = list.length;
  const info = {
    id,
    tag: node.tagName.toLowerCase(),
    classes: node.className || '',
    textPrefix: prune(node.textContent)
  };
  list.push(info);
  if (node.children && node.children.length) {
    info.children = [];
    for (const child of node.children) {
      info.children.push(list.length);
      walk(child, list);
    }
  } else {
    info.children = [];
  }
}

async function handleSelectors(selectors, groups) {
  const result = {};
  for (const sel of selectors) {
    const nodes = Array.from(document.querySelectorAll(sel.css)).slice(0, sel.maxItems || 30);
    result[sel.name] = nodes.map(n => n.href || n.value || prune(n.textContent));
  }
  await browser.runtime.sendMessage({ type: 'extractionSummary', summary: result, groups });
}

// Helper to safely get attribute values
function getAttributeValue(node, attr) {
    try {
        const value = node.getAttribute(attr);
        return value || undefined;
    } catch (e) {
        return undefined;
    }
}

// Create a lightweight DOM snapshot
function createSnapshot() {
    const snapshotWalk = (node, arr) => {
        if (node.nodeType !== 1) return; // Skip non-element nodes
        
        // Get element info
        const info = {
            tag: node.tagName.toLowerCase(),
            cls: getAttributeValue(node, 'class'),
            txt: node.textContent.trim().slice(0, 40),
            id: getAttributeValue(node, 'id'),
            attrs: {}
        };

        // Get important attributes safely
        const href = getAttributeValue(node, 'href');
        if (href) info.attrs.href = href;
        
        const role = getAttributeValue(node, 'role');
        if (role) info.attrs.role = role;
        
        const ariaLabel = getAttributeValue(node, 'aria-label');
        if (ariaLabel) info.attrs['aria-label'] = ariaLabel;

        // Handle SVG elements specially
        if (node instanceof SVGElement) {
            // Get basic SVG attributes
            const width = getAttributeValue(node, 'width');
            const height = getAttributeValue(node, 'height');
            const viewBox = getAttributeValue(node, 'viewBox');
            
            if (width) info.attrs.width = width;
            if (height) info.attrs.height = height;
            if (viewBox) info.attrs.viewBox = viewBox;
        }
        
        arr.push(info);
        
        // Process children
        for (const child of node.children) {
            snapshotWalk(child, arr);
        }
    };

    const out = [];
    snapshotWalk(document.body, out);
    return out;
}

// Helper function to clean text content
function cleanText(text) {
    if (!text) return '';
    
    // Remove JavaScript code blocks
    text = text.replace(/if\s*\([^)]*\)\s*{[^}]*}/g, '');
    text = text.replace(/window\.[^;]*;/g, '');
    text = text.replace(/console\.[^;]*;/g, '');
    
    // Remove ad-related content
    text = text.replace(/Strike\.insertAd[^;]*;/g, '');
    text = text.replace(/ad-[^"'\s]*/g, '');
    
    // Remove multiple newlines and spaces
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
    text = text.replace(/\s{2,}/g, ' ');
    
    return text.trim();
}

// Add initialization logging
console.log('Content script loaded for:', window.location.href);

// Debug mode settings
const DEBUG_COLORS = {
    'main-text': 'rgba(144, 238, 144, 0.3)',    // light green
    'main-widget': 'rgba(144, 238, 144, 0.3)',  // light green
    'branding': 'rgba(255, 255, 0, 0.3)',       // yellow
    'nav': 'rgba(173, 216, 230, 0.3)',          // light blue
    'ignore': 'rgba(255, 0, 0, 0.3)'            // red
};

// Add debug styles to the page
function addDebugStyles() {
    const styleId = 'uillm-debug-styles';
    if (document.getElementById(styleId)) {
        return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
        .uillm-debug-main-text,
        .uillm-debug-main-widget {
            background-color: ${DEBUG_COLORS['main-text']} !important;
            outline: 2px solid ${DEBUG_COLORS['main-text'].replace('0.3', '0.8')} !important;
        }
        .uillm-debug-branding {
            background-color: ${DEBUG_COLORS.branding} !important;
            outline: 2px solid ${DEBUG_COLORS.branding.replace('0.3', '0.8')} !important;
        }
        .uillm-debug-nav {
            background-color: ${DEBUG_COLORS.nav} !important;
            outline: 2px solid ${DEBUG_COLORS.nav.replace('0.3', '0.8')} !important;
        }
        .uillm-debug-ignore {
            background-color: ${DEBUG_COLORS.ignore} !important;
            outline: 2px solid ${DEBUG_COLORS.ignore.replace('0.3', '0.8')} !important;
        }
        .uillm-debug-element {
            position: relative !important;
        }
        .uillm-debug-element:hover::after {
            content: attr(data-uillm-category) "\\A" attr(data-uillm-selector);
            position: absolute;
            top: 100%;
            left: 0;
            background: white;
            padding: 4px 8px;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
            font-size: 12px;
            white-space: pre;
            z-index: 2147483647;
            pointer-events: none;
        }
        #uillm-debug-legend {
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
            pointer-events: auto;
        }
        #uillm-debug-legend .legend-item {
            display: flex;
            align-items: center;
            margin: 5px 0;
        }
        #uillm-debug-legend .color-swatch {
            width: 15px;
            height: 15px;
            margin-right: 8px;
            border: 1px solid rgba(0,0,0,0.2);
        }
    `;
    document.head.appendChild(style);
}

// Create debug visualization using CSS classes
function createDebugOverlay(selectors) {
    console.log('=== Creating Debug Visualization ===');
    console.log('Selectors:', selectors);
    
    // Remove existing debug classes and legend
    document.querySelectorAll('[class*="uillm-debug-"]').forEach(el => {
        el.classList.remove('uillm-debug-main-text', 'uillm-debug-main-widget', 
                          'uillm-debug-branding', 'uillm-debug-nav', 'uillm-debug-ignore',
                          'uillm-debug-element');
        el.removeAttribute('data-uillm-category');
        el.removeAttribute('data-uillm-selector');
    });
    const existingLegend = document.getElementById('uillm-debug-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    
    // Add debug styles if not already present
    addDebugStyles();
    
    // Apply debug classes to elements
    selectors.forEach(selector => {
        console.log(`Processing selector: ${selector.name} (${selector.css})`);
        try {
            const elements = document.querySelectorAll(selector.css);
            console.log(`Found ${elements.length} elements for selector:`, selector);
            
            elements.forEach((element, index) => {
                // Skip elements with zero dimensions
                const rect = element.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) {
                    console.log(`Skipping element ${index} with zero dimensions`);
                    return;
                }
                
                // Add debug class based on category
                let debugClass = 'uillm-debug-ignore';
                if (selector.name.startsWith('ignore-')) {
                    debugClass = 'uillm-debug-ignore';
                } else if (selector.name === 'main-text' || selector.name === 'main-widget') {
                    debugClass = selector.name === 'main-text' ? 'uillm-debug-main-text' : 'uillm-debug-main-widget';
                } else if (selector.name === 'branding') {
                    debugClass = 'uillm-debug-branding';
                } else if (selector.name === 'nav') {
                    debugClass = 'uillm-debug-nav';
                }
                
                element.classList.add(debugClass, 'uillm-debug-element');
                element.setAttribute('data-uillm-category', selector.name);
                element.setAttribute('data-uillm-selector', selector.css);
                
                console.log(`Added debug class to element ${index}`);
            });
        } catch (error) {
            console.error(`Error processing selector ${selector.name}:`, error);
        }
    });
    
    // Create legend
    const legend = document.createElement('div');
    legend.id = 'uillm-debug-legend';
    
    Object.entries(DEBUG_COLORS).forEach(([category, color]) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color;
        swatch.style.borderColor = color.replace('0.3', '0.8');
        
        const label = document.createElement('span');
        label.textContent = category;
        
        item.appendChild(swatch);
        item.appendChild(label);
        legend.appendChild(item);
    });
    
    document.body.appendChild(legend);
    console.log('Debug visualization complete');
}

// Helper function for port-based communication
async function communicateWithLLM(message) {
    console.log('=== Setting up LLM Communication ===');
    console.log('Message type:', message.type);
    console.log('Current tab ID:', currentTabId);
    
    const port = browser.runtime.connect({ name: "llm" });
    console.log('LLM port connected');
    
    // Use stored tab ID
    if (currentTabId) {
        message.tabId = currentTabId;
        console.log('Using stored tab ID:', currentTabId);
    } else {
        console.warn('No tab ID available');
    }
    
    return new Promise((resolve, reject) => {
        // Set up message handler
        port.onMessage.addListener((response) => {
            console.log('=== Received LLM Port Response ===');
            console.log('Response type:', response.type);
            console.log('Response data:', response);
            
            if (response.type === 'error') {
                console.error('LLM port error:', response.error);
                reject(new Error(response.error));
            } else {
                console.log('LLM port success, resolving with:', response);
                resolve(response);
            }
        });
        
        // Set up disconnect handler
        port.onDisconnect.addListener((p) => {
            console.log('=== LLM Port Disconnected ===');
            if (p.error) {
                console.error('Port disconnected with error:', p.error);
                reject(new Error(p.error.message));
            }
        });
        
        // Send the message
        console.log('Sending message to LLM port:', message);
        try {
            port.postMessage(message);
            console.log('Message sent to LLM port successfully');
        } catch (error) {
            console.error('Error sending message to LLM port:', error);
            reject(error);
        }
    });
}

// Message handler
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('=== Content Script Message Received ===');
    console.log('Message type:', message.type);
    console.log('Sender:', sender);
    console.log('Current URL:', window.location.href);
    console.log('Current tab ID:', currentTabId);
    
    // Store tab ID if provided in message
    if (message.tab && message.tab.id) {
        currentTabId = message.tab.id;
        console.log('Stored tab ID from message:', currentTabId);
    }
    
    if (message.type === 'ping') {
        console.log('Received ping, responding...');
        sendResponse({ success: true, tabId: currentTabId });
        return false;
    }
    
    if (message.type === 'createDebugOverlay') {
        console.log('Creating debug overlay with selectors:', message.selectors);
        createDebugOverlay(message.selectors);
        sendResponse({ success: true });
        return false;
    }
    
    if (message.type === 'runCleaner') {
        console.log('=== Starting runCleaner Handler ===');
        // Use an IIFE to handle async operations
        (async () => {
            try {
                if (!currentTabId) {
                    throw new Error('No tab ID available');
                }
                
                console.log('1. Starting content extraction...');
                // Get DOM snapshot
                const domSnapshot = createSnapshot();
                console.log('2. DOM snapshot created:', domSnapshot.length, 'elements');
                console.log('3. Using stored tab ID:', currentTabId);
                
                // Send to background for LLM processing using port
                console.log('4. Setting up LLM communication...');
                const response = await communicateWithLLM({
                    type: 'classifyDOM',
                    snapshot: domSnapshot,
                    tabId: currentTabId
                });

                console.log('5. Received response from LLM:', response);
                if (response && response.result) {
                    console.log('6. Processing LLM result...');
                    await applySelectors(response.result);
                    console.log('7. Selectors applied successfully');
                    sendResponse({ success: true });
                } else {
                    console.error('Failed to get selectors from LLM');
                    sendResponse({ type: 'error', error: 'No valid result from LLM' });
                }
            } catch (error) {
                console.error('Error in runCleaner:', error);
                sendResponse({ type: 'error', error: error.message });
            }
        })();
        return true; // Keep the message channel open for async response
    }
});

// Update applySelectors to use port communication
async function applySelectors(selectors) {
    if (!selectors || !selectors.selectors) return;

    const result = {};
    const groups = selectors.groups || {};

    // Apply each selector
    for (const sel of selectors.selectors) {
        try {
            const nodes = Array.from(document.querySelectorAll(sel.css))
                .slice(0, sel.maxItems || 30);

            result[sel.name] = nodes.map(node => {
                // Extract text or href
                if (node.href) return node.href;
                if (node.value) return node.value;
                
                // Clean the text content
                let content = node.textContent.trim();
                
                // Special handling for article body and content sections
                if (sel.name === 'Article Body' || sel.name.includes('Content')) {
                    // Remove script tags and their content
                    const scripts = node.getElementsByTagName('script');
                    while (scripts.length > 0) {
                        scripts[0].parentNode.removeChild(scripts[0]);
                    }
                    
                    // Remove ad-related elements
                    const adElements = node.querySelectorAll('[class*="ad-"], [id*="ad-"], [class*="advertisement"], [id*="advertisement"]');
                    adElements.forEach(el => el.parentNode.removeChild(el));
                    
                    // Get clean text content
                    content = cleanText(node.textContent);
                }
                
                return content;
            }).filter(Boolean); // Remove empty strings
        } catch (e) {
            console.error(`Error applying selector ${sel.name}:`, e);
            result[sel.name] = [];
        }
    }

    // Store result and open viewer using port
    await browser.storage.local.set({ 
        lastExtraction: { 
            result, 
            groups,
            url: location.href,
            timestamp: Date.now()
        }
    });

    // Open viewer in new tab using port
    await communicateWithLLM({ 
        type: 'openViewer',
        data: { result, groups }
    });
}
