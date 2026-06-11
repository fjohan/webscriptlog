async function fetchIDFXToZip({ alsoStoreToIDB = false } = {}) {
  if (!sid) {
    console.log('sid is empty, not getting');
    return;
  }

  const converter = window.DiffKeysDirectConverter;
  if (!converter?.recordsToIDFX) {
    messages.value += "IDFX converter is not loaded.\n";
    messages.scrollTop = messages.scrollHeight;
    return;
  }

  setBatchZipProgress(1, 'Starting');
  await flushBatchZipProgress();

  const startlimit = $("#startlimit").val();
  const endlimit = $("#endlimit").val();
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
      manifest.push({ included: false, reason: 'Malformed response row', raw: line });
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
      if ((lineIndex + 1) % 5 === 0) await flushBatchZipProgress();
      continue;
    }

    const published_on = parts[0];
    const user = parts[1];
    const index = parts[3];
    const key = `${index}_${user}_${published_on}`;
    const bytes = new Uint8Array(parts[2].split(',').map(Number));

    if (alsoStoreToIDB && typeof idbStore !== 'undefined') {
      try {
        await idbStore.setItem(key, bytes);
      } catch (e) {
        console.warn('IDB store failed for', key, e);
      }
    }

    let parsed;
    try {
      const jsonText = pako.inflate(bytes, { to: 'string' });
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error('Parse failed for', key, e);
      manifest.push({ key, user, published_on, included: false, reason: 'Inflate or JSON parse failed' });
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
      if ((lineIndex + 1) % 5 === 0) await flushBatchZipProgress();
      continue;
    }

    try {
      if (parsed.header_records) parsed.header_records._indexeddb_key = key;
      const idfx = converter.recordsToIDFX(parsed, { indexedDBKey: key });
      zip.file(`${makeSafeExportBaseName(key, 'webscriptlog')}.idfx`, idfx);
      const participantCode = key.includes('-') ? key.slice(key.indexOf('-') + 1, key.indexOf('-') + 7) : "";
      manifest.push({
        key,
        user,
        published_on,
        included: true,
        participant_code: participantCode,
        text_records: Object.keys(parsed.text_records || {}).length,
        key_records: Object.keys(parsed.key_records || {}).length,
        bytes_in_zip: new TextEncoder().encode(idfx).length
      });
      added++;
    } catch (e) {
      console.error('IDFX conversion failed for', key, e);
      manifest.push({ key, user, published_on, included: false, reason: 'IDFX conversion failed' });
    }

    setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
    if ((lineIndex + 1) % 5 === 0) await flushBatchZipProgress();
  }

  if (added === 0) {
    messages.value += "Hittade inga IDFX-filer att zippa.\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress();
    return;
  }

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
    const zipName = `${makeSafeExportBaseName('idfx', sid, `${startlimit}-${endlimit}`, stamp)}.zip`;
    saveAs(blob, zipName);

    messages.value += `Zippade ${added} IDFX-filer → ${zipName}\n`;
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
