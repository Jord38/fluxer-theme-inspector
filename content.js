/* Fluxer Theme Inspector — Content Script */
"use strict";

(function () {
  // Guard against double-injection
  if (window.__themeInspectorLoaded) return;
  window.__themeInspectorLoaded = true;

  // ── Constants ──────────────────────────────────────────────────────────
  const CACHE_TTL_MS = 5000;
  const MAX_DEPTH = 15;
  const STORAGE_KEY = `__ti_${location.hostname}`;
  const OVERRIDE_STYLE_ID = "__ti-overrides";
  const HIGHLIGHT_STYLE_ID = "__ti-highlight-style";
  const HIGHLIGHT_ATTR = "data-theme-inspector-highlight";
  const SETTINGS_BTN_ID = "__ti-settings-btn";

  // ── SVG Icons ──────────────────────────────────────────────────────────
  const ICONS = {
    palette: `<svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor"><path d="M200.77,53.89A103.27,103.27,0,0,0,128,24h-1.07A104,104,0,0,0,24,128c0,43,26.58,79.06,69.36,94.17A32,32,0,0,0,136,192a16,16,0,0,1,16-16h46.21a31.81,31.81,0,0,0,31.2-24.88,104.43,104.43,0,0,0,2.59-24A103.28,103.28,0,0,0,200.77,53.89ZM76,168a12,12,0,1,1,12-12A12,12,0,0,1,76,168Zm0-56a12,12,0,1,1,12-12A12,12,0,0,1,76,112Zm52-44a12,12,0,1,1,12-12A12,12,0,0,1,128,68Zm52,44a12,12,0,1,1,12-12A12,12,0,0,1,180,112Z" opacity="0.2"/><path d="M200.77,53.89A103.27,103.27,0,0,0,128,24h-1.07A104,104,0,0,0,24,128c0,43,26.58,79.06,69.36,94.17A32,32,0,0,0,136,192a16,16,0,0,1,16-16h46.21a31.81,31.81,0,0,0,31.2-24.88,104.43,104.43,0,0,0,2.59-24A103.28,103.28,0,0,0,200.77,53.89ZM213.57,148.55A15.94,15.94,0,0,1,198.21,160H152a32,32,0,0,0-32,32,16,16,0,0,1-21.31,15.07C62.49,194.3,40,164,40,128a88,88,0,0,1,87.09-88h.9a88.35,88.35,0,0,1,88,87.25A89.15,89.15,0,0,1,213.57,148.55ZM140,76a12,12,0,1,1-12-12A12,12,0,0,1,140,76ZM88,100a12,12,0,1,1-12-12A12,12,0,0,1,88,100Zm0,56a12,12,0,1,1-12-12A12,12,0,0,1,88,156Zm104-56a12,12,0,1,1-12-12A12,12,0,0,1,192,100Z"/></svg>`,
    crosshair: `<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M232,120H216.43A88.18,88.18,0,0,0,136,39.57V24a8,8,0,0,0-16,0V39.57A88.18,88.18,0,0,0,39.57,120H24a8,8,0,0,0,0,16H39.57A88.18,88.18,0,0,0,120,216.43V232a8,8,0,0,0,16,0V216.43A88.18,88.18,0,0,0,216.43,136H232a8,8,0,0,0,0-16Zm-96,80.43V192a8,8,0,0,0-16,0v8.43A72.2,72.2,0,0,1,55.57,136H64a8,8,0,0,0,0-16H55.57A72.2,72.2,0,0,1,120,55.57V64a8,8,0,0,0,16,0V55.57A72.2,72.2,0,0,1,200.43,120H192a8,8,0,0,0,0,16h8.43A72.2,72.2,0,0,1,136,200.43Z"/></svg>`,
    highlighter: `<svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M227.32,73.37,182.63,28.69a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.32,96a16,16,0,0,0,0-22.63ZM48,179.31,76.69,208H48ZM92.69,208l-48-48L136,68.69,187.32,120Z"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>`,
  };

  // ── Async Storage (replaces GM_getValue/GM_setValue) ───────────────────
  let stateCache = {};
  function loadStateFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        try {
          stateCache = result[STORAGE_KEY] ? JSON.parse(result[STORAGE_KEY]) : {};
        } catch (_) {
          stateCache = {};
        }
        resolve(stateCache);
      });
    });
  }

  function loadState() {
    return { ...stateCache };
  }

  function saveState(patch) {
    Object.assign(stateCache, patch);
    chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(stateCache) });
  }

  // ── Stylesheet Scanner (cached, 5s TTL) ────────────────────────────────
  let cachedEntries = null;
  let cachedTimestamp = 0;
  let fetchedSheetEntries = null;

  const VAR_REGEX = /var\(\s*(--[a-zA-Z0-9_-]+)/g;

  function extractVarEntries(rules) {
    const entries = [];
    for (let j = 0; j < rules.length; j++) {
      const rule = rules[j];
      if (rule instanceof CSSStyleRule) {
        const cssText = rule.style.cssText;
        if (!cssText.includes("var(")) continue;
        const variables = [];
        let match;
        VAR_REGEX.lastIndex = 0;
        while ((match = VAR_REGEX.exec(cssText)) !== null) {
          if (!variables.includes(match[1])) variables.push(match[1]);
        }
        if (variables.length > 0) {
          entries.push({ selector: rule.selectorText, variables });
        }
      } else if (rule.cssRules) {
        entries.push(...extractVarEntries(rule.cssRules));
      }
    }
    return entries;
  }

  async function fetchCrossOriginSheets() {
    if (fetchedSheetEntries !== null) return;
    const entries = [];

    for (const sheet of document.styleSheets) {
      if (!sheet.href) continue;
      let accessible = false;
      try { accessible = !!sheet.cssRules; } catch (_) {}
      if (accessible) continue;

      try {
        const resp = await fetch(sheet.href);
        if (!resp.ok) continue;
        const cssText = await resp.text();
        const parsed = new CSSStyleSheet();
        parsed.replaceSync(cssText.replace(/@import\s+[^;]+;/g, ""));
        entries.push(...extractVarEntries(parsed.cssRules));
      } catch (e) {
        console.warn("[Theme Inspector] Could not fetch cross-origin sheet:", sheet.href, e);
      }
    }

    fetchedSheetEntries = entries;
    invalidateCache();
  }

  function scanStyleSheets() {
    const now = Date.now();
    if (cachedEntries && now - cachedTimestamp < CACHE_TTL_MS) return cachedEntries;

    const entries = [];

    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (_) {
        continue;
      }
      if (!rules) continue;
      entries.push(...extractVarEntries(rules));
    }

    if (fetchedSheetEntries) {
      entries.push(...fetchedSheetEntries);
    }

    cachedEntries = entries;
    cachedTimestamp = now;
    return entries;
  }

  function invalidateCache() {
    cachedEntries = null;
    cachedTimestamp = 0;
  }

  // ── Color classification cache ─────────────────────────────────────────
  const colorClassCache = new Map();

  function isColorVariable(varName) {
    if (colorClassCache.has(varName)) return colorClassCache.get(varName);
    const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    let isColor = false;
    if (val) {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#aabbcc"; ctx.fillStyle = val;
        const c1 = ctx.fillStyle !== "#aabbcc";
        ctx.fillStyle = "#112233"; ctx.fillStyle = val;
        isColor = c1 || ctx.fillStyle !== "#112233";
      }
    }
    colorClassCache.set(varName, isColor);
    return isColor;
  }

  // ── Element → Variables ────────────────────────────────────────────────
  function getThemeVariablesForElement(el) {
    const entries = scanStyleSheets();
    const found = new Set();

    let current = el;
    let depth = 0;

    while (current && current !== document.documentElement && current !== document.body && depth < MAX_DEPTH) {
      for (const entry of entries) {
        const selectors = entry.selector.split(",");
        for (const rawSelector of selectors) {
          const selector = rawSelector.trim();
          if (!selector || selector.includes("::")) continue;
          try {
            if (current.matches(selector)) {
              for (const v of entry.variables) found.add(v);
            }
          } catch (_) {}
        }
      }
      current = current.parentElement;
      depth++;
    }

    // Classify and sort: colors first, then non-colors
    const all = Array.from(found);
    const colors = [];
    const other = [];
    for (const v of all) {
      if (isColorVariable(v)) colors.push(v);
      else other.push(v);
    }

    // Build element info string
    let info = el.tagName.toLowerCase();
    if (el.id) {
      info += `#${el.id}`;
    } else if (typeof el.className === "string" && el.className.trim()) {
      const raw = el.className.trim().split(/\s+/)[0];
      const m = raw.match(/^(\w+)\.module__(\w+)___\w+$/);
      info += "." + (m ? `${m[1]}.${m[2]}` : raw.length > 30 ? raw.substring(0, 30) + "\u2026" : raw);
    }

    return {
      elementInfo: info,
      colors,
      other,
    };
  }

  // ── Variable → Elements ────────────────────────────────────────────────
  function getElementsUsingVariable(variable) {
    const entries = scanStyleSheets();
    const matchingSelectors = [];

    for (const entry of entries) {
      if (entry.variables.includes(variable)) {
        const selectors = entry.selector.split(",");
        for (const rawSelector of selectors) {
          const selector = rawSelector.trim();
          if (selector && !selector.includes("::")) {
            matchingSelectors.push(selector);
          }
        }
      }
    }

    if (matchingSelectors.length === 0) return [];

    try {
      return Array.from(document.querySelectorAll(matchingSelectors.join(", ")));
    } catch (_) {
      return [];
    }
  }

  // ── Color Utilities ────────────────────────────────────────────────────
  function cssColorStringToNumber(color) {
    if (!color || typeof color !== "string") return null;
    const trimmed = color.trim();
    if (!trimmed) return null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    try {
      // Two-sentinel technique: non-color values leave fillStyle unchanged.
      // Test with two different sentinels to avoid false negatives when the
      // actual color happens to match one of them.
      ctx.fillStyle = "#aabbcc";
      ctx.fillStyle = trimmed;
      const changed1 = ctx.fillStyle !== "#aabbcc";
      ctx.fillStyle = "#112233";
      ctx.fillStyle = trimmed;
      const changed2 = ctx.fillStyle !== "#112233";
      if (!changed1 && !changed2) return null;
      const parsed = String(ctx.fillStyle);
      const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(parsed);
      if (match) {
        const r = Math.max(0, Math.min(255, parseInt(match[1], 10)));
        const g = Math.max(0, Math.min(255, parseInt(match[2], 10)));
        const b = Math.max(0, Math.min(255, parseInt(match[3], 10)));
        return ((r << 16) | (g << 8) | b) >>> 0;
      }
      if (/^#[0-9A-Fa-f]{6}$/.test(parsed)) {
        return parseInt(parsed.slice(1), 16) >>> 0;
      }
    } catch (_) {}
    return null;
  }

  function numberToHex(value) {
    return "#" + (value >>> 0).toString(16).padStart(6, "0").slice(-6).toUpperCase();
  }

  function numberToInputHex(value) {
    return "#" + (value >>> 0).toString(16).padStart(6, "0").slice(-6).toLowerCase();
  }

  function getResolvedColor(variable) {
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }

  // ── Fluxer Bridge (page-world store access) ───────────────────────────
  let fluxerBridge = false;

  function injectBridge() {
    return new Promise((resolve) => {
      let resolved = false;
      const onReady = () => {
        document.removeEventListener("__ti_bridge_ready", onReady);
        fluxerBridge = true;
        resolved = true;
        resolve(true);
      };
      document.addEventListener("__ti_bridge_ready", onReady);

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("bridge.js");
      script.onload = () => {
        script.remove();
        // If bridge didn't fire ready synchronously, give it a moment
        setTimeout(() => { if (!resolved) { resolved = true; resolve(false); } }, 500);
      };
      script.onerror = () => {
        script.remove();
        if (!resolved) { resolved = true; resolve(false); }
      };
      document.documentElement.appendChild(script);
    });
  }

  function getFluxerCss() {
    return new Promise((resolve) => {
      const handler = (e) => {
        document.removeEventListener("__ti_css_response", handler);
        resolve(e.detail || "");
      };
      document.addEventListener("__ti_css_response", handler);
      document.dispatchEvent(new CustomEvent("__ti_get_css"));
    });
  }

  function setFluxerCss(css) {
    document.dispatchEvent(new CustomEvent("__ti_set_css", { detail: css }));
  }

  // Update a single variable within a CSS string, or append it
  function updateCssForVariable(css, variableName, newValue) {
    const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(${escaped}\\s*:[^;]*;)`);

    if (newValue === null) {
      return css.replace(pattern, "").replace(/^\s*\n/gm, "");
    }
    if (pattern.test(css)) {
      return css.replace(pattern, `${variableName}: ${newValue};`);
    }
    // Append — wrap in :root if the CSS doesn't already have one
    const trimmed = css.trim();
    if (!trimmed) return `:root {\n  ${variableName}: ${newValue};\n}`;
    // Insert into existing :root block if present
    const rootEnd = trimmed.lastIndexOf("}");
    if (trimmed.includes(":root") && rootEnd !== -1) {
      return trimmed.slice(0, rootEnd) + `  ${variableName}: ${newValue};\n}`;
    }
    return `${trimmed}\n:root {\n  ${variableName}: ${newValue};\n}`;
  }

  // Parse a customThemeCss string into a { variable: value } map
  function extractOverridesFromCss(css) {
    const map = {};
    if (!css) return map;
    const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let m;
    while ((m = re.exec(css)) !== null) {
      map[m[1].trim()] = m[2].trim();
    }
    return map;
  }

  // ── Override Style Management ──────────────────────────────────────────
  let overrides = {};

  async function loadOverrides() {
    if (fluxerBridge) {
      const css = await getFluxerCss();
      overrides = extractOverridesFromCss(css);
    }
    applyOverrides();
  }

  async function setOverride(variable, value) {
    overrides[variable] = value;
    applyOverrides();

    if (fluxerBridge) {
      const css = await getFluxerCss();
      const updated = updateCssForVariable(css, variable, value);
      setFluxerCss(updated);
    }
  }

  async function resetAllOverrides() {
    overrides = {};
    applyOverrides();

    if (fluxerBridge) {
      setFluxerCss("");
    }
  }

  function applyOverrides() {
    let style = document.getElementById(OVERRIDE_STYLE_ID);
    const keys = Object.keys(overrides);
    if (!keys.length) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = OVERRIDE_STYLE_ID;
      document.head.appendChild(style);
    }
    const lines = keys.map((k) => `  ${k}: ${overrides[k]} !important;`);
    style.textContent = `:root {\n${lines.join("\n")}\n}`;
  }

  function getOverridesCSS() {
    const keys = Object.keys(overrides);
    if (!keys.length) return "";
    return `:root {\n${keys.map((k) => `  ${k}: ${overrides[k]};`).join("\n")}\n}`;
  }

  // ── Highlight ──────────────────────────────────────────────────────────
  function ensureHighlightStyle() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent = `[${HIGHLIGHT_ATTR}] { outline: 2px solid #7c3aed !important; outline-offset: 2px; box-shadow: inset 0 0 0 9999px rgba(124, 58, 237, 0.08), 0 0 0 4px rgba(124, 58, 237, 0.15) !important; }`;
    document.head.appendChild(style);
  }

  function removeHighlightStyle() {
    const el = document.getElementById(HIGHLIGHT_STYLE_ID);
    if (el) el.remove();
  }

  function clearAllHighlights() {
    for (const el of document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`)) {
      el.removeAttribute(HIGHLIGHT_ATTR);
    }
  }

  function highlightElementsForVariable(variable) {
    clearAllHighlights();
    ensureHighlightStyle();
    const elements = getElementsUsingVariable(variable);
    for (const el of elements) {
      el.setAttribute(HIGHLIGHT_ATTR, "true");
    }
  }

  // ── State ──────────────────────────────────────────────────────────────
  let toolbarEl = null;
  let toolbarRef = null;
  let isOpen = false;
  let selectorModeActive = false;
  let selectedVariable = null;
  let hoveredInfo = null; // { elementInfo, colors: string[], other: string[] }
  let highlightedVariable = null;
  let posX = 20;
  let posY = 20;

  // ── State Actions ─────────────────────────────────────────────────────
  function storeOpen() {
    isOpen = true;
    createToolbar();
  }

  function storeClose() {
    isOpen = false;
    selectorModeActive = false;
    selectedVariable = null;
    hoveredInfo = null;
    highlightedVariable = null;
    clearAllHighlights();
    removeHighlightStyle();
    removeHoverOverlay();
    document.body.style.cursor = "";
    destroyToolbar();
  }

  function storeToggle() {
    if (isOpen) storeClose();
    else storeOpen();
  }

  function storeToggleSelectorMode() {
    selectorModeActive = !selectorModeActive;
    if (selectorModeActive) {
      setupSelectorListeners();
    } else {
      teardownSelectorListeners();
      hoveredInfo = null;
    }
    renderToolbar();
  }

  function storeSetHoveredInfo(info) {
    hoveredInfo = info;
    renderToolbar();
  }

  function storePinHoveredInfo() {
    selectorModeActive = false;
    teardownSelectorListeners();
    selectedVariable = null;
    renderToolbar();
  }

  function storeSelectVariable(variable) {
    selectedVariable = variable;
    selectorModeActive = false;
    teardownSelectorListeners();
    renderToolbar();
  }

  function storeClearSelection() {
    selectedVariable = null;
    highlightedVariable = null;
    clearAllHighlights();
    renderToolbar();
  }

  function storeSetHighlightedVariable(variable) {
    highlightedVariable = variable;
  }

  // ── Hover Overlay (element picker) ─────────────────────────────────────
  let hoverOverlay = null;
  let hoverLabel = null;
  let lastHoverTarget = null;

  function createHoverOverlay() {
    if (hoverOverlay) return;
    hoverOverlay = document.createElement("div");
    hoverOverlay.className = "__ti-hover-overlay";
    document.body.appendChild(hoverOverlay);
    hoverLabel = document.createElement("div");
    hoverLabel.className = "__ti-hover-label";
    document.body.appendChild(hoverLabel);
  }

  function removeHoverOverlay() {
    if (hoverOverlay) { hoverOverlay.remove(); hoverOverlay = null; }
    if (hoverLabel) { hoverLabel.remove(); hoverLabel = null; }
    lastHoverTarget = null;
  }

  function updateHoverOverlay(el) {
    if (!hoverOverlay) createHoverOverlay();
    const rect = el.getBoundingClientRect();
    Object.assign(hoverOverlay.style, {
      top: rect.top + "px", left: rect.left + "px",
      width: rect.width + "px", height: rect.height + "px",
    });
    // Build label
    let label = el.tagName.toLowerCase();
    if (el.id) label += "#" + el.id;
    else if (typeof el.className === "string" && el.className.trim()) {
      const raw = el.className.trim().split(/\s+/)[0];
      const m = raw.match(/^(\w+)\.module__(\w+)___\w+$/);
      label += "." + (m ? `${m[1]}.${m[2]}` : raw.length > 24 ? raw.substring(0, 24) + "\u2026" : raw);
    }
    hoverLabel.textContent = `${label}  ${Math.round(rect.width)}\u00d7${Math.round(rect.height)}`;
    const labelTop = rect.top > 24 ? rect.top - 22 : rect.bottom + 2;
    hoverLabel.style.top = labelTop + "px";
    hoverLabel.style.left = rect.left + "px";
  }

  // ── Selector Mode Listeners ────────────────────────────────────────────
  let selectorListenersAttached = false;

  function onSelectorMouseMove(event) {
    const target = event.target;
    if (!target || target.nodeType !== 1) return;
    if (toolbarRef && toolbarRef.contains(target)) return;
    if (hoverOverlay && hoverOverlay.contains(target)) return;
    if (hoverLabel && hoverLabel.contains(target)) return;
    if (target === lastHoverTarget) return;
    lastHoverTarget = target;
    updateHoverOverlay(target);
    const info = getThemeVariablesForElement(target);
    storeSetHoveredInfo(info);
  }

  function onSelectorClick(event) {
    const target = event.target;
    if (!target) return;
    if (toolbarRef && toolbarRef.contains(target)) return;
    if (hoverOverlay && hoverOverlay.contains(target)) return;
    if (hoverLabel && hoverLabel.contains(target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!hoveredInfo) return;
    const all = [...hoveredInfo.colors, ...hoveredInfo.other];
    if (all.length === 1) {
      storeSelectVariable(all[0]);
    } else if (all.length > 0) {
      storePinHoveredInfo();
    }
  }

  function onSelectorKeyDown(event) {
    if (event.key === "Escape") {
      storeToggleSelectorMode();
    }
  }

  function setupSelectorListeners() {
    if (selectorListenersAttached) return;
    document.addEventListener("mousemove", onSelectorMouseMove, true);
    document.addEventListener("click", onSelectorClick, true);
    document.addEventListener("keydown", onSelectorKeyDown, true);
    document.body.style.cursor = "crosshair";
    selectorListenersAttached = true;
  }

  function teardownSelectorListeners() {
    if (!selectorListenersAttached) return;
    document.removeEventListener("mousemove", onSelectorMouseMove, true);
    document.removeEventListener("click", onSelectorClick, true);
    document.removeEventListener("keydown", onSelectorKeyDown, true);
    document.body.style.cursor = "";
    removeHoverOverlay();
    selectorListenersAttached = false;
  }

  // ── Drag ───────────────────────────────────────────────────────────────
  function setupDrag(handle, target) {
    let startX, startY, origX, origY;

    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      origX = posX;
      origY = posY;
      handle.setPointerCapture(e.pointerId);

      const onMove = (e2) => {
        const dx = e2.clientX - startX;
        const dy = e2.clientY - startY;
        posX = origX + dx;
        posY = origY + dy;
        target.style.transform = `translate(${posX}px, ${posY}px)`;
      };

      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        saveState({ x: posX, y: posY });
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  // ── Create / Destroy Toolbar ───────────────────────────────────────────
  function createToolbar() {
    if (toolbarEl) return;
    loadOverrides();

    const state = loadState();
    posX = typeof state.x === "number" ? state.x : 20;
    posY = typeof state.y === "number" ? state.y : 20;

    toolbarEl = document.createElement("div");
    toolbarEl.className = "__ti-container";
    toolbarEl.style.transform = `translate(${posX}px, ${posY}px)`;
    toolbarRef = toolbarEl;

    // Header
    const header = document.createElement("div");
    header.className = "__ti-header";

    const icon = document.createElement("span");
    icon.className = "__ti-header-icon";
    icon.innerHTML = ICONS.palette;
    header.appendChild(icon);

    const title = document.createElement("span");
    title.className = "__ti-header-title";
    title.textContent = "Theme Inspector";
    header.appendChild(title);

    const selectorBtn = document.createElement("button");
    selectorBtn.className = "__ti-header-btn";
    selectorBtn.setAttribute("aria-label", "Toggle element selector");
    selectorBtn.innerHTML = ICONS.crosshair;
    selectorBtn.addEventListener("click", () => {
      if (selectorModeActive) {
        clearAllHighlights();
      }
      storeToggleSelectorMode();
    });
    header.appendChild(selectorBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "__ti-header-btn";
    closeBtn.setAttribute("aria-label", "Close theme inspector");
    closeBtn.innerHTML = ICONS.close;
    closeBtn.addEventListener("click", storeClose);
    header.appendChild(closeBtn);

    toolbarEl.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "__ti-body";
    toolbarEl.appendChild(body);

    document.body.appendChild(toolbarEl);
    setupDrag(header, toolbarEl);

    renderToolbar();
  }

  function destroyToolbar() {
    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
      toolbarRef = null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function renderToolbar() {
    if (!toolbarEl) return;

    // Update selector button active state
    const selectorBtn = toolbarEl.querySelector('button[aria-label="Toggle element selector"]');
    if (selectorBtn) {
      if (selectorModeActive) {
        selectorBtn.classList.add("__ti-header-btn-active");
      } else {
        selectorBtn.classList.remove("__ti-header-btn-active");
      }
    }

    const body = toolbarEl.querySelector(".__ti-body");
    if (!body) return;
    body.innerHTML = "";

    if (selectedVariable) {
      renderSelectedVariableEditor(body, selectedVariable);
    } else if (hoveredInfo && (hoveredInfo.colors.length > 0 || hoveredInfo.other.length > 0)) {
      // Element info bar
      const infoBar = document.createElement("div");
      infoBar.className = "__ti-element-info";
      infoBar.textContent = hoveredInfo.elementInfo;
      body.appendChild(infoBar);

      // Color variables — shown prominently
      if (hoveredInfo.colors.length > 0) {
        const label = document.createElement("div");
        label.className = "__ti-section-label";
        label.textContent = `Colors (${hoveredInfo.colors.length})`;
        body.appendChild(label);
        renderVariableList(body, hoveredInfo.colors);
      }

      // Non-color variables — collapsed
      if (hoveredInfo.other.length > 0) {
        const details = document.createElement("details");
        details.className = "__ti-inherited-section";
        const summary = document.createElement("summary");
        summary.className = "__ti-section-label __ti-section-label-toggle";
        summary.textContent = `Layout & other (${hoveredInfo.other.length})`;
        details.appendChild(summary);
        renderVariableList(details, hoveredInfo.other);
        body.appendChild(details);
      }
    } else if (selectorModeActive) {
      const hint = document.createElement("div");
      hint.className = "__ti-hint";
      hint.textContent = "Hover over an element to see which theme variables style it.";
      body.appendChild(hint);
    } else {
      const hint = document.createElement("div");
      hint.className = "__ti-hint";
      hint.textContent = "Click the crosshair to activate element selector mode, or press Ctrl+Shift+. to toggle this toolbar.";
      body.appendChild(hint);
    }
  }

  function renderVariableList(container, variables) {
    const list = document.createElement("div");
    list.className = "__ti-variable-list";

    for (const v of variables) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "__ti-variable-item";

      const swatch = document.createElement("div");
      swatch.className = "__ti-swatch";
      swatch.style.backgroundColor = `var(${v})`;
      btn.appendChild(swatch);

      const name = document.createElement("span");
      name.className = "__ti-variable-name";
      name.textContent = v;
      btn.appendChild(name);

      btn.addEventListener("click", () => storeSelectVariable(v));

      btn.addEventListener("mouseenter", () => {
        highlightElementsForVariable(v);
      });

      btn.addEventListener("mouseleave", () => {
        if (!highlightedVariable) {
          clearAllHighlights();
        }
      });

      list.appendChild(btn);
    }

    container.appendChild(list);
  }

  function renderSelectedVariableEditor(container, variable) {
    const section = document.createElement("div");
    section.className = "__ti-selected-section";

    // Variable name header
    const header = document.createElement("div");
    header.className = "__ti-selected-header";
    header.textContent = variable;
    section.appendChild(header);

    // Color picker row
    const resolvedColor = getResolvedColor(variable);
    const colorNum = cssColorStringToNumber(resolvedColor);

    if (colorNum !== null) {
      const row = document.createElement("div");
      row.className = "__ti-color-row";

      const preview = document.createElement("div");
      preview.className = "__ti-color-preview";
      preview.style.backgroundColor = overrides[variable] || resolvedColor;

      const nativeInput = document.createElement("input");
      nativeInput.type = "color";
      nativeInput.className = "__ti-color-native";
      nativeInput.value = numberToInputHex(cssColorStringToNumber(overrides[variable] || resolvedColor) || colorNum);
      nativeInput.addEventListener("input", () => {
        setOverride(variable, nativeInput.value);
        preview.style.backgroundColor = nativeInput.value;
        textInput.value = nativeInput.value.toUpperCase();
      });
      preview.appendChild(nativeInput);
      row.appendChild(preview);

      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.className = "__ti-color-text";
      textInput.value = overrides[variable] || numberToHex(colorNum);
      textInput.addEventListener("input", () => {
        const num = cssColorStringToNumber(textInput.value);
        if (num !== null) {
          setOverride(variable, textInput.value);
          preview.style.backgroundColor = textInput.value;
          nativeInput.value = numberToInputHex(num);
        }
      });
      row.appendChild(textInput);

      section.appendChild(row);
    } else {
      // Non-color variable — text input only
      const textInput = document.createElement("input");
      textInput.type = "text";
      textInput.className = "__ti-color-text";
      textInput.style.width = "100%";
      textInput.value = overrides[variable] || resolvedColor;
      textInput.addEventListener("input", () => {
        setOverride(variable, textInput.value);
      });
      section.appendChild(textInput);
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "__ti-action-buttons";

    const highlightBtn = document.createElement("button");
    highlightBtn.type = "button";
    highlightBtn.className = "__ti-action-btn";

    function updateHighlightBtn() {
      highlightBtn.innerHTML =
        highlightedVariable === variable
          ? `${ICONS.highlighter} Clear highlight`
          : `${ICONS.highlighter} Highlight usage`;
    }
    updateHighlightBtn();

    highlightBtn.addEventListener("click", () => {
      if (highlightedVariable === variable) {
        clearAllHighlights();
        storeSetHighlightedVariable(null);
      } else {
        highlightElementsForVariable(variable);
        storeSetHighlightedVariable(variable);
      }
      updateHighlightBtn();
    });
    actions.appendChild(highlightBtn);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "__ti-action-btn";
    clearBtn.textContent = "Clear selection";
    clearBtn.addEventListener("click", () => {
      storeClearSelection();
    });
    actions.appendChild(clearBtn);

    section.appendChild(actions);
    container.appendChild(section);
  }

  // ── Hotkey: Ctrl+Shift+. ─────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === ">") {
      e.preventDefault();
      storeToggle();
    }
  });

  // ── Message handler for popup commands ─────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.action) {
      case "toggle":
        storeToggle();
        sendResponse({ isOpen });
        break;
      case "getState":
        sendResponse({
          isOpen,
          overrideCount: Object.keys(overrides).length,
          overridesCSS: getOverridesCSS(),
        });
        break;
      case "copyCSS": {
        const css = getOverridesCSS();
        if (css) {
          navigator.clipboard.writeText(css).then(
            () => sendResponse({ success: true }),
            () => sendResponse({ success: false })
          );
          return true; // async response
        }
        sendResponse({ success: false, empty: true });
        break;
      }
      case "resetAll":
        resetAllOverrides();
        invalidateCache();
        if (isOpen) renderToolbar();
        sendResponse({ success: true });
        break;
    }
  });

  // ── Fluxer Settings Integration (MutationObserver) ─────────────────────
  function injectSettingsButton() {
    // Don't inject if already present
    if (document.getElementById(SETTINGS_BTN_ID)) return;

    // Look for the Appearance settings section
    // Fluxer renders settings in a modal — look for headings containing "Appearance"
    // and the "Custom Theme Tokens" accordion/section
    const allHeadings = document.querySelectorAll("h2, h3, h4, [class*='heading'], [class*='title'], [class*='label']");
    let themeSection = null;

    for (const heading of allHeadings) {
      const text = heading.textContent.trim().toLowerCase();
      if (text.includes("custom theme") || text.includes("theme token")) {
        themeSection = heading;
        break;
      }
    }

    // Also try looking for an Appearance heading as a fallback
    if (!themeSection) {
      for (const heading of allHeadings) {
        const text = heading.textContent.trim().toLowerCase();
        if (text === "appearance") {
          themeSection = heading;
          break;
        }
      }
    }

    if (!themeSection) return;

    // Find the container to append the button to
    // Walk up to find a suitable parent, then append after
    let container = themeSection.closest("[class*='section']") || themeSection.parentElement;
    if (!container) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = SETTINGS_BTN_ID;
    btn.className = "__ti-settings-btn";
    btn.innerHTML = `${ICONS.palette} Open Theme Inspector`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isOpen) storeOpen();
    });

    container.appendChild(btn);
  }

  // Watch for settings modal appearance
  const settingsObserver = new MutationObserver(() => {
    // Debounce: only check if we don't already have the button
    if (!document.getElementById(SETTINGS_BTN_ID)) {
      injectSettingsButton();
    }
  });

  // Start observing once DOM is ready
  function startSettingsObserver() {
    settingsObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    // Also try immediately in case settings is already open
    injectSettingsButton();
  }

  // ── Initialize ─────────────────────────────────────────────────────────
  async function init() {
    await loadStateFromStorage();
    await injectBridge();
    await loadOverrides();
    await fetchCrossOriginSheets();
    startSettingsObserver();
  }

  init();
})();
