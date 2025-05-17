let port = null;
let latestResult = null;

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

browser.action.onClicked.addListener(async (tab) => {
  await browser.tabs.sendMessage(tab.id, { type: 'snapshotRequest' });
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === 'snapshot') {
    const response = await sendNative(msg.data);
    await browser.tabs.sendMessage(sender.tab.id, {
      type: 'runSelectors',
      selectors: response.selectors || [],
      groups: response.groups || {}
    });
  } else if (msg.type === 'extractionSummary') {
    const check = await sendNative({ summary: msg.summary });
    if (check && check.selectors && check.selectors.length) {
      await browser.tabs.sendMessage(sender.tab.id, {
        type: 'runSelectors',
        selectors: check.selectors,
        groups: check.groups || {}
      });
    } else {
      latestResult = Object.assign({}, msg.summary, { groups: check.groups || msg.groups || {} });
      await browser.tabs.create({ url: browser.runtime.getURL('viewer.html') });
    }
  }
});

// expose result to viewer
export function getLatest() {
  return latestResult;
}
