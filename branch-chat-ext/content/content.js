console.log("[StormAI] content script loaded");

const MSG_SELECTOR = 'div[data-message-author-role], article[data-message-author-role], main .group';

function roleOf(el) {
  const r = el.getAttribute('data-message-author-role');
  if (r) return r === 'assistant' ? 'assistant' : 'user';
  // fallback heuristics
  if (el.className?.toLowerCase().includes('assistant')) return 'assistant';
  return 'user';
}

function textOf(el) {
  // Grab visible text; be resilient to nested rich blocks
  return (el.innerText || el.textContent || "").trim();
}

function collectMessagesUpTo(targetEl) {
  const all = [...document.querySelectorAll(MSG_SELECTOR)]
    .filter(n => textOf(n).length); // ignore empties
  const idx = all.indexOf(targetEl);
  const upto = idx >= 0 ? all.slice(0, idx + 1) : all;
  return upto.map(n => ({ role: roleOf(n), content: textOf(n) }));
}

function injectButtons(root = document) {
  const nodes = root.querySelectorAll(MSG_SELECTOR);
  nodes.forEach((el) => {
    if (el.querySelector('.branch-chat-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'branch-chat-btn';
    btn.textContent = 'branch';
    Object.assign(btn.style, {
      position: 'absolute', right: '8px', top: '8px',
      padding: '4px 8px', border: '1px solid #ddd',
      borderRadius: '8px', background: '#fff', cursor: 'pointer', zIndex: 5
    });
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const transcript = collectMessagesUpTo(el);
      chrome.runtime.sendMessage({ type: 'OPEN_STORMAI', transcript });
    });
    el.style.position = 'relative';
    el.appendChild(btn);
  });
}

new MutationObserver(() => injectButtons()).observe(document.documentElement, { subtree: true, childList: true });
injectButtons();
