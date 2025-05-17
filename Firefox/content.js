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

// Apply selectors and extract content
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
                // Extract text or href safely
                const href = getAttributeValue(node, 'href');
                if (href) return href;
                
                const value = getAttributeValue(node, 'value');
                if (value) return value;
                
                return node.textContent.trim();
            }).filter(Boolean);
        } catch (e) {
            console.error(`Error applying selector ${sel.name}:`, e);
            result[sel.name] = [];
        }
    }

    // Store result and open viewer
    await browser.storage.local.set({ 
        lastExtraction: { 
            result, 
            groups,
            url: location.href,
            timestamp: Date.now()
        }
    });

    // Open viewer in new tab
    await browser.runtime.sendMessage({ 
        type: 'openViewer',
        data: { result, groups }
    });
}

// Message handler
browser.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'runCleaner') {
        try {
            console.log('Starting content extraction...');
            // Get DOM snapshot
            const domSnapshot = createSnapshot();
            console.log('DOM snapshot created:', domSnapshot.length, 'elements');
            
            // Send to background for LLM processing
            console.log('Sending snapshot to background for LLM processing...');
            const selectors = await browser.runtime.sendMessage({
                type: 'classifyDOM',
                snapshot: domSnapshot
            });

            if (selectors) {
                console.log('Received selectors from LLM:', selectors);
                await applySelectors(selectors);
            } else {
                console.error('Failed to get selectors from LLM');
            }
        } catch (e) {
            console.error('Error in content script:', e);
        }
    }
});
