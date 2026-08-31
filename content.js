(() => {
  const contentVersion = chrome.runtime.getManifest().version;
  if (window.__darkifyContentVersion === contentVersion) return;
  window.__darkifyContentVersion = contentVersion;

  const ACTIVE_CLASS = '__force-dark-active__';
  const ADJUSTED_CLASS = '__fd_color_adjusted__';
  const MONOCHROME_CLASS = '__fd_monochrome_image__';
  const host = location.hostname;
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const INTERNAL_PROPERTIES = [
    '--fd-bg', '--fd-color', '--fd-border-top', '--fd-border-right',
    '--fd-border-bottom', '--fd-border-left', '--fd-outline', '--fd-decoration',
    '--fd-shadow', '--fd-text-shadow', '--fd-bg-image', '--fd-fill', '--fd-stroke',
    '--fd-caret', '--fd-column-rule', '--fd-accent',
    '--fd-before-bg', '--fd-before-color', '--fd-before-border',
    '--fd-before-shadow', '--fd-before-text-shadow', '--fd-before-bg-image',
    '--fd-after-bg', '--fd-after-color', '--fd-after-border',
    '--fd-after-shadow', '--fd-after-text-shadow', '--fd-after-bg-image',
    '--fd-original-filter'
  ];

  let settings = { enabled: true, siteOverrides: {} };
  let active = false;
  let workScheduled = false;
  let urgentUntil = 0;
  const queuedElements = new Set();
  const adjustedElements = new Set();
  const observedRoots = new WeakSet();
  const originalStyles = new WeakMap();
  const internalAttributeStates = new WeakMap();

  function parseColor(value) {
    if (!value || value === 'transparent') return null;
    const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
      const numbers = rgbMatch[1].match(/[\d.]+/g)?.map(Number) || [];
      if (numbers.length < 3) return null;
      return {
        r: numbers[0],
        g: numbers[1],
        b: numbers[2],
        a: numbers.length > 3 ? numbers[3] : 1
      };
    }
    const hexMatch = value.match(/^#([\da-f]{3,8})$/i);
    if (!hexMatch) return null;
    let hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(char => char + char).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }

  function rgbToHsl({ r, g, b }) {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) / 2;
    if (maximum === minimum) return { h: 0, s: 0, l: lightness };
    const difference = maximum - minimum;
    const saturation = lightness > 0.5
      ? difference / (2 - maximum - minimum)
      : difference / (maximum + minimum);
    let hue;
    if (maximum === red) hue = (green - blue) / difference + (green < blue ? 6 : 0);
    else if (maximum === green) hue = (blue - red) / difference + 2;
    else hue = (red - green) / difference + 4;
    return { h: hue / 6, s: saturation, l: lightness };
  }

  function hslToRgb({ h, s, l }, alpha) {
    let red;
    let green;
    let blue;
    if (s === 0) {
      red = green = blue = l;
    } else {
      const hueToRgb = (p, q, t) => {
        let hue = t;
        if (hue < 0) hue += 1;
        if (hue > 1) hue -= 1;
        if (hue < 1 / 6) return p + (q - p) * 6 * hue;
        if (hue < 1 / 2) return q;
        if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      red = hueToRgb(p, q, h + 1 / 3);
      green = hueToRgb(p, q, h);
      blue = hueToRgb(p, q, h - 1 / 3);
    }
    const r = Math.round(red * 255);
    const g = Math.round(green * 255);
    const b = Math.round(blue * 255);
    return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
  }

  function relativeLuminance({ r, g, b }) {
    const linear = value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  }

  function chroma({ r, g, b }) {
    return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  }

  function contrastRatio(firstLuminance, secondLuminance) {
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function compositedLuminance(color, backgroundLuminance) {
    const alpha = Number.isFinite(color.a) ? color.a : 1;
    return relativeLuminance(color) * alpha + backgroundLuminance * (1 - alpha);
  }

  function ensureContrast(value, backgroundLuminance, minimumRatio) {
    const color = parseColor(value);
    if (!color || backgroundLuminance === null) return value;
    if (contrastRatio(compositedLuminance(color, backgroundLuminance), backgroundLuminance) >= minimumRatio) return value;
    const hsl = rgbToHsl(color);
    const towardLight = backgroundLuminance < 0.45;
    let lowerFraction = 0;
    let upperFraction = 1;
    let best = null;
    for (let step = 0; step < 10; step++) {
      const fraction = (lowerFraction + upperFraction) / 2;
      const candidate = {
        h: hsl.h,
        s: Math.min(hsl.s, 0.72),
        l: hsl.l + ((towardLight ? 0.96 : 0.04) - hsl.l) * fraction
      };
      const rendered = hslToRgb(candidate, color.a);
      const renderedColor = parseColor(rendered);
      if (
        renderedColor
        && contrastRatio(compositedLuminance(renderedColor, backgroundLuminance), backgroundLuminance) >= minimumRatio
      ) {
        best = rendered;
        upperFraction = fraction;
      } else {
        lowerFraction = fraction;
      }
    }
    if (best) return best;
    return towardLight
      ? hslToRgb({ h: hsl.h, s: Math.min(hsl.s, 0.45), l: 0.96 }, 1)
      : hslToRgb({ h: hsl.h, s: Math.min(hsl.s, 0.45), l: 0.04 }, 1);
  }

  function transformBackground(value) {
    const color = parseColor(value);
    if (!color || color.a === 0) return null;
    const hsl = rgbToHsl(color);
    if (hsl.l <= 0.24) return value;
    if (chroma(color) >= 0.22) {
      hsl.l = Math.min(0.42, Math.max(0.18, hsl.l > 0.58 ? 0.36 : hsl.l));
      hsl.s = Math.min(hsl.s, 0.68);
    } else {
      hsl.l = 0.10 + (1 - hsl.l) * 0.26;
      hsl.s = Math.min(0.06, hsl.s * 0.25);
    }
    return hslToRgb(hsl, color.a);
  }

  function transformForeground(value, backgroundLuminance = null) {
    const color = parseColor(value);
    if (!color || color.a === 0) return null;
    if (
      backgroundLuminance !== null
      && contrastRatio(compositedLuminance(color, backgroundLuminance), backgroundLuminance) >= 4.5
    ) return value;
    const hsl = rgbToHsl(color);
    if (chroma(color) >= 0.20) {
      hsl.l = Math.max(0.64, Math.min(0.82, hsl.l));
      hsl.s = Math.min(hsl.s, 0.72);
    } else {
      hsl.l = 0.82 + (0.62 - hsl.l) * 0.10;
      hsl.s = Math.min(0.05, hsl.s * 0.25);
    }
    return ensureContrast(hslToRgb(hsl, color.a), backgroundLuminance, 4.5);
  }

  function transformBorder(value, backgroundLuminance = null) {
    const color = parseColor(value);
    if (!color || color.a === 0) return null;
    if (
      backgroundLuminance !== null
      && contrastRatio(compositedLuminance(color, backgroundLuminance), backgroundLuminance) >= 3
    ) return value;
    const hsl = rgbToHsl(color);
    if (chroma(color) >= 0.20) {
      hsl.l = Math.max(0.38, Math.min(0.58, hsl.l));
    } else {
      hsl.l = Math.max(0.24, Math.min(0.36, hsl.l));
      hsl.s = Math.min(0.04, hsl.s * 0.2);
    }
    return ensureContrast(hslToRgb(hsl, color.a), backgroundLuminance, 3);
  }

  function rewriteColors(value, transform) {
    if (!value || value === 'none') return null;
    let changed = false;
    const rewritten = value.replace(/rgba?\([^)]+\)|#[\da-f]{3,8}\b/gi, match => {
      const replacement = transform(match);
      if (!replacement || replacement === match) return match;
      changed = true;
      return replacement;
    });
    return changed ? rewritten : null;
  }

  function shadowNeedsColorFreeze(shadow, colorValue) {
    const color = parseColor(colorValue);
    return Boolean(
      shadow
      && shadow !== 'none'
      && color
      && relativeLuminance(color) < 0.25
      && shadow.includes(colorValue)
    );
  }

  function getVisibleBackgroundLuminance(element) {
    for (let current = element; current; current = current.parentElement) {
      const color = parseColor(getComputedStyle(current).backgroundColor);
      if (color && color.a > 0.2) return relativeLuminance(color);
    }
    return null;
  }

  function siteLooksAlreadyDark() {
    const samples = [];
    const candidates = [document.documentElement, document.body].filter(Boolean);
    if (document.body) {
      const points = [
        [8, 8],
        [window.innerWidth / 2, 8],
        [window.innerWidth / 2, window.innerHeight / 2],
        [8, window.innerHeight / 2]
      ];
      points.forEach(([x, y]) => {
        const element = document.elementFromPoint(Math.max(0, x), Math.max(0, y));
        if (element) candidates.push(element);
      });
    }
    candidates.forEach(element => {
      const luminance = getVisibleBackgroundLuminance(element);
      if (luminance !== null) samples.push(luminance);
    });
    if (!samples.length) return false;
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] < 0.18;
  }

  function shouldForceDark() {
    const override = settings.siteOverrides[host];
    if (override === false) return false;
    if (override === true) return true;
    if (!settings.enabled || !darkModeQuery.matches) return false;
    if (active) return true;
    return !siteLooksAlreadyDark();
  }

  function removeInternalStyles(element) {
    element.classList.remove(ADJUSTED_CLASS, MONOCHROME_CLASS);
    INTERNAL_PROPERTIES.forEach(property => element.style.removeProperty(property));
  }

  function rememberInternalAttributeState(element) {
    internalAttributeStates.set(element, {
      className: element.getAttribute('class'),
      style: element.getAttribute('style')
    });
  }

  function isInternalAttributeMutation(element) {
    const state = internalAttributeStates.get(element);
    return Boolean(
      state
      && state.className === element.getAttribute('class')
      && state.style === element.getAttribute('style')
    );
  }

  function setVariable(element, property, value) {
    if (value) element.style.setProperty(property, value);
  }

  function snapshotStyle(element, pseudo = null) {
    const style = getComputedStyle(element, pseudo);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      color: style.color,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      outlineColor: style.outlineColor,
      textDecorationColor: style.textDecorationColor,
      boxShadow: style.boxShadow,
      textShadow: style.textShadow,
      fill: style.fill,
      stroke: style.stroke,
      caretColor: style.caretColor,
      columnRuleColor: style.columnRuleColor,
      accentColor: style.accentColor,
      filter: style.filter,
      content: style.content,
      display: style.display
    };
  }

  function replaceResolvedColor(value, from, to) {
    if (!value || !from || from === to) return value;
    return value.split(from).join(to);
  }

  function replaceSnapshotColorReferences(style, from, to) {
    [
      'color', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
      'borderLeftColor', 'outlineColor', 'textDecorationColor', 'boxShadow',
      'textShadow', 'fill', 'stroke', 'caretColor', 'columnRuleColor'
    ].forEach(property => {
      style[property] = replaceResolvedColor(style[property], from, to);
    });
  }

  function normalizeInheritedColors(element, style, before, after) {
    const parent = element.parentElement;
    const parentOriginal = parent ? originalStyles.get(parent) : null;
    if (!parent || !parentOriginal) return;
    const inheritedCurrent = getComputedStyle(parent).color;
    if (style.color !== inheritedCurrent) return;
    const resolvedColor = style.color;
    replaceSnapshotColorReferences(style, resolvedColor, parentOriginal.color);
    replaceSnapshotColorReferences(before, resolvedColor, parentOriginal.color);
    replaceSnapshotColorReferences(after, resolvedColor, parentOriginal.color);
  }

  function getFinalBackgroundLuminance(element) {
    for (let current = element; current; current = current.parentElement) {
      const snapshot = originalStyles.get(current);
      const color = parseColor(snapshot?.backgroundColor || getComputedStyle(current).backgroundColor);
      if (color && color.a > 0.2) {
        const transformed = parseColor(transformBackground(
          snapshot?.backgroundColor || getComputedStyle(current).backgroundColor
        )) || color;
        return relativeLuminance(transformed);
      }
    }
    return null;
  }

  function applyStyleSnapshot(element, style) {
    const backgroundLuminance = getFinalBackgroundLuminance(element);
    const transformLocalForeground = value => transformForeground(value, backgroundLuminance);
    const transformLocalBorder = value => transformBorder(value, backgroundLuminance);
    setVariable(element, '--fd-bg', transformBackground(style.backgroundColor) || style.backgroundColor);
    setVariable(element, '--fd-color', transformLocalForeground(style.color) || style.color);
    setVariable(element, '--fd-border-top', transformLocalBorder(style.borderTopColor) || style.borderTopColor);
    setVariable(element, '--fd-border-right', transformLocalBorder(style.borderRightColor) || style.borderRightColor);
    setVariable(element, '--fd-border-bottom', transformLocalBorder(style.borderBottomColor) || style.borderBottomColor);
    setVariable(element, '--fd-border-left', transformLocalBorder(style.borderLeftColor) || style.borderLeftColor);
    setVariable(element, '--fd-outline', transformLocalBorder(style.outlineColor) || style.outlineColor);
    setVariable(element, '--fd-decoration', transformLocalForeground(style.textDecorationColor) || style.textDecorationColor);
    if (shadowNeedsColorFreeze(style.textShadow, style.color)) {
      setVariable(element, '--fd-text-shadow', style.textShadow);
    }
    setVariable(element, '--fd-bg-image', rewriteColors(style.backgroundImage, transformBackground) || style.backgroundImage);
    setVariable(element, '--fd-caret', transformLocalForeground(style.caretColor) || style.caretColor);
    setVariable(element, '--fd-column-rule', transformLocalBorder(style.columnRuleColor) || style.columnRuleColor);
    if (style.accentColor !== 'auto') {
      setVariable(element, '--fd-accent', transformLocalForeground(style.accentColor) || style.accentColor);
    }
    if (element instanceof SVGElement) {
      setVariable(element, '--fd-fill', transformLocalForeground(style.fill) || style.fill);
      setVariable(element, '--fd-stroke', transformLocalForeground(style.stroke) || style.stroke);
    }
  }

  function applyPseudoStyle(element, prefix, style) {
    if (style.content === 'none' || style.display === 'none') return;
    const backgroundLuminance = getFinalBackgroundLuminance(element);
    const transformLocalForeground = value => transformForeground(value, backgroundLuminance);
    const transformLocalBorder = value => transformBorder(value, backgroundLuminance);
    setVariable(element, `--fd-${prefix}-bg`, transformBackground(style.backgroundColor) || style.backgroundColor);
    setVariable(element, `--fd-${prefix}-color`, transformLocalForeground(style.color) || style.color);
    setVariable(element, `--fd-${prefix}-border`, transformLocalBorder(style.borderTopColor) || style.borderTopColor);
    if (shadowNeedsColorFreeze(style.textShadow, style.color)) {
      setVariable(element, `--fd-${prefix}-text-shadow`, style.textShadow);
    }
    setVariable(element, `--fd-${prefix}-bg-image`, rewriteColors(style.backgroundImage, transformBackground) || style.backgroundImage);
  }

  function applyPseudoStyles(element, before, after) {
    applyPseudoStyle(element, 'before', before);
    applyPseudoStyle(element, 'after', after);
  }

  function percentile(values, fraction) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  }

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
      const neutral = colored / visible <= 0.025 && percentile(chromaValues, 0.95) <= 18;
      if (!neutral) return false;
      const transparentRatio = transparent / (visible + transparent);
      const extremeRatio = nearExtremes / visible;
      const smallAsset = img.naturalWidth <= 192 && img.naturalHeight <= 192;
      return luminanceBins.size <= 6 || (smallAsset && (transparentRatio >= 0.08 || extremeRatio >= 0.72));
    } catch (error) {
      return false;
    }
  }

  function processImage(image, style) {
    const classify = () => {
      if (!active || !image.isConnected) return;
      const signature = `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
      if (image.dataset.fdImageSignature === signature) return;
      image.dataset.fdImageSignature = signature;
      image.classList.toggle(MONOCHROME_CLASS, isMonochromeImage(image));
      const baseFilter = style.filter === 'none' ? '' : `${style.filter} `;
      setVariable(image, '--fd-original-filter', `${baseFilter}invert(1) hue-rotate(180deg) brightness(0.9)`);
      rememberInternalAttributeState(image);
    };
    if (image.complete && image.naturalWidth) classify();
    else image.addEventListener('load', classify, { once: true });
  }

  function processBatch(elements) {
    const prepared = [];
    elements.forEach(element => {
      if (!element.isConnected || element.closest('style, script, link, meta')) return;
      const wasMonochrome = element.classList.contains(MONOCHROME_CLASS);
      removeInternalStyles(element);
      prepared.push({ element, wasMonochrome });
    });

    const snapshots = prepared.map(({ element, wasMonochrome }) => {
      const style = snapshotStyle(element);
      const before = snapshotStyle(element, '::before');
      const after = snapshotStyle(element, '::after');
      normalizeInheritedColors(element, style, before, after);
      return { element, wasMonochrome, style, before, after };
    });

    snapshots.forEach(({ element, style }) => originalStyles.set(element, style));

    snapshots.forEach(({ element, wasMonochrome, style, before, after }) => {
      applyStyleSnapshot(element, style);
      applyPseudoStyles(element, before, after);
      element.classList.add(ADJUSTED_CLASS);
      if (element instanceof HTMLImageElement) {
        if (wasMonochrome) element.classList.add(MONOCHROME_CLASS);
        processImage(element, style);
      }
      rememberInternalAttributeState(element);
      adjustedElements.add(element);
    });
  }

  function runWork(deadline) {
    workScheduled = false;
    if (!active) return;
    const batch = [];
    const maximum = 240;
    while (queuedElements.size && batch.length < maximum) {
      const iterator = queuedElements.values().next();
      queuedElements.delete(iterator.value);
      batch.push(iterator.value);
      if (deadline?.timeRemaining && deadline.timeRemaining() < 2 && batch.length >= 40) break;
    }
    if (batch.length) processBatch(batch);
    if (queuedElements.size) scheduleWork();
  }

  function scheduleWork() {
    if (workScheduled || !active) return;
    workScheduled = true;
    if (document.visibilityState === 'visible' && performance.now() < urgentUntil) {
      setTimeout(() => runWork(null), 0);
    } else if ('requestIdleCallback' in window) requestIdleCallback(runWork, { timeout: 120 });
    else setTimeout(() => runWork(null), 0);
  }

  function requestUrgentRefresh(root = document.documentElement) {
    if (!active || !root) return;
    urgentUntil = performance.now() + 2000;
    const hadScheduledWork = workScheduled;
    enqueueRoot(root);
    if (hadScheduledWork) setTimeout(() => runWork(null), 0);
  }

  function enqueueElement(element) {
    if (!(element instanceof Element)) return;
    queuedElements.add(element);
    if (element.shadowRoot) enqueueRoot(element.shadowRoot);
  }

  function enqueueRoot(root) {
    if (root instanceof Element) enqueueElement(root);
    root.querySelectorAll?.('*').forEach(enqueueElement);
    if (root instanceof ShadowRoot) observeRoot(root);
    scheduleWork();
  }

  const observer = new MutationObserver(mutations => {
    if (!active) return;
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) enqueueRoot(node);
        });
      } else {
        if (
          (mutation.attributeName === 'class' || mutation.attributeName === 'style')
          && isInternalAttributeMutation(mutation.target)
        ) return;
        if (mutation.target instanceof HTMLImageElement) delete mutation.target.dataset.fdImageSignature;
        enqueueRoot(mutation.target);
      }
    });
  });

  function observeRoot(root) {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    observer.observe(root, {
      attributes: true,
      attributeFilter: [
        'class', 'style', 'src', 'srcset', 'fill', 'stroke', 'color',
        'bgcolor', 'border', 'open', 'hidden', 'disabled', 'checked', 'selected'
      ],
      childList: true,
      subtree: true
    });
  }

  function clearAllAdjustments() {
    queuedElements.clear();
    adjustedElements.forEach(element => {
      if (!element.isConnected) return;
      removeInternalStyles(element);
      delete element.dataset.fdImageSignature;
    });
    adjustedElements.clear();
  }

  function apply() {
    const nextActive = shouldForceDark();
    if (!nextActive) {
      active = false;
      document.documentElement.classList.remove(ACTIVE_CLASS);
      clearAllAdjustments();
      return;
    }
    if (active) return;
    active = true;
    document.documentElement.classList.add(ACTIVE_CLASS);
    observeRoot(document.documentElement);
    requestUrgentRefresh();
  }

  function scheduleApply() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
    else apply();
  }

  window.addEventListener('pageshow', () => {
    if (!active) apply();
    else requestUrgentRefresh();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!active) apply();
      else requestUrgentRefresh();
    }
  });

  const refreshInteractionPath = event => {
    if (!active) return;
    const path = event.composedPath();
    setTimeout(() => {
      urgentUntil = performance.now() + 500;
      path.forEach(node => {
        if (node instanceof Element) enqueueElement(node);
      });
      scheduleWork();
    }, 0);
  };

  [
    'pointerover', 'pointerout', 'focusin', 'focusout',
    'transitionrun', 'transitionend', 'animationstart', 'animationiteration', 'animationend'
  ].forEach(type => document.addEventListener(type, refreshInteractionPath, true));

  darkModeQuery.addEventListener('change', apply);
  chrome.storage.sync.get(['enabled', 'siteOverrides'], data => {
    if (typeof data.enabled === 'boolean') settings.enabled = data.enabled;
    if (data.siteOverrides) settings.siteOverrides = data.siteOverrides;
    scheduleApply();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.siteOverrides) settings.siteOverrides = changes.siteOverrides.newValue || {};
    apply();
  });
})();
