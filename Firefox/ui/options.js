// Load saved key on page load
browser.storage.local.get('apiKey').then(({ apiKey }) => {
    if (apiKey) {
        document.getElementById('key').value = apiKey;
    }
});

// Save key
async function saveKey() {
    const key = document.getElementById('key').value.trim();
    if (!key) {
        showStatus('Please enter an API key', 'error');
        return;
    }

    try {
        await browser.storage.local.set({ apiKey: key });
        showStatus('API key saved successfully', 'success');
    } catch (e) {
        showStatus('Failed to save API key: ' + e.message, 'error');
    }
}

// Helper function for port-based communication
async function communicateWithLLM(message) {
    const port = browser.runtime.connect({ name: "llm" });
    
    return new Promise((resolve, reject) => {
        port.onMessage.addListener((response) => {
            if (response.type === 'error') {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
        
        port.postMessage(message);
    });
}

// Test connection
async function testConnection() {
    const key = document.getElementById('key').value.trim();
    if (!key) {
        showStatus('Please enter an API key first', 'error');
        return;
    }

    try {
        // Save the key first
        await browser.storage.local.set({ apiKey: key });
        
        // Test the connection using port
        const response = await communicateWithLLM({ type: 'pingLLM' });
        if (response && response.result) {
            showStatus('Connection test successful!', 'success');
        } else {
            showStatus('Connection test failed. Please check your API key.', 'error');
        }
    } catch (e) {
        showStatus('Connection test failed: ' + e.message, 'error');
    }
}

// Show status message
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
    status.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}

// Event listeners
document.getElementById('save').addEventListener('click', saveKey);
document.getElementById('test').addEventListener('click', testConnection); 