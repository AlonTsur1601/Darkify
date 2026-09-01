# Darkify

Darkify is a Chrome extension that forces a natural-looking dark mode on light
websites when the operating system uses dark mode. It leaves sites that already
look dark alone and supports a manual per-site override.

## Install from GitHub

1. On this repository page, select **Code → Download ZIP**. You can also
   download the newest `Darkify-v*.zip` from the GitHub Releases page.
2. Extract the downloaded ZIP to a permanent folder. Do not select the ZIP
   itself in Chrome and do not delete the extracted folder after installation.
3. Open a new Chrome tab and enter `chrome://extensions` in the address bar.
4. Turn on **Developer mode** using the switch in the upper-right corner of the
   Extensions page.
5. Select **Load unpacked** in the upper-left corner.
6. In the folder picker, choose the extracted folder that directly contains
   `manifest.json`, `content.js` and `background.js`.
7. Confirm that the **Darkify** card appears and that its version matches the
   latest release. Darkify now runs automatically on eligible websites when
   the operating system prefers dark mode.

You can pin Darkify from Chrome's puzzle-piece menu to quickly enable or
disable it globally or set an override for the current website.

### Updating an unpacked installation

Chrome does not automatically update unpacked extensions. Download a newer
release and replace the extracted files when you want to update Darkify, then
open `chrome://extensions` and click **Reload** on the Darkify card. Existing
tabs running an older Darkify version are refreshed once so that an old content
script cannot remain active alongside the new one.

## How it works

- Light pages are darkened only when the system prefers dark mode.
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
- Some cross-origin images cannot be inspected pixel-by-pixel; Darkify keeps
  those images unchanged rather than risking a photographic negative.
- Unpacked extensions must be updated manually.

## Development

There is no build step. Load this directory as an unpacked Manifest V3
extension, edit the source, then reload the extension and the page under test.

## Privacy

Darkify does not collect or transmit browsing data. See [PRIVACY.md](PRIVACY.md).
