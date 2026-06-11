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
  return {
    header_records: data?.header_records || {},
    text_records: data?.text_records || {},
    cursor_records: data?.cursor_records || {},
    key_records: data?.key_records || {},
    scroll_records: data?.scroll_records || {},
    image_records: data?.image_records || {},
    window_records: data?.window_records || data?.pdf_records || {}
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

function getDiffKeysSortedEntries(recordObject) {
  if (typeof getSortedRecordEntries === "function") return getSortedRecordEntries(recordObject || {});
  return Object.keys(recordObject || {})
    .map((key) => ({ ts: Number(key), value: recordObject[key] }))
    .filter((entry) => Number.isFinite(entry.ts))
    .sort((a, b) => a.ts - b.ts);
}

function formatDiffKeysTime(ts, startTime) {
  if (!Number.isFinite(ts)) return "";
  const base = Number.isFinite(startTime) ? startTime : 0;
  return ((ts - base) / 1000).toFixed(3);
}

function getDiffKeysChangedText(previousText, currentText, prefixLength, suffixLength) {
  const deleted = previousText.slice(prefixLength, previousText.length - suffixLength);
  const inserted = currentText.slice(prefixLength, currentText.length - suffixLength);
  if (deleted && inserted) return `${deleted} -> ${inserted}`;
  if (deleted) return `DEL: ${deleted}`;
  return inserted;
}

function buildDiffKeysRows(records = {}) {
  const textEntries = getDiffKeysSortedEntries(records.text_records || {});
  const keyEntries = getDiffKeysSortedEntries(records.key_records || {});
  const startTime = Number(records.header_records?.starttime);
  const keydowns = keyEntries.filter((entry) => String(entry.value || "").startsWith("keydown: "));
  const keyups = keyEntries.filter((entry) => String(entry.value || "").startsWith("keyup: "));
  const rows = [];
  let previousText = "";
  let keydownIndex = 0;
  let keyupIndex = 0;

  for (let i = 0; i < textEntries.length; i++) {
    const entry = textEntries[i];
    const currentText = String(entry.value ?? "");
    let prefixLength = 0;
    const maxPrefix = Math.min(previousText.length, currentText.length);
    while (prefixLength < maxPrefix && previousText[prefixLength] === currentText[prefixLength]) {
      prefixLength += 1;
    }

    let suffixLength = 0;
    while (
      suffixLength < previousText.length - prefixLength &&
      suffixLength < currentText.length - prefixLength &&
      previousText[previousText.length - 1 - suffixLength] === currentText[currentText.length - 1 - suffixLength]
    ) {
      suffixLength += 1;
    }

    while (keydownIndex < keydowns.length && keydowns[keydownIndex].ts <= entry.ts) keydownIndex += 1;
    const precedingKeydown = keydownIndex > 0 ? keydowns[keydownIndex - 1] : null;

    while (keyupIndex < keyups.length && keyups[keyupIndex].ts < entry.ts) keyupIndex += 1;
    const followingKeyup = keyupIndex < keyups.length ? keyups[keyupIndex] : null;

    rows.push({
      id: i + 1,
      prefixLength,
      totalLength: currentText.length,
      keydownTime: formatDiffKeysTime(precedingKeydown?.ts, startTime),
      keyupTime: formatDiffKeysTime(followingKeyup?.ts, startTime),
      keydownValue: precedingKeydown ? String(precedingKeydown.value || "").slice("keydown: ".length) : "",
      keyupValue: followingKeyup ? String(followingKeyup.value || "").slice("keyup: ".length) : "",
      changedText: getDiffKeysChangedText(previousText, currentText, prefixLength, suffixLength)
    });

    previousText = currentText;
  }

  return rows;
}

function renderDiffKeysPane(records = null) {
  const target = document.getElementById("diffKeysOutput");
  if (!target) return;
  const source = records || {
    header_records: header_record || {},
    text_records: text_record || {},
    key_records: key_record || {}
  };
  const rows = buildDiffKeysRows(source);
  if (!rows.length) {
    target.innerHTML = '<div class="diff-keys-empty">No text records available.</div>';
    return;
  }

  const body = rows.map((row) => `
    <tr>
      <td>${row.id}</td>
      <td>${row.prefixLength}</td>
      <td>${row.totalLength}</td>
      <td>${escapeDiffKeysHtml(row.keydownTime)}</td>
      <td>${escapeDiffKeysHtml(row.keyupTime)}</td>
      <td>${escapeDiffKeysHtml(row.keydownValue)}</td>
      <td>${escapeDiffKeysHtml(row.keyupValue)}</td>
      <td class="diff-keys-text">${escapeDiffKeysHtml(row.changedText)}</td>
    </tr>
  `).join("");

  target.innerHTML = `
    <table class="diff-keys-table">
      <thead>
        <tr>
          <th>id</th>
          <th>prefix length</th>
          <th>text length</th>
          <th>keydown time</th>
          <th>keyup time</th>
          <th>keydown value</th>
          <th>keyup value</th>
          <th>text changed</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
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
    const tr = obj?.text_records || {};
    const lastKey = Object.keys(tr).at(-1);

    if (!lastKey) {
      messages.value += `No text_records found in "${key}".\n`;
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    const finalText = tr[lastKey] ?? '';
    const blob = new Blob([finalText], { type: "text/plain;charset=utf-8" });
    saveAs(blob, key + "_final.txt");
  } catch (err) {
    console.error("Final text download failed:", err);
    messages.value += `Final text download failed for "${key}".\n`;
    messages.scrollTop = messages.scrollHeight;
  }
}

function debugInspect() {

}

function makeLINfile() {
  //linfile = "LINFILE:\n";
  linfile = "";
  lastKtime = header_record['starttime'];
  nKeydowns = 0;
  nMousedowns = 0;
  firstKdown = 0;
  finalKup = 0;
  numberOfPauses = 0;
  totalPauseTime = 0;
  var pauseCriteria = $("#pauseCrit").val();
  for (var k in key_record) {
    key07 = key_record[k].substring(0, 7);
    passed = (k - lastKtime) / 1000.0;
    // keydown and mousedown may be pauses
    if (key07 === "keydown" ||
        key07 === "mousedo") {
      if (passed >= pauseCriteria && firstKdown > 0) { // hard-coded pause crit ¯\(°_o)/¯ - not anymore!
        numberOfPauses += 1;
        totalPauseTime += passed;
        linfile += "<span class='linred'>&lt;" + passed + "&gt;</span>";
      }
    }

    // lin file        
    if (key07 === "mousedo") {
      nMousedowns += 1;
      linfile += "<span class='linred'>&lt;MOUSE&gt;</span>";
      /*for (kcr in cursor_record) {
        if (kcr > k) {
        fcr = cursor_record[kcr];
        console.log(fcr);
        break;
        }
        }
        st_en = fcr.split(':');
        for (ktr in text_record) {
        if (ktr > k) {
        ftr = text_record[ktr];
        ftr_part = ftr.slice(parseInt(st_en[0])-10,parseInt(st_en[1])+10);
        console.log(st_en+'|'+ftr_part+'|');
        break;
        }
        }*/
    }

    if (key07 === "keydown") {
      if (firstKdown === 0) {
        firstKdown = k;
      }
      nKeydowns += 1;
      keyString = key_record[k].substring(9);
      if (keyString.length > 1) { // hack :p
        keyString = "<span class='linred'>&lt;" + keyString.toUpperCase() + "&gt;</span>";
      }
      //linfile += keyString;
      for (kcr in cursor_record) {
        if (kcr > k) {
          fcr = cursor_record[kcr];
          //console.log(fcr);
          break;
        }
      }
      st_en = fcr.split(':');
      for (ktr in text_record) {
        if (ktr > k) {
          ftr = text_record[ktr];
          sti = parseInt(st_en[0]);
          eni = parseInt(st_en[1]);
          ftr_part = ftr.slice(sti-20,eni) + "|" + ftr.slice(eni,eni+20);
          //console.log(st_en+'|'+ftr_part+'|');
          break;
        }
      }
      linfile += "<span title='" + ftr_part + "'>" + keyString + "</span>";
    }

    if (key07 === "repeat:") {
      keyString = key_record[k].substring(8);
      if (keyString.length > 1) { // hack :p
        keyString = "<span class='linred'>&lt;" + keyString.toUpperCase() + "&gt;</span>";
      }
      linfile += keyString;
    }

    if (key07 === 'keyup: ') {
      finalKup = k;
    }
    // only in verbose
    //messages.value += k + ': ' + key_record[k] + ' - ' + passed + '\n';
    lastKtime = k;
  }
  messages.value += 'Typing time: '
    + (finalKup - firstKdown) / 1000 + '\n';

  // only in verbose
  //    for (var k in cursor_record) {
  //        messages.value += k + ': ' + cursor_record[k] + '\n';
  //    }

  insertions = 0;
  deletions = 0;
  replacements = 0;
  current_text = "";
  for (var k in text_record) {
    edited_text = text_record[k];
    var commonlength = myDmp.diff_commonPrefix(current_text, edited_text);
    text1 = current_text.substring(commonlength);
    text2 = edited_text.substring(commonlength);

    // Trim off common suffix (speedup).
    commonlengths = myDmp.diff_commonSuffix(text1, text2);
    //var commonsuffix = text1.substring(text1.length - commonlengths);
    text1 = text1.substring(0, text1.length - commonlengths);
    text2 = text2.substring(0, text2.length - commonlengths);

    if (text1.length === 0 && text2.length > 0) {
      insertions += 1;
    }
    if (text1.length > 0 && text2.length === 0) {
      deletions += 1;
    }
    if (text1.length > 0 && text2.length > 0) {
      replacements += 1;
    }

    current_text = edited_text;
    // only in verbose
    //messages.value += k + ': ' + text_record[k] + ' - ' + text1 + ':' + text2 + '\n';
    //messages.value += text1 + ':' + text2 + '\n';
  }
  if (linoutput) linoutput.innerHTML = linfile;
  //messages.value += linfile + '\n';
}

/* the following three should allow for saving+reapplying ranges */
function getHighlightedCharSpans() {
  return Array.from(
    document.querySelectorAll('#content span[time-bef][time-aft]')
  );
}

function saveAllHighlights() {
  const wrappers = Array.from(document.querySelectorAll('#content .newspan'));
  const allChars = getHighlightedCharSpans();

  const ranges = wrappers.map(wrapper => {
    const chars = wrapper.querySelectorAll('span[time-bef][time-aft]');
    if (!chars.length) return null;

    const start = allChars.indexOf(chars[0]);
    const end = allChars.indexOf(chars[chars.length - 1]) + 1;

    if (start < 0 || end <= start) return null;

    return { start, end };
  }).filter(Boolean);

  return ranges;
}

function applyAllHighlights(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return;

  // Flattened character stream in document order (works even if some are already wrapped)
  const spans = Array.from(document.querySelectorAll('#content span[time-bef][time-aft]'));
  if (spans.length === 0) return;

  // 1) (Optional but recommended) unwrap existing highlights first
  //    so indices refer to the plain character stream
  const existing = Array.from(document.querySelectorAll('#content .newspan'));
  for (const wrapper of existing) {
    const parent = wrapper.parentNode;
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
    parent.removeChild(wrapper);
  }

  // Recompute after unwrapping (DOM changed)
  const flat = Array.from(document.querySelectorAll('#content span[time-bef][time-aft]'));

  // 2) Normalize + sort descending so wrapping doesn't shift later indices
  const normalized = ranges
    .map(r => ({
      start: Math.max(0, Math.min(r.start, flat.length)),
      end: Math.max(0, Math.min(r.end, flat.length))
    }))
    .map(r => (r.start <= r.end ? r : ({ start: r.end, end: r.start })))
    .filter(r => r.end > r.start)
    .sort((a, b) => b.start - a.start);

  // 3) Wrap each range
  for (const r of normalized) {
    const startSpan = flat[r.start];
    const endSpan = flat[r.end - 1];
    if (!startSpan || !endSpan) continue;

    const range = document.createRange();
    range.setStartBefore(startSpan);
    range.setEndAfter(endSpan);

    const wrapper = document.createElement('span');
    wrapper.className = 'newspan';
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }
}

function getFinalTextCharSpan(node) {
  if (!node) return null;
  const el = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
  return el?.closest?.('#content span[time-bef][time-aft]') || null;
}

function unwrapFinalTextMark(wrapper) {
  if (!wrapper?.parentNode) return;
  const parent = wrapper.parentNode;
  while (wrapper.firstChild) {
    parent.insertBefore(wrapper.firstChild, wrapper);
  }
  parent.removeChild(wrapper);
}

function clearFinalTextMarks() {
  Array.from(document.querySelectorAll('#content .newspan')).forEach(unwrapFinalTextMark);
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

function makeFTAnalysis() {
  const dmp = new diff_match_patch();

  // Build ftr = { starttime: "", ...text_record }
  const hr = {};
  hr[header_record['starttime']] = '';
  const ftr = Object.assign(hr, text_record);


	// Convert to array + sort by real time
	let cumulative = 0;

	const textData = Object.keys(ftr)
		.map((key) => ({
			realTime: +key,
			text: ftr[key]
		}))
		.sort((a, b) => a.realTime - b.realTime)
		.map((item, index) => {
			//cumulative += (index + 1) * 1000; // fake/debug time
			cumulative = index; // fake/debug time

			return {
				time: item.realTime,        // original timestamp
				cumulative: cumulative,     // fake/debug timeline
				length: item.text.length,
				text: item.text
			};
		});

	/* Convert to array + (important) sort by time
	const textData = Object.keys(ftr)
		.map((key) => ({
			time: +key,
			length: ftr[key].length,
			text: ftr[key],
		}))
		.sort((a, b) => a.time - b.time);

	// fake time for easier debugging
	let cumulative = 0;
	const textData = Object.keys(ftr).map((key, index) => {
		cumulative += (index + 1) * 1000; // increment grows with index
		return {
			time: cumulative,
			length: ftr[key].length,
			text: ftr[key]
		};
	});*/

	// Diff logic
	const textList = [];
	let currentPosition = 0;

	const diffSteps = []; // one entry per diff between snapshots

	textData.forEach((item, index) => {
		if (index === 0) return;

		const prevText = textData[index - 1].text;
		const currentText = item.text;

		const diffs = dmp.diff_main(prevText, currentText);
		dmp.diff_cleanupSemantic(diffs);

		/*let unchangedLen = 0;
		let insertLen = 0;
		let deleteLen = 0;

		diffs.forEach(([operation, text]) => {
			const L = text.length;
			if (operation === 0) unchangedLen += L;
			else if (operation === 1) insertLen += L;
			else if (operation === -1) deleteLen += L;
		});

		diffSteps.push({
			time: item.time,                 // real time of this snapshot
			cumulative: item.cumulative,     // fake/debug time if you want
			unchangedLen,
			insertLen,
			deleteLen
		});*/

		const chunks = diffs.map(([op, txt]) => ({ op, len: txt.length }))
			.filter(c => c.len > 0);

		diffSteps.push({
			time: item.time,
			cumulative: item.cumulative,
			chunks
		});

		//console.log('----------');
		//console.log(diffs);
    currentPosition = 0;
    diffs.forEach(([operation, text]) => {
      if (operation === 0) {
        // Unchanged: advance by length (NOT reset)
        currentPosition += text.length;
      } else if (operation === 1) {
        // Insertion
        const timeSincePrev = item.time - textData[index - 1].time;
        const timeUntilNext = (textData[index + 1] ? textData[index + 1].time : item.time) - item.time;

        for (const char of text) {
          //textList.splice(currentPosition, 0, [item.time, char, timeSincePrev, timeUntilNext]);
          textList.splice(currentPosition, 0, [item.time, item.cumulative, char, timeSincePrev, timeUntilNext]);
          currentPosition++;
        }
      } else if (operation === -1) {
        // Deletion
        for (let i = 0; i < text.length; i++) {
          textList.splice(currentPosition, 1);
					// we may need currentPosition-- here; but is *seems* it is not needed.
					// we can't create a diff that contains multiple deletions
        }
      }
      //console.log(operation, text, currentPosition);
    });
  });

  // Render final text
  const contentDiv = document.getElementById("content");
  const labelDiv = document.getElementById("label");
  const tableContainer = document.getElementById("table-container");

  // Clear previous run output (prevents duplicate listeners + duplicated spans)
  contentDiv.innerHTML = "";
  if (tableContainer) tableContainer.innerHTML = "";

  reconstructedText = '';
  textList.forEach(([time, cumulative, char, timeSincePrev, timeUntilNext]) => {
    const span = document.createElement("span");
    span.textContent = char;
    reconstructedText = reconstructedText + char;
    span.setAttribute("data-time", time);
    span.setAttribute("data-cumulative", cumulative);
    span.setAttribute("time-bef", timeSincePrev);
    span.setAttribute("time-aft", timeUntilNext);
    contentDiv.appendChild(span);
  });

  // test that reconstructed text match final text
  tmp_keys = Object.keys(ftr);
  if (reconstructedText == ftr[tmp_keys[tmp_keys.length-1]]) {
  	console.log('MATCH');
	} else {
  	console.log('NO MATCH');
  }

  //drawCumulativeVsPosition(textList);

  //drawDiffStackedBars(diffSteps, false);

  //drawDiffStackedBarsOrdered(diffSteps);
  //drawDiffStackedBarsOrderedD3(diffSteps);

	// this loads any existing spans from localStorage
	loadHighlightsFromLocalStorage();

  // Hover via delegation
  contentDiv.addEventListener("mouseover", (e) => {
    const span = e.target.closest('#content span[time-bef][time-aft]');
    if (!span) return;
    //labelDiv.textContent = `B: ${span.getAttribute("time-bef")} A: ${span.getAttribute("time-aft")}`;
    labelDiv.textContent = `B: ${span.getAttribute('time-bef')} A: ${span.getAttribute('time-aft')} C: ${span.getAttribute('data-cumulative')}`;

  });

  contentDiv.addEventListener("mouseout", (e) => {
    const span = e.target.closest('#content span[time-bef][time-aft]');
    if (!span) return;
    labelDiv.textContent = "Time: -";
  });

  // Wrap selection (snap to whole char spans)
  contentDiv.addEventListener("mouseup", (e) => {
    if (e.target.closest(".newspan")) return;
    markFinalTextSelection();
  });

  // Unwrap on click (works for single-letter selections too)
  contentDiv.addEventListener("click", (e) => {
    const wrapper = e.target.closest(".newspan");
    if (!wrapper) return;

    unwrapFinalTextMark(wrapper);
  });

  const markBtn = document.getElementById("mark-selected");
  if (markBtn) {
    markBtn.addEventListener("click", markFinalTextSelection);
  }

  const clearBtn = document.getElementById("clear-marks");
  if (clearBtn) {
    clearBtn.addEventListener("click", clearFinalTextMarks);
  }

  // Table generation (robust for 1-letter selections)
  const btn = document.getElementById("generate-table");
  if (btn) {
    btn.addEventListener("click", generateTable);
  }

	async function saveHighlightsToLocalStorage() {
		const key = lb_load.options[lb_load.selectedIndex].text; // your text id
		const ranges = saveAllHighlights(); // returns [{start,end}, ...]
		const storageKey = `highlights:${key}`;

		localStorage.setItem(storageKey, JSON.stringify(ranges));
    // needs await and handling in listbox
		//await idbStore.setItem(storageKey, JSON.stringify(ranges)); 
	}

	function loadHighlightsFromLocalStorage() {
		const key = lb_load.options[lb_load.selectedIndex].text;
		const storageKey = `highlights:${key}`;

		const raw = localStorage.getItem(storageKey);
		if (!raw) return;

		let ranges;
		try {
			ranges = JSON.parse(raw);
		} catch {
			return;
		}

		applyAllHighlights(ranges);
	}



  async function generateTable() {
    // save highlights to localStorage
		await saveHighlightsToLocalStorage();

    const container = document.getElementById("content");
    const wrappers = container.getElementsByClassName("newspan");
    const tableContainer = document.getElementById("table-container");

    if (!tableContainer) return;

    if (wrappers.length === 0) {
      tableContainer.innerHTML = "<p>No newspan elements found.</p>";
      return;
    }

    let tableHTML =
      "<table><thead><tr><th>Content</th><th>Time Before</th><th>Time After</th></tr></thead><tbody>";

    Array.from(wrappers).forEach((wrapper) => {
      const content = wrapper.textContent;

      const chars = wrapper.querySelectorAll("span[time-bef][time-aft]");
      if (!chars.length) return;

      const timeBef = chars[0].getAttribute("time-bef");
      const timeAft = chars[chars.length - 1].getAttribute("time-aft");

      tableHTML += `<tr><td>${content}</td><td>${timeBef}</td><td>${timeAft}</td></tr>`;
    });

    tableHTML += "</tbody></table>";
    tableContainer.innerHTML = tableHTML;
  }
}

function inspectRecords() {
  for (var k in header_record) {
    messages.value += '(internal ' + k + ': ' + header_record[k] + ')\n';
  }
  messages.value += 'Recording time: '
    + (header_record['endtime'] - header_record['starttime']) / 1000 + '\n';

  makeLINfile();

  //makeRevisionTable();

  processGraphFormat();
  messages.value += ''
    + 'Process: ' + processlength + '\n'       // from processGF
    + 'Product: ' + current_text.length + '\n' // from processGF
    + 'Keystrokes: ' + nKeydowns + '\n'
    + 'Mouse clicks: ' + nMousedowns + '\n'
    + 'Pauses: ' + numberOfPauses + '\n'
    + 'Pausetime : ' + totalPauseTime + '\n'
    + 'Insertions: ' + insertions + '\n'
    + 'Deletions: ' + deletions + '\n'
    + 'Replacements: ' + replacements + '\n';

  messages.value += makeInspectMetricsReport();
  // messages.value += makeLinearLogPrintout();
  //messages.value += makeImageClickTextTimeline();
  messages.scrollTop = messages.scrollHeight;
}

let lastInspectMetrics = null;
let lastWritingScore = null;
let lastWritingScoreValidation = null;
let lastLinearRepresentation = null;
let lastLinearRepresentationValidation = null;

function makeInspectMetricsReport() {
  const options = getInspectMetricOptions();
  const summary = buildInspectMetricsFromRecords(getCurrentRecordSet(), options);
  lastInspectMetrics = summary;
  window.lastInspectMetrics = summary;

  return serializeInspectMetrics(summary);
}

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
  return buildInspectMetricsFromRecords(getCurrentRecordSet(), options);
}

function buildInspectMetricsFromRecords(records, options) {
  const normalizedRecords = normalizeInspectMetricRecords(records);
  const startTime = Number(normalizedRecords.header_records?.starttime) || 0;
  const endTime = Number(normalizedRecords.header_records?.endtime) || startTime;
  const textEvents = getInspectTextEvents(normalizedRecords.text_records);
  const keyEvents = getSortedRecordEntries(normalizedRecords.key_records);
  const textTimes = textEvents.map(ev => ev.ts);
  const finalText = textEvents.length ? textEvents[textEvents.length - 1].text : '';

  const typingBounds = getTypingBounds(keyEvents);
  const typingStart = typingBounds.firstKeydown ?? startTime;
  const typingEnd = typingBounds.lastKeyup ?? endTime;
  const recordingDuration = Math.max(0, endTime - startTime) / 1000;
  const typingDuration = Math.max(0, typingEnd - typingStart) / 1000;

  let basisStart = startTime;
  let basisEnd = endTime;
  let basisUsed = 'recording';

  if (options.basis === 'typing' && typingBounds.firstKeydown !== null && typingBounds.lastKeyup !== null && typingEnd >= typingStart) {
    basisStart = typingStart;
    basisEnd = typingEnd;
    basisUsed = 'typing';
  }

  const pauseEvents = getPauseEvents(keyEvents, startTime, options.pause_threshold_s);
  const boundaries = getIntervalBoundaries(basisStart, basisEnd, options.intervals);
  const hasWindowRecords = Object.keys(normalizedRecords.window_records || {}).length > 0;
  const windowBaseline = hasWindowRecords
    ? getWindowInteractionMetricsAt(basisStart, startTime, normalizedRecords.window_records)
    : null;

  const cumulativeRows = boundaries.map((boundaryTs, index) => {
    const cumulative = getCumulativeMetricsAt(boundaryTs, textEvents, textTimes, pauseEvents);
    const windowCumulative = hasWindowRecords
      ? subtractWindowMetrics(
          getWindowInteractionMetricsAt(boundaryTs, startTime, normalizedRecords.window_records),
          windowBaseline
        )
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
    ? subtractWindowMetrics(
        getWindowInteractionMetricsAt(basisEnd, startTime, normalizedRecords.window_records),
        windowBaseline
      )
    : null;

  return {
    has_window_records: hasWindowRecords,
    options: {
      ...options,
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

function normalizeInspectMetricRecords(records) {
  return {
    header_records: records?.header_records || {},
    text_records: records?.text_records || {},
    key_records: records?.key_records || {},
    window_records: records?.window_records || records?.pdf_records || {}
  };
}

function getSortedRecordEntries(recordObj) {
  return Object.keys(recordObj || {})
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
    .map(ts => ({ ts, value: recordObj[String(ts)] ?? recordObj[ts] }));
}

function getInspectTextEvents(textRecords = text_record) {
  const events = [];
  let previousText = '';
  const entries = getSortedRecordEntries(textRecords);

  for (let i = 0; i < entries.length; i++) {
    const ts = entries[i].ts;
    const currentText = String(entries[i].value ?? '');
    const diff = myDmp.diff_main(previousText, currentText);
    myDmp.diff_cleanupSemantic(diff);

    let insertedChars = 0;
    let hasInsert = false;
    let hasDelete = false;
    for (let j = 0; j < diff.length; j++) {
      if (diff[j][0] === DIFF_INSERT) {
        insertedChars += diff[j][1].length;
        hasInsert = true;
      } else if (diff[j][0] === DIFF_DELETE) {
        hasDelete = true;
      }
    }

    let classification = 'NOCHANGE';
    if (hasInsert && hasDelete) classification = 'REPLACE';
    else if (hasInsert) classification = 'INSERT';
    else if (hasDelete) classification = 'DELETE';

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
    const ev = String(keyEvents[i].value ?? '');
    if (firstKeydown === null && ev.startsWith('keydown: ')) {
      firstKeydown = keyEvents[i].ts;
    }
    if (ev.startsWith('keyup: ')) {
      lastKeyup = keyEvents[i].ts;
    }
  }

  return { firstKeydown, lastKeyup };
}

function getPauseEvents(keyEvents, startTime, thresholdS) {
  const pauses = [];
  let lastKtime = startTime;
  let firstKeydownSeen = false;

  for (let i = 0; i < keyEvents.length; i++) {
    const ev = String(keyEvents[i].value ?? '');
    const isPauseCarrier = ev.startsWith('keydown: ') || ev.startsWith('mousedown');
    const passed = (keyEvents[i].ts - lastKtime) / 1000;

    if (isPauseCarrier && firstKeydownSeen && passed >= thresholdS) {
      pauses.push({ ts: keyEvents[i].ts, duration_s: passed });
    }
    if (ev.startsWith('keydown: ')) {
      firstKeydownSeen = true;
    }
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
  let chosen = '';
  for (let i = 0; i < textEvents.length; i++) {
    if (textTimes[i] <= boundaryTs) chosen = textEvents[i].text;
    else break;
  }
  return chosen;
}

function countProcessWords(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(token => token.length > 0)
    .length;
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
    if (ev.classification === 'INSERT') insertionsTotal += 1;
    if (ev.classification === 'DELETE') deletionsTotal += 1;
    if (ev.classification === 'REPLACE') replacementsTotal += 1;
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

function getWindowInteractionMetricsAt(boundaryTs, recordingStartTs, windowRecords = window_record) {
  const events = getSortedRecordEntries(windowRecords).map(entry => ({
    ts: entry.ts,
    rec: entry.value || {}
  }));

  const dwellMsByWindow = {
    writing: 0,
    upper: 0,
    lower: 0
  };
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
    const raw = String(rec.window || rec.pane || '').trim().toLowerCase();
    if (raw === 'upper' || raw === 'lower' || raw === 'writing' || raw === 'task') return raw;
    return null;
  }

  function registerSwitch(fromWindow, toWindow) {
    if (!fromWindow || !toWindow || fromWindow === toWindow) return;
    const key = `${fromWindow}_to_${toWindow}`;
    if (switchCounts[key] !== undefined) switchCounts[key] += 1;
    if (fromWindow === 'writing' && (toWindow === 'upper' || toWindow === 'lower')) {
      switchCounts.writing_to_task += 1;
    }
    if ((fromWindow === 'upper' || fromWindow === 'lower') && toWindow === 'writing') {
      switchCounts.task_to_writing += 1;
    }
  }

  for (let i = 0; i < events.length; i++) {
    const { ts, rec } = events[i];
    if (ts > boundaryTs) break;
    accumulateUntil(ts);

    const ev = rec.event;
    const windowName = normalizeWindowName(rec);

    if (ev === 'show' || ev === 'hide') {
      activeWindow = null;
      pendingWindow = null;
      continue;
    }
    if (ev === 'mouse_enter') {
      const fromWindow = activeWindow || pendingWindow;
      registerSwitch(fromWindow, windowName);
      activeWindow = windowName;
      pendingWindow = null;
      continue;
    }
    if (ev === 'mouse_leave') {
      if (windowName && activeWindow === windowName) {
        pendingWindow = activeWindow;
        activeWindow = null;
      }
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

let sentenceDiffTable = '';
//const myDmp = new diff_match_patch();

// Initialize the table with sentence diffs, classifications, locations, grouping, second diff, and row number
let recordKeys = '';
let prevClassification = '';
let prevStartLocation = -1;
let prevEndLocation = -1;
let groupStartText = '';
let previousRow = '';
//let groupPrevTime = 0;
let groupStartTime = 0;

function makeRevisionTable() {

  sentenceDiffTable = document.getElementById('sentenceDiffTable').getElementsByTagName('tbody')[0];
  sentenceDiffTable.innerHTML='';
  text_record["0"] = '';
  recordKeys = Object.keys(text_record).sort((a, b) => Number(a) - Number(b));
  groupStartText = '';
  groupStartTime = Number(recordKeys[1]) || 0;
  previousRow = '';

  for (let i = 1; i < recordKeys.length; i++) {
    const previousText = text_record[recordKeys[i - 1]];
    const currentText = text_record[recordKeys[i]];

    const diff = myDmp.diff_main(previousText, currentText);
    myDmp.diff_cleanupSemantic(diff);

    //const prettyHtml = myDmp.diff_prettyHtml(diff);
    const prettyHtml = diff_prettyHtml_short(diff, 20);
    const classification = classifyDiff(diff);
    const location = calculateLocation(diff, classification);
    const isNewGroup = checkNewGroup(classification, location, i - 1);
    const secondDiff = computeSecondDiff(currentText, groupStartText, location);

    if (isNewGroup) {
      //groupPrevTime = recordKeys[i-1];
      groupStartTime = recordKeys[i];
      if (previousRow) previousRow.className = 'last-in-group';
    }

    const row = sentenceDiffTable.insertRow();
    const cell1 = row.insertCell(0);
    const cell2 = row.insertCell(1);
    const cell3 = row.insertCell(2);
    const cell4 = row.insertCell(3);
    const cell5 = row.insertCell(4);
    const cell6 = row.insertCell(5);
    const cell7 = row.insertCell(6);

    cell1.textContent = i;
    cell2.innerHTML = prettyHtml;
    cell3.textContent = classification;
    cell3.className = classification.toLowerCase(); // Apply styling based on classification
    cell4.textContent = location.start+'-'+location.end;
    cell5.textContent = isNewGroup ? 'Yes' : 'No';
    cell5.className = isNewGroup ? 'new-group' : '';
    cell6.innerHTML = secondDiff;
    //cell7.textContent = (recordKeys[i] - header_record['starttime']) / 1000.0;
    //cell7.id = recordKeys[i];
    cell7.textContent = (groupStartTime - header_record['starttime']) / 1000.0;
    cell7.id = groupStartTime;

    previousRow = row;
  }
  if (previousRow) previousRow.className = 'last-in-group';

  const rows = sentenceDiffTable.getElementsByTagName('tr');

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].classList.contains('last-in-group')) {
      rows[i].style.display = 'none';
    }
  }

  delete text_record["0"];

  const playFromRows = sentenceDiffTable.getElementsByClassName('last-in-group');

  for (let i = 0; i < playFromRows.length; i++) {
    playFromRows[i].addEventListener('click', playFromRow, false);
  }
  
}

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

function diff_prettyHtml_short(diffs, context) {
  var html = [];
  var pattern_amp = /&/g;
  var pattern_lt = /</g;
  var pattern_gt = />/g;
  var pattern_para = /\n/g;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];    // Operation (insert, delete, equal)
    var data = diffs[x][1];  // Text of change.
    var text = data.replace(pattern_amp, '&amp;').replace(pattern_lt, '&lt;')
      .replace(pattern_gt, '&gt;').replace(pattern_para, '&para;<br>');
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<ins style="background:#e6ffe6;">' + text + '</ins>';
        break;
      case DIFF_DELETE:
        html[x] = '<del style="background:#ffe6e6;">' + text + '</del>';
        break;
      case DIFF_EQUAL:
        if (x === 0) {
          html[x] = '<span>' + text.substring(text.length-context) + '</span>';
        } else {
          html[x] = '<span>' + text.substring(0, context) + '</span>';
        }
        break;
    }
  }
  return html.join('');
};

function classifyDiff(diff) {
  let hasInsertion = false;
  let hasDeletion = false;

  for (const d of diff) {
    if (d[0] === 1) {
      hasInsertion = true;
    } else if (d[0] === -1) {
      hasDeletion = true;
    }
  }

  if (hasInsertion && hasDeletion) {
    return 'REPLACE';
  } else if (hasInsertion) {
    return 'INSERT';
  } else if (hasDeletion) {
    return 'DELETE';
  } else {
    return 'NOCHANGE';
  }
}

function calculateLocation(diff, classification) {
  let start = -1;
  let end = -1;

  if (classification === 'INSERT' || classification === 'DELETE') {
    if (diff.length === 1) {
      start = 0;
      end = diff[0][1].length;
    } else {
      start = diff[0][1].length;
      end = start + diff[1][1].length;
    }
  } else if (classification === 'REPLACE') {
    if (diff.length === 2) {
      start = 0;
      end = diff[0][1].length;
    } else {
      start = diff[0][1].length;
      end = start + diff[2][1].length;
    }
  }

  return { start, end };
}

function checkNewGroup(classification, location, index) {
  const isNewClassification = classification !== prevClassification;

  let isNewLocation = false;
  if (classification === 'INSERT') {
    isNewLocation = location.start !== prevEndLocation;
  }
  if (classification === 'REPLACE') {
    isNewLocation = location.start !== prevEndLocation;
  }
  if (classification === 'DELETE') {
    isNewLocation = location.end !== prevStartLocation;
  }

  const isNewGroup = isNewClassification || isNewLocation;

  // Update previous classification and end location for the next iteration
  prevClassification = classification;
  prevStartLocation = location.start;
  prevEndLocation = location.end;

  // Update group start text if a new group is formed
  if (isNewGroup) {
    groupStartText = text_record[recordKeys[index]];
  }

  return isNewGroup;
}

function computeSecondDiff(currentText, groupStartText, location) {
  const secondDiff = myDmp.diff_main(groupStartText, currentText);
  myDmp.diff_cleanupSemantic(secondDiff);

  //return myDmp.diff_prettyHtml_short(secondDiff);
  return diff_prettyHtml_short(secondDiff, 20);
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
  if (replayState.currentTs != null && replayState.paused) return replayState.currentTs;
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

const mobileNotesState = {
  initialized: false,
  sessionId: '',
  starttime: 0,
  lastTs: 0,
  nextNoteNumber: 1,
  activeNoteId: null,
  notes: [],
  switch_records: {}
};

function mobileNotesNow() {
  const now = Date.now();
  mobileNotesState.lastTs = Math.max(now, mobileNotesState.lastTs + 1);
  return mobileNotesState.lastTs;
}

function mobileNotesEnsureSession() {
  if (mobileNotesState.sessionId) return;
  const ts = mobileNotesNow();
  mobileNotesState.starttime = ts;
  mobileNotesState.sessionId = `mobile-${ts}`;
}

function mobileNotesGetCode() {
  const own = String(document.getElementById('mobileNotesCode')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const main = String(i_code?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (own || main || 'MOBILE').slice(0, 6).padEnd(6, '0');
}

function mobileNotesCreateRecords(note, ts) {
  return {
    header_records: {
      starttime: ts,
      endtime: ts,
      mobile_note_id: note.id,
      mobile_note_title: note.title,
      mobile_session_id: mobileNotesState.sessionId
    },
    text_records: {},
    cursor_records: {},
    key_records: {},
    scroll_records: {},
    image_records: {},
    window_records: {}
  };
}

function mobileNotesCreateNote() {
  mobileNotesEnsureSession();
  const ts = mobileNotesNow();
  const noteNumber = mobileNotesState.nextNoteNumber;
  mobileNotesState.nextNoteNumber += 1;
  const note = {
    id: `note-${noteNumber}`,
    title: `Note ${noteNumber}`,
    createdTs: ts,
    updatedTs: ts,
    currentText: '',
    keySet: new Set(),
    records: null
  };
  note.records = mobileNotesCreateRecords(note, ts);
  mobileNotesState.notes.unshift(note);
  mobileNotesRender();
  mobileNotesOpenNote(note.id);
}

function mobileNotesFindNote(noteId) {
  return mobileNotesState.notes.find((note) => note.id === noteId) || null;
}

function mobileNotesRecordSwitch(fromNoteId, toNoteId, reason = 'open') {
  mobileNotesEnsureSession();
  const ts = mobileNotesNow();
  mobileNotesState.switch_records[ts] = {
    from_note_id: fromNoteId || null,
    to_note_id: toNoteId || null,
    reason
  };
}

function mobileNotesOpenNote(noteId) {
  const note = mobileNotesFindNote(noteId);
  if (!note) return;
  const previous = mobileNotesState.activeNoteId;
  mobileNotesState.activeNoteId = note.id;
  mobileNotesRecordSwitch(previous, note.id, 'open');

  const overview = document.getElementById('mobileNotesOverview');
  const editorShell = document.getElementById('mobileNotesEditorShell');
  const editor = document.getElementById('mobileNotesEditor');
  const title = document.getElementById('mobileNotesTitle');
  if (overview) overview.hidden = true;
  if (editorShell) editorShell.hidden = false;
  if (title) title.value = note.title;
  if (editor) {
    editor.value = note.currentText;
    requestAnimationFrame(() => {
      editor.focus();
      const pos = editor.value.length;
      try {
        editor.setSelectionRange(pos, pos);
      } catch (err) {
        // Some mobile browsers reject selection changes until focus settles.
      }
      mobileNotesEnsureEditorCaretVisible(editor);
    });
  }
  mobileNotesRender();
}

function mobileNotesBackToOverview() {
  const previous = mobileNotesState.activeNoteId;
  mobileNotesState.activeNoteId = null;
  mobileNotesRecordSwitch(previous, null, 'overview');
  const overview = document.getElementById('mobileNotesOverview');
  const editorShell = document.getElementById('mobileNotesEditorShell');
  if (overview) overview.hidden = false;
  if (editorShell) editorShell.hidden = true;
  mobileNotesRender();
}

function mobileNotesDeleteNote(noteId = mobileNotesState.activeNoteId) {
  const note = mobileNotesFindNote(noteId);
  if (!note) return;
  const wasActive = mobileNotesState.activeNoteId === note.id;
  mobileNotesRecordSwitch(wasActive ? note.id : null, null, 'delete');
  mobileNotesState.notes = mobileNotesState.notes.filter((item) => item.id !== note.id);
  if (wasActive) {
    mobileNotesState.activeNoteId = null;
    const overview = document.getElementById('mobileNotesOverview');
    const editorShell = document.getElementById('mobileNotesEditorShell');
    if (overview) overview.hidden = false;
    if (editorShell) editorShell.hidden = true;
  }
  mobileNotesRender();
}

function mobileNotesHandleKeyDown(event) {
  const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
  if (!note) return;
  const ts = mobileNotesNow();
  const key = String(event.key || '');
  if (!note.keySet.has(key)) {
    note.keySet.add(key);
    note.records.key_records[ts] = `keydown: ${key}`;
  } else {
    note.records.key_records[ts] = `repeat: ${key}`;
    note.records.cursor_records[ts] = `${this.selectionStart}:${this.selectionEnd}`;
  }
}

function mobileNotesHandleKeyUp(event) {
  const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
  if (!note) return;
  const key = String(event.key || '');
  if (!note.keySet.delete(key)) return;
  const ts = mobileNotesNow();
  note.records.key_records[ts] = `keyup: ${key}`;
  note.records.cursor_records[ts] = `${this.selectionStart}:${this.selectionEnd}`;
}

function mobileNotesHandlePointerRecord(kind, target) {
  const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
  if (!note) return;
  const ts = mobileNotesNow();
  note.records.key_records[ts] = `${kind}: yes`;
  note.records.cursor_records[ts] = `${target.selectionStart}:${target.selectionEnd}`;
}

function mobileNotesHandleInput(event) {
  const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
  if (!note) return;
  const target = event.target;
  const ts = mobileNotesNow();
  note.currentText = String(target.value || '');
  note.updatedTs = ts;
  note.records.text_records[ts] = note.currentText;
  note.records.cursor_records[ts] = `${target.selectionStart}:${target.selectionEnd}`;
  note.records.header_records.endtime = ts;
  mobileNotesRenderStatus();
  mobileNotesEnsureEditorCaretVisible(target);
}

function mobileNotesGetTextareaCaretCoordinates(target, position) {
  if (!target || !document.body || typeof document.createElement !== 'function') return null;

  const style = window.getComputedStyle ? window.getComputedStyle(target) : {};
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const fontSize = Number.parseFloat(style.fontSize) || 40;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.35 || 40;
  const copiedProps = [
    'boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'textAlign', 'textIndent', 'tabSize', 'wordBreak'
  ];

  mirror.style.position = 'absolute';
  mirror.style.left = '-99999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.width = `${Math.max(1, Number(target.clientWidth || target.offsetWidth) || 1)}px`;
  copiedProps.forEach((prop) => {
    mirror.style[prop] = style[prop];
  });

  marker.textContent = '\u200b';
  marker.style.display = 'inline-block';
  marker.style.width = '1px';
  marker.style.height = `${lineHeight}px`;
  marker.style.verticalAlign = 'top';
  const text = String(target.value || '');
  const pos = Math.max(0, Math.min(Number(position) || 0, text.length));
  mirror.appendChild(document.createTextNode(text.slice(0, pos)));
  mirror.appendChild(marker);
  mirror.appendChild(document.createTextNode(text.slice(pos, pos + 1) || '.'));
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const coords = {
    top: markerRect.top - mirrorRect.top,
    left: markerRect.left - mirrorRect.left,
    lineHeight
  };

  document.body.removeChild(mirror);
  return coords;
}

function mobileNotesUpdateCaretOverlay(target = document.getElementById('mobileNotesEditor')) {
  const caret = document.getElementById('mobileNotesCaret');
  if (!caret) return;
  if (!target) {
    caret.style.display = 'none';
    return;
  }
  if (document.activeElement !== target) {
    caret.style.display = 'none';
    return;
  }

  const pos = Math.max(0, Math.min(Number(target.selectionEnd) || 0, String(target.value || '').length));
  const coords = mobileNotesGetTextareaCaretCoordinates(target, pos);
  if (!coords) {
    caret.style.display = 'none';
    return;
  }

  caret.style.left = `${coords.left - target.scrollLeft}px`;
  caret.style.top = `${coords.top - target.scrollTop}px`;
  caret.style.height = `${coords.lineHeight}px`;
  caret.style.display = 'block';
}

function mobileNotesEnsureEditorCaretVisible(target = document.getElementById('mobileNotesEditor')) {
  if (!target) return;
  requestAnimationFrame(() => {
    const pos = Math.max(0, Math.min(Number(target.selectionEnd) || 0, String(target.value || '').length));
    try {
      target.setSelectionRange(target.selectionStart, target.selectionEnd);
    } catch (err) {
      // Ignore browsers that temporarily reject selection updates.
    }

    const coords = mobileNotesGetTextareaCaretCoordinates(target, pos);
    if (!coords) return;

    const caretTop = coords.top;
    const margin = coords.lineHeight * 1.5;
    if (caretTop < target.scrollTop + margin) {
      target.scrollTop = Math.max(0, caretTop - margin);
    } else if (caretTop + coords.lineHeight > target.scrollTop + target.clientHeight - margin) {
      target.scrollTop = caretTop + coords.lineHeight - target.clientHeight + margin;
    }
    mobileNotesUpdateCaretOverlay(target);

    const rect = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
    const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
    if (rect && viewportHeight && rect.bottom > viewportHeight - 16) {
      try {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
      } catch (err) {
        target.scrollIntoView();
      }
      mobileNotesUpdateCaretOverlay(target);
    }
  });
}

function mobileNotesHandleScroll(event) {
  const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
  if (!note) return;
  const ts = mobileNotesNow();
  note.records.scroll_records[ts] = String(event.target.scrollTop || 0);
  mobileNotesUpdateCaretOverlay(event.target);
}

function mobileNotesHandleTitleInput(event) {
  const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
  if (!note) return;
  note.title = String(event.target.value || '').trim() || 'Untitled note';
  note.updatedTs = mobileNotesNow();
  note.records.header_records.mobile_note_title = note.title;
  mobileNotesRenderStatus();
}

function mobileNotesBuildSnapshot(note) {
  const records = normalizeWebScriptLogRecords(note.records);
  const ts = mobileNotesNow();
  records.header_records = {
    ...records.header_records,
    endtime: ts,
    mobile_note_id: note.id,
    mobile_note_title: note.title,
    mobile_session_id: mobileNotesState.sessionId,
    mobile_snapshot_time: ts
  };
  records.mobile_note_records = {
    [note.id]: {
      id: note.id,
      title: note.title,
      created_ts: note.createdTs,
      updated_ts: note.updatedTs,
      final_length: note.currentText.length
    }
  };
  records.mobile_switch_records = { ...mobileNotesState.switch_records };

  const textKeys = Object.keys(records.text_records).sort((a, b) => Number(a) - Number(b));
  const lastTextKey = textKeys.length ? textKeys[textKeys.length - 1] : null;
  const lastTextValue = lastTextKey == null ? null : records.text_records[lastTextKey];
  if (!textKeys.length || lastTextValue !== note.currentText) {
    records.text_records[ts] = note.currentText;
    records.cursor_records[ts] = `${note.currentText.length}:${note.currentText.length}`;
  }

  return records;
}

async function mobileNotesCommitNote(noteId = mobileNotesState.activeNoteId) {
  const note = mobileNotesFindNote(noteId);
  if (!note) return;
  const records = mobileNotesBuildSnapshot(note);
  const code = mobileNotesGetCode();
  const baseKey = makeWebScriptLogStorageKey(`wslog_${code}_mobile`, records, note.title || note.id);
  const key = await saveWebScriptLogRecordsToIndexedDB(records, baseKey);
  applyWebScriptLogRecords(records, key || baseKey);
  if (typeof processGraphFormat === 'function') processGraphFormat();
  if (typeof showWritingScore === 'function') showWritingScore();
  if (typeof renderDiffKeysPane === 'function') renderDiffKeysPane(records);
  if (typeof makeFTAnalysis === 'function') makeFTAnalysis();
  window.activateWebScriptLogTab?.('REPLAY');
  mobileNotesRenderStatus(`Committed "${note.title}" as ${key || baseKey}.`);
}

function mobileNotesFormatTime(ts) {
  if (!Number.isFinite(Number(ts))) return '';
  return new Date(Number(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mobileNotesRenderStatus(extra = '') {
  const status = document.getElementById('mobileNotesStatus');
  if (!status) return;
  const count = mobileNotesState.notes.length;
  const active = mobileNotesFindNote(mobileNotesState.activeNoteId);
  const base = active
    ? `Editing ${active.title} (${active.currentText.length} chars)`
    : `${count} ${count === 1 ? 'note' : 'notes'} in this mobile session`;
  status.textContent = extra || base;
}

function mobileNotesRender() {
  const grid = document.getElementById('mobileNotesGrid');
  const commitActive = document.getElementById('mobileNotesCommitActive');
  if (commitActive) commitActive.disabled = !mobileNotesState.activeNoteId;
  if (!grid) {
    mobileNotesRenderStatus();
    return;
  }

  if (!mobileNotesState.notes.length) {
    grid.innerHTML = '<div class="mobile-notes-status">No notes yet.</div>';
    mobileNotesRenderStatus();
    return;
  }

  grid.innerHTML = mobileNotesState.notes.map((note) => {
    const title = escapeDiffKeysHtml(note.title || 'Untitled note');
    const preview = escapeDiffKeysHtml(note.currentText || 'Empty note');
    const updated = mobileNotesFormatTime(note.updatedTs);
    return `
      <div class="mobile-note-card" data-note-id="${escapeDiffKeysHtml(note.id)}">
        <button class="mobile-note-card-delete" type="button" data-mobile-note-delete="${escapeDiffKeysHtml(note.id)}" aria-label="Delete ${title}">×</button>
        <button class="mobile-note-card-main" type="button" data-mobile-note-open="${escapeDiffKeysHtml(note.id)}">
          <div class="mobile-note-card-title">${title}</div>
          <div class="mobile-note-card-preview">${preview}</div>
        </button>
        <div>
          <div class="mobile-note-card-meta">${note.currentText.length} chars${updated ? ` · ${updated}` : ''}</div>
          <div class="mobile-note-card-actions">
            <button class="sl_button" type="button" data-mobile-note-commit="${escapeDiffKeysHtml(note.id)}">Commit</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  mobileNotesRenderStatus();
}

function initMobileNotesPrototype() {
  const app = document.getElementById('mobileNotesApp');
  if (!app || app.dataset.bound === 'true') return;
  app.dataset.bound = 'true';

  const editor = document.getElementById('mobileNotesEditor');
  const title = document.getElementById('mobileNotesTitle');
  const code = document.getElementById('mobileNotesCode');
  if (code && i_code?.value) code.value = String(i_code.value || '').toUpperCase();

  document.getElementById('mobileNotesNew')?.addEventListener('click', mobileNotesCreateNote);
  document.getElementById('mobileNotesHome')?.addEventListener('click', mobileNotesBackToOverview);
  document.getElementById('mobileNotesCommitOpen')?.addEventListener('click', () => mobileNotesCommitNote());
  document.getElementById('mobileNotesCommitActive')?.addEventListener('click', () => mobileNotesCommitNote());

  app.addEventListener('click', (event) => {
    const openId = event.target?.closest?.('[data-mobile-note-open]')?.getAttribute('data-mobile-note-open');
    if (openId) {
      mobileNotesOpenNote(openId);
      return;
    }
    const commitId = event.target?.closest?.('[data-mobile-note-commit]')?.getAttribute('data-mobile-note-commit');
    if (commitId) {
      mobileNotesCommitNote(commitId);
      return;
    }
    const deleteId = event.target?.closest?.('[data-mobile-note-delete]')?.getAttribute('data-mobile-note-delete');
    if (deleteId) mobileNotesDeleteNote(deleteId);
  });

  title?.addEventListener('input', mobileNotesHandleTitleInput);
  if (editor) {
    editor.addEventListener('keydown', mobileNotesHandleKeyDown);
    editor.addEventListener('keyup', mobileNotesHandleKeyUp);
    editor.addEventListener('mousedown', (event) => mobileNotesHandlePointerRecord('mousedown', event.currentTarget));
    editor.addEventListener('mouseup', (event) => mobileNotesHandlePointerRecord('mouseup', event.currentTarget));
    editor.addEventListener('input', mobileNotesHandleInput);
    editor.addEventListener('click', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
    editor.addEventListener('keyup', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
    editor.addEventListener('select', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
    editor.addEventListener('focus', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
    editor.addEventListener('blur', () => mobileNotesUpdateCaretOverlay(null));
    editor.addEventListener('scroll', mobileNotesHandleScroll);
  }

  mobileNotesRender();
}


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
