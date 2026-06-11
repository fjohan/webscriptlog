
async function fetchStatsToZip({ alsoStoreToIDB = false } = {}) {
  if (!sid) {
    console.log('sid is empty, not getting');
    return;
  }

  setBatchZipProgress(1, 'Starting');
  await flushBatchZipProgress();

  const startlimit = $("#startlimit").val();
  const endlimit = $("#endlimit").val();
  const mydata = "id=" + sid + "&startlimit=" + startlimit + "&endlimit=" + endlimit;
  const metricOptions = getInspectMetricOptions();

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
      if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
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

    let jsonText;
    try {
      jsonText = pako.inflate(bytes, { to: 'string' });
    } catch (e) {
      console.error('Inflate failed for', key, e);
      manifest.push({ key, user, published_on, included: false, reason: 'Inflate failed' });
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
      if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error('Parse failed for', key, e);
      manifest.push({ key, user, published_on, included: false, reason: 'JSON parse failed' });
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
      if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
      continue;
    }

    try {
      const summary = buildInspectMetricsFromRecords(parsed, metricOptions);
      const report = serializeInspectMetrics(summary);
      zip.file(`${makeSafeExportBaseName(key, 'stats')}.tsv`, report);
      manifest.push({
        key,
        user,
        published_on,
        included: true,
        basis_used: summary.options.basis_used,
        has_window_records: summary.has_window_records ? 1 : 0
      });
      added++;
    } catch (e) {
      console.error('Metrics failed for', key, e);
      manifest.push({ key, user, published_on, included: false, reason: 'Metrics calculation failed' });
    }

    setBatchZipProgress(((lineIndex + 1) / lines.length) * 90, 'Processing');
    if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
  }

  if (added === 0) {
    messages.value += "Hittade inga statistikfiler att zippa.\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress();
    return;
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        sid,
        fetched_at: new Date().toISOString(),
        startlimit,
        endlimit,
        files: added,
        metric_options: metricOptions,
        entries: manifest
      },
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
    const zipName = `${makeSafeExportBaseName('stats', sid, `${startlimit}-${endlimit}`, stamp)}.zip`;
    saveAs(blob, zipName);

    messages.value += `Zippade ${added} statistikfiler → ${zipName}\n`;
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
