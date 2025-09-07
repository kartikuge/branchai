// WHY THIS FILE:
// - MV3 background worker opens your hosted UI and injects data safely.

const STORMAI_URL = "https://stormeai.vercel.app/"; // <-- deploy StormAI here (HTTPS)


chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type !== "OPEN_STORMAI") return;

  const transcript = Array.isArray(msg.transcript) ? msg.transcript : [];

  // Create the StormAI tab
  chrome.tabs.create({ url: STORMAI_URL }, (tab) => {
    const tabId = tab.id;

    // Wait for the page to complete, then inject the context
    const onUpdated = (id, info) => {
      if (id !== tabId || info.status !== "complete") return;
      chrome.tabs.onUpdated.removeListener(onUpdated);

      chrome.scripting.executeScript({
        target: { tabId },
        args: [transcript],
        func: (data) => {
          // This runs IN the StormAI page
          window.__BRANCH_CONTEXT = data;
          // Also drop into sessionStorage as backup
          try { sessionStorage.setItem('stormai_ctx', JSON.stringify(data)); } catch {}
          // Kick a custom event so the app can react if it already booted
          window.dispatchEvent(new Event('stormai:ctx-ready'));
          console.log('[StormAI] context injected', data);
        }
      });
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
});