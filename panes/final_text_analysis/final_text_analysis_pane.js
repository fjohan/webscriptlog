(function (root) {
  "use strict";

  function getCurrentRecords() {
    if (typeof root.getCurrentWebScriptLogRecords === "function") return root.getCurrentWebScriptLogRecords();
    return {
      header_records: root.header_record || {},
      text_records: root.text_record || {},
      key_records: root.key_record || {}
    };
  }

  function getStorageKey() {
    const selected = root.lb_load?.options?.[root.lb_load.selectedIndex];
    return selected?.text || selected?.textContent || getCurrentRecords().header_records?._indexeddb_key || "current";
  }

  function getFinalTextAnalysisPurityColor(purity) {
    const value = Math.max(0, Math.min(8, Number(purity) || 0));
    const hue = Math.round(132 - (value / 8) * 132);
    const alpha = value === 0 ? 0.16 : 0.24 + (value / 8) * 0.34;
    return `hsla(${hue}, 88%, 52%, ${alpha.toFixed(2)})`;
  }

  function applyFinalTextAnalysisPurityColors(contentDiv, records = {}) {
    if (!contentDiv) return;
    const spans = Array.from(contentDiv.querySelectorAll("span[time-bef][time-aft]"));
    if (!spans.length) return;

    let rows = [];
    try {
      rows = root.WebScriptLogAnalysisCore.buildWordBoundaryTiming(records);
    } catch (err) {
      console.warn("Could not calculate word purity for Final Text Analysis.", err);
      return;
    }

    rows.forEach((row) => {
      const color = getFinalTextAnalysisPurityColor(row.wordPurity);
      for (let i = row.start; i < row.end && i < spans.length; i++) {
        const span = spans[i];
        span.classList.add("fta-purity-char");
        if (i === row.start) span.classList.add("fta-purity-word-start");
        if (i === row.end - 1) span.classList.add("fta-purity-word-end");
        span.dataset.wordIndex = row.index;
        span.dataset.wordPurity = row.wordPurity;
        span.style.backgroundColor = color;
        span.title = `${row.word}: purity ${row.wordPurity}`;
      }
    });
  }

  function getHighlightedCharSpans() {
    return Array.from(document.querySelectorAll("#content span[time-bef][time-aft]"));
  }

  function saveAllHighlights() {
    const wrappers = Array.from(document.querySelectorAll("#content .newspan"));
    const allChars = getHighlightedCharSpans();

    return wrappers.map((wrapper) => {
      const chars = wrapper.querySelectorAll("span[time-bef][time-aft]");
      if (!chars.length) return null;

      const start = allChars.indexOf(chars[0]);
      const end = allChars.indexOf(chars[chars.length - 1]) + 1;
      if (start < 0 || end <= start) return null;

      return { start, end };
    }).filter(Boolean);
  }

  function unwrapFinalTextMark(wrapper) {
    if (!wrapper?.parentNode) return;
    const parent = wrapper.parentNode;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
  }

  function applyAllHighlights(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) return;

    const spans = Array.from(document.querySelectorAll("#content span[time-bef][time-aft]"));
    if (spans.length === 0) return;

    Array.from(document.querySelectorAll("#content .newspan")).forEach(unwrapFinalTextMark);
    const flat = Array.from(document.querySelectorAll("#content span[time-bef][time-aft]"));

    const normalized = ranges
      .map((range) => ({
        start: Math.max(0, Math.min(range.start, flat.length)),
        end: Math.max(0, Math.min(range.end, flat.length))
      }))
      .map((range) => (range.start <= range.end ? range : { start: range.end, end: range.start }))
      .filter((range) => range.end > range.start)
      .sort((a, b) => b.start - a.start);

    for (const rangeInfo of normalized) {
      const startSpan = flat[rangeInfo.start];
      const endSpan = flat[rangeInfo.end - 1];
      if (!startSpan || !endSpan) continue;

      const range = document.createRange();
      range.setStartBefore(startSpan);
      range.setEndAfter(endSpan);

      const wrapper = document.createElement("span");
      wrapper.className = "newspan";
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
    }
  }

  function getFinalTextCharSpan(node) {
    if (!node) return null;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return el?.closest?.("#content span[time-bef][time-aft]") || null;
  }

  function clearFinalTextMarks() {
    Array.from(document.querySelectorAll("#content .newspan")).forEach(unwrapFinalTextMark);
    const tableContainer = document.getElementById("table-container");
    if (tableContainer) tableContainer.innerHTML = "";
  }

  function markFinalTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const original = selection.getRangeAt(0);
    if (original.collapsed) return false;

    const contentDiv = document.getElementById("content");
    if (!contentDiv || !contentDiv.contains(original.commonAncestorContainer)) return false;

    const startSpan = getFinalTextCharSpan(original.startContainer);
    const endSpan = getFinalTextCharSpan(original.endContainer);
    if (!startSpan || !endSpan) return false;
    if (startSpan.closest(".newspan") || endSpan.closest(".newspan")) return false;

    const range = document.createRange();
    range.setStartBefore(startSpan);
    range.setEndAfter(endSpan);

    const wrapper = document.createElement("span");
    wrapper.className = "newspan";
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);

    selection.removeAllRanges();
    return true;
  }

  async function saveHighlightsToLocalStorage() {
    const ranges = saveAllHighlights();
    localStorage.setItem(`highlights:${getStorageKey()}`, JSON.stringify(ranges));
  }

  function loadHighlightsFromLocalStorage() {
    const raw = localStorage.getItem(`highlights:${getStorageKey()}`);
    if (!raw) return;
    try {
      const ranges = JSON.parse(raw);
      applyAllHighlights(ranges);
    } catch (err) {
      // Ignore malformed saved highlight data.
    }
  }

  async function generateFinalTextAnalysisTable() {
    await saveHighlightsToLocalStorage();

    const container = document.getElementById("content");
    const tableContainer = document.getElementById("table-container");
    if (!container || !tableContainer) return;

    const wrappers = container.getElementsByClassName("newspan");
    if (wrappers.length === 0) {
      tableContainer.innerHTML = "<p>No newspan elements found.</p>";
      return;
    }

    let tableHTML = "<table><thead><tr><th>Content</th><th>Time Before</th><th>Time After</th></tr></thead><tbody>";
    Array.from(wrappers).forEach((wrapper) => {
      const chars = wrapper.querySelectorAll("span[time-bef][time-aft]");
      if (!chars.length) return;
      tableHTML += `<tr><td>${wrapper.textContent}</td><td>${chars[0].getAttribute("time-bef")}</td><td>${chars[chars.length - 1].getAttribute("time-aft")}</td></tr>`;
    });
    tableHTML += "</tbody></table>";
    tableContainer.innerHTML = tableHTML;
  }

  function bindFinalTextAnalysisControls(contentDiv, labelDiv) {
    if (!contentDiv || contentDiv.dataset.ftPaneBound === "true") return;

    contentDiv.addEventListener("mouseover", (event) => {
      const span = event.target.closest("#content span[time-bef][time-aft]");
      if (!span || !labelDiv) return;
      const purity = span.dataset.wordPurity;
      labelDiv.textContent = `B: ${span.getAttribute("time-bef")} A: ${span.getAttribute("time-aft")} C: ${span.getAttribute("data-cumulative")}${purity != null ? ` P: ${purity}` : ""}`;
    });

    contentDiv.addEventListener("mouseout", (event) => {
      const span = event.target.closest("#content span[time-bef][time-aft]");
      if (!span || !labelDiv) return;
      labelDiv.textContent = "Time: -";
    });

    contentDiv.addEventListener("mouseup", (event) => {
      if (event.target.closest(".newspan")) return;
      markFinalTextSelection();
    });

    contentDiv.addEventListener("click", (event) => {
      const wrapper = event.target.closest(".newspan");
      if (!wrapper) return;
      unwrapFinalTextMark(wrapper);
    });

    contentDiv.dataset.ftPaneBound = "true";
  }

  function bindFinalTextAnalysisButtons() {
    const markBtn = document.getElementById("mark-selected");
    if (markBtn && markBtn.dataset.ftPaneBound !== "true") {
      markBtn.addEventListener("click", markFinalTextSelection);
      markBtn.dataset.ftPaneBound = "true";
    }

    const clearBtn = document.getElementById("clear-marks");
    if (clearBtn && clearBtn.dataset.ftPaneBound !== "true") {
      clearBtn.addEventListener("click", clearFinalTextMarks);
      clearBtn.dataset.ftPaneBound = "true";
    }

    const tableBtn = document.getElementById("generate-table");
    if (tableBtn && tableBtn.dataset.ftPaneBound !== "true") {
      tableBtn.addEventListener("click", generateFinalTextAnalysisTable);
      tableBtn.dataset.ftPaneBound = "true";
    }
  }

  function makeFTAnalysis() {
    const contentDiv = document.getElementById("content");
    const labelDiv = document.getElementById("label");
    const tableContainer = document.getElementById("table-container");
    if (!contentDiv) return;

    const records = getCurrentRecords();
    const rows = root.WebScriptLogAnalysisCore.buildFinalTextCharacterRows(records);
    const expectedFinalText = root.WebScriptLogRecordUtils.getFinalText(records);

    contentDiv.innerHTML = "";
    if (tableContainer) tableContainer.innerHTML = "";

    let reconstructedText = "";
    rows.forEach((row) => {
      const span = document.createElement("span");
      span.textContent = row.character;
      reconstructedText += row.character;
      span.setAttribute("data-time", row.textDataTimestamp);
      span.setAttribute("data-cumulative", row.textDataIndex);
      span.setAttribute("time-bef", row.timeSincePrev);
      span.setAttribute("time-aft", row.timeUntilNext);
      contentDiv.appendChild(span);
    });

    applyFinalTextAnalysisPurityColors(contentDiv, records);

    console.log(reconstructedText === expectedFinalText ? "MATCH" : "NO MATCH");
    loadHighlightsFromLocalStorage();
    bindFinalTextAnalysisControls(contentDiv, labelDiv);
    bindFinalTextAnalysisButtons();
  }

  root.makeFTAnalysis = makeFTAnalysis;
  root.saveAllHighlights = saveAllHighlights;
  root.applyAllHighlights = applyAllHighlights;
  root.unwrapFinalTextMark = unwrapFinalTextMark;
  root.clearFinalTextMarks = clearFinalTextMarks;
  root.markFinalTextSelection = markFinalTextSelection;
  root.applyFinalTextAnalysisPurityColors = applyFinalTextAnalysisPurityColors;
})(typeof globalThis !== "undefined" ? globalThis : window);
