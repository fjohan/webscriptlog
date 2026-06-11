
function setBatchZipProgress(percent, label = '') {
  const wrap = document.getElementById('batchZipProgress');
  const bar = document.getElementById('batchZipProgressBar');
  const text = document.getElementById('batchZipProgressText');
  if (!wrap || !bar || !text) return;

  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  wrap.hidden = false;
  bar.value = safePercent;
  text.textContent = label ? `${label} ${Math.round(safePercent)}%` : `${Math.round(safePercent)}%`;
}

function clearBatchZipProgress(label = '') {
  const wrap = document.getElementById('batchZipProgress');
  const bar = document.getElementById('batchZipProgressBar');
  const text = document.getElementById('batchZipProgressText');
  if (!wrap || !bar || !text) return;

  bar.value = 0;
  text.textContent = label;
  if (!label) wrap.hidden = true;
}

async function flushBatchZipProgress() {
  await new Promise(resolve => window.setTimeout(resolve, 0));
}

function sanitizeExportFilenamePart(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return cleaned || 'file';
}

function makeSafeExportBaseName(...parts) {
  return parts
    .map(part => sanitizeExportFilenamePart(part))
    .filter(Boolean)
    .join('_');
}

async function fetchToZip({ alsoStoreToIDB = false } = {}) {
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
    const key = `${index}_${user}_${published_on}`; // same label as your listbox/dlFromListbox

    // Parse comma-separated compressed bytes
    const bytes = new Uint8Array(parts[2].split(',').map(Number));

    // Optionally store compressed bytes to IndexedDB (like fetchFromStorage)
    if (alsoStoreToIDB) {
      try { await idbStore.setItem(key, bytes); } catch (e) { console.warn('IDB store failed', key, e); }
    }

    // Inflate to JSON string (same as dlFromListbox uses)
    let jsonText;
    try {
      jsonText = pako.inflate(bytes, { to: 'string' });
    } catch (e) {
      console.error('Inflate failed for', key, e);
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
      if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
      continue;
    }

    // Add to ZIP as .txt (matching dlFromListbox naming/format)
    zip.file(`${makeSafeExportBaseName(key)}.txt`, jsonText);
    added++;
    setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
    if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
  }

  if (added === 0) {
    messages.value += "Inga giltiga poster att zippa.\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress();
    return;
  }

  try {
    const blob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      meta => {
        $("#messageLabel").text(`Zipping ${Math.round(meta.percent)}%… ${meta.currentFile || ''}`);
        setBatchZipProgress(90 + meta.percent * 0.1, 'Zipping');
      }
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipName = `${makeSafeExportBaseName('bundle', sid, `${startlimit}-${endlimit}`, stamp)}.zip`;
    saveAs(blob, zipName);

    messages.value += `Zippade ${added} filer → ${zipName}\n`;
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
