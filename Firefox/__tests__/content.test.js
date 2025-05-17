describe('Content Script', () => {
    let document;

    beforeEach(() => {
        // Set up a basic DOM
        document = {
            body: {
                nodeType: 1,
                tagName: 'BODY',
                className: '',
                textContent: 'Test content',
                children: [
                    {
                        nodeType: 1,
                        tagName: 'ARTICLE',
                        className: 'main-content',
                        textContent: 'Article content',
                        children: [],
                        id: 'main'
                    },
                    {
                        nodeType: 1,
                        tagName: 'NAV',
                        className: 'navigation',
                        textContent: 'Navigation',
                        children: [
                            {
                                nodeType: 1,
                                tagName: 'A',
                                className: 'nav-link',
                                textContent: 'Home',
                                href: 'https://example.com',
                                children: []
                            }
                        ]
                    }
                ]
            }
        };

        // Mock browser API
        global.browser = {
            runtime: {
                sendMessage: jest.fn()
            },
            storage: {
                local: {
                    set: jest.fn()
                }
            }
        };
    });

    test('snapshot creates correct tree structure', () => {
        const snapshot = require('../content').snapshot(document.body);
        
        expect(snapshot).toHaveLength(4); // body, article, nav, a
        expect(snapshot[0].tag).toBe('body');
        expect(snapshot[1].tag).toBe('article');
        expect(snapshot[2].tag).toBe('nav');
        expect(snapshot[3].tag).toBe('a');
        expect(snapshot[3].attrs.href).toBe('https://example.com');
    });

    test('applySelectors processes selectors correctly', async () => {
        const { applySelectors } = require('../content');
        
        const selectors = {
            selectors: [
                { name: 'MainContent', css: 'article', maxItems: 1 },
                { name: 'NavLinks', css: 'nav a', maxItems: 5 }
            ],
            groups: {
                Page: ['MainContent', 'NavLinks']
            }
        };

        // Mock querySelectorAll
        document.querySelectorAll = jest.fn(selector => {
            if (selector === 'article') return [document.body.children[0]];
            if (selector === 'nav a') return [document.body.children[1].children[0]];
            return [];
        });

        await applySelectors(selectors);

        expect(browser.storage.local.set).toHaveBeenCalled();
        const stored = browser.storage.local.set.mock.calls[0][0].lastExtraction;
        expect(stored.result.MainContent).toHaveLength(1);
        expect(stored.result.NavLinks).toHaveLength(1);
        expect(stored.groups).toEqual(selectors.groups);
    });
}); 