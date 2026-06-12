/* -----------------------
   UI spec (keys, not text)
   structure: [tabKey, [ [btnKey, id, fn, optionalEventType], ... ]]
   ----------------------- */
const UI = [
  ["RECORD", [
    ["START", "b_record",  startRecording],
    ["STOP",  "b_recstop", stopRecording],
    ["IMAGE", "b_image",   toggleRecorderImageOverlay],
    ["EMULATE", "b_emulate", emulateRecordingFromUI],
  ]],

  ["MOBILE_NOTES", [
  ]],

  ["REPLAY", [
    ["REPLAY",              "b_replay",       replayNormal],
    ["FAST_FORWARD",        "b_fastforward",  replayFast],
    ["PAUSE",               "b_reppause",     replayPauseToggle],
    ["EDIT_BACK",           "b_repeditback",  replayStepEditBackward],
    ["EDIT_FORWARD",        "b_repeditforward", replayStepEditForward],
    ["GO_TO_END",           "b_repend",       replayGoToEnd],
    ["STOP",                "b_repstop",      replayStop],
    ["FETCH",               "b_fetch",        fetchFromStorage],
    ["FETCH_PLUS",          "b_fetchplus",    fetchPlusFromStorage],
    ["FETCH_TO_ZIP",        "b_fetchtozip",   fetchToZip,            "dblclick"],
    ["FETCH_FT_TO_ZIP",     "b_fetchfttozip", fetchFinalTextsToZip,  "dblclick"],
    ["FETCH_STATS_TO_ZIP",  "b_fetchstatstozip", fetchStatsToZip,    "dblclick"],
    ["FETCH_STATS_TO_XLSX", "b_fetchstatstoxlsx", fetchStatsToXlsx,  "dblclick"],
    ["FETCH_IDFX_TO_ZIP",   "b_fetchidfxtozip", fetchIDFXToZip,      "dblclick"],
    ["FETCH_WRITING_SCORE_TO_ZIP", "b_fetchwritingscoretozip", fetchWritingScoreToZip, "dblclick"],
    ["LOAD_GRID",           "b_loadgrid",     loadGridFromListbox],
    ["CLEAR",               "b_clear",        clearListbox],
    ["CLEAR_ALL",           "b_clearall",     emptyListbox,          "dblclick"],
    ["DOWNLOAD",            "b_download",     dlFromListbox],
    ["DOWNLOAD_FINAL_TEXT", "b_downloadft",   dlFinalTextFromListbox],
  ]],

  ["ANALYZE", [
  ]],

  ["SETTINGS", [
  ]],
];

const LAYOUT_KEY = "layoutMode";

function getLayoutMode() {
  const mode = localStorage.getItem(LAYOUT_KEY);
  return mode === "classic" || mode === "grid" ? mode : "modern";
}

function applyLayoutMode(mode) {
  const normalized = mode === "classic" || mode === "grid" ? mode : "modern";
  document.body.setAttribute("data-layout", normalized);
  localStorage.setItem(LAYOUT_KEY, normalized);
  return normalized;
}

/* -----------------------
   Helpers
   ----------------------- */
function moveButtonsTo(containerId, buttonIds) {
  const container = document.getElementById(containerId);
  if (!container) return;
  buttonIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) container.appendChild(btn);
  });
}

function layoutButtonsInRowsPreserve(containerEl, rows, { afterId = null } = {}) {
  if (!containerEl) return;

  const grid = document.createElement("div");
  grid.className = "btn-grid";

  rows.forEach(rowIds => {
    const row = document.createElement("div");
    row.className = "btn-row";
    rowIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) row.appendChild(btn);
    });
    grid.appendChild(row);
  });

  // Remove previous grid if present (preserve other nodes)
  const oldGrid = containerEl.querySelector(":scope > .btn-grid");
  if (oldGrid) oldGrid.remove();

  if (afterId) {
    const anchor = containerEl.querySelector(`#${CSS.escape(afterId)}`);
    if (anchor && anchor.parentElement === containerEl) {
      // Insert after anchor
      anchor.insertAdjacentElement("afterend", grid);
      return;
    }
  }

  // Fallback: append at end
  containerEl.appendChild(grid);
}

function layoutButtonsInRows(containerEl, rows) {
  if (!containerEl) return;

  const grid = document.createElement("div");
  grid.className = "btn-grid";

  rows.forEach(rowIds => {
    const row = document.createElement("div");
    row.className = "btn-row";

    rowIds.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) row.appendChild(btn);
    });

    grid.appendChild(row);
  });

  containerEl.innerHTML = "";
  containerEl.appendChild(grid);
}

function markDoubleClickButtonsFromUI(UI) {
  const dblIds = new Set();
  for (const [, buttons] of UI) {
    for (const spec of buttons) {
      const eventType = spec[3] ?? "click";
      if (eventType === "dblclick") dblIds.add(spec[1]);
    }
  }

  dblIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.add("dblclick");

    const t0 = (btn.getAttribute("title") || "").trim();
    const hint = t("hint.dblclick");
    btn.setAttribute("title", t0 ? `${t0} (${hint})` : hint);
  });
}

/* -----------------------
   initUI: build UI from UI + templates, then apply i18n
   ----------------------- */

function initUI() {
  const tabsRoot = document.getElementById("tabs");
  tabsRoot.innerHTML = ""; // always start clean when (re)building

  const tabbar = document.createElement("ul");
  tabbar.className = "tabbar";
  tabbar.setAttribute("role", "tablist");

  const panelsWrap = document.createElement("div");

  const tabButtonsByName = new Map();
  const panelsByName = new Map();
  const buttonBarByTab = new Map();

  UI.forEach(([tabName], idx) => {
    const li = document.createElement("li");
    const tabBtn = document.createElement("button");
    tabBtn.type = "button";
    tabBtn.textContent = t(`tab.${tabName}`);
    tabBtn.id = `tab-${idx}`;
    tabBtn.setAttribute("role", "tab");
    tabBtn.setAttribute("aria-controls", `panel-${idx}`);
    tabBtn.setAttribute("aria-selected", "false");
    tabBtn.addEventListener("click", () => activateTab(tabName));
    li.appendChild(tabBtn);
    tabbar.appendChild(li);
    tabButtonsByName.set(tabName, tabBtn);

    const tpl = document.getElementById(`panel-${tabName}`);
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = `panel-${idx}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tabBtn.id);

    if (!tpl) {
      panel.innerHTML = `<p>(Missing template for ${tabName})</p>`;
    } else {
      panel.appendChild(tpl.content.cloneNode(true));
      const btnbar = panel.querySelector('[data-role="btnbar"]');
      if (btnbar) buttonBarByTab.set(tabName, btnbar);
    }

    panelsWrap.appendChild(panel);
    panelsByName.set(tabName, panel);
  });

  tabsRoot.appendChild(tabbar);
  tabsRoot.appendChild(panelsWrap);

  // create buttons (localized labels)
  for (const [tabName, buttons] of UI) {
    const bar = buttonBarByTab.get(tabName);
    if (!bar) continue;

    for (const [btnKey, id, handler, eventType = "click"] of buttons) {
      const btn = document.createElement("button");
      btn.className = "sl_button";
      btn.type = "button";
      btn.id = id;
      btn.textContent = t(`btn.${btnKey}`);
      btn.addEventListener(eventType, handler, false);
      bar.appendChild(btn);
      window[id] = btn; // optional compatibility
    }
  }

  // Post-UI layout/moves
  layoutButtonsInRows(buttonBarByTab.get("RECORD"), [
    ["b_record", "b_recstop"],
    ["b_image", "b_emulate"],
  ]);

  moveButtonsTo("div_fetch", ["b_fetch","b_fetchplus","b_fetchtozip","b_fetchfttozip","b_fetchstatstozip","b_fetchstatstoxlsx","b_fetchidfxtozip","b_fetchwritingscoretozip"]);

  moveButtonsTo("replayTransportControls", ["b_replay", "b_fastforward", "b_reppause", "b_repeditback", "b_repeditforward", "b_repend", "b_repstop"]);

  layoutButtonsInRows(buttonBarByTab.get("REPLAY"), [
    ["b_loadgrid"],
    ["b_clear", "b_clearall"],
    ["b_download", "b_downloadft"],
  ]);

	layoutButtonsInRowsPreserve(document.getElementById("div_fetch"), [
		["b_fetch", "b_fetchplus"],
		["b_fetchtozip", "b_fetchfttozip"],
		["b_fetchstatstozip", "b_fetchstatstoxlsx"],
		["b_fetchidfxtozip", "b_fetchwritingscoretozip"],
	], { afterId: "endlimit" });


  markDoubleClickButtonsFromUI(UI);

  // Translate static HTML inside cloned templates
  applyI18n(tabsRoot);

  if (typeof initDashboard === "function") {
    initDashboard();
  }

  // Keep layout mode sticky across reloads/language changes.
  const layoutSel = tabsRoot.querySelector("#layoutMode");
  if (layoutSel) {
    const currentLayout = getLayoutMode();
    layoutSel.value = currentLayout;
    applyLayoutMode(currentLayout);
    layoutSel.addEventListener("change", () => {
      layoutSel.value = applyLayoutMode(layoutSel.value);
    });
  } else {
    applyLayoutMode(getLayoutMode());
  }

  // NOW the language picker exists (it’s inside the SETTINGS panel)
  const langSel = tabsRoot.querySelector("#lang");
  if (langSel) {
    langSel.value = LANG;
    langSel.addEventListener("change", () => {
      LANG = langSel.value;
      localStorage.setItem("lang", LANG);
      init(); // rebuild with new language
    });
  }

  // activate first tab
  activateTab(UI[0]?.[0]);

  function activateTab(tabName) {
    for (const [name, panel] of panelsByName) {
      panel.classList.toggle("is-active", name === tabName);
    }
    for (const [name, btn] of tabButtonsByName) {
      btn.setAttribute("aria-selected", name === tabName ? "true" : "false");
    }
  }

  window.activateWebScriptLogTab = activateTab;
}
