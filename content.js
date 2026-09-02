(() => {
  const contentVersion = chrome.runtime.getManifest().version;

  // A previously injected development build referenced these names after
  // removing their declarations. Keep a small compatibility bridge so that
  // callbacks left behind in an already-open tab stop throwing as soon as the
  // corrected content script is injected.
  globalThis.MONOCHROME_CLASS ??= '__fd_monochrome_image__';
  globalThis.isInternalAttributeMutation ??= () => true;

  if (window.__darkifyContentVersion === contentVersion) return;
  window.__darkifyContentVersion = contentVersion;

  const ACTIVE_CLASS = '__force-dark-active__';
  const VERSION_ATTRIBUTE = 'data-fd-version';
  const PROPERTIES_ATTRIBUTE = 'data-fd-props';
  const LEGACY_ADJUSTED_ATTRIBUTE = 'data-fd-adjusted';
  const MONOCHROME_ATTRIBUTE = 'data-fd-monochrome';
  const SAMPLING_ATTRIBUTE = 'data-fd-sampling';
  const PRESERVED_MEDIA_SELECTOR = 'img, picture, video, canvas, iframe, object, embed';
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

  const SHADOW_STYLE_ATTRIBUTE = 'data-fd-shadow-styles';
  const SHADOW_STYLE_TEXT = `
    :host-context(html.__force-dark-active__) [data-fd-props~="bg"] { background-color: var(--fd-bg) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="color"] { color: var(--fd-color) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="border-top"] { border-top-color: var(--fd-border-top) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="border-right"] { border-right-color: var(--fd-border-right) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="border-bottom"] { border-bottom-color: var(--fd-border-bottom) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="border-left"] { border-left-color: var(--fd-border-left) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="outline"] { outline-color: var(--fd-outline) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="decoration"] { text-decoration-color: var(--fd-decoration) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="shadow"] { box-shadow: var(--fd-shadow) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="text-shadow"] { text-shadow: var(--fd-text-shadow) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="bg-image"] { background-image: var(--fd-bg-image) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="caret"] { caret-color: var(--fd-caret) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="column-rule"] { column-rule-color: var(--fd-column-rule) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="accent"] { accent-color: var(--fd-accent) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="fill"] { fill: var(--fd-fill) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="stroke"] { stroke: var(--fd-stroke) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="before-bg"]::before { background-color: var(--fd-before-bg) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="before-color"]::before { color: var(--fd-before-color) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="before-border"]::before { border-color: var(--fd-before-border) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="before-shadow"]::before { box-shadow: var(--fd-before-shadow) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="before-text-shadow"]::before { text-shadow: var(--fd-before-text-shadow) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="before-bg-image"]::before { background-image: var(--fd-before-bg-image) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="after-bg"]::after { background-color: var(--fd-after-bg) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="after-color"]::after { color: var(--fd-after-color) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="after-border"]::after { border-color: var(--fd-after-border) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="after-shadow"]::after { box-shadow: var(--fd-after-shadow) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="after-text-shadow"]::after { text-shadow: var(--fd-after-text-shadow) !important; }
    :host-context(html.__force-dark-active__) [data-fd-props~="after-bg-image"]::after { background-image: var(--fd-after-bg-image) !important; }
    :host-context(html.__force-dark-active__) [data-fd-sampling] { transition: none !important; }
    :host-context(html.__force-dark-active__) img[data-fd-monochrome] {
      filter: var(--fd-original-filter) !important;
    }
    :host-context(html.__force-dark-active__) input::placeholder,
    :host-context(html.__force-dark-active__) textarea::placeholder {
      color: #9da3aa !important;
      opacity: 1 !important;
    }
    :host-context(html.__force-dark-active__) ::selection {
      background-color: #315a8a !important;
      color: #f4f6f8 !important;
    }
  `;

  let settings = { enabled: true, siteOverrides: {} };
  let active = false;
  let workScheduled = false;
  const queuedElements = new Set();
  const pendingTraversals = [];
  const queuedTraversalRoots = new WeakSet();
  const pendingAttributeRefreshes = new Map();
  const pendingInteractionElements = new Set();
  const cacheableTraversalElements = new WeakSet();
  const traversalSnapshotCache = new Map();
  let interactionRefreshTimer = null;
  const adjustedElements = new Set();
  const observedRoots = new WeakSet();
  const originalStyles = new WeakMap();
  const internalStyleStates = new WeakMap();
  const backgroundColorCache = new Map();
  const foregroundColorCache = new Map();
  const borderColorCache = new Map();
  const MAX_DARK_SURFACE_LUMINANCE = 0.14;

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

  function colorCacheKey(color) {
    return `${color.r},${color.g},${color.b},${Number(color.a).toFixed(3)}`;
  }

  function cachedColorTransform(cache, value, transform) {
    const color = parseColor(value);
    if (!color || color.a === 0) return null;
    const key = colorCacheKey(color);
    if (!cache.has(key)) cache.set(key, transform(color));
    return cache.get(key);
  }

  function limitSurfaceLuminance(color) {
    if (relativeLuminance(color) <= MAX_DARK_SURFACE_LUMINANCE) return color;
    const hsl = rgbToHsl(color);
    let lower = 0;
    let upper = hsl.l;
    for (let step = 0; step < 12; step++) {
      const lightness = (lower + upper) / 2;
      const candidate = parseColor(hslToRgb({ h: hsl.h, s: hsl.s, l: lightness }, color.a));
      if (candidate && relativeLuminance(candidate) <= MAX_DARK_SURFACE_LUMINANCE) lower = lightness;
      else upper = lightness;
    }
    return parseColor(hslToRgb({ h: hsl.h, s: hsl.s, l: lower }, color.a)) || color;
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
    return cachedColorTransform(backgroundColorCache, value, color => {
      const hsl = rgbToHsl(color);
      if (hsl.l > 0.24) {
        hsl.l = Math.max(0.08, Math.min(0.34, 1 - hsl.l));
        hsl.s = Math.min(hsl.s, 0.78);
      }
      const limited = limitSurfaceLuminance(parseColor(hslToRgb(hsl, color.a)) || color);
      return hslToRgb(rgbToHsl(limited), color.a);
    });
  }

  function transformForeground(value) {
    return cachedColorTransform(foregroundColorCache, value, color => {
      const hsl = rgbToHsl(color);
      if (hsl.l < 0.55) hsl.l = 1 - hsl.l;
      hsl.s = Math.min(hsl.s, 0.78);
      return ensureContrast(hslToRgb(hsl, color.a), MAX_DARK_SURFACE_LUMINANCE, 4.5);
    });
  }

  function transformBorder(value) {
    return cachedColorTransform(borderColorCache, value, color => {
      const hsl = rgbToHsl(color);
      if (hsl.l < 0.5) hsl.l = 1 - hsl.l;
      hsl.s = Math.min(hsl.s, 0.78);
      return ensureContrast(hslToRgb(hsl, color.a), MAX_DARK_SURFACE_LUMINANCE, 3);
    });
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
    element.removeAttribute(PROPERTIES_ATTRIBUTE);
    element.removeAttribute(LEGACY_ADJUSTED_ATTRIBUTE);
    element.removeAttribute(MONOCHROME_ATTRIBUTE);
    element.removeAttribute(SAMPLING_ATTRIBUTE);
    INTERNAL_PROPERTIES.forEach(property => element.style.removeProperty(property));
  }

  function syncPropertyTokens(element) {
    const tokens = INTERNAL_PROPERTIES
      .filter(property => property !== '--fd-original-filter' && element.style.getPropertyValue(property))
      .map(property => property.slice('--fd-'.length));
    if (tokens.length) {
      element.setAttribute(PROPERTIES_ATTRIBUTE, tokens.join(' '));
      adjustedElements.add(element);
    } else {
      element.removeAttribute(PROPERTIES_ATTRIBUTE);
    }
  }

  function setVariable(element, property, value) {
    if (value) element.style.setProperty(property, value);
  }

  function setChangedVariable(element, property, original, transformed) {
    if (transformed && transformed !== original) element.style.setProperty(property, transformed);
  }

  function rememberInternalStyle(element) {
    internalStyleStates.set(element, element.getAttribute('style'));
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
      borderTopStyle: style.borderTopStyle,
      borderRightStyle: style.borderRightStyle,
      borderBottomStyle: style.borderBottomStyle,
      borderLeftStyle: style.borderLeftStyle,
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      textDecorationColor: style.textDecorationColor,
      textDecorationLine: style.textDecorationLine,
      boxShadow: style.boxShadow,
      textShadow: style.textShadow,
      fill: style.fill,
      stroke: style.stroke,
      caretColor: style.caretColor,
      columnRuleColor: style.columnRuleColor,
      columnRuleStyle: style.columnRuleStyle,
      accentColor: style.accentColor,
      filter: style.filter,
      content: style.content,
      display: style.display
    };
  }

  function styleContextPart(element) {
    if (!element) return '';
    const stateAttributes = [];
    for (const attribute of element.attributes) {
      if (
        attribute.name === 'role'
        || attribute.name === 'type'
        || ['color', 'bgcolor', 'fill', 'stroke'].includes(attribute.name)
        || attribute.name.startsWith('aria-')
        || /^data-(state|variant|theme|color|status|selected|active|open)$/i.test(attribute.name)
      ) stateAttributes.push(`${attribute.name}=${attribute.value}`);
    }
    const className = typeof element.className === 'string'
      ? element.className
      : element.getAttribute('class') || '';
    return `${element.tagName}.${className}#${element.id || ''}[${stateAttributes.join('|')}]`;
  }

  function siblingPhase(element) {
    let phase = 1;
    let sibling = element.previousElementSibling;
    while (sibling && phase < 12) {
      phase++;
      sibling = sibling.previousElementSibling;
    }
    return phase === 12 && sibling ? 0 : phase;
  }

  function traversalSnapshotKey(element, inspectPseudos) {
    if (
      element.getRootNode() instanceof ShadowRoot
      || element.matches(':hover, :focus, :focus-within, :active')
    ) return null;
    const contexts = [];
    let current = element;
    for (let depth = 0; current && depth < 4; depth++, current = current.parentElement) {
      contexts.push(styleContextPart(current));
    }
    return [
      contexts.join('>'),
      `phase:${siblingPhase(element)}`,
      `pseudo:${inspectPseudos ? 1 : 0}`,
      `style:${element.getAttribute('style') || ''}`
    ].join('||');
  }

  function cloneSnapshot(snapshot) {
    return {
      style: { ...snapshot.style },
      before: { ...snapshot.before },
      after: { ...snapshot.after }
    };
  }

  function replaceResolvedColor(value, from, to) {
    if (!value || !from || from === to) return value;
    return value.split(from).join(to);
  }

  function replaceSnapshotColorReferences(style, from, to) {
    [
      'color', 'borderTopColor', 'borderRightColor', 'borderBottomColor',
      'borderLeftColor', 'outlineColor', 'textDecorationColor', 'fill', 'stroke',
      'caretColor', 'columnRuleColor'
    ].forEach(property => {
      style[property] = replaceResolvedColor(style[property], from, to);
    });
  }

  function normalizeInheritedColors(element, style, before, after, inheritedCurrent) {
    const parent = element.parentElement;
    const parentOriginal = parent ? originalStyles.get(parent) : null;
    if (!parent || !parentOriginal) return false;
    if (style.color !== inheritedCurrent) return false;
    const resolvedColor = style.color;
    replaceSnapshotColorReferences(style, resolvedColor, parentOriginal.color);
    replaceSnapshotColorReferences(before, resolvedColor, parentOriginal.color);
    replaceSnapshotColorReferences(after, resolvedColor, parentOriginal.color);
    return true;
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

  function applyStyleSnapshot(element, style, skipColor = false) {
    const transformLocalForeground = value => transformForeground(value);
    const transformLocalBorder = value => transformBorder(value);
    setChangedVariable(element, '--fd-bg', style.backgroundColor, transformBackground(style.backgroundColor));
    if (!skipColor) setChangedVariable(element, '--fd-color', style.color, transformLocalForeground(style.color));
    if (style.borderTopStyle !== 'none') setChangedVariable(element, '--fd-border-top', style.borderTopColor, transformLocalBorder(style.borderTopColor));
    if (style.borderRightStyle !== 'none') setChangedVariable(element, '--fd-border-right', style.borderRightColor, transformLocalBorder(style.borderRightColor));
    if (style.borderBottomStyle !== 'none') setChangedVariable(element, '--fd-border-bottom', style.borderBottomColor, transformLocalBorder(style.borderBottomColor));
    if (style.borderLeftStyle !== 'none') setChangedVariable(element, '--fd-border-left', style.borderLeftColor, transformLocalBorder(style.borderLeftColor));
    if (style.outlineStyle !== 'none') setChangedVariable(element, '--fd-outline', style.outlineColor, transformLocalBorder(style.outlineColor));
    if (style.textDecorationLine !== 'none') setChangedVariable(element, '--fd-decoration', style.textDecorationColor, transformLocalForeground(style.textDecorationColor));
    if (style.boxShadow !== 'none') setVariable(element, '--fd-shadow', style.boxShadow);
    if (style.textShadow !== 'none') setVariable(element, '--fd-text-shadow', style.textShadow);
    setChangedVariable(element, '--fd-bg-image', style.backgroundImage, rewriteColors(style.backgroundImage, transformBackground));
    if (element.matches('input, textarea, [contenteditable="true"]')) {
      setChangedVariable(element, '--fd-caret', style.caretColor, transformLocalForeground(style.caretColor));
    }
    if (style.columnRuleStyle !== 'none') {
      setChangedVariable(element, '--fd-column-rule', style.columnRuleColor, transformLocalBorder(style.columnRuleColor));
    }
    if (style.accentColor !== 'auto' && element.matches('input, progress')) {
      setChangedVariable(element, '--fd-accent', style.accentColor, transformLocalForeground(style.accentColor));
    }
    if (element instanceof SVGElement) {
      setChangedVariable(element, '--fd-fill', style.fill, transformLocalForeground(style.fill));
      setChangedVariable(element, '--fd-stroke', style.stroke, transformLocalForeground(style.stroke));
    }
  }

  function applyPseudoStyle(element, prefix, style, skipColor = false) {
    if (style.content === 'none' || style.display === 'none') return;
    const transformLocalForeground = value => transformForeground(value);
    const transformLocalBorder = value => transformBorder(value);
    setChangedVariable(element, `--fd-${prefix}-bg`, style.backgroundColor, transformBackground(style.backgroundColor));
    if (!skipColor) setChangedVariable(element, `--fd-${prefix}-color`, style.color, transformLocalForeground(style.color));
    if (style.borderTopStyle !== 'none') setChangedVariable(element, `--fd-${prefix}-border`, style.borderTopColor, transformLocalBorder(style.borderTopColor));
    if (style.boxShadow !== 'none') setVariable(element, `--fd-${prefix}-shadow`, style.boxShadow);
    if (style.textShadow !== 'none') setVariable(element, `--fd-${prefix}-text-shadow`, style.textShadow);
    setChangedVariable(element, `--fd-${prefix}-bg-image`, style.backgroundImage, rewriteColors(style.backgroundImage, transformBackground));
  }

  function applyPseudoStyles(element, style, before, after) {
    applyPseudoStyle(element, 'before', before, before.color === style.color);
    applyPseudoStyle(element, 'after', after, after.color === style.color);
  }

  function percentile(values, fraction) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  }

  function analyzeMonochromeImage(img, originalFilter = 'none') {
    try {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return { monochrome: false, luminance: 0 };
      if (originalFilter !== 'none') context.filter = originalFilter;
      context.drawImage(img, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size).data;
      const chromaValues = [];
      const luminanceValues = [];
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
        luminanceValues.push(luminance);
        luminanceBins.add(Math.min(15, Math.floor(luminance / 16)));
        if (chroma > 22) colored++;
        if (luminance < 42 || luminance > 213) nearExtremes++;
      }
      if (!visible) return { monochrome: true, luminance: 1 };
      const neutral = colored / visible <= 0.025 && percentile(chromaValues, 0.95) <= 18;
      if (!neutral) return { monochrome: false, luminance: 0 };
      const transparentRatio = transparent / (visible + transparent);
      const extremeRatio = nearExtremes / visible;
      const smallAsset = img.naturalWidth <= 192 && img.naturalHeight <= 192;
      return {
        monochrome: luminanceBins.size <= 6 || (smallAsset && (transparentRatio >= 0.08 || extremeRatio >= 0.72)),
        luminance: percentile(luminanceValues, 0.5) / 255
      };
    } catch (error) {
      return { monochrome: false, luminance: 0 };
    }
  }

  function monochromeFilter(image, style, analysis) {
    const backgroundLuminance = getFinalBackgroundLuminance(image) ?? 0.01;
    const originalLuminance = relativeLuminance({
      r: analysis.luminance * 255,
      g: analysis.luminance * 255,
      b: analysis.luminance * 255
    });
    const invertedValue = 1 - analysis.luminance;
    const invertedLuminance = relativeLuminance({
      r: invertedValue * 255,
      g: invertedValue * 255,
      b: invertedValue * 255
    });
    const originalContrast = contrastRatio(originalLuminance, backgroundLuminance);
    const invertedContrast = contrastRatio(invertedLuminance, backgroundLuminance);
    const baseFilter = style.filter === 'none' ? '' : `${style.filter} `;
    if (originalContrast >= 3) return baseFilter || 'none';
    if (invertedContrast >= 3 && invertedContrast > originalContrast) {
      return `${baseFilter}invert(1) hue-rotate(180deg)`.trim();
    }
    return backgroundLuminance < 0.45
      ? `${baseFilter}brightness(0) invert(1)`.trim()
      : `${baseFilter}brightness(0)`.trim();
  }

  function processImage(image, style) {
    const classify = () => {
      if (!active || !image.isConnected) return;
      const backgroundSignature = (getFinalBackgroundLuminance(image) ?? 0).toFixed(3);
      const signature = `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}|${backgroundSignature}`;
      if (image.dataset.fdImageSignature === signature) return;
      image.dataset.fdImageSignature = signature;
      const analysis = analyzeMonochromeImage(image, style.filter);
      image.toggleAttribute(MONOCHROME_ATTRIBUTE, analysis.monochrome);
      if (analysis.monochrome) {
        setVariable(image, '--fd-original-filter', monochromeFilter(image, style, analysis));
        adjustedElements.add(image);
      } else {
        image.style.removeProperty('--fd-original-filter');
      }
      rememberInternalStyle(image);
    };
    if (image.complete && image.naturalWidth) classify();
    else image.addEventListener('load', classify, { once: true });
  }

  function processBatch(elements) {
    const prepared = [];
    elements.forEach(element => {
      if (!element.isConnected) {
        adjustedElements.delete(element);
        const pendingRefresh = pendingAttributeRefreshes.get(element);
        if (pendingRefresh) clearTimeout(pendingRefresh);
        pendingAttributeRefreshes.delete(element);
        return;
      }
      if (element.closest('style, script, link, meta')) return;
      const wasMonochrome = element.hasAttribute(MONOCHROME_ATTRIBUTE);
      const hadAdjustments = Boolean(
        element.hasAttribute(PROPERTIES_ATTRIBUTE)
        || element.hasAttribute(LEGACY_ADJUSTED_ATTRIBUTE)
        || wasMonochrome
      );
      const preserveImageState = Boolean(
        element instanceof HTMLImageElement
        && wasMonochrome
        && element.dataset.fdImageSignature
        && !element.hasAttribute(PROPERTIES_ATTRIBUTE)
        && !element.hasAttribute(LEGACY_ADJUSTED_ATTRIBUTE)
      );
      if (
        !preserveImageState
        && hadAdjustments
      ) {
        element.setAttribute(SAMPLING_ATTRIBUTE, '');
        removeInternalStyles(element);
        element.setAttribute(SAMPLING_ATTRIBUTE, '');
      }
      prepared.push({ element, wasMonochrome, preserveImageState, sampling: hadAdjustments && !preserveImageState });
    });

    const snapshots = prepared.map(({ element, wasMonochrome, preserveImageState, sampling }) => {
      const cacheable = cacheableTraversalElements.has(element);
      cacheableTraversalElements.delete(element);
      const inspectPseudos = !element.matches(PRESERVED_MEDIA_SELECTOR)
        && element.matches('a, button, input, textarea, select, label, [role], [class*="icon" i], [class*="button" i], [class*="badge" i], [class*="menu" i], [class*="tooltip" i]');
      const cacheKey = cacheable && !preserveImageState && !element.matches(PRESERVED_MEDIA_SELECTOR)
        ? traversalSnapshotKey(element, inspectPseudos)
        : null;
      let cached = cacheKey ? traversalSnapshotCache.get(cacheKey) : null;
      if (!cached) {
        const style = preserveImageState && originalStyles.has(element)
          ? originalStyles.get(element)
          : snapshotStyle(element);
        const before = inspectPseudos ? snapshotStyle(element, '::before') : { content: 'none', display: 'none' };
        const after = inspectPseudos ? snapshotStyle(element, '::after') : { content: 'none', display: 'none' };
        cached = { style, before, after };
        if (cacheKey) traversalSnapshotCache.set(cacheKey, cloneSnapshot(cached));
      }
      const { style, before, after } = cloneSnapshot(cached);
      return { element, wasMonochrome, style, before, after, sampling };
    });

    const snapshotByElement = new Map(snapshots.map(snapshot => [snapshot.element, snapshot.style]));
    const parentColorCache = new Map();
    snapshots.forEach(({ element, style }) => originalStyles.set(element, style));
    snapshots.forEach(snapshot => {
      const parent = snapshot.element.parentElement;
      let parentCurrentColor = null;
      if (parent) {
        parentCurrentColor = snapshotByElement.get(parent)?.color;
        if (!parentCurrentColor) {
          if (!parentColorCache.has(parent)) parentColorCache.set(parent, getComputedStyle(parent).color);
          parentCurrentColor = parentColorCache.get(parent);
        }
      }
      snapshot.inheritedColor = normalizeInheritedColors(
        snapshot.element,
        snapshot.style,
        snapshot.before,
        snapshot.after,
        parentCurrentColor
      );
    });

    const samplingElements = [];
    snapshots.forEach(({ element, wasMonochrome, style, before, after, inheritedColor, sampling }) => {
      if (element instanceof HTMLImageElement) {
        if (wasMonochrome) element.setAttribute(MONOCHROME_ATTRIBUTE, '');
        processImage(element, style);
      } else if (!element.matches(PRESERVED_MEDIA_SELECTOR)) {
        applyStyleSnapshot(element, style, inheritedColor);
        applyPseudoStyles(element, style, before, after);
        syncPropertyTokens(element);
      }
      if (sampling) samplingElements.push(element);
      else rememberInternalStyle(element);
    });
    if (samplingElements.length) {
      // Commit the dark target while transitions are disabled. Re-enabling a
      // transition before this flush can animate from the site's light color.
      getComputedStyle(samplingElements[0]).color;
      samplingElements.forEach(element => {
        element.removeAttribute(SAMPLING_ATTRIBUTE);
        rememberInternalStyle(element);
      });
    }
  }

  function runWork(deadline) {
    workScheduled = false;
    if (!active) return;
    const batch = [];
    const maximum = 36;
    let directElements = 0;
    while ((queuedElements.size || pendingTraversals.length) && batch.length < maximum) {
      if (queuedElements.size && (!pendingTraversals.length || directElements < 24)) {
        const iterator = queuedElements.values().next();
        queuedElements.delete(iterator.value);
        batch.push(iterator.value);
        directElements++;
      } else {
        const traversal = pendingTraversals[0];
        const element = traversal.walker.nextNode();
        if (!element) {
          pendingTraversals.shift();
          queuedTraversalRoots.delete(traversal.root);
          continue;
        }
        if (element.shadowRoot) enqueueRoot(element.shadowRoot);
        cacheableTraversalElements.add(element);
        batch.push(element);
      }
      if (deadline?.timeRemaining && deadline.timeRemaining() < 4 && batch.length >= 12) break;
    }
    if (batch.length) processBatch(batch);
    if (queuedElements.size || pendingTraversals.length) scheduleWork();
  }

  function scheduleWork() {
    if (workScheduled || !active) return;
    workScheduled = true;
    if (globalThis.scheduler?.postTask) {
      globalThis.scheduler.postTask(() => runWork(null), { priority: 'background' }).catch(() => {
        workScheduled = false;
        if (active) setTimeout(() => runWork(null), 0);
      });
    } else if ('requestIdleCallback' in window) {
      requestIdleCallback(runWork, { timeout: 250 });
    } else {
      setTimeout(() => runWork(null), 0);
    }
  }

  function requestUrgentRefresh(root = document.documentElement) {
    if (!active || !root) return;
    enqueueRoot(root);
  }

  function enqueueElement(element) {
    if (!(element instanceof Element)) return;
    queuedElements.add(element);
    if (element.shadowRoot) enqueueRoot(element.shadowRoot);
  }

  function enqueueRoot(root) {
    if (root instanceof Element) enqueueElement(root);
    if (root instanceof ShadowRoot) observeRoot(root);
    if (
      root?.ownerDocument?.createTreeWalker
      && !queuedTraversalRoots.has(root)
    ) {
      queuedTraversalRoots.add(root);
      pendingTraversals.push({
        root,
        walker: root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
      });
    }
    scheduleWork();
  }

  function scheduleElementRefresh(element, includeChildren = false, delay = 140) {
    if (!(element instanceof Element)) return;
    const previous = pendingAttributeRefreshes.get(element);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      pendingAttributeRefreshes.delete(element);
      if (!active || !element.isConnected) return;
      enqueueElement(element);
      if (includeChildren) {
        if (element.children.length <= 24) {
          for (const child of element.children) enqueueElement(child);
        } else {
          enqueueRoot(element);
        }
      }
      scheduleWork();
    }, delay);
    pendingAttributeRefreshes.set(element, timer);
  }

  const observer = new MutationObserver(mutations => {
    if (!active) return;
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        if (
          [...mutation.addedNodes, ...mutation.removedNodes]
            .some(node => node.nodeType === 1 && node.matches?.('style, link[rel="stylesheet"]'))
        ) traversalSnapshotCache.clear();
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) enqueueRoot(node);
        });
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === 1) enqueueRoot(node);
        });
      } else {
        if (
          mutation.attributeName === 'style'
          && internalStyleStates.get(mutation.target) === mutation.target.getAttribute('style')
        ) return;
        traversalSnapshotCache.clear();
        if (
          mutation.target.hasAttribute(PROPERTIES_ATTRIBUTE)
          || mutation.target.hasAttribute(MONOCHROME_ATTRIBUTE)
        ) mutation.target.setAttribute(SAMPLING_ATTRIBUTE, '');
        if (mutation.target instanceof HTMLImageElement) delete mutation.target.dataset.fdImageSignature;
        scheduleElementRefresh(
          mutation.target,
          ['class', 'style', 'color', 'fill', 'stroke'].includes(mutation.attributeName)
        );
      }
    });
  });

  function observeRoot(root) {
    if (root instanceof ShadowRoot && !root.querySelector(`style[${SHADOW_STYLE_ATTRIBUTE}]`)) {
      const style = document.createElement('style');
      style.setAttribute(SHADOW_STYLE_ATTRIBUTE, '');
      style.textContent = SHADOW_STYLE_TEXT;
      root.prepend(style);
    }
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
    while (pendingTraversals.length) {
      queuedTraversalRoots.delete(pendingTraversals.pop().root);
    }
    pendingAttributeRefreshes.forEach(clearTimeout);
    pendingAttributeRefreshes.clear();
    pendingInteractionElements.clear();
    traversalSnapshotCache.clear();
    if (interactionRefreshTimer) clearTimeout(interactionRefreshTimer);
    interactionRefreshTimer = null;
    adjustedElements.forEach(element => {
      if (!element.isConnected) return;
      removeInternalStyles(element);
      delete element.dataset.fdImageSignature;
    });
    adjustedElements.clear();
  }

  function apply() {
    document.documentElement.setAttribute(VERSION_ATTRIBUTE, contentVersion);
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
    else if (queuedElements.size || pendingTraversals.length) scheduleWork();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!active) apply();
      else if (queuedElements.size || pendingTraversals.length) {
        scheduleWork();
      }
    }
  });

  const refreshInteractionPath = event => {
    if (!active) return;
    event.composedPath().slice(0, 4).forEach(node => {
      if (node instanceof Element) {
        pendingInteractionElements.add(node);
        if (
          node.hasAttribute(PROPERTIES_ATTRIBUTE)
          || node.hasAttribute(MONOCHROME_ATTRIBUTE)
        ) node.setAttribute(SAMPLING_ATTRIBUTE, '');
      }
    });
    if (interactionRefreshTimer) clearTimeout(interactionRefreshTimer);
    interactionRefreshTimer = setTimeout(() => {
      interactionRefreshTimer = null;
      pendingInteractionElements.forEach(enqueueElement);
      pendingInteractionElements.clear();
      scheduleWork();
    }, 90);
  };

  ['pointerover', 'pointerout', 'focusin', 'focusout']
    .forEach(type => document.addEventListener(type, refreshInteractionPath, true));

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
