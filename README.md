# Darkify

Darkify is a Chrome extension that forces a natural-looking dark mode on light
websites when the operating system uses dark mode. It leaves sites that already
look dark alone and supports a manual per-site override.

## Install from GitHub

1. Download the latest source ZIP from **Code → Download ZIP** (or download a
   packaged ZIP from the GitHub Releases page when one is available).
2. Extract the ZIP to a permanent folder.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the folder that contains `manifest.json`.

Chrome does not automatically update unpacked extensions. Download a newer
release and replace the extracted files when you want to update Darkify, then
click **Reload** on its card in `chrome://extensions`.

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
