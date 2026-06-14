(function(root) {
  "use strict";

  const recordUtils = root.WebScriptLogRecordUtils || (typeof require === "function" ? require("../../webscriptlog_record_utils.js") : null);

  function normalizeInspectMetricRecords(records) {
    const normalized = recordUtils.normalizeRecords(records);
    return {
      header_records: normalized.header_records,
      text_records: normalized.text_records,
      key_records: normalized.key_records,
      cursor_records: normalized.cursor_records,
      window_records: normalized.window_records
    };
  }

  function sortedEntries(recordObj) {
    return recordUtils.sortedEntries(recordObj || {}).map((entry) => ({ ts: entry.ts, value: entry.value }));
  }

  function getDiffMatchPatch() {
    if (root.myDmp) return root.myDmp;
    if (typeof root.diff_match_patch === "function") return new root.diff_match_patch();
    throw new Error("diff_match_patch is not available");
  }

  function getInspectTextEvents(textRecords = {}) {
    const dmp = getDiffMatchPatch();
    const events = [];
    let previousText = "";
    const entries = sortedEntries(textRecords);

    for (let i = 0; i < entries.length; i++) {
      const ts = entries[i].ts;
      const currentText = String(entries[i].value ?? "");
      const diff = dmp.diff_main(previousText, currentText);
      dmp.diff_cleanupSemantic(diff);

      let insertedChars = 0;
      let hasInsert = false;
      let hasDelete = false;
      for (let j = 0; j < diff.length; j++) {
        if (diff[j][0] === 1) {
          insertedChars += diff[j][1].length;
          hasInsert = true;
        } else if (diff[j][0] === -1) {
          hasDelete = true;
        }
      }

      let classification = "NOCHANGE";
      if (hasInsert && hasDelete) classification = "REPLACE";
      else if (hasInsert) classification = "INSERT";
      else if (hasDelete) classification = "DELETE";

      events.push({
        ts,
        text: currentText,
        processChars: insertedChars,
        classification
      });
      previousText = currentText;
    }

    return events;
  }

  function getTypingBounds(keyEvents) {
    let firstKeydown = null;
    let lastKeyup = null;

    for (let i = 0; i < keyEvents.length; i++) {
      const ev = String(keyEvents[i].value ?? "");
      if (firstKeydown === null && ev.startsWith("keydown: ")) firstKeydown = keyEvents[i].ts;
      if (ev.startsWith("keyup: ")) lastKeyup = keyEvents[i].ts;
    }

    return { firstKeydown, lastKeyup };
  }

  function getPauseEvents(keyEvents, startTime, thresholdS) {
    const pauses = [];
    let lastKtime = startTime;
    let firstKeydownSeen = false;

    for (let i = 0; i < keyEvents.length; i++) {
      const ev = String(keyEvents[i].value ?? "");
      const isPauseCarrier = ev.startsWith("keydown: ") || ev.startsWith("mousedown");
      const passed = (keyEvents[i].ts - lastKtime) / 1000;

      if (isPauseCarrier && firstKeydownSeen && passed >= thresholdS) {
        pauses.push({ ts: keyEvents[i].ts, duration_s: passed });
      }
      if (ev.startsWith("keydown: ")) firstKeydownSeen = true;
      lastKtime = keyEvents[i].ts;
    }

    return pauses;
  }

  function getIntervalBoundaries(startTs, endTs, intervalCount) {
    const boundaries = [];
    const duration = Math.max(0, endTs - startTs);
    for (let i = 1; i <= intervalCount; i++) {
      boundaries.push(startTs + (duration * i) / intervalCount);
    }
    return boundaries;
  }

  function getLatestTextAtOrBefore(boundaryTs, textEvents, textTimes) {
    let chosen = "";
    for (let i = 0; i < textEvents.length; i++) {
      if (textTimes[i] <= boundaryTs) chosen = textEvents[i].text;
      else break;
    }
    return chosen;
  }

  function countProcessWords(text) {
    return String(text || "").split(/\s+/).filter((token) => token.length > 0).length;
  }

  function getCumulativeMetricsAt(boundaryTs, textEvents, textTimes, pauseEvents) {
    let processChars = 0;
    let insertionsTotal = 0;
    let deletionsTotal = 0;
    let replacementsTotal = 0;

    for (let i = 0; i < textEvents.length; i++) {
      const ev = textEvents[i];
      if (ev.ts > boundaryTs) break;
      processChars += ev.processChars;
      if (ev.classification === "INSERT") insertionsTotal += 1;
      if (ev.classification === "DELETE") deletionsTotal += 1;
      if (ev.classification === "REPLACE") replacementsTotal += 1;
    }

    let pauseTime = 0;
    let pauseCount = 0;
    for (let i = 0; i < pauseEvents.length; i++) {
      if (pauseEvents[i].ts > boundaryTs) break;
      pauseTime += pauseEvents[i].duration_s;
      pauseCount += 1;
    }

    const currentText = getLatestTextAtOrBefore(boundaryTs, textEvents, textTimes);

    return {
      process_chars_total: processChars,
      word_count_total: countProcessWords(currentText),
      deletions_total: deletionsTotal,
      insertions_total: insertionsTotal,
      replacements_total: replacementsTotal,
      pause_time_total_s: pauseTime,
      pause_count_total: pauseCount
    };
  }

  function getWindowInteractionMetricsAt(boundaryTs, recordingStartTs, windowRecords = {}) {
    const events = sortedEntries(windowRecords).map((entry) => ({
      ts: entry.ts,
      rec: entry.value || {}
    }));

    const dwellMsByWindow = { writing: 0, upper: 0, lower: 0 };
    const switchCounts = {
      writing_to_task: 0,
      writing_to_upper: 0,
      writing_to_lower: 0,
      task_to_writing: 0,
      upper_to_writing: 0,
      lower_to_writing: 0,
      upper_to_lower: 0,
      lower_to_upper: 0
    };

    let lastTs = recordingStartTs;
    let activeWindow = null;
    let pendingWindow = null;

    function addWindowMs(windowName, ms) {
      if (!windowName || ms <= 0) return;
      if (dwellMsByWindow[windowName] === undefined) dwellMsByWindow[windowName] = 0;
      dwellMsByWindow[windowName] += ms;
    }

    function accumulateUntil(ts) {
      if (ts <= lastTs) return;
      const dt = ts - lastTs;
      if (activeWindow) addWindowMs(activeWindow, dt);
      lastTs = ts;
    }

    function normalizeWindowName(rec) {
      const raw = String(rec.window || rec.pane || "").trim().toLowerCase();
      if (raw === "upper" || raw === "lower" || raw === "writing" || raw === "task") return raw;
      return null;
    }

    function registerSwitch(fromWindow, toWindow) {
      if (!fromWindow || !toWindow || fromWindow === toWindow) return;
      const key = `${fromWindow}_to_${toWindow}`;
      if (switchCounts[key] !== undefined) switchCounts[key] += 1;
      if (fromWindow === "writing" && (toWindow === "upper" || toWindow === "lower")) switchCounts.writing_to_task += 1;
      if ((fromWindow === "upper" || fromWindow === "lower") && toWindow === "writing") switchCounts.task_to_writing += 1;
    }

    for (let i = 0; i < events.length; i++) {
      const { ts, rec } = events[i];
      if (ts > boundaryTs) break;
      accumulateUntil(ts);

      const ev = rec.event;
      const windowName = normalizeWindowName(rec);
      if (ev === "show" || ev === "hide") {
        activeWindow = null;
        pendingWindow = null;
        continue;
      }
      if (ev === "mouse_enter") {
        registerSwitch(activeWindow || pendingWindow, windowName);
        activeWindow = windowName;
        pendingWindow = null;
        continue;
      }
      if (ev === "mouse_leave" && windowName && activeWindow === windowName) {
        pendingWindow = activeWindow;
        activeWindow = null;
      }
    }

    accumulateUntil(Math.max(boundaryTs, lastTs));
    const totalTaskMs = (dwellMsByWindow.upper || 0) + (dwellMsByWindow.lower || 0);

    return {
      has_records: events.length > 0 ? 1 : 0,
      dwell_writing_s: dwellMsByWindow.writing / 1000,
      dwell_task_s: totalTaskMs / 1000,
      dwell_upper_s: dwellMsByWindow.upper / 1000,
      dwell_lower_s: dwellMsByWindow.lower / 1000,
      writing_to_task: switchCounts.writing_to_task,
      writing_to_upper: switchCounts.writing_to_upper,
      writing_to_lower: switchCounts.writing_to_lower,
      task_to_writing: switchCounts.task_to_writing,
      upper_to_writing: switchCounts.upper_to_writing,
      lower_to_writing: switchCounts.lower_to_writing,
      upper_to_lower: switchCounts.upper_to_lower,
      lower_to_upper: switchCounts.lower_to_upper
    };
  }

  function subtractWindowMetrics(currentMetrics, baseMetrics) {
    const base = baseMetrics || {
      has_records: 0,
      dwell_writing_s: 0,
      dwell_task_s: 0,
      dwell_upper_s: 0,
      dwell_lower_s: 0,
      writing_to_task: 0,
      writing_to_upper: 0,
      writing_to_lower: 0,
      task_to_writing: 0,
      upper_to_writing: 0,
      lower_to_writing: 0,
      upper_to_lower: 0,
      lower_to_upper: 0
    };

    return {
      has_records: currentMetrics.has_records,
      dwell_writing_s: currentMetrics.dwell_writing_s - base.dwell_writing_s,
      dwell_task_s: currentMetrics.dwell_task_s - base.dwell_task_s,
      dwell_upper_s: currentMetrics.dwell_upper_s - base.dwell_upper_s,
      dwell_lower_s: currentMetrics.dwell_lower_s - base.dwell_lower_s,
      writing_to_task: currentMetrics.writing_to_task - base.writing_to_task,
      writing_to_upper: currentMetrics.writing_to_upper - base.writing_to_upper,
      writing_to_lower: currentMetrics.writing_to_lower - base.writing_to_lower,
      task_to_writing: currentMetrics.task_to_writing - base.task_to_writing,
      upper_to_writing: currentMetrics.upper_to_writing - base.upper_to_writing,
      lower_to_writing: currentMetrics.lower_to_writing - base.lower_to_writing,
      upper_to_lower: currentMetrics.upper_to_lower - base.upper_to_lower,
      lower_to_upper: currentMetrics.lower_to_upper - base.lower_to_upper
    };
  }

  function buildInspectMetricsFromRecords(records, options = {}) {
    const normalizedRecords = normalizeInspectMetricRecords(records);
    const startTime = Number(normalizedRecords.header_records?.starttime) || 0;
    const endTime = Number(normalizedRecords.header_records?.endtime) || startTime;
    const textEvents = getInspectTextEvents(normalizedRecords.text_records);
    const keyEvents = sortedEntries(normalizedRecords.key_records);
    const textTimes = textEvents.map((ev) => ev.ts);
    const finalText = textEvents.length ? textEvents[textEvents.length - 1].text : "";

    const typingBounds = getTypingBounds(keyEvents);
    const typingStart = typingBounds.firstKeydown ?? startTime;
    const typingEnd = typingBounds.lastKeyup ?? endTime;
    const recordingDuration = Math.max(0, endTime - startTime) / 1000;
    const typingDuration = Math.max(0, typingEnd - typingStart) / 1000;

    let basisStart = startTime;
    let basisEnd = endTime;
    let basisUsed = "recording";
    if (options.basis === "typing" && typingBounds.firstKeydown !== null && typingBounds.lastKeyup !== null && typingEnd >= typingStart) {
      basisStart = typingStart;
      basisEnd = typingEnd;
      basisUsed = "typing";
    }

    const pauseThreshold = Number.isFinite(Number(options.pause_threshold_s)) ? Number(options.pause_threshold_s) : 0.3;
    const intervalCount = Number.isFinite(Number(options.intervals)) ? Math.max(1, Math.floor(Number(options.intervals))) : 5;
    const pauseEvents = getPauseEvents(keyEvents, startTime, pauseThreshold);
    const boundaries = getIntervalBoundaries(basisStart, basisEnd, intervalCount);
    const hasWindowRecords = Object.keys(normalizedRecords.window_records || {}).length > 0;
    const windowBaseline = hasWindowRecords ? getWindowInteractionMetricsAt(basisStart, startTime, normalizedRecords.window_records) : null;

    const cumulativeRows = boundaries.map((boundaryTs, index) => {
      const cumulative = getCumulativeMetricsAt(boundaryTs, textEvents, textTimes, pauseEvents);
      const windowCumulative = hasWindowRecords
        ? subtractWindowMetrics(getWindowInteractionMetricsAt(boundaryTs, startTime, normalizedRecords.window_records), windowBaseline)
        : null;
      return {
        interval: index + 1,
        boundaryTs,
        start_s: ((index === 0 ? basisStart : boundaries[index - 1]) - startTime) / 1000,
        end_s: (boundaryTs - startTime) / 1000,
        ...cumulative,
        ...(hasWindowRecords ? { window: windowCumulative } : {})
      };
    });

    const intervalRows = cumulativeRows.map((row, index) => {
      const prev = index === 0 ? null : cumulativeRows[index - 1];
      const intervalDurationMin = Math.max(0, (row.boundaryTs - (prev ? prev.boundaryTs : basisStart)) / 60000);
      const processInterval = row.process_chars_total - (prev ? prev.process_chars_total : 0);
      return {
        interval: row.interval,
        start_s: row.start_s,
        end_s: row.end_s,
        speed_chars_per_min: intervalDurationMin > 0 ? processInterval / intervalDurationMin : 0,
        word_count_total: row.word_count_total,
        word_count_interval: row.word_count_total - (prev ? prev.word_count_total : 0),
        deletions_total: row.deletions_total,
        deletions_interval: row.deletions_total - (prev ? prev.deletions_total : 0),
        insertions_total: row.insertions_total,
        insertions_interval: row.insertions_total - (prev ? prev.insertions_total : 0),
        replacements_total: row.replacements_total,
        replacements_interval: row.replacements_total - (prev ? prev.replacements_total : 0),
        pause_time_total_s: row.pause_time_total_s,
        pause_time_interval_s: row.pause_time_total_s - (prev ? prev.pause_time_total_s : 0),
        pause_count_total: row.pause_count_total,
        pause_count_interval: row.pause_count_total - (prev ? prev.pause_count_total : 0),
        ...(hasWindowRecords ? {
          window_total: row.window,
          window: subtractWindowMetrics(row.window, prev ? prev.window : null)
        } : {})
      };
    });

    const basisDurationMin = Math.max(0, (basisEnd - basisStart) / 60000);
    const overallCounts = getCumulativeMetricsAt(basisEnd, textEvents, textTimes, pauseEvents);
    const overallWindow = hasWindowRecords
      ? subtractWindowMetrics(getWindowInteractionMetricsAt(basisEnd, startTime, normalizedRecords.window_records), windowBaseline)
      : null;

    return {
      has_window_records: hasWindowRecords,
      options: {
        ...options,
        intervals: intervalCount,
        pause_threshold_s: pauseThreshold,
        basis_used: basisUsed,
        recording_time_s: recordingDuration,
        typing_time_s: typingDuration
      },
      overall: {
        speed_chars_per_min: basisDurationMin > 0 ? overallCounts.process_chars_total / basisDurationMin : 0,
        word_count_total: countProcessWords(finalText),
        deletions_total: overallCounts.deletions_total,
        insertions_total: overallCounts.insertions_total,
        replacements_total: overallCounts.replacements_total,
        pause_time_total_s: overallCounts.pause_time_total_s,
        pause_count_total: overallCounts.pause_count_total,
        ...(hasWindowRecords ? { window: overallWindow } : {})
      },
      intervals: intervalRows
    };
  }

  function buildLegacyInspectSummary(records, options = {}) {
    const normalized = normalizeInspectMetricRecords(records);
    const startTime = Number(normalized.header_records?.starttime) || 0;
    const keyEvents = sortedEntries(normalized.key_records);
    const textEvents = getInspectTextEvents(normalized.text_records);
    const pauseThreshold = Number.isFinite(Number(options.pause_threshold_s)) ? Number(options.pause_threshold_s) : 0.3;
    const typingBounds = getTypingBounds(keyEvents);
    const pauses = getPauseEvents(keyEvents, startTime, pauseThreshold);
    const finalText = textEvents.length ? textEvents[textEvents.length - 1].text : "";
    const processChars = textEvents.reduce((sum, event) => sum + event.processChars, 0);

    return {
      typing_time_s: typingBounds.firstKeydown !== null && typingBounds.lastKeyup !== null
        ? (typingBounds.lastKeyup - typingBounds.firstKeydown) / 1000
        : 0,
      keystrokes: keyEvents.filter((entry) => String(entry.value || "").startsWith("keydown: ")).length,
      mouse_clicks: keyEvents.filter((entry) => String(entry.value || "").startsWith("mousedown")).length,
      pauses: pauses.length,
      pause_time_s: pauses.reduce((sum, pause) => sum + pause.duration_s, 0),
      insertions: textEvents.filter((event) => event.classification === "INSERT").length,
      deletions: textEvents.filter((event) => event.classification === "DELETE").length,
      replacements: textEvents.filter((event) => event.classification === "REPLACE").length,
      process_chars: processChars,
      product_chars: finalText.length
    };
  }

  function formatNumber(value, digits = 3) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "";
  }

  function serializeInspectMetrics(summary) {
    if (!summary) return "";
    const lines = ["<inspect-metrics>"];
    lines.push(`basis\t${summary.options?.basis_used || ""}`);
    lines.push(`recording_time_s\t${formatNumber(summary.options?.recording_time_s)}`);
    lines.push(`typing_time_s\t${formatNumber(summary.options?.typing_time_s)}`);
    lines.push(`speed_chars_per_min\t${formatNumber(summary.overall?.speed_chars_per_min)}`);
    lines.push(`word_count_total\t${summary.overall?.word_count_total ?? 0}`);
    lines.push(`insertions_total\t${summary.overall?.insertions_total ?? 0}`);
    lines.push(`deletions_total\t${summary.overall?.deletions_total ?? 0}`);
    lines.push(`replacements_total\t${summary.overall?.replacements_total ?? 0}`);
    lines.push(`pause_count_total\t${summary.overall?.pause_count_total ?? 0}`);
    lines.push(`pause_time_total_s\t${formatNumber(summary.overall?.pause_time_total_s)}`);
    lines.push("interval\tstart_s\tend_s\tspeed_chars_per_min\tword_count_total\tword_count_interval\tinsertions_interval\tdeletions_interval\treplacements_interval\tpause_count_interval\tpause_time_interval_s");
    for (const row of summary.intervals || []) {
      lines.push([
        row.interval,
        formatNumber(row.start_s),
        formatNumber(row.end_s),
        formatNumber(row.speed_chars_per_min),
        row.word_count_total,
        row.word_count_interval,
        row.insertions_interval,
        row.deletions_interval,
        row.replacements_interval,
        row.pause_count_interval,
        formatNumber(row.pause_time_interval_s)
      ].join("\t"));
    }
    lines.push("</inspect-metrics>");
    return lines.join("\n") + "\n";
  }

  const api = {
    normalizeInspectMetricRecords,
    sortedEntries,
    getInspectTextEvents,
    getTypingBounds,
    getPauseEvents,
    getIntervalBoundaries,
    getLatestTextAtOrBefore,
    countProcessWords,
    getCumulativeMetricsAt,
    getWindowInteractionMetricsAt,
    subtractWindowMetrics,
    buildInspectMetricsFromRecords,
    buildLegacyInspectSummary,
    serializeInspectMetrics
  };

  root.WebScriptLogInspectCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
