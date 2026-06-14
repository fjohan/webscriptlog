/* global messages, keySet, myDmp, current_text, playback, recorder, lb_load, d3, linoutput */

let recorderImageOverlayActive = false;
let image_record = {};
let window_record = {};

function drawRecorderImageOverlay() {
  const canvas = document.getElementById("recorderImageOverlay");
  if (!canvas || !recorder) return;

  const width = recorder.clientWidth;
  const height = recorder.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#2b2f31";
  ctx.fillRect(0, 0, width, height);

  const titleSize = Math.max(24, Math.min(52, Math.floor(width * 0.07)));
  const hintSize = Math.max(14, Math.min(24, Math.floor(width * 0.03)));

  ctx.fillStyle = "#64d17a";
  ctx.textAlign = "center";
  ctx.font = `700 ${titleSize}px monospace`;
  ctx.fillText("IMAGE PLACEHOLDER", width / 2, height / 2 - 10);

  ctx.font = `500 ${hintSize}px monospace`;
  ctx.fillText("Click IMAGE to hide", width / 2, height / 2 + 30);
}

function toggleRecorderImageOverlay() {
  const frame = document.getElementById("recorderFrame");
  if (!frame || !recorder) return;
  if (!recorder.recording) return;

  recorderImageOverlayActive = !recorderImageOverlayActive;
  if (recorder.recording) {
    let myTime = (new Date()).getTime();
    while (image_record[myTime] !== undefined) myTime += 1;
    image_record[myTime] = recorderImageOverlayActive ? "show" : "hide";
  }
  frame.classList.toggle("image-overlay-active", recorderImageOverlayActive);

  if (recorderImageOverlayActive) {
    recorder.readOnly = true;
    recorder.blur();
    drawRecorderImageOverlay();
  } else {
    recorder.readOnly = !recorder.recording;
    if (recorder.recording) recorder.focus();
  }
}

function startRecording() {
  if (recorder.recording) {
    messages.value += 'Already recording!\n';
    recorder.focus();
    return;
  }
  recorder.value = '';
  doRecording();
}

function continueRecording() {
  doRecording();
}

function doRecording() {
  header_record = {};
  key_record = {};
  text_record = {};
  image_record = {};
  text_record_keeper = {};
  cursor_record = {};
  cursor_record_keeper = {};
  current_text = '';
  keySet = new Set();
  recorder.addEventListener('keydown', recordKeyDown, false);
  recorder.addEventListener('keyup', recordKeyUp, false);
  recorder.addEventListener('mousedown', recordMouseDown, false);
  recorder.addEventListener('mouseup', recordMouseUp, false);
  recorder.addEventListener('mousemove', recordMouseMove, false);
  recorder.addEventListener('input', recordInput, false);
  recorder.addEventListener('scroll', recordScroll, false);
  recorder.style.borderColor = "white";
  recorder.readOnly = recorderImageOverlayActive;
  if (!recorderImageOverlayActive) recorder.focus();
  recorder.recording = true;
  $('#b_record').prop('disabled', true);
  $('#b_recstop').prop('disabled', false);
  $('#b_image').prop('disabled', false);
  $('#b_emulate').prop('disabled', true);
  $('#b_linearlog').prop('disabled', true);
  $('#userCode').prop('disabled', true);
  header_record['starttime'] = (new Date()).getTime();
  messages.value = 'Recording started at ' + header_record['starttime'] + '.\n';
}


// Requires: idbStore (the KV wrapper), pako, updateListbox()

function makeWebScriptLogStorageKey(prefix, records, fallbackName = '') {
  const startTime = Number(records?.header_records?.starttime) || Date.now();
  const d = new Date(startTime);
  const pad = (value) => String(value).padStart(2, "0");
  const safeName = String(fallbackName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `${prefix}${safeName ? `_${safeName}` : ''}_` +
    `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function makeUniqueWebScriptLogIDBKey(baseKey) {
  if (!idbStore?.keys) return baseKey;
  const keys = await idbStore.keys();
  if (!keys.includes(baseKey)) return baseKey;
  let index = 2;
  let key = `${baseKey}_${index}`;
  while (keys.includes(key)) {
    index += 1;
    key = `${baseKey}_${index}`;
  }
  return key;
}

function normalizeWebScriptLogRecords(data) {
  return WebScriptLogRecordUtils.normalizeRecords(data);
}

function getCurrentWebScriptLogRecords() {
  return {
    header_records: header_record || {},
    text_records: text_record || {},
    cursor_records: cursor_record || {},
    key_records: key_record || {},
    scroll_records: scroll_record || {},
    image_records: image_record || {},
    window_records: window_record || {}
  };
}

function escapeDiffKeysHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// DiffKeys, Word History, and Final Text Analysis core now live in webscriptlog_analysis_core.js.
// Pane rendering lives under panes/diffkeys, panes/word_history, and panes/final_text_analysis.
function buildDiffKeysRows(records = {}) {
  return WebScriptLogAnalysisCore.buildDiffKeysRows(records);
}

function buildWordHistoryRows(records = {}) {
  return WebScriptLogAnalysisCore.buildWordBoundaryTiming(records);
}

function buildFinalTextCharacterRows(records = {}) {
  return WebScriptLogAnalysisCore.buildFinalTextCharacterRows(records);
}

function joinFinalTextAnalysisAndDiffKeys(records = {}) {
  return WebScriptLogAnalysisCore.joinFinalTextAnalysisAndDiffKeys(records);
}

function applyWebScriptLogRecords(records, key = '') {
  header_record = records.header_records;
  if (header_record && key) header_record._indexeddb_key = key;
  text_record = records.text_records;
  cursor_record = records.cursor_records;
  key_record = records.key_records;
  scroll_record = records.scroll_records;
  image_record = records.image_records;
  window_record = records.window_records;

  messages.value += `Read ${Object.keys(text_record || {}).length} text records.\n`;
  messages.scrollTop = messages.scrollHeight;

  makeRevisionTable();
  renderDiffKeysPane();
  renderWordHistoryPane();
  window.dashboardEvents?.emit?.("log:loaded", {
    key,
    text_records: Object.keys(text_record || {}).length
  });
}

async function refreshAndSelectIndexedDBKey(key) {
  await updateListbox();
  if (!lb_load || !key) return;
  for (let i = 0; i < lb_load.options.length; i++) {
    if (lb_load.options[i].text === key || lb_load.options[i].textContent === key) {
      lb_load.selectedIndex = i;
      return;
    }
  }
}

async function saveWebScriptLogRecordsToIndexedDB(records, baseKey) {
  if (!idbStore?.setItem || !pako?.deflate) return null;
  const key = await makeUniqueWebScriptLogIDBKey(baseKey);
  const jsonStr = JSON.stringify(records, null, '\t');
  const compressed = pako.deflate(jsonStr);
  await idbStore.setItem(key, compressed);
  try {
    await refreshAndSelectIndexedDBKey(key);
  } catch (err) {
    console.warn('WebScriptLog file was saved, but the IndexedDB listbox could not be refreshed.', err);
  }
  return key;
}

async function stopRecording() {
  if (typeof requestEmulationStop === 'function') requestEmulationStop();
  if (!recorder.recording) {
    messages.value += 'Not recording!\n'; // localize
    return;
  }

  header_record['endtime'] = (new Date()).getTime();
  recorder.recording = false;
  recorder.readOnly = true;
  recorderImageOverlayActive = false;
  document.getElementById("recorderFrame")?.classList.remove("image-overlay-active");
  recorder.style.borderColor = "lightskyblue";
  messages.value += 'Recording ended at ' + header_record['endtime'] + '.\n';

  recorder.removeEventListener('keydown',   recordKeyDown,  false);
  recorder.removeEventListener('keyup',     recordKeyUp,    false);
  recorder.removeEventListener('mousedown', recordMouseDown,false);
  recorder.removeEventListener('mouseup',   recordMouseUp,  false);
  recorder.removeEventListener('mousemove', recordMouseMove,false);
  recorder.removeEventListener('input',     recordInput,    false);
  recorder.removeEventListener('scroll',    recordScroll,   false);

  $('#b_record').prop('disabled', false);
  $('#b_recstop').prop('disabled', true);
  $('#b_image').prop('disabled', true);
  $('#b_emulate').prop('disabled', !(String(i_code?.value || '').length === 6));
  $('#b_linearlog').prop('disabled', !(String(i_code?.value || '').length === 6));
  $('#userCode').prop('disabled', false);

  if (Object.keys(text_record).length < 1) {
    messages.value += 'No text records!!\n'; // localize
    return;
  }

  // Build the key (same as before)
  const d = new Date();
  const lsString =
    "wslog_" + i_code.value + "_" +
    ("0" + d.getDate()).slice(-2) + "-" +
    ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
    d.getFullYear() + "_" +
    ("0" + d.getHours()).slice(-2) + ":" +
    ("0" + d.getMinutes()).slice(-2) + ":" +
    ("0" + d.getSeconds()).slice(-2);

  const records = {
    header_records: header_record,
    text_records:   text_record,
    cursor_records: cursor_record,
    key_records:    key_record,
    scroll_records: scroll_record,
    image_records:  image_record,
    window_records: window_record
  };

  // Prepare the payload once
  const jsonStr = JSON.stringify(records, null, '\t');

  // Compress to Uint8Array (deflate – matches your server)
  let compressed;
  try {
    compressed = pako.deflate(jsonStr); // Uint8Array
  } catch (e) {
    console.error('Compression failed:', e);
    $("#messageLabel").text("Kunde inte komprimera data."); // localize
    return;
  }

  // Save locally to IndexedDB (store compressed bytes)
  console.log('saving to IndexedDB');
  try {
    await idbStore.setItem(lsString, compressed);
    //const saveMessage = 'Sparat lokalt som ' + lsString + '.\n';
    const saveMessage = t("msg.saveMessage", { lsString });
    messages.value += saveMessage;
    $("#messageLabel").text(saveMessage);
    messages.scrollTop = messages.scrollHeight;
    await updateListbox();
  } catch (e) {
    console.error('IDB save failed:', e);
    $("#messageLabel").text("Kan ej spara lokalt! (IndexedDB-fel)"); // localize
    return; // bail out if we can’t even store locally
  }

  // Optional: upload to server if we have an id
  if (sid == '') {
    console.log('sid is empty, not putting');
    return;
  }

  try {
    const myid = sid + "-" + i_code.value;

    // Send as comma-separated ints (mirrors your PHP fetch format)
    const responseParam = Array.from(compressed).join(',');

    const mydata = "id=" + encodeURIComponent(myid) +
                   "&response=" + encodeURIComponent(responseParam);

    console.log("key_record_length: " + Object.keys(key_record).length);
    console.log("compressed data length (bytes): " + compressed.length);

    const jqxhr = $.ajax({
      url: "php/putdata.php",
      type: "post",
      data: mydata
    });

    jqxhr.done(function (response, textStatus, jqXHR) {
      const status = "Svaren har lagrats.";
      const phprt  = jqXHR.responseText; // ok, so we actually ignore the real php response here and write a localized string instead
      //const phprt = t("msg.fromPhp");
      console.log('Success : ' + textStatus + ' : ' + phprt);
      $("#messageLabel").append(phprt);
    });

    jqxhr.fail(function (jqXHR, textStatus, errorThrown) {
      const status = "Något gick fel :(";
      console.error("The following error occured: ", textStatus, errorThrown);
      console.log("Status:", jqXHR.status);
      console.log("Response:", jqXHR.responseText);
      $("#messageLabel").append(errorThrown);
    });
  } catch (e) {
    console.error('Upload failed:', e);
    $("#messageLabel").append(" Uppladdning misslyckades.");
  }
}

async function updateListbox() {
  const select = lb_load || document.getElementById('lb_load');
  if (!select) return;

  const keys = await idbStore.keys();
  keys.sort();

  let listbox = '';
  for (let i = 0; i < keys.length; i++) {
    listbox += `<option value="${i}">${keys[i]}</option>`;
  }
  select.innerHTML = listbox;

  console.log(`indexedDB Entries: ${keys.length}`);
}

function myItems(jsonString){
  var json = JSON.parse(jsonString);
  json.table.rows.forEach(line => {
      if (line.c[1].v.startsWith(tag)) {
      dates = line.c[0].f;
      delt = line.c[1].v;
      response = line.c[2].v;
      localStorage.setItem(delt, response);
      console.log(delt);
      }
      });
}

// Assumes: idbStore, pako, emptyListbox(), updateListbox(), loadFromListbox() are defined

async function fetchPlusFromStorage() {
  if (sid == '') {
    console.log('sid is empty, not getting');
    return;
  }

  try {
    // 1) Clear IDB + listbox
    await emptyListbox(); // your async version that calls idbStore.clear() + updateListbox()

    // 2) Prepare request params (force a single record)
    const startlimit = $("#startlimit").val();
    $("#endlimit").val(1);
    const endlimit = 1;

    const mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;

    // 3) Fetch (await the jqXHR)
    const response = await $.ajax({
      url: getdataphp,
      type: "POST",
      data: mydata
    });

    // 4) Handle "no results"
    if (typeof response === 'string' && response.includes("0 results")) {
      messages.value += response + "\n";
      return;
    }

    // 5) Parse response: expect at most one non-empty line (but handle safely)
    const lines = String(response).split('\n');

    for (const line of lines) {
      if (!line) continue;
      const rarr = line.split('\t');
      if (rarr.length !== 4) continue;

      // rarr[0] = published_on, rarr[1] = user, rarr[2] = "1,2,3,...", rarr[3] = index
      const key = `${rarr[3]}_${rarr[1]}_${rarr[0]}`;

      // Convert comma-separated ints -> Uint8Array
      const bytes = new Uint8Array(rarr[2].split(',').map(Number));

      // Store COMPRESSED bytes directly in IDB
      await idbStore.setItem(key, bytes);

      // We only asked for one record; break after the first good line
      break;
    }

    // 6) Refresh listbox and select the first item
    await updateListbox();

    if (lb_load && lb_load.options.length > 0) {
      // Your updateListbox sets option.value to the index ("0", "1", ...), text = key
      lb_load.selectedIndex = 0;

      // 7) Load selected item (async)
      await loadFromListbox();
    }

    // 8) Clear playback UI (unchanged)
    playback.value = '';

  } catch (err) {
    const status = "Något gick fel :(";
    console.error("The following error occurred:", err);
    messages.value += status + "\n";
  }
}

// Assumes: pako is available, idbStore is loaded.

async function fetchFromStorage() {
  if (sid == '') {
    console.log('sid is empty, not getting');
    return;
  }
  setBatchZipProgress(1, 'Starting');
  await flushBatchZipProgress();

  const startlimit = $("#startlimit").val();
  const endlimit = $("#endlimit").val();
  const mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;

  let response;
  try {
    response = await $.ajax({
      url: getdataphp,
      type: 'POST',
      data: mydata
    });
  } catch (err) {
    console.error("The following error occured:", err);
    messages.value += "Något gick fel :(\n";
    clearBatchZipProgress('Fetch failed');
    return;
  }

  if (typeof response === 'string' && response.includes("0 results")) {
    messages.value += response + "\n";
    clearBatchZipProgress('No results');
    return;
  }

  const lines = String(response).split('\n').filter(Boolean);
  if (!lines.length) {
    messages.value += "0 results\n";
    clearBatchZipProgress('No results');
    return;
  }

  let stored = 0;

  // Process sequentially to keep memory spikes low
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const rarr = line.split('\t');
    if (rarr.length !== 4) {
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 100, 'Fetching');
      if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
      continue;
    }

    // rarr[0] = published_on, rarr[1] = user, rarr[2] = "1,2,3,...", rarr[3] = index
    const key = `${rarr[3]}_${rarr[1]}_${rarr[0]}`;

    // Store the compressed bytes directly in IndexedDB.
    const bytes = new Uint8Array(rarr[2].split(',').map(Number));
    await idbStore.setItem(key, bytes);
    stored += 1;

    setBatchZipProgress(((lineIndex + 1) / lines.length) * 100, 'Fetching');
    if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
  }

  await updateListbox();
  clearBatchZipProgress(`Done: ${stored} files`);
}

// Make this async wherever you call it: `await loadFromListbox();`
async function loadFromListbox() {
  replayStop();
  resetReplayView();
  if (!lb_load || lb_load.selectedIndex < 0) return;

  // Your listbox shows the key as its text (same as before)
  const key = lb_load.options[lb_load.selectedIndex].text;

  // Read + inflate (or pass through if stored as string)
  const jsonStr = await getJsonFromIDB(key);
  if (!jsonStr) {
    messages.value += `Key "${key}" not found.\n`;
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse JSON for key:', key, e);
    messages.value += `Could not parse data for "${key}".\n`;
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  // Assign your records (unchanged)
  header_record = data.header_records;
  if (header_record && key) header_record._indexeddb_key = key;
  text_record   = data.text_records;
  cursor_record = data.cursor_records;
  key_record    = data.key_records;
  scroll_record = data.scroll_records;
  image_record  = data.image_records || {};
  window_record = data.window_records || data.pdf_records || {};

  messages.value += `Read ${Object.keys(text_record || {}).length} text records.\n`;
  messages.scrollTop = messages.scrollHeight;

  makeRevisionTable();
  renderDiffKeysPane();
  renderWordHistoryPane();
  window.dashboardEvents?.emit?.("log:loaded", {
    key,
    text_records: Object.keys(text_record || {}).length
  });
}

async function loadGridFromListbox() {
  await loadFromListbox();
  processGraphFormat();
  showWritingScore();
  renderDiffKeysPane();
  renderWordHistoryPane();
  makeFTAnalysis();
}

async function clearListbox() {
  if (lb_load.selectedIndex < 0) {
    return;
  }

  const slString = lb_load.options[lb_load.selectedIndex].text;

  try {
    await idbStore.removeItem(slString);
    messages.value += 'Removing ' + slString + '.\n';
    await updateListbox();
  } catch (err) {
    console.error("Failed to remove item:", err);
    messages.value += 'Error removing ' + slString + '.\n';
  }
}

async function emptyListbox() {
  try {
    // Clear the IndexedDB store
    await idbStore.clear();

    // Refresh the UI
    await updateListbox();
    console.log("All items removed from IndexedDB.");
  } catch (err) {
    console.error("Failed to clear IndexedDB:", err);
  }
}

async function dlFromListbox() {
  if (!lb_load || lb_load.selectedIndex < 0) return;

  const key = lb_load.options[lb_load.selectedIndex].text;

  try {
    const jsonStr = await getJsonFromIDB(key);
    if (!jsonStr) {
      messages.value += `No data for "${key}".\n`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const blob = new Blob([jsonStr], { type: "text/plain;charset=utf-8" });
    saveAs(blob, key + ".txt");
  } catch (err) {
    console.error("Download failed:", err);
    messages.value += `Download failed for "${key}".\n`;
    messages.scrollTop = messages.scrollHeight;
  }
}

async function dlFinalTextFromListbox() {
  if (!lb_load || lb_load.selectedIndex < 0) return;

  const key = lb_load.options[lb_load.selectedIndex].text;

  try {
    const jsonStr = await getJsonFromIDB(key);
    if (!jsonStr) {
      messages.value += `No data for "${key}".\n`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const obj = JSON.parse(jsonStr);
    const finalEntry = WebScriptLogRecordUtils.getFinalTextEntry(obj);

    if (!finalEntry) {
      messages.value += `No text_records found in "${key}".\n`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const finalText = finalEntry.value ?? '';
    const blob = new Blob([finalText], { type: "text/plain;charset=utf-8" });
    saveAs(blob, key + "_final.txt");
  } catch (err) {
    console.error("Final text download failed:", err);
    messages.value += `Final text download failed for "${key}".\n`;
    messages.scrollTop = messages.scrollHeight;
  }
}

// Info Window and Inspect metrics live under panes/info.
function debugInspect() {}

function normalizeInspectMetricRecords(records) {
  return WebScriptLogInspectCore.normalizeInspectMetricRecords(records);
}

function getSortedRecordEntries(recordObj) {
  return WebScriptLogRecordUtils.sortedEntries(recordObj || {})
    .map((entry) => ({ ts: entry.ts, value: entry.value }));
}

function getPauseEvents(keyEvents, startTime, thresholdS) {
  return WebScriptLogInspectCore.getPauseEvents(keyEvents, startTime, thresholdS);
}

function buildInspectMetricsFromRecords(records, options) {
  return WebScriptLogInspectCore.buildInspectMetricsFromRecords(records, options);
}

let lastWritingScore = null;
let lastWritingScoreValidation = null;
let lastLinearRepresentation = null;
let lastLinearRepresentationValidation = null;

function makeWritingScoreReport() {
  const score = buildWritingScoreFromRecords(getCurrentRecordSet());
  const validation = validateWritingScore(score, getCurrentRecordSet());

  lastWritingScore = score;
  lastWritingScoreValidation = validation;
  window.lastWritingScore = score;
  window.lastWritingScoreValidation = validation;

  const lines = ['<writing-score>'];
  lines.push('time_s\top\texpected_pos\tactual_pos\targ');
  for (let i = 0; i < score.operations.length; i++) {
    const op = score.operations[i];
    lines.push([
      op.time_s.toFixed(3),
      op.type === 'insert' ? 'I' : 'D',
      op.expected_pos,
      op.actual_pos === null ? '' : op.actual_pos,
      op.type === 'insert' ? JSON.stringify(op.text) : op.count
    ].join('\t'));
  }
  lines.push('</writing-score>');
  lines.push('<writing-score-check>');
  lines.push(`events\t${validation.event_count}`);
  lines.push(`operations\t${validation.operation_count}`);
  lines.push(`matches_all\t${validation.matches_all ? 'yes' : 'no'}`);
  lines.push(`mismatch_count\t${validation.mismatches.length}`);
  lines.push(`final_text_matches\t${validation.final_text_matches ? 'yes' : 'no'}`);
  if (validation.mismatches.length) {
    for (let i = 0; i < validation.mismatches.length; i++) {
      const mismatch = validation.mismatches[i];
      lines.push(`mismatch\t${mismatch.time_s.toFixed(3)}\t${JSON.stringify(mismatch.expected)}\t${JSON.stringify(mismatch.actual)}`);
    }
  }
  lines.push('</writing-score-check>');

  return lines.join('\n') + '\n';
}

function getInspectMetricOptions() {
  const intervalInput = Number(document.getElementById('inspectIntervals')?.value);
  const pauseInput = Number(document.getElementById('pauseCrit')?.value);
  const basisInput = document.getElementById('inspectBasis')?.value;
  return {
    intervals: Number.isFinite(intervalInput) ? Math.max(1, Math.min(100, Math.floor(intervalInput))) : 5,
    basis: basisInput === 'typing' ? 'typing' : 'recording',
    pause_threshold_s: Number.isFinite(pauseInput) ? Math.max(0, pauseInput) : 0.3
  };
}

function buildInspectMetrics(options) {
  return WebScriptLogInspectCore.buildInspectMetricsFromRecords(getCurrentRecordSet(), options);
}

function makeLinearLogPrintout() {
  const start = Number(header_record?.starttime) || 0;
  const dmp = new diff_match_patch();
  const lines = ['<linear-log-compact>'];

  function fmtTs(ts) {
    return ((ts - start) / 1000).toFixed(3) + 's';
  }

  function parseCursor(raw) {
    const s = String(raw || '').split(':');
    if (s.length !== 2) return null;
    const a = Number(s[0]);
    const b = Number(s[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { start: a, end: b };
  }

  function getCursorAtOrBefore(ts) {
    const times = Object.keys(cursor_record || {})
      .map(Number)
      .filter(v => Number.isFinite(v) && v <= ts)
      .sort((a, b) => a - b);
    if (!times.length) return null;
    return parseCursor(cursor_record[String(times[times.length - 1])] ?? cursor_record[times[times.length - 1]]);
  }

  function summarizeTextDiff(prevText, currText) {
    const diffs = dmp.diff_main(prevText || '', currText || '');
    dmp.diff_cleanupSemantic(diffs);

    let pos = 0;
    let insLen = 0;
    let delLen = 0;
    const parts = [];

    for (let i = 0; i < diffs.length; i++) {
      const op = diffs[i][0];
      const chunk = diffs[i][1] || '';
      if (op === DIFF_EQUAL) {
        pos += chunk.length;
        continue;
      }

      const safe = chunk.replace(/\n/g, '\\n');
      if (op === DIFF_DELETE) {
        delLen += chunk.length;
        parts.push(`=${pos} -"${safe}"`);
      } else if (op === DIFF_INSERT) {
        insLen += chunk.length;
        parts.push(`=${pos} +"${safe}"`);
        pos += chunk.length;
      }
    }

    let cls = 'NOCHANGE';
    if (insLen > 0 && delLen > 0) cls = 'REPLACE';
    else if (insLen > 0) cls = 'INSERT';
    else if (delLen > 0) cls = 'DELETE';

    // expected cursor after previous text change
    let unchangedBefore = 0;
    for (let i = 0; i < diffs.length; i++) {
      if (diffs[i][0] === DIFF_EQUAL) unchangedBefore += (diffs[i][1] || '').length;
      else break;
    }
    const expectedAfter = (cls === 'DELETE') ? unchangedBefore : (unchangedBefore + insLen);

    return {
      cls,
      expectedAfter,
      summary: parts.length ? parts.join(' | ') : '[no change]'
    };
  }

  const events = [];

  const keyTimes = Object.keys(key_record || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  for (let i = 0; i < keyTimes.length; i++) {
    const ts = keyTimes[i];
    const raw = key_record[String(ts)] ?? key_record[ts] ?? '';
    if (typeof raw !== 'string') continue;

    if (raw.startsWith('keydown: ')) {
      const keyName = raw.substring(9);
      events.push({ ts, type: 'keydown', key: keyName });
    } else if (raw.startsWith('mousedown')) {
      events.push({ ts, type: 'mouse', key: 'mousedown' });
    } else if (raw.startsWith('mouseup')) {
      events.push({ ts, type: 'mouse', key: 'mouseup' });
    }
  }

  const textTimes = Object.keys(text_record || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  let prevText = '';
  for (let i = 0; i < textTimes.length; i++) {
    const ts = textTimes[i];
    const currText = text_record[String(ts)] ?? text_record[ts] ?? '';
    const diffInfo = summarizeTextDiff(prevText, currText);
    events.push({
      ts,
      type: 'text',
      diffInfo
    });
    prevText = currText;
  }

  events.sort((a, b) => a.ts - b.ts || (a.type === 'text' ? 1 : -1));

  let lastTs = start;
  let expectedCursor = 0;
  const pauseCritValue = Number(document.getElementById('pauseCrit')?.value);
  const longPauseSec = Number.isFinite(pauseCritValue) ? Math.max(1.0, pauseCritValue) : 1.0;
  const navKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const delta = (ev.ts - lastTs) / 1000;
    if (delta >= longPauseSec) {
      lines.push(`${fmtTs(ev.ts)} pause ${delta.toFixed(3)}s`);
    }
    lastTs = ev.ts;

    if (ev.type === 'text') {
      lines.push(`${fmtTs(ev.ts)} ${ev.diffInfo.cls} ${ev.diffInfo.summary}`);
      expectedCursor = ev.diffInfo.expectedAfter;
      continue;
    }

    let line = `${fmtTs(ev.ts)} keydown ${ev.key}`;
    const isCursorSensitive = ev.type === 'mouse' || navKeys.has(ev.key);
    if (isCursorSensitive) {
      const cur = getCursorAtOrBefore(ev.ts);
      if (cur) {
        const isExpected = cur.start === expectedCursor && cur.end === expectedCursor;
        if (!isExpected) {
          line += ` cursor ${cur.start}:${cur.end}`;
        }
        if (cur.start === cur.end) expectedCursor = cur.start;
      }
    }
    lines.push(line);
  }
  lines.push('</linear-log-compact>');

  return lines.join('\n') + '\n';
}

function makeImageClickTextTimeline() {
  const showTimes = Object.keys(image_record || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter(ts => (image_record[String(ts)] ?? image_record[ts]) === "show")
    .sort((a, b) => a - b);

  if (!showTimes.length) {
    return 'No image show records.\n';
  }

  const textTimes = Object.keys(text_record || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  function textAtOrBefore(ts) {
    let chosen = '';
    for (let i = 0; i < textTimes.length; i++) {
      const t = textTimes[i];
      if (t <= ts) {
        chosen = text_record[String(t)] ?? text_record[t] ?? chosen;
      } else {
        break;
      }
    }
    return chosen;
  }

  const lines = [];
  const dmp = new diff_match_patch();

  function formatTimeSinceStart(ts) {
    const start = Number(header_record?.starttime) || 0;
    return ((ts - start) / 1000).toFixed(3);
  }

  function formatDiffSinceLastShow(prevText, nextText) {
    const diffs = dmp.diff_main(prevText || '', nextText || '');
    dmp.diff_cleanupSemantic(diffs);

    const parts = [];
    for (let i = 0; i < diffs.length; i++) {
      const op = diffs[i][0];
      const text = (diffs[i][1] || '').replace(/\n/g, '\\n');
      if (!text) continue;
      if (op === -1) parts.push('- ' + text);
      if (op === 1) parts.push('+ ' + text);
    }
    return parts.length ? parts.join('\n') : '[no change]';
  }

  const snapshots = showTimes.map(ts => textAtOrBefore(ts));
  const lastTextTime = textTimes.length ? textTimes[textTimes.length - 1] : null;
  const finalText = lastTextTime === null
    ? ''
    : (text_record[String(lastTextTime)] ?? text_record[lastTextTime] ?? '');

  lines.push('<start>');
  lines.push(snapshots[0] || '[empty]');

  for (let i = 0; i < showTimes.length; i++) {
    lines.push(`<Image clicked @ ${formatTimeSinceStart(showTimes[i])}s>`);
    if (i < showTimes.length - 1) {
      lines.push(formatDiffSinceLastShow(snapshots[i], snapshots[i + 1]));
    }
  }

  const lastShowSnapshot = snapshots[snapshots.length - 1] || '';
  const stopTs = Number(header_record?.endtime);
  const stopTag = Number.isFinite(stopTs)
    ? `<Final diff before stop @ ${formatTimeSinceStart(stopTs)}s>`
    : '<Final diff before stop>';
  lines.push(stopTag);
  lines.push(formatDiffSinceLastShow(lastShowSnapshot, finalText));

  lines.push('<stop>');
  return lines.join('\n') + '\n';
}

// Revision Table lives under panes/revision_table.

let groupTime = -1;

function parseReplayCursorRecord(raw) {
  const parts = String(raw ?? '').split(':');
  if (parts.length !== 2) return null;
  const start = Number(parts[0]);
  const end = Number(parts[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

function clampReplayCursor(cursor, text) {
  if (!cursor) return null;
  const max = String(text ?? '').length;
  const start = Math.max(0, Math.min(max, cursor.start));
  const end = Math.max(0, Math.min(max, cursor.end));
  return { start, end };
}

function isReplayCursorInText(cursor, text) {
  if (!cursor) return false;
  const max = String(text ?? '').length;
  return cursor.start >= 0 && cursor.start <= max && cursor.end >= 0 && cursor.end <= max;
}

function findReplayBoundaryEntry(recordObj, timestamp, inclusive) {
  const boundary = Number(timestamp);
  if (!Number.isFinite(boundary)) return null;
  const entries = getSortedRecordEntries(recordObj || {});
  let selected = null;
  for (let i = 0; i < entries.length; i++) {
    const ts = entries[i].ts;
    if ((inclusive ? ts <= boundary : ts < boundary)) selected = entries[i];
    else break;
  }
  return selected;
}

function inferReplayCursorFromTextChange(textEntry) {
  if (!textEntry) return { start: 0, end: 0 };
  const previousTextEntry = findReplayBoundaryEntry(text_record || {}, textEntry.ts, false);
  const previousText = String(previousTextEntry?.value ?? '');
  const currentText = String(textEntry.value ?? '');
  const diff = myDmp.diff_main(previousText, currentText);

  let oldPos = 0;
  let newPos = 0;
  let firstChange = null;
  let insertedLength = 0;
  let deletedLength = 0;

  for (let i = 0; i < diff.length; i++) {
    const op = diff[i][0];
    const text = diff[i][1] || '';
    if (op === DIFF_EQUAL) {
      oldPos += text.length;
      newPos += text.length;
    } else {
      if (firstChange === null) firstChange = newPos;
      if (op === DIFF_INSERT) {
        insertedLength += text.length;
        newPos += text.length;
      } else if (op === DIFF_DELETE) {
        deletedLength += text.length;
        oldPos += text.length;
      }
    }
  }

  const position = firstChange === null
    ? currentText.length
    : firstChange + (insertedLength > 0 ? insertedLength : 0);
  return clampReplayCursor({ start: position, end: position }, currentText);
}

function resolveReplayStateAtTimestamp(timestamp, mode = 'before') {
  const inclusive = mode === 'inclusive';
  const textEntry = findReplayBoundaryEntry(text_record || {}, timestamp, inclusive);
  const text = String(textEntry?.value ?? '');
  const cursorEntry = findReplayBoundaryEntry(cursor_record || {}, timestamp, inclusive);
  const scrollEntry = findReplayBoundaryEntry(scroll_record || {}, timestamp, inclusive);

  const parsedCursor = parseReplayCursorRecord(cursorEntry?.value);
  let cursor = isReplayCursorInText(parsedCursor, text) ? parsedCursor : null;
  if (!cursor || (cursorEntry && (cursorEntry.ts < Number(textEntry?.ts || -Infinity) || cursorEntry.ts > Number(timestamp)))) {
    const exactTextCursor = textEntry
      ? parseReplayCursorRecord((cursor_record || {})[String(textEntry.ts)] ?? (cursor_record || {})[textEntry.ts])
      : null;
    cursor = clampReplayCursor(exactTextCursor, text) || inferReplayCursorFromTextChange(textEntry);
  }

  return {
    text,
    textTs: textEntry?.ts ?? null,
    cursor,
    cursorTs: cursorEntry?.ts ?? null,
    scrollTop: scrollEntry ? Number(scrollEntry.value) : null,
    scrollTs: scrollEntry?.ts ?? null
  };
}

function setReplayStartTimestamp(timestamp, mode = 'before') {
  replayStop();

  const nextGroupTime = Number(timestamp);
  if (!Number.isFinite(nextGroupTime)) return;
  groupTime = nextGroupTime;

  const replayStateAtTime = resolveReplayStateAtTimestamp(groupTime, mode);
  playback.value = replayStateAtTime.text;
  const cursor = replayStateAtTime.cursor || { start: 0, end: 0 };
  playback.setSelectionRange(cursor.start, cursor.end);
  if (Number.isFinite(replayStateAtTime.scrollTop)) playback.scrollTop = replayStateAtTime.scrollTop;
  else ensureReplayCaretVisible(cursor.end);

  syncReplayCursorMode(cursor.end);
  updateProcessGraphReplayMarker(groupTime);
  window.dashboardEvents?.emit?.("replay:jump", {
    timestamp: groupTime,
    mode
  });
}

function playFromRow(e) {
  const row = e.currentTarget || e.target?.closest?.('tr');
  const tsCell = row?.cells?.[6];
  setReplayStartTimestamp(tsCell ? Number(tsCell.id) : NaN);
}

function processGraphFormat() {
  const startTime = Number(header_record?.starttime) || 0;
  const pauseSettings = getProcessGraphPauseSettings();
  const pauseThreshold = pauseSettings.threshold;
  const textSeries = [];
  const positionSeries = [];
  const keyEvents = getSortedRecordEntries(key_record || {});
  const cursorEntries = getSortedRecordEntries(cursor_record || {});

  current_text = "";
  processlength = 0;

  for (var k in text_record) {
    edited_text = text_record[k];
    var commonlength = myDmp.diff_commonPrefix(current_text, edited_text);
    text1 = current_text.substring(commonlength);
    text2 = edited_text.substring(commonlength);

    commonlengths = myDmp.diff_commonSuffix(text1, text2);
    text1 = text1.substring(0, text1.length - commonlengths);
    text2 = text2.substring(0, text2.length - commonlengths);

    processlength += text2.length;
    const elapsedMs = Number(k) - startTime;

    textSeries.push({
      elapsed_ms: elapsedMs,
      product: text_record[k].length,
      process: processlength
    });

    current_text = edited_text;
  }

  for (let i = 0; i < cursorEntries.length; i++) {
    const parsed = parseCursorRecord(cursorEntries[i].value);
    if (!parsed) continue;
    positionSeries.push({
      elapsed_ms: cursorEntries[i].ts - startTime,
      position: parsed.end
    });
  }

  const pauseSeries = getPauseEvents(keyEvents, startTime, pauseThreshold)
    .map((pause) => ({
      elapsed_ms: pause.ts - startTime,
      duration_s: pause.duration_s
    }))
    .filter((pause) => pause.duration_s >= pauseSettings.min && (
      pauseSettings.max === null || pause.duration_s <= pauseSettings.max
    ));

  drawSvg({
    textSeries,
    positionSeries,
    pauseSeries,
    pauseAxisMin: pauseSettings.min,
    pauseAxisMax: pauseSettings.max
  });
}

function getProcessGraphPauseSettings() {
  const thresholdInput = Number(document.getElementById('processGraphPauseThreshold')?.value);
  const minInput = Number(document.getElementById('processGraphPauseMin')?.value);
  const maxInputRaw = document.getElementById('processGraphPauseMax')?.value;
  const maxInput = Number(maxInputRaw);
  const threshold = Number.isFinite(thresholdInput) ? Math.max(0, thresholdInput) : 0.3;
  const min = Number.isFinite(minInput) ? Math.max(0, minInput) : 0;
  const max = maxInputRaw === '' || maxInputRaw == null || !Number.isFinite(maxInput)
    ? null
    : Math.max(min, maxInput);

  return { threshold, min, max };
}

function recordKeyDown(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  if (!keySet.has(e.key)) {
    keySet.add(e.key);
    key_record[myTime] = "keydown: " + e.key;
    // only in verbose
    //messages.value += myTime + ': (d, ' + selStart + ', ' + selEnd + ') ' + '\n';
    /*if (e.repeat) {
      return
      }*/
  } else {
    key_record[myTime] = "repeat: " + e.key;
    // only in verbose        
    //messages.value += myTime + ': (r, ' + selStart + ', ' + selEnd + ') ' + '\n';
    cursor_record[myTime] = selStart + ':' + selEnd;
  }
  //messages.scrollTop = messages.scrollHeight;
}

function recordKeyUp(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  if (keySet.delete(e.key)) {
    key_record[myTime] = "keyup: " + e.key;
    cursor_record[myTime] = selStart + ':' + selEnd;
    // only in verbose        
    //messages.value += myTime + ': (u, ' + selStart + ', ' + selEnd + ') ' + '\n';
    //messages.scrollTop = messages.scrollHeight;
  }
}

function recordMouseDown(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  key_record[myTime] = "mousedown: yes";
  cursor_record[myTime] = selStart + ':' + selEnd;
  // only in verbose        
  //messages.value += myTime + ': (md, ' + selStart + ', ' + selEnd + ') ' + '\n';
  //messages.scrollTop = messages.scrollHeight;
}

function recordMouseUp(e) {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  key_record[myTime] = "mouseup: yes";
  cursor_record[myTime] = selStart + ':' + selEnd;
  // only in verbose        
  //messages.value += myTime + ': (mu, ' + selStart + ', ' + selEnd + ') ' + '\n';
  //messages.scrollTop = messages.scrollHeight;
}

function recordMouseMove(e) {
  if (e.buttons > 0 && e.buttons < 5) {
    var myTime = (new Date()).getTime();
    var selStart = this.selectionStart;
    var selEnd = this.selectionEnd;
    key_record[myTime] = "mousemove: yes";
    cursor_record[myTime] = selStart + ':' + selEnd;
    // only in verbose        
    //messages.value += myTime + ': (mm, ' + selStart + ', ' + selEnd + ') ' + '\n';
    //messages.scrollTop = messages.scrollHeight;
  }
}

function recordInput() {
  var myTime = (new Date()).getTime();
  var selStart = this.selectionStart;
  var selEnd = this.selectionEnd;
  var edited_text = this.value;

  var commonlength = myDmp.diff_commonPrefix(current_text, edited_text);
  //var commonprefix = current_text.substring(0, commonlength);
  text1 = current_text.substring(commonlength);
  text2 = edited_text.substring(commonlength);

  // Trim off common suffix (speedup).
  commonlengths = myDmp.diff_commonSuffix(text1, text2);
  //var commonsuffix = text1.substring(text1.length - commonlengths);
  text1 = text1.substring(0, text1.length - commonlengths);
  text2 = text2.substring(0, text2.length - commonlengths);

  /*
     messages.value += myTime + ': (i, '
     + selStart + ', '
     + selEnd + ') '
     + 'Old: ' + text1 + ' '
     + 'New: ' + text2 + ' '
     + 'Diff: ' + commonlength
     + '\n';
   */

  text_record[myTime] = edited_text;
  // more compact, needs another replay function
  //text_record[myTime] = commonlength + ':' + text1 + ':' + text2;
  cursor_record[myTime] = selStart + ':' + selEnd;
  current_text = edited_text;
  // only in verbose
  //messages.value += myTime + ': (i, ' + Object.keys(text_record).length + ') \n';
  //messages.scrollTop = messages.scrollHeight;
  messages.value += text1 + ':' + text2 + ' ';

}

function recordScroll() {
  var myTime = (new Date()).getTime();
  var myScrollTop = this.scrollTop;
  scroll_record[myTime] = myScrollTop;
  // only in verbose        
  //messages.value += myTime + ': (s, ' + myScrollTop + ') ' + '\n';
  //messages.scrollTop = messages.scrollHeight;
}

function replayNormal() {
  replayStart(1);
}

function replayFast() {
  replayStart(0.1);
}

function getReplayTextEditEntries() {
  return getSortedRecordEntries(text_record || {})
    .filter((entry) => Number.isFinite(entry.ts));
}

function getReplayCurrentTextTimestamp() {
  const logicalTs = getCurrentReplayLogicalTimestamp();
  const state = resolveReplayStateAtTimestamp(logicalTs, 'inclusive');
  return Number.isFinite(Number(state.textTs)) ? Number(state.textTs) : null;
}

function replayStepEditForward() {
  const entries = getReplayTextEditEntries();
  if (!entries.length) return;

  const currentTextTs = getReplayCurrentTextTimestamp();
  const next = entries.find((entry) => currentTextTs == null || entry.ts > currentTextTs);
  if (next) setReplayStartTimestamp(next.ts, 'inclusive');
}

function replayStepEditBackward() {
  const entries = getReplayTextEditEntries();
  if (!entries.length) return;

  const currentTextTs = getReplayCurrentTextTimestamp();
  if (currentTextTs == null) return;

  let previous = null;
  for (const entry of entries) {
    if (entry.ts < currentTextTs) previous = entry;
    else break;
  }

  if (previous) {
    setReplayStartTimestamp(previous.ts, 'inclusive');
    return;
  }

  const startTs = Number(header_record?.starttime);
  if (Number.isFinite(startTs)) setReplayStartTimestamp(startTs, 'before');
}

function replayGoToEnd() {
  const endTs = Number(header_record?.endtime);
  const entries = getReplayTextEditEntries();
  const fallbackTs = entries.length ? entries[entries.length - 1].ts : Number(header_record?.starttime);
  const targetTs = Number.isFinite(endTs) ? endTs : fallbackTs;
  if (Number.isFinite(targetTs)) setReplayStartTimestamp(targetTs, 'inclusive');
}

let replayState = {
  active: false,
  paused: false,
  speedup: 1,
  mark: 0,
  startedAt: 0,
  currentTs: null
};

function bindPlaybackEditGuard() {
  if (!playback || playback.dataset.editGuardBound === 'true') return;
  playback.setAttribute('aria-readonly', 'true');
  playback.setAttribute('tabindex', '0');
  playback.readOnly = false;

  playback.addEventListener('beforeinput', (event) => {
    event.preventDefault();
  });
  playback.addEventListener('paste', (event) => {
    event.preventDefault();
  });
  playback.addEventListener('drop', (event) => {
    event.preventDefault();
  });
  playback.addEventListener('cut', (event) => {
    event.preventDefault();
  });
  playback.addEventListener('scroll', () => {
    syncReplayCursorMode();
  });
  playback.addEventListener('keydown', (event) => {
    const editKeys = new Set(['Backspace', 'Delete', 'Enter']);
    const isCharacterInput = event.key?.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (isCharacterInput || editKeys.has(event.key)) {
      event.preventDefault();
    }
  });

  playback.dataset.editGuardBound = 'true';
}

function syncReplayRecorderSize() {
  const checkbox = document.getElementById('replayUseRecorderSize');
  if (!playback || !recorder || !checkbox?.checked) {
    playback?.classList?.remove('replay-recorder-size');
    if (playback) {
      playback.style.removeProperty('--replay-recorder-width');
      playback.style.removeProperty('--replay-recorder-height');
      playback.style.fontFamily = "Calibri, Georgia, serif";
      playback.style.fontSize = '';
      playback.style.lineHeight = '';
    }
    syncReplayCursorMode();
    return;
  }

  const measurement = measureRecorderForReplay();
  if (measurement.width > 0 && measurement.height > 0) {
    playback.classList.add('replay-recorder-size');
    playback.style.setProperty('--replay-recorder-width', `${Math.round(measurement.width)}px`);
    playback.style.setProperty('--replay-recorder-height', `${Math.round(measurement.height)}px`);
    playback.style.fontFamily = measurement.fontFamily;
    playback.style.fontSize = measurement.fontSize;
    playback.style.lineHeight = measurement.lineHeight;
  }
  syncReplayCursorMode();
}

function measureRecorderForReplay() {
  const getMeasurement = () => {
    const rect = recorder.getBoundingClientRect();
    const style = window.getComputedStyle(recorder);
    return {
      width: rect.width,
      height: rect.height,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight
    };
  };

  let measurement = getMeasurement();
  if (measurement.width > 0 && measurement.height > 0) return measurement;

  const panel = recorder.closest('.panel');
  if (!panel) return measurement;

  const previousStyle = {
    display: panel.style.display,
    position: panel.style.position,
    visibility: panel.style.visibility,
    left: panel.style.left,
    top: panel.style.top,
    width: panel.style.width,
    pointerEvents: panel.style.pointerEvents,
    zIndex: panel.style.zIndex
  };

  panel.style.display = 'block';
  panel.style.position = 'absolute';
  panel.style.visibility = 'hidden';
  panel.style.left = '-100000px';
  panel.style.top = '0';
  panel.style.width = `${Math.max(320, document.documentElement.clientWidth - 24)}px`;
  panel.style.pointerEvents = 'none';
  panel.style.zIndex = '-1';

  measurement = getMeasurement();

  panel.style.display = previousStyle.display;
  panel.style.position = previousStyle.position;
  panel.style.visibility = previousStyle.visibility;
  panel.style.left = previousStyle.left;
  panel.style.top = previousStyle.top;
  panel.style.width = previousStyle.width;
  panel.style.pointerEvents = previousStyle.pointerEvents;
  panel.style.zIndex = previousStyle.zIndex;

  return measurement;
}

function updateReplayPauseButton() {
  const button = document.getElementById('b_reppause');
  if (!button) return;
  button.textContent = replayState.paused ? t('btn.RESUME') : t('btn.PAUSE');
}

function replayStart(speedup) {
  replayStop();
  if (recorder.recording) {
    stopRecording();
  }
  //store the time the sequence started
  //so that we can subtract it from subsequent actions
  // set up text changes
  if (groupTime === -1) {
    playback.value = '';
    var mark = header_record['starttime'];
  } else {
    var mark = groupTime;
  }
  replayState = {
    active: true,
    paused: false,
    speedup,
    mark,
    startedAt: Date.now(),
    currentTs: mark
  };
  updateReplayPauseButton();
  syncReplayCursorMode();
  updateProcessGraphReplayMarker(mark);
  startProcessGraphReplayMarkerLoop();
  //var mark = 1682689804661;
  //var mark = 1682689195634;
  for (var t in text_record) {
    //        if (mark) {
    var timeout = t - mark;
    timeout = timeout * speedup;
    //        } else {
    //            var timeout = 0;
    //            mark = t;
    //        }
    // We need to create a callback which closes over the value of t
    // because t would have changed by the time this is run
    if (timeout >= 0) text_record_keeper[t] = setTimeout(changeValueCallback(text_record[t], t), timeout);
  }

  // set up cursor changes
  //    var mark = null;
  for (var t in cursor_record) {
    //        if (mark) {
    var timeout = t - mark;
    timeout = timeout * speedup;
    //        } else {
    //            var timeout = 0;
    //            mark = t;
    //        }
    // We need to create a callback which closes over the value of t
    // because t would have changed by the time this is run
    if (timeout >= 0) cursor_record_keeper[t] = setTimeout(changeCursorCallback(cursor_record[t], t), timeout);
  }

  // set up scroll changes
  for (var t in scroll_record) {
    // if (mark) see above...impossible to have scroll_record without starttime
    var timeout = t - mark;
    timeout = timeout * speedup;
    if (timeout >= 0) scroll_record_keeper[t] = setTimeout(changeScrollCallback(scroll_record[t], t), timeout);
  }

}

function clearReplayTimers() {
  for (var t in text_record) {
    clearTimeout(text_record_keeper[t]);
  }
  for (var t in cursor_record) {
    clearTimeout(cursor_record_keeper[t]);
  }
  for (var t in scroll_record) {
    clearTimeout(scroll_record_keeper[t]);
  }
  text_record_keeper = {};
  cursor_record_keeper = {};
  scroll_record_keeper = {};
}

function replayStop() {
  const stoppedTs = getCurrentReplayLogicalTimestamp();
  clearReplayTimers();
  stopProcessGraphReplayMarkerLoop();
  replayState.active = false;
  replayState.paused = false;
  replayState.currentTs = null;
  if (Number.isFinite(stoppedTs)) updateProcessGraphReplayMarker(stoppedTs);
  updateReplayPauseButton();
}

function resetReplayView() {
  groupTime = -1;
  if (playback) {
    playback.value = '';
    playback.scrollTop = 0;
    try {
      playback.setSelectionRange(0, 0);
    } catch (err) {
      // Ignore if the textarea is not currently focusable.
    }
  }
  syncReplayCursorMode(0);
  updateProcessGraphReplayMarker(Number(header_record?.starttime) || 0);
}

function getReplayCaretPosition() {
  const selectionEnd = Number(playback?.selectionEnd);
  return Number.isFinite(selectionEnd) ? selectionEnd : 0;
}

function getReplayMirror(style) {
  const mirror = document.createElement('div');
  const copiedProps = [
    'boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'textAlign', 'textIndent', 'tabSize'
  ];

  mirror.style.position = 'absolute';
  mirror.style.left = '-99999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.wordBreak = style.wordBreak;
  mirror.style.width = `${playback.offsetWidth}px`;
  copiedProps.forEach((prop) => {
    mirror.style[prop] = style[prop];
  });
  return mirror;
}

function updateReplaySelectionOverlay() {
  const overlay = document.getElementById('replaySelectionOverlay');
  if (!playback || !overlay) return;

  overlay.replaceChildren();
  if (!isReplayVirtualCursorEnabled()) {
    overlay.style.display = 'none';
    return;
  }

  const start = Math.max(0, Math.min(Number(playback.selectionStart) || 0, playback.value.length));
  const end = Math.max(0, Math.min(Number(playback.selectionEnd) || 0, playback.value.length));
  if (start === end) {
    overlay.style.display = 'none';
    return;
  }

  const frame = document.getElementById('replayFrame');
  if (!frame) return;

  const selectionStart = Math.min(start, end);
  const selectionEnd = Math.max(start, end);
  const style = window.getComputedStyle(playback);
  const mirror = getReplayMirror(style);
  const selected = document.createElement('span');
  selected.textContent = playback.value.slice(selectionStart, selectionEnd);

  mirror.appendChild(document.createTextNode(playback.value.slice(0, selectionStart)));
  mirror.appendChild(selected);
  mirror.appendChild(document.createTextNode(playback.value.slice(selectionEnd) || '.'));
  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const playbackRect = playback.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const visibleTop = playbackRect.top - frameRect.top;
  const visibleLeft = playbackRect.left - frameRect.left;
  const visibleBottom = visibleTop + playback.clientHeight;
  const visibleRight = visibleLeft + playback.clientWidth;

  overlay.style.left = `${visibleLeft}px`;
  overlay.style.top = `${visibleTop}px`;
  overlay.style.width = `${playback.clientWidth}px`;
  overlay.style.height = `${playback.clientHeight}px`;

  Array.from(selected.getClientRects()).forEach((rect) => {
    const left = playbackRect.left - frameRect.left + (rect.left - mirrorRect.left) - playback.scrollLeft;
    const top = playbackRect.top - frameRect.top + (rect.top - mirrorRect.top) - playback.scrollTop;
    const right = left + rect.width;
    const bottom = top + rect.height;
    const clippedLeft = Math.max(left, visibleLeft);
    const clippedTop = Math.max(top, visibleTop);
    const clippedRight = Math.min(right, visibleRight);
    const clippedBottom = Math.min(bottom, visibleBottom);
    if (clippedRight <= clippedLeft || clippedBottom <= clippedTop) return;

    const segment = document.createElement('div');
    segment.className = 'replay-selection-segment';
    segment.style.left = `${clippedLeft - visibleLeft}px`;
    segment.style.top = `${clippedTop - visibleTop}px`;
    segment.style.width = `${clippedRight - clippedLeft}px`;
    segment.style.height = `${clippedBottom - clippedTop}px`;
    overlay.appendChild(segment);
  });

  document.body.removeChild(mirror);
  overlay.style.display = overlay.childElementCount > 0 ? 'block' : 'none';
}

function updateReplayCaretOverlay(position = getReplayCaretPosition()) {
  const caret = document.getElementById('replayCaretOverlay');
  if (!playback || !caret) return;
  updateReplaySelectionOverlay();
  if (!isReplayVirtualCursorEnabled()) {
    caret.style.display = 'none';
    return;
  }

  const pos = Math.max(0, Math.min(Number(position) || 0, playback.value.length));
  const frame = document.getElementById('replayFrame');
  if (!frame) return;

  const style = window.getComputedStyle(playback);
  const mirror = getReplayMirror(style);

  const before = document.createTextNode(playback.value.slice(0, pos));
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  const afterChar = playback.value.slice(pos, pos + 1);
  const after = document.createTextNode(afterChar || '.');
  mirror.appendChild(before);
  mirror.appendChild(marker);
  mirror.appendChild(after);
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const playbackRect = playback.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 18;

  const left = playbackRect.left - frameRect.left + (markerRect.left - mirrorRect.left) - playback.scrollLeft;
  const top = playbackRect.top - frameRect.top + (markerRect.top - mirrorRect.top) - playback.scrollTop;

  document.body.removeChild(mirror);

  const visibleTop = playbackRect.top - frameRect.top;
  const visibleBottom = visibleTop + playback.clientHeight;
  const visibleLeft = playbackRect.left - frameRect.left;
  const visibleRight = visibleLeft + playback.clientWidth;

  if (top + lineHeight < visibleTop || top > visibleBottom || left < visibleLeft || left > visibleRight) {
    caret.style.display = 'none';
    return;
  }

  caret.style.left = `${left}px`;
  caret.style.top = `${top}px`;
  caret.style.height = `${lineHeight}px`;
  caret.style.display = 'block';
}

function getReplayCaretCoordinates(position = getReplayCaretPosition()) {
  if (!playback) return null;

  const pos = Math.max(0, Math.min(Number(position) || 0, playback.value.length));
  const style = window.getComputedStyle(playback);
  const mirror = getReplayMirror(style);

  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(document.createTextNode(playback.value.slice(0, pos)));
  mirror.appendChild(marker);
  mirror.appendChild(document.createTextNode(playback.value.slice(pos, pos + 1) || '.'));
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2 || 18;
  const coords = {
    left: markerRect.left - mirrorRect.left,
    top: markerRect.top - mirrorRect.top,
    lineHeight
  };

  document.body.removeChild(mirror);
  return coords;
}

function ensureReplayCaretVisible(position = getReplayCaretPosition()) {
  const checkbox = document.getElementById('replayEnsureCaretVisible');
  if (!checkbox?.checked) return;

  const coords = getReplayCaretCoordinates(position);
  if (!coords || !playback) return;

  const padding = Math.max(8, coords.lineHeight * 0.5);
  const caretTop = coords.top;
  const caretBottom = coords.top + coords.lineHeight;
  const viewportTop = playback.scrollTop;
  const viewportBottom = playback.scrollTop + playback.clientHeight;

  if (caretTop < viewportTop + padding) {
    playback.scrollTop = Math.max(0, caretTop - padding);
  } else if (caretBottom > viewportBottom - padding) {
    playback.scrollTop = caretBottom - playback.clientHeight + padding;
  }
}

function isReplayVirtualCursorEnabled() {
  return Boolean(document.getElementById('replayVirtualCursor')?.checked);
}

function syncReplayCursorMode(position = getReplayCaretPosition()) {
  const caret = document.getElementById('replayCaretOverlay');
  const selection = document.getElementById('replaySelectionOverlay');
  const virtual = isReplayVirtualCursorEnabled();

  playback?.classList?.toggle('replay-virtual-cursor-enabled', virtual);

  if (virtual) {
    if (document.activeElement === playback) playback.blur();
    updateReplayCaretOverlay(position);
    return;
  }

  if (caret) caret.style.display = 'none';
  if (selection) {
    selection.replaceChildren();
    selection.style.display = 'none';
  }
  if (playback && document.activeElement !== playback) {
    try {
      playback.focus({ preventScroll: true });
    } catch (err) {
      playback.focus();
    }
  }
}

function getCurrentReplayLogicalTimestamp() {
  if (replayState.currentTs != null && (replayState.paused || !replayState.active)) return replayState.currentTs;
  if (!replayState.active) return Number(groupTime) > -1 ? Number(groupTime) : Number(header_record?.starttime) || 0;
  const elapsed = Date.now() - replayState.startedAt;
  return replayState.mark + (elapsed / Math.max(Number(replayState.speedup) || 1, 0.0001));
}

let processGraphReplayMarkerFrame = null;

function updateProcessGraphReplayMarker(timestamp = getCurrentReplayLogicalTimestamp()) {
  const startTime = Number(header_record?.starttime) || 0;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !startTime) return;

  document.querySelectorAll('.process-graph-replay-marker').forEach((line) => {
    const svgRoot = line.ownerSVGElement;
    const plotWidth = Number(svgRoot?.dataset?.plotWidth);
    const maxElapsed = Number(svgRoot?.dataset?.maxElapsedMs);
    if (!Number.isFinite(plotWidth) || !Number.isFinite(maxElapsed) || maxElapsed <= 0) return;
    const elapsed = Math.max(0, Math.min(maxElapsed, ts - startTime));
    const xPos = (elapsed / maxElapsed) * plotWidth;
    line.setAttribute('x1', xPos);
    line.setAttribute('x2', xPos);
    line.style.display = '';
  });
}

function startProcessGraphReplayMarkerLoop() {
  stopProcessGraphReplayMarkerLoop();

  const tick = () => {
    if (!replayState.active) {
      processGraphReplayMarkerFrame = null;
      return;
    }

    const logicalTs = getCurrentReplayLogicalTimestamp();
    const endTs = Number(header_record?.endtime);
    updateProcessGraphReplayMarker(logicalTs);

    if (Number.isFinite(endTs) && logicalTs >= endTs) {
      replayState.active = false;
      replayState.currentTs = endTs;
      updateProcessGraphReplayMarker(endTs);
      updateReplayPauseButton();
      processGraphReplayMarkerFrame = null;
      return;
    }

    processGraphReplayMarkerFrame = requestAnimationFrame(tick);
  };

  processGraphReplayMarkerFrame = requestAnimationFrame(tick);
}

function stopProcessGraphReplayMarkerLoop() {
  if (processGraphReplayMarkerFrame != null) {
    cancelAnimationFrame(processGraphReplayMarkerFrame);
    processGraphReplayMarkerFrame = null;
  }
}

function replayPauseToggle() {
  if (replayState.paused) {
    const speedup = replayState.speedup || 1;
    replayStart(speedup);
    return;
  }

  if (!replayState.active) return;
  const speedup = replayState.speedup || 1;
  const logicalTs = getCurrentReplayLogicalTimestamp();
  clearReplayTimers();
  setReplayStartTimestamp(logicalTs, 'before');
  replayState = {
    active: false,
    paused: true,
    speedup,
    mark: logicalTs,
    startedAt: 0,
    currentTs: logicalTs
  };
  groupTime = logicalTs;
  updateReplayPauseButton();
}

function changeValueCallback(val, ts) {
  return function () {
    replayState.currentTs = Number(ts);
    playback.value = val;
    ensureReplayCaretVisible();
    syncReplayCursorMode();
    updateProcessGraphReplayMarker(ts);
  };
}

function changeCursorCallback(val, ts) {
  return function () {
    replayState.currentTs = Number(ts);
    val_indices = val.split(":");
    playback.setSelectionRange(val_indices[0], val_indices[1]);
    ensureReplayCaretVisible(val_indices[1]);
    syncReplayCursorMode(val_indices[1]);
    updateProcessGraphReplayMarker(ts);
  };
}

function changeScrollCallback(val, ts) {
  return function () {
    replayState.currentTs = Number(ts);
    playback.scrollTop = val;
    syncReplayCursorMode();
    updateProcessGraphReplayMarker(ts);
  };
}

function drawSvgInto(svgSelector, graphData) {
  const textSeries = Array.isArray(graphData?.textSeries) ? graphData.textSeries : [];
  const positionSeries = Array.isArray(graphData?.positionSeries) ? graphData.positionSeries : [];
  const pauseSeries = Array.isArray(graphData?.pauseSeries) ? graphData.pauseSeries : [];
  const pauseAxisMin = Number.isFinite(Number(graphData?.pauseAxisMin)) ? Number(graphData.pauseAxisMin) : 0;
  const pauseAxisMax = Number.isFinite(Number(graphData?.pauseAxisMax)) ? Number(graphData.pauseAxisMax) : null;

  if (textSeries.length === 0) {
    return;
  }

  const svgRoot = d3.select(svgSelector);
  if (svgRoot.empty()) return;

  svgRoot.selectAll("*").remove();
  //    var svg = d3.select("svg"),
  //            margin = {top: 20, right: 20, bottom: 30, left: 50},
  //    width = +svg.attr("width") - margin.left - margin.right,
  //            height = +svg.attr("height") - margin.top - margin.bottom,
  //            g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  const svgNode = svgRoot.node();
  const svgBounds = svgNode?.getBoundingClientRect?.() || { width: 960, height: 500 };
  const parentNode = svgNode?.closest?.('.process-graph-tool') || svgNode?.parentElement;
  const parentBounds = parentNode?.getBoundingClientRect?.() || null;
  const measuredWidth = parentBounds?.width || svgBounds.width;
  const measuredHeight = svgBounds.height || parentBounds?.height;
  var margin = {top: 20, right: 60, bottom: 50, left: 50},
      outerWidth = Math.max(320, Math.round(measuredWidth) || 960),
      outerHeight = Math.max(240, Math.round(measuredHeight) || 500),
      width = Math.max(120, outerWidth - margin.left - margin.right),
      height = Math.max(120, outerHeight - margin.top - margin.bottom);

  var x = d3.scaleLinear().range([0, width]);
  var yChars = d3.scaleLinear().range([height, 0]);
  var yPause = d3.scaleLinear().range([height, 0]);

  var processLine = d3.line()
    .x(function (d) {
        return x(d.elapsed_ms);
        })
  .y(function (d) {
      return yChars(d.process);
        });

  var productLine = d3.line()
    .x(function (d) {
        return x(d.elapsed_ms);
        })
  .y(function (d) {
      return yChars(d.product);
      });

  var positionLine = d3.line()
    .x(function (d) {
        return x(d.elapsed_ms);
        })
  .y(function (d) {
      return yChars(d.position);
      });
  // append the svg obgect to the body of the page
  // appends a 'group' element to 'svg'
  // moves the 'group' element to the top left margin
  var svg = svgRoot
    .attr("width", outerWidth)
    .attr("height", outerHeight)
    .attr("viewBox", `0 0 ${outerWidth} ${outerHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

  // gridlines in x axis function
  function make_x_gridlines() {
    return d3.axisBottom(x)
      .ticks(5)
  }

  // gridlines in y axis function
  function make_y_gridlines() {
    return d3.axisLeft(yChars)
      .ticks(5)
  }


  //    var data = [
  //        {date: "0.100", product: "68.13", process: "34.12"},
  //        {date: "0.230", product: "63.98", process: "45.56"},
  //        {date: "0.327", product: "67.00", process: "67.89"},
  //        {date: "2.726", product: "606.98", process: "580.12"}
  //    ];

  function formatElapsedMs(value) {
    const totalMs = Math.max(0, Math.round(Number(value) || 0));
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    return String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0') + '.' +
      String(millis).padStart(3, '0');
  }

  textSeries.forEach(function (d) {
      d.elapsed_ms = +d.elapsed_ms;
      d.product = +d.product;
      d.process = +d.process;
      });
  positionSeries.forEach(function (d) {
      d.elapsed_ms = +d.elapsed_ms;
      d.position = +d.position;
      });
  pauseSeries.forEach(function (d) {
      d.elapsed_ms = +d.elapsed_ms;
      d.duration_s = +d.duration_s;
      });

  const maxElapsed = d3.max([
    d3.max(textSeries, function (d) { return d.elapsed_ms; }) || 0,
    d3.max(positionSeries, function (d) { return d.elapsed_ms; }) || 0,
    d3.max(pauseSeries, function (d) { return d.elapsed_ms; }) || 0
  ]) || 0;
  const maxChars = d3.max([
    d3.max(textSeries, function (d) { return Math.max(d.product, d.process); }) || 0,
    d3.max(positionSeries, function (d) { return d.position; }) || 0
  ]) || 0;
  const maxPause = d3.max(pauseSeries, function (d) { return d.duration_s; }) || 1;
  const startTime = Number(header_record?.starttime) || 0;

  x.domain([0, maxElapsed > 0 ? maxElapsed : 1]);
  yChars.domain([0, Math.max(1, maxChars)]);
  yPause.domain([
    Math.max(0, pauseAxisMin),
    Math.max(Math.max(0, pauseAxisMin) + 0.001, pauseAxisMax === null ? Math.max(1, maxPause) : pauseAxisMax)
  ]);
  svgRoot
    .attr("data-plot-width", width)
    .attr("data-max-elapsed-ms", maxElapsed > 0 ? maxElapsed : 1);

  svg.append("path")
    .data([textSeries])
    .attr("fill", "none")
    .attr("stroke", "#1f77b4")
    .attr("stroke-width", 2.5)
    .attr("d", processLine);

  svg.append("path")
    .data([textSeries])
    .attr("fill", "none")
    .attr("stroke", "#2ca02c")
    .attr("stroke-width", 2.5)
    .attr("d", productLine);

  if (positionSeries.length > 0) {
    svg.append("path")
      .data([positionSeries])
      .attr("fill", "none")
      .attr("stroke", "#3cb44b")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "8,5")
      .attr("opacity", 0.95)
      .attr("d", positionLine);
  }

  if (pauseSeries.length > 0) {
    svg.append("g")
      .selectAll("circle")
      .data(pauseSeries)
      .enter()
      .append("circle")
      .attr("cx", function (d) { return x(d.elapsed_ms); })
      .attr("cy", function (d) { return yPause(d.duration_s); })
      .attr("r", 3.5)
      .attr("fill", "#f59e0b");
  }

  const xAxis = d3.axisBottom(x)
    .ticks(Math.max(2, Math.floor(width / 120)))
    .tickFormat(function (value) {
      return (Number(value) / 1000).toFixed(1);
    });

  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis);

  svg.append("text")
    //            .attr("x", 480)
    //            .attr("y", 475)
    .attr("transform",
        "translate(" + (width / 2) + " ," +
        (height + margin.top + 20) + ")")
    .style("text-anchor", "middle")
    .text("Time (s)");

  svg.append("g")
    .call(d3.axisLeft(yPause).ticks(5))
    .attr("color", "#d97706");

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("fill", "#111827")
    .text("Pause (s)");

  svg.append("g")
    .attr("transform", "translate(" + width + ",0)")
    .call(d3.axisRight(yChars).ticks(5));

  svg.append("text")
    .attr("transform", "rotate(90)")
    .attr("y", 0 - width - margin.right + 40)
    .attr("x", height / 2)
    .attr("dy", "-1em")
    .style("text-anchor", "middle")
    .style("fill", "#111827")
    .text("Characters");

  svg.append("g")
    .attr("class", "grid")
    .attr("transform", "translate(0," + height + ")")
    .call(make_x_gridlines()
        .tickSize(-height)
        .tickFormat("")
        );

  svg.append("g")
    .attr("class", "grid")
    .call(make_y_gridlines()
        .tickSize(-width)
        .tickFormat("")
        );

  svg.append("line")
    .attr("class", "process-graph-replay-marker")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", 0)
    .attr("y2", height)
    .attr("stroke", "#111827")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "5,4")
    .attr("opacity", 0.85)
    .style("pointer-events", "none")
    .style("display", "none");

  svg.append("rect")
    .attr("class", "process-graph-click-target")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .on("click", function (event) {
      if (!startTime) return;
      const pointer = d3.pointer(event, this);
      const elapsedMs = Math.max(0, Math.min(maxElapsed > 0 ? maxElapsed : 1, x.invert(pointer[0])));
      const targetTs = startTime + elapsedMs;
      if (typeof setReplayStartTimestamp === "function") {
        setReplayStartTimestamp(targetTs, "inclusive");
      }
      updateProcessGraphReplayMarker(targetTs);
    });

  const legendItems = [
    { label: "Process", color: "#1f77b4", dashed: false, point: false },
    { label: "Product", color: "#2ca02c", dashed: false, point: false },
    { label: "Position", color: "#3cb44b", dashed: true, point: false },
    { label: "Pause", color: "#f59e0b", dashed: false, point: true }
  ];
  const legend = svg.append("g").attr("transform", "translate(12,8)");

  legendItems.forEach(function (item, index) {
    const row = legend.append("g").attr("transform", "translate(0," + (index * 22) + ")");
    if (item.point) {
      row.append("circle")
        .attr("cx", 8)
        .attr("cy", 8)
        .attr("r", 4)
        .attr("fill", item.color);
    } else {
      row.append("line")
        .attr("x1", 0)
        .attr("x2", 22)
        .attr("y1", 8)
        .attr("y2", 8)
        .attr("stroke", item.color)
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", item.dashed ? "8,5" : null);
    }
    row.append("text")
      .attr("x", 30)
      .attr("y", 12)
      .style("font-size", "12px")
      .style("fill", "#111827")
      .text(item.label);
  });

  updateProcessGraphReplayMarker();
}

function drawSvg(data) {
  drawSvgInto("#playbackProgressGraph", data);
}

function refreshProcessGraphIfPossible() {
  if (!header_record || !header_record.starttime) return;
  if (!text_record || Object.keys(text_record).length === 0) return;
  processGraphFormat();
}

let processGraphRefreshTimer = null;
function scheduleProcessGraphRefresh() {
  if (processGraphRefreshTimer) clearTimeout(processGraphRefreshTimer);
  processGraphRefreshTimer = setTimeout(() => {
    processGraphRefreshTimer = null;
    refreshProcessGraphIfPossible();
  }, 250);
}

let processGraphResizeObserver = null;
function bindProcessGraphResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return;
  if (processGraphResizeObserver) processGraphResizeObserver.disconnect();
  processGraphResizeObserver = new ResizeObserver(() => scheduleProcessGraphRefresh());

  const graph = document.getElementById('playbackProgressGraph');
  const target = graph?.closest?.('.dashboard-panel') || graph;
  if (target) processGraphResizeObserver.observe(target);
}

var openFile = function (event) {
  replayStop();
  resetReplayView();
  var input = event.target;
  const file = input?.files?.[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = async function () {
    file_text = reader.result;
    try {
      const parsed = JSON.parse(file_text);
      const records = normalizeWebScriptLogRecords(parsed);
      if (!parsed?.header_records || !parsed?.text_records || !parsed?.key_records) {
        throw new Error('Missing required WebScriptLog record groups.');
      }

      const baseKey = makeWebScriptLogStorageKey('wslog_uploaded', records, file.name);
      let savedKey = '';
      try {
        savedKey = await saveWebScriptLogRecordsToIndexedDB(records, baseKey);
      } catch (saveErr) {
        console.error('Could not save uploaded WebScriptLog file to IndexedDB:', saveErr);
        messages.value += 'Read file, but could not save it to IndexedDB.\n';
      }

      applyWebScriptLogRecords(records, savedKey || file.name);
      if (savedKey) {
        messages.value += `Uploaded file saved to IndexedDB as ${savedKey}.\n`;
        messages.scrollTop = messages.scrollHeight;
      }
    } catch (err) {
      console.error('Could not import WebScriptLog file:', err);
      messages.value += "Not a ScriptLog.js file, can't read.\n";
      messages.scrollTop = messages.scrollHeight;
    } finally {
      if (input) input.value = '';
    }
    //console.log(reader.result.substring(0, 200));
  };
  reader.readAsText(file);
};

/*
   function hideshowOther() {
   $("#hidable").toggle();
   }
 */

// https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      )
}

// from stackoverflowverse - lost where
function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  var results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

function checkUserCode(input) {
	//const validPattern = /[^\p{L}\p{N}]/gu; // Matches non-alphanumeric UTF-8 characters
  const validPattern = /[^a-zA-Z0-9]/g; // only allow ASCII letters + digits
            
  const originalValue = input.value;
  const sanitizedValue = originalValue.replace(validPattern, ''); // Remove invalid characters

  // Check if invalid chars were removed
  if (originalValue !== sanitizedValue) {
    // Show native tooltip
    input.setCustomValidity('Only letters and numbers are allowed.');
    input.reportValidity();
    // Clear it so the field doesn't stay invalid
    setTimeout(() => input.setCustomValidity(''), 1000);
  }
            
  input.value = sanitizedValue; // Update input field

	if (sanitizedValue.length === 6) {
  	$('#b_record').prop('disabled', false);
    $('#b_emulate').prop('disabled', false);
    $('#b_linearlog').prop('disabled', false);
  } else {
  	$('#b_record').prop('disabled', true);
    $('#b_emulate').prop('disabled', true);
    $('#b_linearlog').prop('disabled', true);
	}
}

// Helper: read from IDB and return the JSON string (handles Uint8Array / Blob / string)
async function getJsonFromIDB(key) {
  const val = await idbStore.getItem(key);
  if (val == null) return null;

  let bytes;
  if (val instanceof Uint8Array) {
    bytes = val;
  } else if (val instanceof Blob) {
    const buf = await val.arrayBuffer();
    bytes = new Uint8Array(buf);
  } else if (typeof val === 'string') {
    // Already a JSON string (e.g., old localStorage data migrated)
    return val;
  } else if (val && val.bytes instanceof Uint8Array) {
    // If you stored { bytes, ...meta }
    bytes = val.bytes;
  } else {
    // Fallback: treat as JSON-serializable object
    return JSON.stringify(val);
  }

  // Inflate gzip -> string
  return pako.inflate(bytes, { to: 'string' });
}

function makeStorageKeyForCode(code) {
  const d = new Date();
  return "wslog_" + code + "_" +
    ("0" + d.getDate()).slice(-2) + "-" +
    ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
    d.getFullYear() + "_" +
    ("0" + d.getHours()).slice(-2) + ":" +
    ("0" + d.getMinutes()).slice(-2) + ":" +
    ("0" + d.getSeconds()).slice(-2);
}

// Mobile Notes lives under panes/mobile_notes.

//var my_uuidv4;
var sid;
var getdataphp = "php/getdata.php";


function init() {

  initUI();

  sid = getUrlParameter("sid");
  sid = sid.replace(/\W/g, '');
  if (sid != '') {
    sessionStorage.setItem('sid', sid);
  }
  if (sid == '') {
    sid = sessionStorage.getItem('sid');
    if (sid === null) {
      sid = '';
    }
  }

  const sidtext = sid
    ? t("msg.sid.withid", { sid })
    : t("msg.sid.noid");

  document.querySelectorAll(".sidLabel").forEach(el => {
    el.textContent = sidtext;
  });


  /*sidtext = "-ID- "
    if (sid == '') {
      sidtext = sidtext+"No id! Data will be saved locally.";
    } else {
      sidtext = sidtext+"Your id is: "+sid
    }
  $(".sidLabel").text(sidtext);*/
  console.log("sid="+sid);

  /*setTimeout(() => {
    window.history.pushState(
    "",
    "Page Title",
    window.location.href.split("?")[0]
  //"anything goes?"
  );

  // window.location.replace(window.location.href.split("?")[0])
  }, 0);*/

  if (sid.includes("admin")) {
    $("#div_fetch").css('display','');
  }

  //my_uuidv4 = uuidv4();
  recorder = document.getElementById("recorder");
  //recorder = document.getElementById("recordingLog");
  playback = document.getElementById("playback");
  messages = document.getElementById("messages");
  recorderImageOverlayActive = false;
  document.getElementById("recorderFrame")?.classList.remove("image-overlay-active");

  recorder.readOnly = true;
  //recorder.recording = false;
  recorder.style.borderColor = "lightskyblue";
  recorder.style.fontFamily = "Calibri, Georgia, serif";
  //recorder.style.fontSize = "large";
  playback.style.fontFamily = "Calibri, Georgia, serif";
  //playback.style.fontSize = "large";
  playback.readOnly = false;
  bindPlaybackEditGuard();
  syncReplayRecorderSize();
  bindProcessGraphResizeObserver();
  //playback.disabled = true;
  messages.readOnly = true;


  lb_load = document.getElementById("lb_load");
  linoutput = document.getElementById("linoutput");
	i_code = document.getElementById("userCode");

  header_record = {};
  key_record = {};
  text_record = {};
  image_record = {};
  window_record = {};
  text_record_keeper = {};
  cursor_record = {};
  cursor_record_keeper = {};
  scroll_record = {};
  scroll_record_keeper = {};
  current_text = '';
  file_text = '';
  myDmp = new diff_match_patch();
  initMobileNotesPrototype();

  updateListbox();

	// disabling record here because we need code
  $('#b_record').prop('disabled', true);
  $('#b_recstop').prop('disabled', true);
  $('#b_image').prop('disabled', true);
  $('#b_emulate').prop('disabled', true);

  if (!window._pauseThresholdRefreshBound) {
    const handlePauseThresholdChange = (event) => {
      if (!event.target?.matches?.('#playbackWritingScorePauseCrit')) return;
      if (header_record?.starttime && text_record && Object.keys(text_record).length > 0 && typeof showWritingScore === 'function') {
        showWritingScore();
      }
    };
    document.addEventListener('input', handlePauseThresholdChange);
    document.addEventListener('change', handlePauseThresholdChange);
    window._pauseThresholdRefreshBound = true;
  }

  if (!window._processGraphControlsBound) {
    const handleProcessGraphControlChange = (event) => {
      if (!event.target?.matches?.('#processGraphPauseThreshold, #processGraphPauseMin, #processGraphPauseMax')) return;
      scheduleProcessGraphRefresh();
    };
    document.addEventListener('input', handleProcessGraphControlChange);
    document.addEventListener('change', handleProcessGraphControlChange);
    window._processGraphControlsBound = true;
  }

  if (!window._replayOptionsBound) {
    document.addEventListener('change', (event) => {
      if (event.target?.matches?.('#replayUseRecorderSize')) {
        syncReplayRecorderSize();
      }
      if (event.target?.matches?.('#replayEnsureCaretVisible')) {
        syncReplayCursorMode();
      }
      if (event.target?.matches?.('#replayVirtualCursor')) {
        syncReplayCursorMode();
      }
    });
    window.addEventListener('resize', syncReplayRecorderSize);
    window._replayOptionsBound = true;
  }

  if (!window._recorderOverlayResizeBound) {
    window.addEventListener("resize", () => {
      if (recorderImageOverlayActive) drawRecorderImageOverlay();
    });
    window._recorderOverlayResizeBound = true;
  }

  //drawSvg();

} // end of init()

//window.addEventListener("DOMContentLoaded", init);
