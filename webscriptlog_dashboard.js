// Modular dashboard shell for swappable workspace panels.
const DASHBOARD_LAYOUT_KEY = "webscriptlog.dashboard.layout";

const DashboardEventBus = {
  listeners: new Map(),
  on(eventName, handler) {
    const list = this.listeners.get(eventName) || [];
    list.push(handler);
    this.listeners.set(eventName, list);
    return () => {
      const current = this.listeners.get(eventName) || [];
      this.listeners.set(eventName, current.filter((item) => item !== handler));
    };
  },
  emit(eventName, payload) {
    const list = this.listeners.get(eventName) || [];
    list.forEach((handler) => handler(payload));
  }
};

const DashboardModules = new Map();
const DashboardExternalHomes = new Map();
let dashboardLayout = null;

function registerDashboardModule(moduleDef) {
  if (!moduleDef || !moduleDef.id || !moduleDef.title || typeof moduleDef.getNode !== "function") return;
  DashboardModules.set(moduleDef.id, moduleDef);
}

function getDefaultDashboardLayout() {
  return {
    version: 3,
    columns: 2,
    rowHeight: 420,
    slots: [
      { id: "slot-replay", module: "textReplay", spanX: 1, spanY: 1 },
      { id: "slot-trace", module: "textTrace", spanX: 1, spanY: 1 },
      { id: "slot-score", module: "writingScore", spanX: 1, spanY: 1 },
      { id: "slot-graph", module: "processGraph", spanX: 1, spanY: 1 },
      { id: "slot-diffkeys", module: "diffKeys", spanX: 2, spanY: 1 },
      { id: "slot-controls", module: "playbackControls", spanX: 2, spanY: 1 },
      { id: "slot-idfx-csv", module: "idfxCsv", spanX: 2, spanY: 1 }
    ]
  };
}

function normalizeDashboardSpan(value, fallback = 1) {
  const span = Math.floor(Number(value));
  return Number.isFinite(span) ? Math.max(1, Math.min(2, span)) : fallback;
}

function normalizeDashboardLayout(layout) {
  const fallback = getDefaultDashboardLayout();
  if (!layout || !Array.isArray(layout.slots)) return fallback;
  const layoutVersion = Number(layout.version) || 1;
  const slots = layout.slots.slice();
  if (layoutVersion < 2 && !slots.some((slot) => slot?.module === "idfxCsv")) {
    slots.push({ id: "slot-idfx-csv", module: "idfxCsv", spanX: 2, spanY: 1 });
  }
  if (layoutVersion < 3 && !slots.some((slot) => slot?.module === "diffKeys")) {
    slots.push({ id: "slot-diffkeys", module: "diffKeys", spanX: 2, spanY: 1 });
  }
  return {
    version: 3,
    columns: Math.max(1, Math.min(2, Number(layout.columns) || fallback.columns)),
    rowHeight: Number(layout.rowHeight) || fallback.rowHeight,
    slots: slots
      .filter((slot) => slot && slot.id)
      .map((slot) => ({
        id: String(slot.id),
        module: DashboardModules.has(slot.module) ? slot.module : "empty",
        spanX: normalizeDashboardSpan(slot.spanX ?? (slot.wide ? 2 : 1)),
        spanY: normalizeDashboardSpan(slot.spanY),
        full: !!slot.full
      }))
  };
}

function loadDashboardLayout() {
  try {
    const raw = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (raw) return normalizeDashboardLayout(JSON.parse(raw));
  } catch (err) {
    console.warn("Could not load dashboard layout", err);
  }
  return getDefaultDashboardLayout();
}

function saveDashboardLayout(layout = dashboardLayout) {
  if (!layout) return;
  localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
}

function serializeDashboardLayout() {
  return JSON.stringify(dashboardLayout || getDefaultDashboardLayout(), null, 2);
}

function applyDashboardLayout(layout) {
  dashboardLayout = normalizeDashboardLayout(layout);
  saveDashboardLayout();
  renderDashboard();
  return dashboardLayout;
}

function getDashboardModuleBankNode(moduleId) {
  const bank = document.getElementById("dashboardModuleBank");
  return bank?.querySelector?.(`[data-dashboard-module="${CSS.escape(moduleId)}"]`) || null;
}

function getBankedModuleNode(moduleId) {
  const source = getDashboardModuleBankNode(moduleId);
  if (!source) return null;
  return source.firstElementChild || source;
}

function rememberDashboardNodeHome(moduleId, node) {
  if (!node || DashboardExternalHomes.has(moduleId)) return;
  if (node.closest?.("#playbackDashboard")) return;
  const parent = node.parentNode;
  if (!parent) return;
  const placeholder = document.createComment(`dashboard-home:${moduleId}`);
  parent.insertBefore(placeholder, node);
  DashboardExternalHomes.set(moduleId, { placeholder });
}

function registerDefaultDashboardModules() {
  if (DashboardModules.size > 0) return;

  registerDashboardModule({
    id: "empty",
    title: "Empty",
    getNode() {
      const node = document.createElement("div");
      node.className = "dashboard-empty-panel";
      return node;
    }
  });

  registerDashboardModule({
    id: "textReplay",
    title: "Text Replay",
    getNode() {
      return getBankedModuleNode("textReplay");
    }
  });

  registerDashboardModule({
    id: "textTrace",
    title: "Text Trace",
    refreshKey: "writingAnalysis",
    getNode() {
      return getBankedModuleNode("textTrace");
    },
    refresh() {
      if (typeof showWritingScore === "function") showWritingScore();
    }
  });

  registerDashboardModule({
    id: "writingScore",
    title: "Writing Score",
    refreshKey: "writingAnalysis",
    getNode() {
      return getBankedModuleNode("writingScore");
    },
    refresh() {
      if (typeof showWritingScore === "function") showWritingScore();
    }
  });

  registerDashboardModule({
    id: "processGraph",
    title: "Process Graph",
    getNode() {
      return getBankedModuleNode("processGraph");
    },
    refresh() {
      if (typeof refreshProcessGraphIfPossible === "function") refreshProcessGraphIfPossible();
    }
  });

  registerDashboardModule({
    id: "diffKeys",
    title: "DiffKeys",
    getNode() {
      return getBankedModuleNode("diffKeys");
    },
    refresh() {
      if (hasDashboardRecordData() && typeof renderDiffKeysPane === "function") renderDiffKeysPane();
    }
  });

  registerDashboardModule({
    id: "playbackControls",
    title: "Log Object Manager",
    getNode() {
      return getBankedModuleNode("playbackControls");
    }
  });

  registerDashboardModule({
    id: "revisionTable",
    title: "Revision Table",
    getNode() {
      return getBankedModuleNode("revisionTable");
    },
    refresh() {
      if (hasDashboardRecordData() && typeof makeRevisionTable === "function") makeRevisionTable();
    }
  });

  registerDashboardModule({
    id: "finalTextAnalysis",
    title: "Final Text Analysis",
    getNode() {
      return getBankedModuleNode("finalTextAnalysis");
    },
    refresh() {
      if (hasDashboardRecordData() && typeof makeFTAnalysis === "function") makeFTAnalysis();
    }
  });

  registerDashboardModule({
    id: "infoWindow",
    title: "Info Window",
    getNode() {
      return getBankedModuleNode("infoWindow");
    }
  });

  registerDashboardModule({
    id: "idfxCsv",
    title: "IDFX",
    getNode() {
      return getBankedModuleNode("idfxCsv");
    }
  });
}

function returnDashboardPanelContentToBank() {
  const bank = document.getElementById("dashboardModuleBank");
  const workspace = document.getElementById("playbackDashboard");
  if (!bank || !workspace) return;
  workspace.querySelectorAll("[data-dashboard-mounted-module]").forEach((node) => {
    const moduleId = node.getAttribute("data-dashboard-mounted-module");
    const source = getDashboardModuleBankNode(moduleId);
    if (source && node.parentElement) {
      source.appendChild(node);
      node.removeAttribute("data-dashboard-mounted-module");
      return;
    }
    const home = DashboardExternalHomes.get(moduleId);
    if (
      home?.placeholder?.parentNode &&
      node.parentElement &&
      !node.contains(home.placeholder.parentNode)
    ) {
      home.placeholder.parentNode.insertBefore(node, home.placeholder.nextSibling);
      node.removeAttribute("data-dashboard-mounted-module");
      return;
    }
    if (node.parentElement) {
      bank.appendChild(node);
      node.removeAttribute("data-dashboard-mounted-module");
    }
  });
}

function makeDashboardModuleSelect(slot) {
  const select = document.createElement("select");
  select.className = "dashboard-module-select";
  select.setAttribute("aria-label", "Panel module and layout actions");

  const moduleGroup = document.createElement("optgroup");
  moduleGroup.label = "Pane content";
  [...DashboardModules.values()].forEach((moduleDef) => {
    const option = document.createElement("option");
    option.value = moduleDef.id;
    option.textContent = moduleDef.title;
    option.selected = moduleDef.id === slot.module;
    moduleGroup.appendChild(option);
  });
  select.appendChild(moduleGroup);

  const actionGroup = document.createElement("optgroup");
  actionGroup.label = "Pane layout";
  [
    ["__action:add", "Add pane"],
    ["__action:delete", "Delete pane"],
    ["__size:full", "Full"],
    ["__size:1x1", "1x1"],
    ["__size:2x1", "2x1"],
    ["__size:1x2", "1x2"],
    ["__size:2x2", "2x2"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    actionGroup.appendChild(option);
  });
  select.appendChild(actionGroup);

  select.addEventListener("change", () => {
    handleDashboardPanelSelect(slot.id, select.value);
  });

  return select;
}

function handleDashboardPanelSelect(slotId, value) {
  if (value === "__action:add") {
    addDashboardPanel();
    return;
  }
  if (value === "__action:delete") {
    deleteDashboardPanel(slotId);
    return;
  }
  if (value.startsWith("__size:")) {
    if (value === "__size:full") {
      setDashboardPanelFull(slotId);
      return;
    }
    const match = value.slice("__size:".length).match(/^([12])x([12])$/);
    if (match) setDashboardPanelSize(slotId, Number(match[1]), Number(match[2]));
    return;
  }
  setDashboardPanelModule(slotId, value);
}

function renderDashboardPanel(slot) {
  const moduleDef = DashboardModules.get(slot.module) || DashboardModules.get("empty");
  const panel = document.createElement("section");
  panel.className = "dashboard-panel";
  panel.dataset.dashboardSlot = slot.id;
  panel.dataset.dashboardModule = moduleDef.id;
  panel.dataset.dashboardSpan = `${slot.spanX || 1}x${slot.spanY || 1}`;
  panel.dataset.dashboardFull = slot.full ? "true" : "false";
  panel.style.setProperty("--dashboard-span-x", normalizeDashboardSpan(slot.spanX));
  panel.style.setProperty("--dashboard-span-y", normalizeDashboardSpan(slot.spanY));

  const header = document.createElement("div");
  header.className = "dashboard-panel-header";

  const title = document.createElement("h3");
  title.textContent = moduleDef.title;
  header.appendChild(title);
  header.appendChild(makeDashboardModuleSelect(slot));
  panel.appendChild(header);

  const body = document.createElement("div");
  body.className = "dashboard-panel-body";
  const node = moduleDef.getNode();
  if (node) {
    rememberDashboardNodeHome(moduleDef.id, node);
    node.setAttribute("data-dashboard-mounted-module", moduleDef.id);
    body.appendChild(node);
  }
  panel.appendChild(body);

  return panel;
}

function renderDashboard() {
  const workspace = document.getElementById("playbackDashboard");
  if (!workspace) return;

  returnDashboardPanelContentToBank();
  workspace.innerHTML = "";
  workspace.style.setProperty("--dashboard-row-height", `${dashboardLayout.rowHeight}px`);
  workspace.style.setProperty("--dashboard-columns", dashboardLayout.columns);

  dashboardLayout.slots.forEach((slot) => {
    workspace.appendChild(renderDashboardPanel(slot));
  });

  DashboardEventBus.emit("dashboard:rendered", dashboardLayout);
  window.dashboardLayout = dashboardLayout;
  if (hasDashboardRecordData()) refreshDashboardModules();
  if (typeof scheduleProcessGraphRefresh === "function") {
    requestAnimationFrame(() => requestAnimationFrame(scheduleProcessGraphRefresh));
  }
  if (typeof bindProcessGraphResizeObserver === "function") {
    requestAnimationFrame(bindProcessGraphResizeObserver);
  }
}

function setDashboardPanelModule(slotId, moduleId) {
  if (!dashboardLayout || !DashboardModules.has(moduleId)) return;
  const slot = dashboardLayout.slots.find((item) => item.id === slotId);
  if (!slot) return;
  if (moduleId !== "empty") {
    dashboardLayout.slots.forEach((item) => {
      if (item.id !== slotId && item.module === moduleId) {
        item.module = "empty";
      }
    });
  }
  slot.module = moduleId;
  saveDashboardLayout();
  renderDashboard();
}

function addDashboardPanel() {
  if (!dashboardLayout) return;
  dashboardLayout.slots.push({
    id: `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    module: "empty",
    spanX: 1,
    spanY: 1,
    full: false
  });
  saveDashboardLayout();
  renderDashboard();
}

function deleteDashboardPanel(slotId) {
  if (!dashboardLayout) return;
  if (dashboardLayout.slots.length <= 1) return;
  dashboardLayout.slots = dashboardLayout.slots.filter((slot) => slot.id !== slotId);
  saveDashboardLayout();
  renderDashboard();
}

function setDashboardPanelSize(slotId, spanX, spanY) {
  if (!dashboardLayout) return;
  const slot = dashboardLayout.slots.find((item) => item.id === slotId);
  if (!slot) return;
  slot.spanX = normalizeDashboardSpan(spanX);
  slot.spanY = normalizeDashboardSpan(spanY);
  slot.full = false;
  saveDashboardLayout();
  renderDashboard();
}

function setDashboardPanelFull(slotId) {
  if (!dashboardLayout) return;
  const slot = dashboardLayout.slots.find((item) => item.id === slotId);
  if (!slot) return;
  slot.full = true;
  saveDashboardLayout();
  renderDashboard();
}

function hasDashboardRecordData() {
  return typeof header_record !== "undefined" &&
    header_record &&
    header_record.starttime &&
    typeof text_record !== "undefined" &&
    text_record &&
    Object.keys(text_record).length > 0;
}

function refreshDashboardModules() {
  if (!dashboardLayout) return;
  const refreshed = new Set();
  dashboardLayout.slots.forEach((slot) => {
    const moduleDef = DashboardModules.get(slot.module);
    const refreshKey = moduleDef?.refreshKey || slot.module;
    if (refreshed.has(refreshKey)) return;
    if (moduleDef && typeof moduleDef.refresh === "function") moduleDef.refresh();
    refreshed.add(refreshKey);
  });
}

function resetDashboardLayout() {
  dashboardLayout = getDefaultDashboardLayout();
  saveDashboardLayout();
  renderDashboard();
}

function initDashboard() {
  registerDefaultDashboardModules();
  dashboardLayout = loadDashboardLayout();
  renderDashboard();
  window.registerDashboardModule = registerDashboardModule;
  window.applyDashboardLayout = applyDashboardLayout;
  window.serializeDashboardLayout = serializeDashboardLayout;
  window.resetDashboardLayout = resetDashboardLayout;
  window.addDashboardPanel = addDashboardPanel;
  window.deleteDashboardPanel = deleteDashboardPanel;
  window.setDashboardPanelSize = setDashboardPanelSize;
  window.setDashboardPanelFull = setDashboardPanelFull;
  window.refreshDashboardModules = refreshDashboardModules;
  window.dashboardModules = DashboardModules;
  window.dashboardEvents = DashboardEventBus;
  window.dashboardLayout = dashboardLayout;
}
