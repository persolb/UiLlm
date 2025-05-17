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

// Create debug overlay with highlighted elements
function createDebugOverlay(selectors) {
    console.log('=== Creating Debug Overlay ===');
    console.log('Selectors:', selectors);
    
    // Remove existing overlay if any
    const existingOverlay = document.getElementById('uillm-debug-overlay');
    if (existingOverlay) {
        console.log('Removing existing overlay');
        existingOverlay.remove();
    }
    
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
        background: transparent;
    `;
    
    // Create highlight elements for each selector
    selectors.forEach(selector => {
        console.log(`Processing selector: ${selector.name} (${selector.css})`);
        try {
            const elements = document.querySelectorAll(selector.css);
            console.log(`Found ${elements.length} elements for selector:`, selector);
            
            elements.forEach((element, index) => {
                const rect = element.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) {
                    console.log(`Skipping element ${index} with zero dimensions`);
                    return;
                }
                
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
                    border: 2px solid ${color.replace('0.3', '0.8')};
                    pointer-events: none;
                    z-index: 2147483646;
                    box-sizing: border-box;
                `;
                
                // Add tooltip with category and selector
                highlight.title = `${selector.name}\n${selector.css}`;
                
                overlay.appendChild(highlight);
                console.log(`Added highlight for element ${index}`);
            });
        } catch (error) {
            console.error(`Error processing selector ${selector.name}:`, error);
        }
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
        pointer-events: auto;
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
    console.log('Debug overlay added to page');
    
    // Update positions on scroll and resize
    let updateTimeout;
    function updatePositions() {
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            console.log('Updating overlay positions');
            overlay.remove();
            createDebugOverlay(selectors);
        }, 100);
    }
    
    window.addEventListener('scroll', updatePositions);
    window.addEventListener('resize', updatePositions);
    
    // Log final state
    console.log('Debug overlay creation complete');
    console.log('Overlay element:', overlay);
    console.log('Overlay parent:', overlay.parentElement);
    console.log('Overlay style:', overlay.style.cssText);
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
