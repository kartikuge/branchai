// bg/background.js — opens extension tab on icon click, handles context handoff

const APP_URL = chrome.runtime.getURL('app/index.html');

// Click extension icon → open BranchAI tab
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: APP_URL });
});

// Content script sends transcript → store in session, then open/reuse tab
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'OPEN_BRANCHAI') return;

  const transcript = Array.isArray(msg.transcript) ? msg.transcript : [];
  const anchorIndex = Number.isFinite(msg.anchorIndex) ? msg.anchorIndex : transcript.length - 1;
  const title = msg.title || null;

  // Store in session storage so the app page can pick it up
  chrome.storage.session.set({
    branchai_pending: { transcript, anchorIndex, title },
  }).then(async () => {
    // Try to reuse an existing BranchAI tab
    const tabs = await chrome.tabs.query({ url: APP_URL });
    if (tabs.length) {
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true });
      // Notify the already-open tab that new context is available
      chrome.tabs.sendMessage(tab.id, { type: 'CTX_READY' }).catch(() => {});
    } else {
      chrome.tabs.create({ url: APP_URL });
    }
    sendResponse({ ok: true });
  });

  // Keep the message channel open for the async work above
  return true;
});
