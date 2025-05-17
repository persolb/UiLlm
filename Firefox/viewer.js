(async () => {
  const bg = await browser.runtime.getBackgroundPage();
  const data = bg.getLatest();
  const container = document.getElementById('content');
  container.innerHTML = '';
  if (!data) {
    container.textContent = 'No data available';
    return;
  }
  for (const [group, names] of Object.entries(data.groups || {})) {
    const sec = document.createElement('section');
    sec.dataset.group = group;
    const h2 = document.createElement('h2');
    h2.textContent = group;
    sec.appendChild(h2);
    for (const name of names) {
      const div = document.createElement('div');
      div.className = 'block';
      const h3 = document.createElement('h3');
      h3.textContent = name;
      div.appendChild(h3);
      const items = data[name] || [];
      for (const item of items) {
        const p = document.createElement('p');
        p.textContent = item;
        div.appendChild(p);
      }
      sec.appendChild(div);
    }
    container.appendChild(sec);
  }
})();
