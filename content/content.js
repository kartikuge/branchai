// content/content.js — ChatGPT branch injector
console.log("[BranchAI] content script loaded");

const MSG_SELECTOR = 'main div[data-message-author-role], main .group';

function roleOf(el) {
  const r = el.getAttribute('data-message-author-role');
  if (r) return r === 'assistant' ? 'assistant' : 'user';
  const cls = (el.className || '').toLowerCase();
  return cls.includes('assistant') ? 'assistant' : 'user';
}

function textOf(el) {
  const md = el.querySelector('div.markdown, .prose, .message-content');
  return (md ? md.innerText : el.innerText || '').trim();
}

function scrapeAll() {
  const nodes = Array.from(document.querySelectorAll(MSG_SELECTOR));
  const turns = [];
  for (const el of nodes) {
    const content = textOf(el);
    if (!content) continue;
    turns.push({ role: roleOf(el), content, ts: Date.now() });
  }
  return { turns, nodes };
}

function addPill(el) {
  if (el.querySelector('.branch-chat-btn')) return;
  el.style.position ||= 'relative';

  const btn = document.createElement('button');
  btn.className = 'branch-chat-btn';
  btn.textContent = 'branch';
  btn.title = 'Branch from here → BranchAI';
  Object.assign(btn.style, {
    position: 'absolute', right: '8px', top: '8px',
    padding: '4px 8px', border: '1px solid #ddd', borderRadius: '8px',
    background: '#fff', fontSize: '12px', cursor: 'pointer', zIndex: 10,
  });

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const { turns, nodes } = scrapeAll();
    const anchorIndex = Math.max(0, nodes.indexOf(el));
    chrome.runtime.sendMessage({ type: 'OPEN_BRANCHAI', transcript: turns, anchorIndex });
  });

  el.appendChild(btn);
}

function injectAll() {
  document.querySelectorAll(MSG_SELECTOR).forEach(addPill);
}

new MutationObserver(() => injectAll())
  .observe(document.documentElement, { childList: true, subtree: true });

let tries = 0;
(function retry() {
  injectAll();
  if (++tries < 10) setTimeout(retry, 500);
})();
