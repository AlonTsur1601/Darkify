chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['enabled', 'siteOverrides'], (data) => {
    const updates = {};
    if (typeof data.enabled !== 'boolean') updates.enabled = true;
    if (!data.siteOverrides) updates.siteOverrides = {};
    if (Object.keys(updates).length) chrome.storage.sync.set(updates);
  });
});
