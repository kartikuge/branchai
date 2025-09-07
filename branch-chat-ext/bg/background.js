// WHY THIS FILE:
// - MV3 background worker opens your hosted UI and injects data safely.

const STORMAI_URL = "https://stormeai.vercel.app/"; // <-- deploy StormAI here (HTTPS)

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "OPEN_STORMAI") return;
  const transcript = Array.isArray(msg.transcript) ? msg.transcript : [];
  const anchorIndex = Number.isFinite(msg.anchorIndex) ? msg.anchorIndex : transcript.length - 1;

  chrome.tabs.create({ url: STORMAI_URL }, (tab) => {
    const tabId = tab.id;
    const onUpdated = (id, info) => {
      if (id !== tabId || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.scripting.executeScript({
        target: { tabId },
        args: [transcript, anchorIndex],
        func: (data, anchor) => {
          window.__BRANCH_CONTEXT = data;
          window.__BRANCH_ANCHOR  = anchor;
          sessionStorage.setItem('stormai_ctx', JSON.stringify(data));
          sessionStorage.setItem('stormai_anchor', String(anchor));
          window.dispatchEvent(new Event('stormai:ctx-ready'));
          console.log('[StormAI] context injected', data.length, 'turns @', anchor);
        }
      });
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
});