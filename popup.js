/* Fluxer Theme Inspector — Popup Script */
"use strict";

const toggleBtn = document.getElementById("toggleBtn");
const copyBtn = document.getElementById("copyBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");

// ── Helpers ──────────────────────────────────────────────────────────────

function showStatus(text, type = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (type ? " " + type : "");
  if (text) {
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "status";
    }, 3000);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(action) {
  const tab = await getActiveTab();
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, { action });
  } catch (_) {
    return null;
  }
}

// ── Inspector Controls ───────────────────────────────────────────────────

async function refreshState() {
  const state = await sendToContent("getState");
  if (state) {
    toggleBtn.textContent = state.isOpen ? "Close Inspector" : "Open Inspector";
    if (state.overrideCount > 0) {
      showStatus(`${state.overrideCount} override(s) active`);
    }
  } else {
    toggleBtn.textContent = "Open Inspector";
    showStatus("Not available on this page", "error");
    toggleBtn.disabled = true;
    copyBtn.disabled = true;
    resetBtn.disabled = true;
  }
}

toggleBtn.addEventListener("click", async () => {
  const result = await sendToContent("toggle");
  if (result) {
    toggleBtn.textContent = result.isOpen ? "Close Inspector" : "Open Inspector";
  }
});

copyBtn.addEventListener("click", async () => {
  const result = await sendToContent("copyCSS");
  if (result?.success) {
    showStatus("CSS copied to clipboard!", "success");
  } else if (result?.empty) {
    showStatus("No overrides to copy", "error");
  } else {
    showStatus("Failed to copy", "error");
  }
});

resetBtn.addEventListener("click", async () => {
  const result = await sendToContent("resetAll");
  if (result?.success) {
    showStatus("All overrides cleared", "success");
  }
});

// ── Init ─────────────────────────────────────────────────────────────────

refreshState();
