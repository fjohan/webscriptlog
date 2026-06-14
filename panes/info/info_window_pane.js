(function(root) {
  "use strict";

  let lastInspectMetrics = null;

  function getCurrentRecords() {
    if (typeof root.getCurrentWebScriptLogRecords === "function") return root.getCurrentWebScriptLogRecords();
    return {
      header_records: root.header_record || {},
      text_records: root.text_record || {},
      cursor_records: root.cursor_record || {},
      key_records: root.key_record || {},
      scroll_records: root.scroll_record || {},
      image_records: root.image_record || {},
      window_records: root.window_record || {}
    };
  }

  function getInspectMetricOptions() {
    const intervalInput = Number(document.getElementById("inspectIntervals")?.value);
    const pauseInput = Number(document.getElementById("pauseCrit")?.value);
    const basisInput = document.getElementById("inspectBasis")?.value;

    return {
      intervals: Number.isFinite(intervalInput) ? Math.max(1, Math.min(100, Math.floor(intervalInput))) : 5,
      basis: basisInput === "typing" ? "typing" : "recording",
      pause_threshold_s: Number.isFinite(pauseInput) ? Math.max(0, pauseInput) : 0.3
    };
  }

  function buildInspectMetrics(options) {
    return root.WebScriptLogInspectCore.buildInspectMetricsFromRecords(getCurrentRecords(), options);
  }

  function makeInspectMetricsReport() {
    const options = getInspectMetricOptions();
    const summary = root.WebScriptLogInspectCore.buildInspectMetricsFromRecords(getCurrentRecords(), options);
    lastInspectMetrics = summary;
    root.lastInspectMetrics = summary;
    return root.WebScriptLogInspectCore.serializeInspectMetrics(summary);
  }

  function appendLine(target, text) {
    if (!target) return;
    target.value += text + "\n";
  }

  function inspectRecords() {
    const target = root.messages || document.getElementById("messages");
    const records = getCurrentRecords();
    const options = getInspectMetricOptions();
    const header = records.header_records || {};
    const legacy = root.WebScriptLogInspectCore.buildLegacyInspectSummary(records, options);

    for (const key in header) {
      appendLine(target, `(internal ${key}: ${header[key]})`);
    }

    const recordingTime = (Number(header.endtime) - Number(header.starttime)) / 1000;
    appendLine(target, `Recording time: ${Number.isFinite(recordingTime) ? recordingTime : 0}`);
    appendLine(target, `Typing time: ${legacy.typing_time_s}`);

    if (typeof root.processGraphFormat === "function") root.processGraphFormat();

    appendLine(target, `Process: ${legacy.process_chars}`);
    const productChars = legacy.product_chars;
    appendLine(target, `Product: ${productChars}`);
    appendLine(target, `Keystrokes: ${legacy.keystrokes}`);
    appendLine(target, `Mouse clicks: ${legacy.mouse_clicks}`);
    appendLine(target, `Pauses: ${legacy.pauses}`);
    appendLine(target, `Pausetime : ${legacy.pause_time_s}`);
    appendLine(target, `Insertions: ${legacy.insertions}`);
    appendLine(target, `Deletions: ${legacy.deletions}`);
    appendLine(target, `Replacements: ${legacy.replacements}`);

    if (target) {
      target.value += makeInspectMetricsReport();
      target.scrollTop = target.scrollHeight;
    }
  }

  root.getInspectMetricOptions = getInspectMetricOptions;
  root.buildInspectMetrics = buildInspectMetrics;
  root.makeInspectMetricsReport = makeInspectMetricsReport;
  root.inspectRecords = inspectRecords;
})(typeof globalThis !== "undefined" ? globalThis : window);
