# Darkify

Darkify is a Chrome extension that forces a natural-looking dark mode on light
websites when the operating system uses dark mode. It leaves sites that already
look dark alone and supports a manual per-site override.

## Install from GitHub

These instructions are for desktop Google Chrome. Installation is free and
does not require the Chrome Web Store, a developer account, Node.js, npm or a
build command. Load only a copy you trust: Darkify requests website access so
it can read and change page styling.

### 1. Download and extract the files

1. Open [the Darkify repository](https://github.com/AlonTsur1601/Darkify).
2. Above the file list, select **Code**, then **Download ZIP**. This downloads
   the current source; a separately published release ZIP is not required.
3. Find the downloaded ZIP in your Downloads folder. On Windows, right-click
   it, select **Extract All**, choose a permanent destination, then **Extract**.
   On other desktop systems, use the system's archive extraction action.
4. Open the extracted folder. GitHub usually calls it `Darkify-main`. If it
   contains another folder of that name, open that inner folder too.
5. Find the folder that directly contains the following files:

   ```text
   Darkify-main/
     manifest.json
     background.js
     content.js
     dark.css
     popup.html
     popup.js
     icons/
   ```

   Keep the whole folder, including `icons`. Do not open or edit `manifest.json`
   to install the extension. Do not choose the ZIP, an individual file, the
   `icons` folder, or a parent folder that merely contains `Darkify-main`.

Chrome uses these files where you put them. Keep the extracted folder in place;
deleting or moving it later can break the installation. The downloaded ZIP
itself is no longer needed once extraction is complete.

### 2. Load the folder in Chrome

1. Open Chrome in the browser profile where you want Darkify installed.
2. Open a new tab, type `chrome://extensions/` in the address bar and press
   **Enter**. Type this address in the address bar, not into Google search.
3. Turn on the switch labelled **Developer mode** (**מצב פיתוח**). Button
   positions can differ between left-to-right and right-to-left interfaces.
4. Select **Load unpacked** (**טעינת פריט Unpacked** in the Hebrew interface).
   This button appears after Developer mode is enabled.
5. In the folder picker, navigate to the extracted folder identified above.
   Select that folder and confirm with **Select Folder**, **Open**, or your
   system's equivalent. Select the folder, not `manifest.json` itself.
6. A **Darkify** card should appear. Confirm that its switch is on and that
   the displayed version matches the `version` in the downloaded `manifest.json`.

Do not use **Pack extension**: it is not needed for this installation. Keep
Developer mode enabled for this unpacked development installation. Chrome's
normal warning that an extension is loaded in developer mode does not mean
installation failed.

These Chrome steps follow the
[official unpacked-extension instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

### 3. Open the controls and check that it works

1. Open Chrome's puzzle-piece **Extensions** menu beside the address bar.
2. Find **Darkify** and click its pin icon if you want it permanently visible
   in the toolbar. Pinning is optional; the extension also works without it.
3. Switch to an ordinary `https://` website, then click Darkify's icon. Do not
   test on the Extensions page: Chrome blocks page modification there.
4. Turn on **Extension enabled** in Darkify's popup. This is separate from
   Chrome's own switch on the extension card; both must be on.
5. Choose the mode under **For this site:**

   - **Automatic**: when the system prefers dark mode, wait 3 seconds and
     darken the page only if it still looks light. An already-dark website
     is left alone. With a light system theme, Automatic does not darken it.
   - **Always force dark**: apply immediately, regardless of the system theme.
     Use this on a light website to verify the installation without changing
     your system's theme.
   - **Never touch**: do not darken this hostname.

6. To test disabling, turn **Extension enabled** off. Darkify's styling should
   disappear even if **Always force dark** was selected. The site selection
   is retained and dimmed for the next time you enable the extension.
7. Restore the site mode you prefer after testing.

Site choices apply to the hostname shown in the popup, not to every website.
For example, `my.tau.ac.il` and another TAU subdomain are separate choices.
Darkify can also run in eligible tabs that were already open.

### Updating an unpacked installation

Chrome does not automatically update a folder installed with **Load unpacked**.
Changing files on disk, updating this repository, or refreshing a website is
not a substitute for reloading the extension.

1. Save any unsent forms or work in open tabs before updating: Darkify may
   refresh tabs once to replace disconnected or older content scripts.
2. Download a fresh source ZIP and extract it as described above. If you use
   Git instead, update the checkout you originally loaded into Chrome.
3. Replace the extension files in the **same permanent folder Chrome already
   loads**. Do not accidentally create a new nested `Darkify-main` inside it.
   Replace all extension files together; do not mix versions or keep only a
   new `content.js` with an old `background.js`.
4. Open `chrome://extensions/`. With Developer mode on, click the circular
   **Reload** arrow on the **Darkify card**. This is not the browser's Reload
   button and not the **Update** button at the top of the Extensions page.
5. Verify the card's version against `manifest.json`, then test on a normal
   website. Reload that website manually if it still shows older behavior.

Tabs running a disconnected Darkify instance are refreshed once, even when the
version number is unchanged, so stale content scripts cannot ignore new
preferences or remain active alongside the new instance. Updating in the same
loaded folder and Chrome profile preserves the stored preferences.

If you moved the installation folder, remove the old Darkify card and use
**Load unpacked** with the new folder. Removal can discard its preferences.
Do not leave multiple Darkify copies enabled, as they may interfere with one
another. Each Chrome profile needs its own local installation.

### Installation and update troubleshooting

- **Load unpacked is missing:** enable Developer mode first. If it is disabled
  by a work/school browser policy, ask the administrator; these instructions
  do not bypass that policy.
- **Manifest missing or unreadable:** extract the ZIP, then choose the folder
  containing `manifest.json` directly. Check that the file was not renamed
  to `manifest.json.txt`, and that you downloaded the whole repository.
- **A script, stylesheet or icon is missing:** extract the complete ZIP again;
  do not load only the files that happen to be visible at the repository root.
- **The card still shows an older version:** check which folder you originally
  loaded. Replace files there, then click the card's Reload arrow. Downloading
  or extracting a newer copy elsewhere does not update the installed copy.
- **Darkify is installed but does not affect a website:** check both enable
  switches, the current site's mode and, for Automatic, the system theme and
  3-second wait. In the extension's **Details**, check its **Site access**;
  it needs access to the website being tested. To use it across websites,
  allow it on all sites, or grant access only to the sites you prefer.
- **Testing a restricted page:** Chrome internal pages (`chrome://...`), other
  extensions' pages and the Chrome Web Store cannot be styled by Darkify.
  Test on an ordinary website instead.
- **Local files or private windows:** if you specifically need these, enable
  **Allow access to file URLs** or **Allow in Incognito** in Darkify's Details,
  respectively. These are separate, optional permissions, not installation steps.
- **An Errors badge remains after an update:** error history is retained. Open
  **Errors**, record any relevant message, then **Clear all** (**ניקוי הכול**)
  and reproduce the problem. Clearing history is not a fix. If a new error
  appears, report its message, source line, website, extension version and mode;
  do not include credentials or private page content.
- **Behavior appears doubled or preferences do not take effect:** check for
  duplicate Darkify cards, reload the intended installation, then refresh the
  affected website. Do not keep an old copy enabled next to the updated one.

## How it works

- Light pages are darkened only when the system prefers dark mode.
- Auto waits 3 seconds before checking whether the page still needs darkening,
  giving the website's native automatic dark theme priority. Always force dark
  applies immediately; disabling Darkify cancels any pending wait.
- Document colors are rewritten in place across the entire page; Darkify does
  not use a viewport-sized inversion overlay.
- Color images and transparent images remain in their original DOM position
  without a double inversion or a fixed-position copy.
- Simple neutral icons are darkened with the page, while grayscale photographs
  remain unchanged.
- Videos, canvases, embedded content and CSS image backgrounds retain their
  original appearance while their surrounding UI is darkened.
- The popup can enable or disable Darkify globally or override one hostname.
- Installing, updating or reloading Darkify also activates it in eligible tabs
  that were already open; those pages do not need to be refreshed manually.
- Local dark widgets, authored glow/shadow colors, hover states and pages restored
  from a background tab are re-evaluated without re-lightening the whole page.
- Text is adjusted to at least a 4.5:1 contrast ratio and visible borders/icons
  to at least 3:1 against their final local background.
- Monochrome images are inverted only when that improves contrast; their dominant
  tone is kept at 3:1 or better against the surrounding surface.

## Limitations

- Chrome blocks extensions on internal pages such as `chrome://extensions`.
- Small cross-origin images are inspected using a bounded, cached copy fetched
  by the extension. Large, inaccessible or undecodable images stay unchanged
  rather than risking a photographic negative.
- Unpacked extensions must be updated manually.

## Development

There is no build step. Load this directory as an unpacked Manifest V3
extension, edit the source, then reload the extension and the page under test.

Run `node tests/regression.cjs` to check mode transitions, the Auto grace period,
startup preference races, same-version reload recovery and font-rule failures.

## Privacy

Darkify does not collect or transmit browsing data. See [PRIVACY.md](PRIVACY.md).
