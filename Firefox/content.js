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

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'snapshotRequest') {
    const list = [];
    walk(document.body, list);
    browser.runtime.sendMessage({ type: 'snapshot', data: { url: location.href, tree: list } });
  } else if (msg.type === 'runSelectors') {
    handleSelectors(msg.selectors, msg.groups);
  }
});
