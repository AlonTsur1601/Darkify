function initializeSettings() {
  chrome.storage.sync.get(['enabled', 'siteOverrides'], data => {
    const updates = {};
    if (typeof data.enabled !== 'boolean') updates.enabled = true;
    if (!data.siteOverrides) updates.siteOverrides = {};
    if (Object.keys(updates).length) chrome.storage.sync.set(updates);
  });
}

async function missingDarkifyFrames(tabId, version) {
  const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: expectedVersion => window.__darkifyContentVersion !== expectedVersion,
    args: [version]
  });
  return results.filter(result => result.result).map(result => result.frameId);
}

async function injectIntoTab(tabId, version) {
  try {
    const frameIds = await missingDarkifyFrames(tabId, version);
    if (!frameIds.length) return;
    const target = { tabId, frameIds };
    await chrome.scripting.insertCSS({ target, files: ['dark.css'] });
    await chrome.scripting.executeScript({ target, files: ['content.js'] });
  } catch (error) {
    // Chrome-internal pages, the Web Store and frames without host access are
    // expected to reject injection. Other eligible tabs must still continue.
  }
}

let currentInjectionRun = null;

function injectIntoOpenTabs() {
  if (currentInjectionRun) return currentInjectionRun;
  currentInjectionRun = (async () => {
    const version = chrome.runtime.getManifest().version;
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    await Promise.allSettled(
      tabs
        .filter(tab => Number.isInteger(tab.id))
        .map(tab => injectIntoTab(tab.id, version))
    );
  })().finally(() => {
    currentInjectionRun = null;
  });
  return currentInjectionRun;
}

chrome.runtime.onInstalled.addListener(() => {
  initializeSettings();
  injectIntoOpenTabs().catch(() => {});
});

initializeSettings();
injectIntoOpenTabs().catch(() => {});
