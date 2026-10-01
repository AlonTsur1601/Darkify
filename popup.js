const globalToggle = document.getElementById('globalToggle');
const siteMode = document.getElementById('siteMode');
const siteNameEl = document.getElementById('siteName');
const siteWarningEl = document.getElementById('siteWarning');

let currentHost = '';

function updateSiteAvailability() {
  siteMode.disabled = !currentHost || !globalToggle.checked;
  siteMode.classList.toggle('extension-paused', !globalToggle.checked);
}

const INTERNAL_SCHEMES = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'devtools:'];

function getActiveTabInfo(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].url) return callback({ url: '', host: '', supported: false });
    const fullUrl = tabs[0].url;
    try {
      const u = new URL(fullUrl);
      const supported = !INTERNAL_SCHEMES.includes(u.protocol);
      callback({ url: fullUrl, host: supported ? DarkifyDomains.domain(u.hostname) : '', supported });
    } catch (e) {
      callback({ url: fullUrl, host: '', supported: false });
    }
  });
}

function load() {
  chrome.storage.sync.get(['enabled', 'siteOverrides'], (data) => {
    globalToggle.checked = data.enabled !== false;
    getActiveTabInfo(({ url, host, supported }) => {
      currentHost = host;
      siteNameEl.textContent = host || (url ? 'Unsupported page' : '(no active tab)');

      if (!supported) {
        siteWarningEl.textContent = 'Not available on this page';
        siteWarningEl.style.display = 'block';
      } else {
        siteWarningEl.style.display = 'none';
      }

      const overrides = DarkifyDomains.overrides(data.siteOverrides || {});
      if (overrides[host] === true) siteMode.value = 'on';
      else if (overrides[host] === false) siteMode.value = 'off';
      else siteMode.value = 'auto';
      updateSiteAvailability();
    });
  });
}

globalToggle.addEventListener('change', () => {
  updateSiteAvailability();
  chrome.storage.sync.set({ enabled: globalToggle.checked });
});

siteMode.addEventListener('change', () => {
  if (!currentHost || !globalToggle.checked) return;
  chrome.storage.sync.get(['siteOverrides'], (data) => {
    const overrides = DarkifyDomains.overrides(data.siteOverrides || {});
    if (siteMode.value === 'on') overrides[currentHost] = true;
    else if (siteMode.value === 'off') overrides[currentHost] = false;
    else delete overrides[currentHost];
    chrome.storage.sync.set({ siteOverrides: overrides });
  });
});

load();
