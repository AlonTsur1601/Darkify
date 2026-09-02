function initializeSettings() {
  chrome.storage.sync.get(['enabled', 'siteOverrides'], data => {
    const updates = {};
    if (typeof data.enabled !== 'boolean') updates.enabled = true;
    if (!data.siteOverrides) updates.siteOverrides = {};
    if (Object.keys(updates).length) chrome.storage.sync.set(updates);
  });
}

async function darkifyFrameStates(tabId, version) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: expectedVersion => {
      const documentVersion = document.documentElement?.getAttribute('data-fd-version') || null;
      const installedVersion = window.__darkifyContentVersion || documentVersion;
      const hasLegacyState = Boolean(
        document.documentElement?.classList.contains('__force-dark-active__')
        || document.querySelector(
          '[data-fd-props], [data-fd-adjusted], [data-fd-monochrome], .__fd_color_adjusted__, .__fd_monochrome_image__'
        )
      );
      return {
        installedVersion: installedVersion || null,
        needsInjection: installedVersion !== expectedVersion,
        needsReload: Boolean(
          (installedVersion && installedVersion !== expectedVersion)
          || (!installedVersion && hasLegacyState)
        )
      };
    },
    args: [version]
  });
  return results.map(result => ({
    frameId: result.frameId,
    installedVersion: result.result?.installedVersion || null,
    needsInjection: Boolean(result.result?.needsInjection),
    needsReload: Boolean(result.result?.needsReload)
  }));
}

async function injectIntoTab(tabId, version) {
  try {
    const frameStates = await darkifyFrameStates(tabId, version);
    const hasPreviousVersion = frameStates.some(state => state.needsReload);
    if (hasPreviousVersion) {
      // An extension reload does not reliably stop observers and event
      // listeners installed by the previous isolated world. Reload once when
      // replacing a running Darkify version so the tab cannot run two color
      // engines at the same time.
      await chrome.tabs.reload(tabId);
      return;
    }

    const frameIds = frameStates
      .filter(state => state.needsInjection)
      .map(state => state.frameId);
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
