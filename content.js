(() => {
  const ACTIVE_CLASS = '__force-dark-active__';
  const HIDDEN_IMAGE_CLASS = '__fd_image_replaced__';
  const OVERLAY_ID = '__fd_overlay__';
  const MEDIA_LAYER_ID = '__fd_media_layer__';
  const host = location.hostname;

  let settings = { enabled: true, siteOverrides: {} };
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const protectedEls = new Set();
  const imageStates = new Map();
  const backgroundEls = new Set();
  const ALWAYS_PROTECT_SELECTOR = 'video, canvas, svg image, iframe, embed, object';

  let overlayEl = null;
  let mediaLayerEl = null;
  let rafScheduled = false;

  function getLuminance(rgbString) {
    if (!rgbString) return null;
    const match = rgbString.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map(part => parseFloat(part.trim()));
    const [r, g, b, a] = parts;
    if (a === 0) return null;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function siteLooksAlreadyDark() {
    let background = null;
    if (document.body) background = getLuminance(getComputedStyle(document.body).backgroundColor);
    if (background === null) background = getLuminance(getComputedStyle(document.documentElement).backgroundColor);
    return background !== null && background < 0.4;
  }

  function shouldForceDark() {
    const override = settings.siteOverrides[host];
    if (override === false) return false;
    if (override === true) return true;
    if (!settings.enabled || !darkModeQuery.matches) return false;
    return !siteLooksAlreadyDark();
  }

  function ensureVisualLayers() {
    if (!overlayEl || !overlayEl.isConnected) {
      overlayEl = document.createElement('div');
      overlayEl.id = OVERLAY_ID;
      (document.body || document.documentElement).appendChild(overlayEl);
    }
    if (!mediaLayerEl || !mediaLayerEl.isConnected) {
      mediaLayerEl = document.createElement('div');
      mediaLayerEl.id = MEDIA_LAYER_ID;
      (document.body || document.documentElement).appendChild(mediaLayerEl);
    }
  }

  function removeVisualLayers() {
    overlayEl?.remove();
    mediaLayerEl?.remove();
    overlayEl = null;
    mediaLayerEl = null;
  }

  function protect(el) {
    if (!el || protectedEls.has(el)) return;
    protectedEls.add(el);
    scheduleVisualUpdate();
  }

  function unprotect(el) {
    if (protectedEls.delete(el)) scheduleVisualUpdate();
  }

  function scheduleVisualUpdate() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      updateClipPath();
      updateImageReplicas();
    });
  }

  function updateClipPath() {
    if (!overlayEl) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let path = `M0,0 H${viewportWidth} V${viewportHeight} H0 Z`;
    protectedEls.forEach(el => {
      if (!el.isConnected) {
        protectedEls.delete(el);
        backgroundEls.delete(el);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      if (rect.right < 0 || rect.bottom < 0 || rect.left > viewportWidth || rect.top > viewportHeight) return;
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(viewportWidth, rect.right);
      const bottom = Math.min(viewportHeight, rect.bottom);
      path += ` M${left},${top} H${right} V${bottom} H${left} Z`;
    });
    overlayEl.style.clipPath = `path(evenodd, '${path}')`;
    overlayEl.style.webkitClipPath = `path(evenodd, '${path}')`;
  }

  function percentile(values, fraction) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  }

  // Neutral UI assets should invert with the page, but grayscale photographs
  // must stay unchanged. This checks color outliers, tonal complexity,
  // transparency and source dimensions instead of average saturation alone.
  function isMonochromeImage(img) {
    try {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return false;
      context.drawImage(img, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      const chromaValues = [];
      const luminanceBins = new Set();
      let visible = 0;
      let transparent = 0;
      let colored = 0;
      let nearExtremes = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = pixels[index + 3];
        if (alpha < 24) {
          transparent++;
          continue;
        }
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
        visible++;
        chromaValues.push(chroma);
        luminanceBins.add(Math.min(15, Math.floor(luminance / 16)));
        if (chroma > 22) colored++;
        if (luminance < 42 || luminance > 213) nearExtremes++;
      }

      if (!visible) return true;
      const coloredRatio = colored / visible;
      const transparentRatio = transparent / (visible + transparent);
      const extremeRatio = nearExtremes / visible;
      const neutral = coloredRatio <= 0.025 && percentile(chromaValues, 0.95) <= 18;
      if (!neutral) return false;
      const smallAsset = img.naturalWidth <= 192 && img.naturalHeight <= 192;
      const simpleTones = luminanceBins.size <= 6;
      const iconLike = transparentRatio >= 0.08 || extremeRatio >= 0.72;
      return simpleTones || (smallAsset && iconLike);
    } catch (error) {
      // A cross-origin canvas can be unreadable. Preserve unknown images rather
      // than risk turning a photograph into a negative.
      return false;
    }
  }

  function getCumulativeOpacity(el) {
    let opacity = 1;
    for (let current = el; current?.nodeType === 1; current = current.parentElement) {
      const value = parseFloat(getComputedStyle(current).opacity);
      if (Number.isFinite(value)) opacity *= value;
    }
    return opacity;
  }

  function getVisibleRect(el, rect) {
    const visible = {
      left: Math.max(0, rect.left),
      top: Math.max(0, rect.top),
      right: Math.min(window.innerWidth, rect.right),
      bottom: Math.min(window.innerHeight, rect.bottom)
    };
    for (let ancestor = el.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = /(hidden|clip|auto|scroll)/.test(style.overflowX);
      const clipsY = /(hidden|clip|auto|scroll)/.test(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const ancestorRect = ancestor.getBoundingClientRect();
      if (clipsX) {
        visible.left = Math.max(visible.left, ancestorRect.left);
        visible.right = Math.min(visible.right, ancestorRect.right);
      }
      if (clipsY) {
        visible.top = Math.max(visible.top, ancestorRect.top);
        visible.bottom = Math.min(visible.bottom, ancestorRect.bottom);
      }
    }
    return visible;
  }

  function createImageState(img, computedStyle) {
    ensureVisualLayers();
    const wrapper = document.createElement('div');
    wrapper.className = '__fd_image_replica__';
    const replica = document.createElement('img');
    replica.alt = '';
    replica.setAttribute('aria-hidden', 'true');
    replica.decoding = 'async';
    wrapper.appendChild(replica);
    mediaLayerEl.appendChild(wrapper);

    const state = { wrapper, replica, source: img.currentSrc || img.src };
    replica.src = state.source;
    replica.style.objectFit = computedStyle.objectFit;
    replica.style.objectPosition = computedStyle.objectPosition;
    replica.style.borderRadius = computedStyle.borderRadius;
    replica.style.clipPath = computedStyle.clipPath;
    replica.style.filter = computedStyle.filter;
    replica.style.mixBlendMode = computedStyle.mixBlendMode;
    replica.style.opacity = String(getCumulativeOpacity(img));
    img.classList.add(HIDDEN_IMAGE_CLASS);
    imageStates.set(img, state);
  }

  function removeImageState(img) {
    imageStates.get(img)?.wrapper.remove();
    imageStates.delete(img);
    img.classList.remove(HIDDEN_IMAGE_CLASS);
  }

  function processImage(img, force = false) {
    if (!(img instanceof HTMLImageElement) || img.closest(`#${MEDIA_LAYER_ID}`)) return;
    const run = () => {
      if (!document.documentElement.classList.contains(ACTIVE_CLASS)) return;
      const source = img.currentSrc || img.src;
      const signature = `${source}|${img.naturalWidth}x${img.naturalHeight}`;
      if (!force && img.dataset.fdImageSignature === signature) return;
      img.dataset.fdImageSignature = signature;
      removeImageState(img);
      if (!source || isMonochromeImage(img)) return;
      createImageState(img, getComputedStyle(img));
      scheduleVisualUpdate();
    };
    if (img.complete && img.naturalWidth) run();
    else img.addEventListener('load', run, { once: true });
  }

  function updateImageReplicas() {
    if (!mediaLayerEl) return;
    imageStates.forEach((state, img) => {
      if (!img.isConnected) {
        removeImageState(img);
        return;
      }
      const rect = img.getBoundingClientRect();
      const visible = getVisibleRect(img, rect);
      const width = visible.right - visible.left;
      const height = visible.bottom - visible.top;
      if (rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) {
        state.wrapper.style.display = 'none';
        return;
      }
      state.wrapper.style.display = 'block';
      state.wrapper.style.left = `${visible.left}px`;
      state.wrapper.style.top = `${visible.top}px`;
      state.wrapper.style.width = `${width}px`;
      state.wrapper.style.height = `${height}px`;
      state.replica.style.left = `${rect.left - visible.left}px`;
      state.replica.style.top = `${rect.top - visible.top}px`;
      state.replica.style.width = `${rect.width}px`;
      state.replica.style.height = `${rect.height}px`;
    });
  }

  function checkBackgroundImage(el) {
    if (!(el instanceof Element) || el.id === OVERLAY_ID || el.id === MEDIA_LAYER_ID) return;
    try {
      const hasImage = getComputedStyle(el).backgroundImage.includes('url(');
      if (hasImage) {
        backgroundEls.add(el);
        protect(el);
      } else if (backgroundEls.delete(el) && !el.matches(ALWAYS_PROTECT_SELECTOR)) {
        unprotect(el);
      }
    } catch (error) {
      // Detached elements can be ignored until a later scan.
    }
  }

  function protectAlways(root) {
    if (root.matches?.(ALWAYS_PROTECT_SELECTOR)) protect(root);
    root.querySelectorAll?.(ALWAYS_PROTECT_SELECTOR).forEach(protect);
  }

  function scanSubtree(root) {
    if (!(root instanceof Element) || root.id === OVERLAY_ID || root.closest(`#${MEDIA_LAYER_ID}`)) return;
    protectAlways(root);
    checkBackgroundImage(root);
    root.querySelectorAll('*').forEach(checkBackgroundImage);
    if (root.matches('img')) processImage(root);
    root.querySelectorAll('img').forEach(img => processImage(img));
  }

  function externalClassChanged(mutation) {
    const normalize = value => (value || '')
      .split(/\s+/)
      .filter(name => name && name !== HIDDEN_IMAGE_CLASS)
      .sort()
      .join(' ');
    return normalize(mutation.oldValue) !== normalize(mutation.target.className);
  }

  function clearProcessedState() {
    imageStates.forEach((state, img) => {
      state.wrapper.remove();
      img.classList.remove(HIDDEN_IMAGE_CLASS);
      delete img.dataset.fdImageSignature;
    });
    imageStates.clear();
    protectedEls.clear();
    backgroundEls.clear();
  }

  function apply() {
    const active = shouldForceDark();
    document.documentElement.classList.toggle(ACTIVE_CLASS, active);
    if (active) {
      ensureVisualLayers();
      scanSubtree(document.documentElement);
      scheduleVisualUpdate();
    } else {
      clearProcessedState();
      removeVisualLayers();
    }
  }

  function scheduleApply() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
    else apply();
    window.addEventListener('load', apply, { once: true });
  }

  const observer = new MutationObserver(mutations => {
    if (!document.documentElement.classList.contains(ACTIVE_CLASS)) return;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) scanSubtree(node);
        });
      } else if (mutation.target instanceof HTMLImageElement) {
        const appearanceChanged = ['src', 'srcset', 'style'].includes(mutation.attributeName)
          || (mutation.attributeName === 'class' && externalClassChanged(mutation));
        processImage(mutation.target, appearanceChanged);
      } else if (mutation.target instanceof Element) {
        checkBackgroundImage(mutation.target);
      }
    }
    scheduleVisualUpdate();
  });

  function startObserving() {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'style', 'src', 'srcset'],
      childList: true,
      subtree: true
    });
  }

  window.addEventListener('scroll', scheduleVisualUpdate, { passive: true, capture: true });
  window.addEventListener('resize', scheduleVisualUpdate, { passive: true });
  darkModeQuery.addEventListener('change', apply);

  chrome.storage.sync.get(['enabled', 'siteOverrides'], data => {
    if (typeof data.enabled === 'boolean') settings.enabled = data.enabled;
    if (data.siteOverrides) settings.siteOverrides = data.siteOverrides;
    scheduleApply();
    startObserving();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.siteOverrides) settings.siteOverrides = changes.siteOverrides.newValue || {};
    apply();
  });
})();
