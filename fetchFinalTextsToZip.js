
async function fetchFinalTextsToZip({ alsoStoreToIDB = false } = {}) {
  if (!sid) {
    console.log('sid is empty, not getting');
    return;
  }

  setBatchZipProgress(1, 'Starting');
  await flushBatchZipProgress();

  const startlimit = $("#startlimit").val();
  const endlimit   = $("#endlimit").val();
  const mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;

  let response;
  try {
    response = await $.ajax({ url: getdataphp, type: "POST", data: mydata });
  } catch (err) {
    console.error("Fetch failed:", err);
    messages.value += "Något gick fel vid hämtning.\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress('Fetch failed');
    return;
  }

  if (typeof response === 'string' && response.includes("0 results")) {
    messages.value += response + "\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress('No results');
    return;
  }

  const lines = String(response).split('\n').filter(Boolean);
  if (!lines.length) {
    messages.value += "0 results\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress('No results');
    return;
  }

  const zip = new JSZip();
  const manifest = [];
  let added = 0;

  setBatchZipProgress(0, 'Processing');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const parts = line.split('\t');
    if (parts.length !== 4) {
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
      if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
      continue;
    }

    const published_on = parts[0];
    const user = parts[1];
    const index = parts[3];
    const key = `${index}_${user}_${published_on}`; // same key you use elsewhere

    // Parse comma-separated compressed bytes → Uint8Array
    const bytes = new Uint8Array(parts[2].split(',').map(Number));

    // Optional: store compressed bytes to IndexedDB (keeps local cache)
    if (alsoStoreToIDB && typeof idbStore !== 'undefined') {
      try { await idbStore.setItem(key, bytes); } catch (e) { console.warn('IDB store failed for', key, e); }
    }

    // Inflate → JSON, then extract final text_records entry
    let finalText = null;
    try {
      const jsonText = pako.inflate(bytes, { to: 'string' });
      const obj = JSON.parse(jsonText);
      const tr = obj?.text_records || {};
      const keys = Object.keys(tr);
      const lastKey = keys[keys.length - 1]; // equivalent to .at(-1) but wider support
      if (lastKey) finalText = tr[lastKey];
    } catch (e) {
      console.error('Parsing failed for', key, e);
      finalText = null;
    }

    // Only include files that actually have a final text
    if (typeof finalText === 'string' && finalText.length > 0) {
      const filename = `${makeSafeExportBaseName(key, 'final')}.txt`;
      zip.file(filename, finalText);

      manifest.push({
        key,
        user,
        published_on,
        included: true,
        bytes_in_zip: new TextEncoder().encode(finalText).length
      });
      added++;
    } else {
      manifest.push({ key, user, published_on, included: false, reason: 'No final text_records entry' });
    }

    setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
    if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
  }

  if (added === 0) {
    messages.value += "Hittade inga final-texter att zippa.\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress();
    return;
  }

  // Include a small manifest for reference
  zip.file(
    "manifest.json",
    JSON.stringify(
      { sid, fetched_at: new Date().toISOString(), startlimit, endlimit, files: added, entries: manifest },
      null,
      2
    )
  );

  try {
    const blob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      meta => {
        $("#messageLabel").text(`Zipping ${Math.round(meta.percent)}%… ${meta.currentFile || ''}`);
        setBatchZipProgress(90 + meta.percent * 0.1, 'Zipping');
      }
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `${makeSafeExportBaseName('final_texts', sid, `${startlimit}-${endlimit}`, stamp)}.zip`;
    saveAs(blob, zipName);

    messages.value += `Zippade ${added} final-texter → ${zipName}\n`;
    messages.scrollTop = messages.scrollHeight;

    if (alsoStoreToIDB && typeof updateListbox === 'function') {
      await updateListbox();
    }
    clearBatchZipProgress(`Done: ${added} files`);
  } catch (e) {
    console.error("ZIP generation failed:", e);
    $("#messageLabel").text("Kunde inte skapa ZIP.");
    clearBatchZipProgress('ZIP failed');
  }
}
