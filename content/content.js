// WHY THIS FILE:
// - Runs in the ChatGPT page (isolated world).
// - Adds “Branch” next to each message.
// - Scrapes only visible text (privacy-by-design).
// - No API keys here (least privilege).

const MSG_SELECTOR = 'main div[data-message-author-role], main .group';
const BTN_CLASS = 'branch-chat-btn';

function roleOf(el) {
  const r = el.getAttribute('data-message-author-role');
  if (r) return r; // 'user' | 'assistant' | 'system'
  return el.querySelector('div.markdown, .prose') ? 'assistant' : 'user';
}

function textOf(el) {
  const md = el.querySelector('div.markdown, .prose, .message-content');
  return (md ? md.innerText : el.innerText || '').trim();
}

function collectMessagesUpTo(targetEl) {
  const nodes = Array.from(document.querySelectorAll(MSG_SELECTOR));
  const slice = [];
  for (const el of nodes) {
    const content = textOf(el);
    if (!content) continue;
    slice.push({
      role: roleOf(el) === 'assistant' ? 'assistant' : 'user',
      content,
      ts: Date.now()
    });
    if (el === targetEl) break;
  }
  return slice;
}

function injectButtons(root = document) {
  const nodes = root.querySelectorAll(MSG_SELECTOR);
  nodes.forEach((el) => {
    if (el.querySelector(`.${BTN_CLASS}`)) return;
    el.classList.add('branch-anchor');

    const btn = document.createElement('button');
    btn.className = BTN_CLASS;
    btn.textContent = 'branch';
    btn.title = 'Branch from here → StormAI';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const transcript = collectMessagesUpTo(el);
      chrome.runtime.sendMessage({ type: 'OPEN_STORMAI', transcript });
    });

    el.style.position = 'relative';
    el.appendChild(btn);
  });
}

injectButtons();
const mo = new MutationObserver(() => injectButtons());
mo.observe(document.body, { childList: true, subtree: true });
