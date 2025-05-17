// Get the background page to access the latest extraction result
let bgPage = null;
let currentData = null;

async function init() {
    try {
        bgPage = await browser.runtime.getBackgroundPage();
        currentData = bgPage.getLatest();
        if (currentData) {
            renderContent(currentData);
        } else {
            document.querySelector('.loading').textContent = 'No content available';
        }
    } catch (e) {
        console.error('Failed to initialize viewer:', e);
        document.querySelector('.loading').textContent = 'Error loading content';
    }
}

function renderContent(data) {
    const main = document.getElementById('content');
    main.innerHTML = '';

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
            const items = data[selectorName] || [];
            if (items.length > 0) {
                const group = document.createElement('div');
                group.className = 'selector-group';
                
                const groupHeader = document.createElement('h3');
                groupHeader.textContent = selectorName;
                group.appendChild(groupHeader);

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
                        div.textContent = item;
                    }
                    
                    group.appendChild(div);
                });

                content.appendChild(group);
            }
        }

        section.appendChild(content);
        main.appendChild(section);
    }
}

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
        a.download = 'extracted-content.html';
        a.click();
        URL.revokeObjectURL(url);
    }
});

// Initialize the viewer
init();
