const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const domainSource = fs.readFileSync(path.join(root, 'domain.js'), 'utf8');
const domainContext = { URL };
vm.runInNewContext(domainSource, domainContext);
const DarkifyDomains = domainContext.DarkifyDomains;

function between(start, end) {
  return content.slice(content.indexOf(start), content.indexOf(end));
}

function engine(initial = { enabled: true, siteOverrides: {} }) {
  let now = 0, nextTimer = 0, initialRead, onChange, refreshes = 0;
  let nativeDark = false;
  const timers = new Map();
  const classes = new Set();
  const context = {
    DarkifyDomains,
    performance: { now: () => now },
    setTimeout(fn, delay) { timers.set(++nextTimer, { fn, time: now + delay }); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      readyState: 'complete',
      documentElement: { setAttribute() {}, classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
      addEventListener() {}
    },
    chrome: { storage: {
      sync: { get: (_, cb) => initialRead = cb },
      onChanged: { addListener: cb => onChange = cb }
    } },
    repairLegacyFontSources() {},
    siteLooksAlreadyDark: () => nativeDark,
    clearAllAdjustments() {}, observeRoot() {},
    requestUrgentRefresh: () => refreshes++
  };
  vm.createContext(context);
  vm.runInContext(`
    const contentVersion='test', VERSION_ATTRIBUTE='data-fd-version', ACTIVE_CLASS='dark', host='example.test';
    ${content.match(/const AUTO_DARK_DELAY_MS = \d+;/)[0]}
    let settings={enabled:true,siteOverrides:{}}, settingsLoaded=false;
    const changedSettingKeys=new Set();
    let autoDarkReadyAt=null,autoDarkTimer=null,active=false,firstScanTask=false;
    const darkModeQuery={matches:true};
    ${between('  function shouldForceDark()', '  function removeInternalStyles')}
    ${between('  function apply()', "  window.addEventListener('pageshow'")}
    ${content.slice(content.indexOf("  chrome.storage.sync.get(['enabled', 'siteOverrides']"), content.lastIndexOf('})();'))}
    this.api={apply, state:()=>active, setDark:v=>{darkModeQuery.matches=v;apply();}};
  `, context);
  return {
    api: context.api,
    load: () => initialRead(initial),
    change(key, value) { onChange({ [key]: { newValue: value } }, 'sync'); },
    setNative: v => nativeDark = v,
    get refreshes() { return refreshes; },
    get pending() { return timers.size; },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, t]) => t.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
        if (!next) break;
        now = next[1].time; timers.delete(next[0]); next[1].fn();
      }
      now = end;
    }
  };
}

function checkTransitions() {
  let e = engine();
  e.api.apply(); e.advance(10000);
  assert.equal(e.api.state(), false, 'Do not apply defaults before storage loads');
  e.load(); e.advance(500); e.api.apply(); e.advance(499);
  assert.equal(e.api.state(), false); e.advance(1); assert.equal(e.api.state(), true);
  e.change('siteOverrides', { 'example.test': false }); assert.equal(e.api.state(), false);
  e.change('siteOverrides', { 'example.test': true }); assert.equal(e.api.state(), true);
  e.change('enabled', false); assert.equal(e.api.state(), false); assert.equal(e.pending, 0);
  e.change('enabled', true); assert.equal(e.api.state(), true);
  e.change('siteOverrides', {}); assert.equal(e.api.state(), false);
  e.advance(500); e.setNative(true); e.advance(500); assert.equal(e.api.state(), false);
  e = engine(); e.load(); e.api.setDark(false); e.advance(4000); assert.equal(e.api.state(), false);
  e.api.setDark(true); e.advance(999); assert.equal(e.api.state(), false);
  e.advance(1); assert.equal(e.api.state(), true);
  e = engine({ enabled: true, siteOverrides: { 'example.test': true } });
  e.change('enabled', false); e.load(); e.advance(10000);
  assert.equal(e.api.state(), false, 'Stale initial get must not undo disable');
  e = engine({ enabled: true, siteOverrides: { 'example.test': true } });
  e.change('siteOverrides', { 'example.test': false }); e.load();
  assert.equal(e.api.state(), false, 'Stale initial get must not undo Never');
}

async function checkInjection() {
  let state;
  let reloads = 0, injections = 0;
  const noop = () => {};
  const context = {
    chrome: {
      runtime: { getManifest: () => ({ version: '1.4.5' }), onInstalled: { addListener: noop }, onMessage: { addListener: noop } },
      storage: { sync: { get: (_, cb) => cb({ enabled: true, siteOverrides: {} }) } },
      tabs: { query: async () => [], reload: async () => reloads++ },
      scripting: {
        insertCSS: async () => {},
        executeScript: async request => {
          if (!request.func) {
            assert.deepEqual(Array.from(request.files), ['domain.js', 'content.js']);
            injections++; return [];
          }
          const scope = {
            expectedVersion: request.args[0],
            window: { __darkifyContentVersion: state.live },
            document: { documentElement: {
              getAttribute: () => state.dom,
              classList: { contains: () => state.legacy }
            }, querySelector: () => state.legacy ? {} : null }
          };
          return [{ frameId: 0, result: vm.runInNewContext(`(${request.func})(expectedVersion)`, scope) }];
        }
      }
    }
  };
  vm.createContext(context); vm.runInContext(background, context);
  for (const row of [
    { live: null, dom: null, legacy: false, reload: 0, inject: 1 },
    { live: '1.4.5', dom: '1.4.5', legacy: true, reload: 0, inject: 0 },
    { live: null, dom: '1.4.5', legacy: false, reload: 1, inject: 0 },
    { live: null, dom: '1.4.5', legacy: true, reload: 1, inject: 0 },
    { live: '1.4.4', dom: '1.4.4', legacy: true, reload: 1, inject: 0 },
    { live: null, dom: null, legacy: true, reload: 1, inject: 0 }
  ]) {
    state = row; reloads = 0; injections = 0;
    await context.injectIntoTab(1, '1.4.5');
    assert.equal(reloads, row.reload, JSON.stringify(row));
    assert.equal(injections, row.inject, JSON.stringify(row));
  }
}

function checkDomains() {
  for (const [hostname, expected] of [
    ['my.tau.ac.il', 'tau.ac.il'], ['moodle.tau.ac.il', 'tau.ac.il'],
    ['a.b.example.co.uk', 'example.co.uk'], ['www.example.com', 'example.com'],
    ['alice.github.io', 'alice.github.io'], ['bob.github.io', 'bob.github.io'],
    ['a.foo.blogspot.com', 'foo.blogspot.com'], ['a.b.ck', 'a.b.ck'],
    ['a.www.ck', 'www.ck'], ['WWW.EXAMPLE.COM.', 'example.com'],
    ['localhost', 'localhost'], ['127.0.0.1', '127.0.0.1'], ['[::1]', '[::1]'],
    ['www.食狮.com.cn', 'xn--85x722f.com.cn']
  ]) assert.equal(DarkifyDomains.domain(hostname), expected, hostname);
  const old = { 'my.tau.ac.il': true, 'moodle.tau.ac.il': false };
  assert.equal(DarkifyDomains.overrides(old)['tau.ac.il'], false);
  assert.equal(DarkifyDomains.overrides({ ...old, 'tau.ac.il': true })['tau.ac.il'], true);
  let storage = { enabled: true, siteOverrides: old };
  let url = 'https://my.tau.ac.il/first?page=1';
  const elements = Object.fromEntries(['globalToggle', 'siteMode', 'siteName', 'siteWarning'].map(id => [id, {
    checked: true, value: '', style: {}, classList: { toggle() {} },
    addEventListener(event, fn) { this[event] = fn; }
  }]));
  const popupContext = {
    URL, DarkifyDomains, document: { getElementById: id => elements[id] },
    chrome: {
      tabs: { query: (_, cb) => cb([{ url }]) },
      storage: { sync: { get: (_, cb) => cb(storage), set: value => Object.assign(storage, value) } }
    }
  };
  vm.createContext(popupContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8'), popupContext);
  assert.equal(elements.siteName.textContent, 'tau.ac.il');
  assert.equal(elements.siteMode.value, 'off');
  elements.siteMode.value = 'on'; elements.siteMode.change();
  assert.deepEqual(Object.keys(storage.siteOverrides), ['tau.ac.il']);
  url = 'https://moodle.tau.ac.il/another/path'; popupContext.load();
  assert.equal(elements.siteMode.value, 'on');
  elements.siteMode.value = 'auto'; elements.siteMode.change();
  assert.deepEqual(Object.keys(storage.siteOverrides), []);
  const e = engine({ enabled: true, siteOverrides: { 'sub.example.test': false } });
  e.load(); e.advance(1000); assert.equal(e.api.state(), false);
  e.change('siteOverrides', { 'other.example.test': true }); assert.equal(e.api.state(), true);
}

function checkFonts() {
  let source = 'url("font.eot?version=1"),url("font.woff") format("woff")';
  let writes = 0;
  const context = { document: { styleSheets: [{ cssRules: [{ type: 5, style: {
    getPropertyValue: () => source,
    setProperty: (_, value) => { writes++; source = value; }
  } }] }] } };
  vm.createContext(context);
  vm.runInContext(`let settings={enabled:true,siteOverrides:{}};const host='example.test';
    ${between('  function repairLegacyFontSources()', '  function getVisibleBackgroundLuminance')}
    this.repair=repairLegacyFontSources;this.mode=(enabled,never)=>{settings.enabled=enabled;settings.siteOverrides=never?{[host]:false}:{}};`, context);
  context.repair(); assert.match(source, /embedded-opentype/);
  const corrected = source;
  for (let cycle = 0; cycle < 10; cycle++) {
    for (const [enabled, never] of [[false,false],[true,false],[true,true],[true,false]]) {
      context.mode(enabled, never); context.repair();
      assert.equal(source, corrected, 'Mode changes must never reintroduce unsupported EOT');
    }
  }
  assert.equal(writes, 1, 'Correction must be idempotent across mode cycles');
  for (const untouched of ['url("only.eot?x=1")', 'url("modern.woff2") format("woff2")', 'url("typed.eot") format("embedded-opentype"),url("modern.ttf") format("truetype")']) {
    source = untouched; context.repair(); assert.equal(source, untouched);
  }
}

(async () => {
  checkTransitions(); await checkInjection(); checkFonts(); checkDomains();
  console.log('PASS: startup/settings races, mode transitions, exact Auto grace, native theme priority, same-version reload recovery, upgrade/fresh injection, persistent font correction, domain grouping and popup preferences');
})().catch(error => { console.error(error); process.exitCode = 1; });
