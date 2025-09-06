// WHY THIS FILE:
// - MV3 background worker opens your hosted UI and injects data safely.

const STORMAI_URL = "https://YOURDOMAIN/"; // <-- deploy StormAI here (HTTPS)

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'OPEN_STORMAI') {
    openStormAITab(msg.transcript);
  }
});

async function openStormAITab(transcript) {
  // Open StormAI “branch” page (root handles it)
  const tab = await chrome.tabs.create({ url: STORMAI_URL });

  chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);

      // Inject transcript as a global the page can read immediately
      const payload = JSON.stringify(transcript)
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`');

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (json) => { window.__BRANCH_CONTEXT = JSON.parse(json); },
        args: [payload]
      });
    }
  });
}
