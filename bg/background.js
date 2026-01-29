// bg/background.js — opens extension tab on icon click, handles context handoff

// Click extension icon → open BranchAI tab
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
});

// Content script sends transcript → store in session, then open tab
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'OPEN_BRANCHAI') return;

  const transcript = Array.isArray(msg.transcript) ? msg.transcript : [];
  const anchorIndex = Number.isFinite(msg.anchorIndex) ? msg.anchorIndex : transcript.length - 1;

  // Store in session storage so the app page can pick it up
  chrome.storage.session.set({
    branchai_pending: { transcript, anchorIndex },
  }).then(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
  });
});
