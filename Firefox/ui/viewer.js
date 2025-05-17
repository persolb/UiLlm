let currentData = null;

async function init() {
    try {
        // Get data from the background script
        const response = await browser.runtime.sendMessage({ type: 'getLatest' });
        if (response) {
            currentData = response;
            renderContent(response);
        } else {
            // Fallback to storage if background script doesn't have data
            const { lastExtraction } = await browser.storage.local.get('lastExtraction');
            if (lastExtraction) {
                currentData = lastExtraction;
                renderContent(lastExtraction);
            } else {
                document.querySelector('.loading').textContent = 'No content available';
            }
        }
    } catch (e) {
        console.error('Failed to initialize viewer:', e);
        document.querySelector('.loading').textContent = 'Error loading content';
    }
}

function renderContent(data) {
    const main = document.getElementById('content');
    main.innerHTML = '';

    // Add source URL
    const source = document.createElement('div');
    source.className = 'source';
    source.innerHTML = `Source: <a href="${data.url}" target="_blank">${data.url}</a>`;
    main.appendChild(source);

    // Render each group
    for (const [groupName, selectorNames] of Object.entries(data.groups || {})) {
        const section = document.createElement('section');
        section.setAttribute('data-group', groupName);
        
        const header = document.createElement('h2');
        header.textContent = groupName;
        section.appendChild(header);

        const content = document.createElement('div');
        content.className = 'content';

        // Render each selector's content
        for (const selectorName of selectorNames) {
            const items = data.result[selectorName] || [];
            if (items.length > 0) {
                const group = document.createElement('div');
                group.className = 'selector-group';
                
                const groupHeader = document.createElement('h3');
                groupHeader.textContent = selectorName;
                group.appendChild(groupHeader);

                // Special handling for article body and other text-heavy content
                if (selectorName === 'Article Body' || selectorName.includes('Content')) {
                    items.forEach(item => {
                        // Split text into paragraphs and handle them separately
                        const paragraphs = item.split(/\n\s*\n/).filter(p => p.trim());
                        paragraphs.forEach(paragraph => {
                            const div = document.createElement('div');
                            div.className = 'item paragraph';
                            div.textContent = paragraph.trim();
                            group.appendChild(div);
                        });
                    });
                } else {
                    items.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'item';
                        
                        // If item is a URL, make it a link
                        if (item.startsWith('http')) {
                            const a = document.createElement('a');
                            a.href = item;
                            a.textContent = item;
                            a.target = '_blank';
                            div.appendChild(a);
                        } else {
                            // For other text, preserve line breaks
                            const text = item.replace(/\n/g, '<br>');
                            div.innerHTML = text;
                        }
                        
                        group.appendChild(div);
                    });
                }

                content.appendChild(group);
            }
        }

        section.appendChild(content);
        main.appendChild(section);
    }
}

// Add some CSS styles
const style = document.createElement('style');
style.textContent = `
    .selector-group {
        margin-bottom: 2em;
        padding: 1em;
        border: 1px solid #eee;
        border-radius: 4px;
    }

    .selector-group h3 {
        margin-top: 0;
        color: #333;
        border-bottom: 2px solid #eee;
        padding-bottom: 0.5em;
    }

    .item {
        margin: 0.5em 0;
        line-height: 1.5;
    }

    .item.paragraph {
        margin: 1em 0;
        text-align: justify;
    }

    .item a {
        color: #0066cc;
        text-decoration: none;
    }

    .item a:hover {
        text-decoration: underline;
    }

    section {
        margin: 2em 0;
    }

    section h2 {
        color: #222;
        border-bottom: 3px solid #eee;
        padding-bottom: 0.5em;
    }

    .source {
        background: #f5f5f5;
        padding: 1em;
        margin-bottom: 2em;
        border-radius: 4px;
        font-size: 0.9em;
    }

    .source a {
        color: #0066cc;
        text-decoration: none;
    }

    .source a:hover {
        text-decoration: underline;
    }

    [data-theme="dark"] {
        background: #1a1a1a;
        color: #eee;
    }

    [data-theme="dark"] .selector-group {
        border-color: #333;
        background: #222;
    }

    [data-theme="dark"] .selector-group h3 {
        color: #eee;
        border-color: #333;
    }

    [data-theme="dark"] .source {
        background: #222;
    }

    [data-theme="dark"] section h2 {
        color: #eee;
        border-color: #333;
    }

    [data-theme="dark"] .item a {
        color: #66b3ff;
    }
`;
document.head.appendChild(style);

// Theme handling
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Initialize theme from localStorage or default to light
const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);

// Theme selector
document.getElementById('themeSelect').value = savedTheme;
document.getElementById('themeSelect').addEventListener('change', (e) => {
    setTheme(e.target.value);
});

// Copy JSON button
document.getElementById('copyJson').addEventListener('click', () => {
    if (currentData) {
        const json = JSON.stringify(currentData, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            const btn = document.getElementById('copyJson');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }
});

// Export HTML button
document.getElementById('exportHtml').addEventListener('click', () => {
    if (currentData) {
        const html = document.documentElement.outerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cleaned-content.html';
        a.click();
        URL.revokeObjectURL(url);
    }
});

// Initialize the viewer
init(); 