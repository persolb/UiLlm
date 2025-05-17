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

// Test connection
async function testConnection() {
    const key = document.getElementById('key').value.trim();
    if (!key) {
        showStatus('Please enter an API key first', 'error');
        return;
    }

    try {
        const ok = await browser.runtime.sendMessage({ type: 'pingLLM' });
        if (ok) {
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