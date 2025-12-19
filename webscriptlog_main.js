/* global messages, keySet, myDmp, current_text, playback, recorder, lb_load, d3, linoutput */

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
  recorder.readOnly = false;
  recorder.focus();
  recorder.recording = true;
  $('#b_record').prop('disabled', true);
  $('#b_recstop').prop('disabled', false);
  $('#userCode').prop('disabled', true);
  header_record['starttime'] = (new Date()).getTime();
  messages.value = 'Recording started at ' + header_record['starttime'] + '.\n';
}


// Requires: idbStore (the KV wrapper), pako, updateListbox()

async function stopRecording() {
  if (!recorder.recording) {
    messages.value += 'Not recording!\n'; // localize
    return;
  }

  header_record['endtime'] = (new Date()).getTime();
  recorder.recording = false;
  recorder.readOnly = true;
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

  // Prepare the payload once
  const jsonStr = JSON.stringify({
    header_records: header_record,
    text_records:   text_record,
    cursor_records: cursor_record,
    key_records:    key_record,
    scroll_records: scroll_record
  }, null, '\t');

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
// Keeps your existing jQuery ajax call.

function fetchFromStorage() {
  if (sid == '') {
    console.log('sid is empty, not getting');
    return;
  }
  var startlimit = $("#startlimit").val();
  var endlimit = $("#endlimit").val();
  var mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;

  var request = $.ajax({
    url: getdataphp,
    type: 'POST',
    data: mydata
  });

  request.done(async function (response, textStatus, jqXHR) {
    if (response.includes("0 results")) {
      messages.value += response + "\n";
      return;
    }

    const lines = response.split('\n');

    // Process sequentially to keep memory spikes low
    for (const line of lines) {
      if (!line) continue;
      const rarr = line.split('\t');
      if (rarr.length !== 4) continue;

      // rarr[0] = published_on, rarr[1] = user, rarr[2] = "1,2,3,...", rarr[3] = index
      const key = `${rarr[3]}_${rarr[1]}_${rarr[0]}`;

      // Convert "1,2,3" -> Uint8Array
      // Make sure to map(Number) to avoid string bytes
      const bytes = new Uint8Array(rarr[2].split(',').map(Number));

      // Store the **compressed** bytes directly in IndexedDB.
      // (Much smaller than inflating to string.)
      await idbStore.setItem(key, bytes);
    }

    await updateListbox(); // now reads keys from IDB
  });

  request.fail(function (jqXHR, textStatus, errorThrown) {
    const status = "Något gick fel :(";
    console.error("The following error occured: ", textStatus, errorThrown);
  });
}

// Make this async wherever you call it: `await loadFromListbox();`
async function loadFromListbox() {
  replayStop();
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
  text_record   = data.text_records;
  cursor_record = data.cursor_records;
  key_record    = data.key_records;
  scroll_record = data.scroll_records;

  messages.value += `Read ${Object.keys(text_record || {}).length} text records.\n`;
  messages.scrollTop = messages.scrollHeight;

  makeRevisionTable();
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
  linoutput.innerHTML = linfile;
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

  function getCharSpan(node) {
    if (!node) return null;
    const el = (node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
    return el?.closest?.('#content span[time-bef][time-aft]') || null;
  }

  // Wrap selection (snap to whole char spans)
  contentDiv.addEventListener("mouseup", (e) => {
    if (e.target.closest(".newspan")) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const original = selection.getRangeAt(0);
    if (original.collapsed) return;

    const startSpan = getCharSpan(original.startContainer);
    const endSpan = getCharSpan(original.endContainer);
    if (!startSpan || !endSpan) return;

    // Optional: don't wrap if boundary is already wrapped
    if (startSpan.closest(".newspan") || endSpan.closest(".newspan")) return;

    const range = document.createRange();
    range.setStartBefore(startSpan);
    range.setEndAfter(endSpan);

    const wrapper = document.createElement("span");
    wrapper.className = "newspan";

    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);

    selection.removeAllRanges();
  });

  // Unwrap on click (works for single-letter selections too)
  contentDiv.addEventListener("click", (e) => {
    const wrapper = e.target.closest(".newspan");
    if (!wrapper) return;

    const parent = wrapper.parentNode;
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    parent.removeChild(wrapper);
  });

  // Table generation (robust for 1-letter selections)
  const btn = document.getElementById("generate-table");
  if (btn) {
    btn.addEventListener("click", generateTable);
  }

	function saveHighlightsToLocalStorage() {
		const key = lb_load.options[lb_load.selectedIndex].text; // your text id
		const ranges = saveAllHighlights(); // returns [{start,end}, ...]
		const storageKey = `highlights:${key}`;

		localStorage.setItem(storageKey, JSON.stringify(ranges));
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



  function generateTable() {
    // save highlights to localStorage
		saveHighlightsToLocalStorage();

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
    + 'Pauses: ' + numberOfPauses + '\n'
    + 'Pausetime : ' + totalPauseTime + '\n'
    + 'Insertions: ' + insertions + '\n'
    + 'Deletions: ' + deletions + '\n'
    + 'Replacements: ' + replacements + '\n';
  messages.scrollTop = messages.scrollHeight;
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
  recordKeys = Object.keys(text_record);

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
      previousRow.className = 'last-in-group';
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
  previousRow.className = 'last-in-group';

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

function playFromRow(e) {
  groupTime = Number(e.srcElement.parentElement.cells[6].id);

  let textTime = -1;

  for (var t in text_record) {
    if (t < groupTime) {
      textTime = t;
    }
  }

  if (textTime > -1) {
    playback.value = text_record[textTime];
  } else {
    playback.value = ''; // this needs to modified for when we have initial text
  }

  let cursorTime = -1;

  for (var t in cursor_record) {
    if (t < groupTime) {
      cursorTime = t;
    }
  }
  if (cursorTime > -1) {
    val_indices = cursor_record[cursorTime].split(":");
    playback.setSelectionRange(val_indices[0], val_indices[1]);
  }

  let scrollTime = -1;

  for (var t in scroll_record) {
    if (t < groupTime) {
      scrollTime = t;
    }
  }
  if (scrollTime > -1) {
    playback.scrollTop = scroll_record[scrollTime];
  }
  playback.focus();

  //console.log(groupTime);
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
  data = [];
  current_text = "";
  processlength = 0;
  var formatTime = d3.timeFormat("%M:%S.%L");
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

    processlength += text2.length;
    //passed_time = (k - header_record['starttime']) / 1000.0;
    passed_time = formatTime(k - header_record['starttime']);

    data.push({date: passed_time,
        product: text_record[k].length,
        process: processlength});

    // only in verbose
    //messages.value += "time: " + passed_time
    //        + ', product: ' + text_record[k].length
    //        + ', process: ' + processlength + '\n';

    current_text = edited_text;
  }
  drawSvg(data);

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

function replayStart(speedup) {
  replayStop();
  if (recorder.recording) {
    stopRecording();
  }
  playback.focus();
  //store the time the sequence started
  //so that we can subtract it from subsequent actions
  // set up text changes
  if (groupTime === -1) {
    playback.value = '';
    var mark = header_record['starttime'];
  } else {
    var mark = groupTime;
  }
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
    text_record_keeper[t] = setTimeout(changeValueCallback(text_record[t]), timeout);
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
    cursor_record_keeper[t] = setTimeout(changeCursorCallback(cursor_record[t]), timeout);
  }

  // set up scroll changes
  for (var t in scroll_record) {
    // if (mark) see above...impossible to have scroll_record without starttime
    var timeout = t - mark;
    timeout = timeout * speedup;
    scroll_record_keeper[t] = setTimeout(changeScrollCallback(scroll_record[t]), timeout);
  }

}

function replayStop() {
  for (var t in text_record) {
    clearTimeout(text_record_keeper[t]);
  }
  for (var t in cursor_record) {
    clearTimeout(cursor_record_keeper[t]);
  }
  for (var t in scroll_record) {
    clearTimeout(scroll_record_keeper[t]);
  }
}

function changeValueCallback(val) {
  return function () {
    playback.value = val;
  };
}

function changeCursorCallback(val) {
  return function () {
    val_indices = val.split(":");
    playback.setSelectionRange(val_indices[0], val_indices[1]);
  };
}

function changeScrollCallback(val) {
  return function () {
    playback.scrollTop = val;
  };
}

function drawSvg(data) {
  if (data.length === 0) {
    return;
  }

  d3.selectAll("svg > *").remove();
  //    var svg = d3.select("svg"),
  //            margin = {top: 20, right: 20, bottom: 30, left: 50},
  //    width = +svg.attr("width") - margin.left - margin.right,
  //            height = +svg.attr("height") - margin.top - margin.bottom,
  //            g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var margin = {top: 20, right: 60, bottom: 50, left: 50},
      width = 960 - margin.left - margin.right,
      height = 500 - margin.top - margin.bottom;

  // parse the date / time
  //var parseTime = d3.timeParse("%d-%b-%y");
  var parseTime = d3.timeParse("%M:%S.%L");

  // set the ranges
  var x = d3.scaleTime().range([0, width]);
  var y = d3.scaleLinear().range([height, 0]);

  // define the line
  var valueline = d3.line()
    .x(function (d) {
        return x(d.date);
        })
  .y(function (d) {
      return y(d.product);
      });

  // define the 2nd line
  var valueline2 = d3.line()
    .x(function (d) {
        return x(d.date);
        })
  .y(function (d) {
      return y(d.process);
      });
  // append the svg obgect to the body of the page
  // appends a 'group' element to 'svg'
  // moves the 'group' element to the top left margin
  var svg = d3.select("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
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
    return d3.axisLeft(y)
      .ticks(5)
  }


  //    var data = [
  //        {date: "0.100", product: "68.13", process: "34.12"},
  //        {date: "0.230", product: "63.98", process: "45.56"},
  //        {date: "0.327", product: "67.00", process: "67.89"},
  //        {date: "2.726", product: "606.98", process: "580.12"}
  //    ];

  // format the data
  data.forEach(function (d) {
      d.date = parseTime(d.date);
      d.product = +d.product;
      d.process = +d.process;
      });

  // Scale the range of the data
  x.domain(d3.extent(data, function (d) {
        return d.date;
        }));
  y.domain([0, d3.max(data, function (d) {
        return Math.max(d.product, d.process);
        })]);

  // Add the valueline path.
  svg.append("path")
    .data([data])
    .attr("class", "line")
    .attr("d", valueline);

  // Add the valueline2 path.
  svg.append("path")
    .data([data])
    .attr("class", "line")
    .style("stroke", "red")
    .attr("d", valueline2);

  // Add the X Axis
  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x)
        .tickFormat(d3.timeFormat("%M:%S.%L"))
        //.ticks(d3.timeMillisecond.every(500))
        );

  svg.append("text")
    //            .attr("x", 480)
    //            .attr("y", 475)
    .attr("transform",
        "translate(" + (width / 2) + " ," +
        (height + margin.top + 20) + ")")
    .style("text-anchor", "middle")
    .text("Time");

  // Add the Y Axis
  svg.append("g")
    .call(d3.axisLeft(y));

  svg.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - margin.left)
    .attr("x", 0 - (height / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .text("Characters");

  svg.append("text")
    .attr("transform", "translate(" + (width + 3) + "," + y(data[data.length - 1].process) + ")")
    .attr("dy", ".35em")
    .attr("text-anchor", "start")
    .style("fill", "red")
    .text("Process");

  svg.append("text")
    .attr("transform", "translate(" + (width + 3) + "," + y(data[data.length - 1].product) + ")")
    .attr("dy", ".35em")
    .attr("text-anchor", "start")
    .style("fill", "steelblue")
    .text("Product");
  // add the X gridlines
  svg.append("g")
    .attr("class", "grid")
    .attr("transform", "translate(0," + height + ")")
    .call(make_x_gridlines()
        .tickSize(-height)
        .tickFormat("")
        );

  // add the Y gridlines
  svg.append("g")
    .attr("class", "grid")
    .call(make_y_gridlines()
        .tickSize(-width)
        .tickFormat("")
        );
}

var openFile = function (event) {
  replayStop();
  var input = event.target;

  var reader = new FileReader();
  reader.onload = function () {
    file_text = reader.result;
    try {
      header_record = JSON.parse(file_text).header_records;
      text_record = JSON.parse(file_text).text_records;
      cursor_record = JSON.parse(file_text).cursor_records;
      key_record = JSON.parse(file_text).key_records;
      messages.value += 'Read ' + Object.keys(text_record).length + ' text records.\n';
      messages.scrollTop = messages.scrollHeight;
      makeRevisionTable();
    } catch (err) {
      messages.value += "Not a ScriptLog.js file, can't read.\n";
      messages.scrollTop = messages.scrollHeight;
    }
    //console.log(reader.result.substring(0, 200));
  };
  reader.readAsText(input.files[0]);
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
  } else {
  	$('#b_record').prop('disabled', true);
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

  recorder.readOnly = true;
  //recorder.recording = false;
  recorder.style.borderColor = "lightskyblue";
  recorder.style.fontFamily = "Calibri, Georgia, serif";
  //recorder.style.fontSize = "large";
  playback.style.fontFamily = "Calibri, Georgia, serif";
  //playback.style.fontSize = "large";
  //playback.readOnly = true;
  //playback.disabled = true;
  messages.readOnly = true;


  lb_load = document.getElementById("lb_load");
  linoutput = document.getElementById("linoutput");
	i_code = document.getElementById("userCode");

  header_record = {};
  key_record = {};
  text_record = {};
  text_record_keeper = {};
  cursor_record = {};
  cursor_record_keeper = {};
  scroll_record = {};
  scroll_record_keeper = {};
  current_text = '';
  file_text = '';
  myDmp = new diff_match_patch();

  updateListbox();

	// disabling record here because we need code
  $('#b_record').prop('disabled', true);
  $('#b_recstop').prop('disabled', true);

  //drawSvg();

} // end of init()

//window.addEventListener("DOMContentLoaded", init);
