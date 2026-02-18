/* Fluxer Theme Inspector — Page-world bridge
 *
 * Injected into the page's MAIN JS world (not the content script's isolated world).
 * Finds Fluxer's AccessibilityStore and ActionCreators via webpack internals,
 * then exposes read/write for customThemeCss via DOM custom events.
 */
(function () {
  "use strict";

  // Find the webpack chunk push array
  const chunkKey = Object.keys(window).find((k) => k.startsWith("webpackChunk"));
  if (!chunkKey) return;

  // Extract the webpack require function
  let wpRequire;
  try {
    window[chunkKey].push([["__ti_probe"], {}, (r) => (wpRequire = r)]);
    window[chunkKey].pop();
  } catch (_) {
    return;
  }
  if (!wpRequire || !wpRequire.m) return;

  // ── Module finders ───────────────────────────────────────────────────

  // Load a module by path, return its exports (or null)
  function tryRequire(path) {
    try { return wpRequire(path); } catch (_) { return null; }
  }

  // Find an export within a module that passes a filter
  function findExport(mod, filter) {
    if (!mod) return null;
    for (const val of Object.values(mod)) {
      try { if (val != null && filter(val)) return val; } catch (_) {}
    }
    return null;
  }

  // Fallback: search ALL loaded modules for an export matching the filter
  function findInAllModules(filter) {
    for (const id of Object.keys(wpRequire.m)) {
      try {
        const mod = wpRequire(id);
        const hit = findExport(mod, filter);
        if (hit) return hit;
      } catch (_) {}
    }
    return null;
  }

  // ── Find AccessibilityStore ──────────────────────────────────────────

  // Strategy 1: known path
  let store = findExport(
    tryRequire("./src/stores/AccessibilityStore.tsx"),
    (v) => typeof v === "object" && "customThemeCss" in v
  );

  // Strategy 2: brute-force search
  if (!store) {
    store = findInAllModules(
      (v) => typeof v === "object" && "customThemeCss" in v && "fontSize" in v
    );
  }

  // ── Find AccessibilityActionCreators.update ──────────────────────────

  // Strategy 1: known path — the module exports a single function
  let updateFn = findExport(
    tryRequire("./src/actions/AccessibilityActionCreators.tsx"),
    (v) => typeof v === "function"
  );

  // Strategy 2: brute-force search (look for module that imports the store path)
  if (!updateFn) {
    updateFn = findInAllModules(
      (v) => typeof v === "function" && v.length === 1 && String(v).includes("customThemeCss")
    );
  }

  if (!store) {
    console.warn("[Theme Inspector Bridge] AccessibilityStore not found");
    return;
  }
  if (!updateFn) {
    console.warn("[Theme Inspector Bridge] AccessibilityActionCreators not found");
  }

  // ── Event-based API for the content script ───────────────────────────

  // Content script requests current customThemeCss
  document.addEventListener("__ti_get_css", () => {
    const css = store.customThemeCss ?? "";
    document.dispatchEvent(new CustomEvent("__ti_css_response", { detail: css }));
  });

  // Content script writes updated customThemeCss
  document.addEventListener("__ti_set_css", (e) => {
    if (updateFn) {
      updateFn({ customThemeCss: e.detail });
    }
  });

  // Signal bridge is ready
  document.dispatchEvent(new CustomEvent("__ti_bridge_ready"));
})();
