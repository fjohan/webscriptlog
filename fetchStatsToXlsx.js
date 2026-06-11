const STATS_XLSX_DETAIL_SHEET_LIMIT = 25;

async function fetchStatsToXlsx({ alsoStoreToIDB = false, detailSheetLimit = STATS_XLSX_DETAIL_SHEET_LIMIT } = {}) {
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

  const summaryEntries = [];
  const intervalEntries = [];
  const windowIntervalEntries = [];
  const detailEntries = [];
  const errorEntries = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const parts = line.split('\t');
    if (parts.length !== 4) {
      errorEntries.push({ key: '', user: '', published_on: '', reason: 'Malformed response row', raw: line });
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 85, 'Processing');
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

    let parsed;
    try {
      const jsonText = pako.inflate(bytes, { to: 'string' });
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error('Parse failed for', key, e);
      errorEntries.push({ key, user, published_on, reason: 'Inflate or parse failed', raw: '' });
      setBatchZipProgress(((lineIndex + 1) / lines.length) * 85, 'Processing');
      if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
      continue;
    }

    try {
      const summary = buildInspectMetricsFromRecords(parsed, metricOptions);
      summaryEntries.push(buildSummaryRow(key, user, published_on, summary));
      intervalEntries.push(...buildIntervalRows(key, user, published_on, summary));
      if (summary.has_window_records) {
        windowIntervalEntries.push(...buildWindowIntervalRows(key, user, published_on, summary));
      }
      detailEntries.push({ key, user, published_on, summary });
    } catch (e) {
      console.error('Metrics failed for', key, e);
      errorEntries.push({ key, user, published_on, reason: 'Metrics calculation failed', raw: '' });
    }

    setBatchZipProgress(((lineIndex + 1) / lines.length) * 85, 'Processing');
    if ((lineIndex + 1) % 10 === 0) await flushBatchZipProgress();
  }

  if (!summaryEntries.length) {
    messages.value += "Hittade inga statistikfiler att exportera.\n";
    messages.scrollTop = messages.scrollHeight;
    clearBatchZipProgress('No files');
    return;
  }

  setBatchZipProgress(88, 'Building workbook');
  await flushBatchZipProgress();

  const sheets = buildStatsWorkbookSheets({
    sid,
    startlimit,
    endlimit,
    metricOptions,
    summaryEntries,
    intervalEntries,
    windowIntervalEntries,
    errorEntries,
    detailEntries,
    detailSheetLimit
  });

  try {
    const blob = await generateWorkbookBlob(
      sheets,
      meta => setBatchZipProgress(90 + meta.percent * 0.1, 'Writing workbook')
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${makeSafeExportBaseName('stats', sid, `${startlimit}-${endlimit}`, stamp)}.xlsx`;
    saveAs(blob, fileName);

    messages.value += `Skapade XLSX med ${summaryEntries.length} filer → ${fileName}\n`;
    messages.scrollTop = messages.scrollHeight;

    if (alsoStoreToIDB && typeof updateListbox === 'function') {
      await updateListbox();
    }
    clearBatchZipProgress(`Done: ${summaryEntries.length} files`);
  } catch (e) {
    console.error("XLSX generation failed:", e);
    $("#messageLabel").text("Kunde inte skapa XLSX.");
    clearBatchZipProgress('XLSX failed');
  }
}

function buildStatsWorkbookSheets({
  sid,
  startlimit,
  endlimit,
  metricOptions,
  summaryEntries,
  intervalEntries,
  windowIntervalEntries,
  errorEntries,
  detailEntries,
  detailSheetLimit
}) {
  const detailMode = detailEntries.length <= detailSheetLimit;
  const sheets = [];

  sheets.push({
    name: 'Summary',
    rows: rowsFromObjects(summaryEntries, SUMMARY_HEADERS)
  });

  sheets.push({
    name: 'Intervals_All',
    rows: rowsFromObjects(intervalEntries, INTERVAL_HEADERS)
  });

  if (windowIntervalEntries.length) {
    sheets.push({
      name: 'Window_Intervals_All',
      rows: rowsFromObjects(windowIntervalEntries, WINDOW_INTERVAL_HEADERS)
    });
  }

  sheets.push({
    name: 'Export_Info',
    rows: [
      ['sid', sid],
      ['startlimit', startlimit],
      ['endlimit', endlimit],
      ['fetched_at', new Date().toISOString()],
      ['files_exported', summaryEntries.length],
      ['files_with_errors', errorEntries.length],
      ['detail_sheet_limit', detailSheetLimit],
      ['detail_sheets_included', detailMode ? 1 : 0],
      ['basis', metricOptions.basis],
      ['pause_threshold_s', metricOptions.pause_threshold_s],
      ['intervals', metricOptions.intervals]
    ]
  });

  if (errorEntries.length) {
    sheets.push({
      name: 'Errors',
      rows: rowsFromObjects(errorEntries, ERROR_HEADERS)
    });
  }

  if (detailMode) {
    for (let i = 0; i < detailEntries.length; i++) {
      const entry = detailEntries[i];
      sheets.push({
        name: entry.key,
        rows: buildDetailedSheetRows(entry)
      });
    }
  }

  return sheets;
}

function buildSummaryRow(key, user, published_on, summary) {
  const row = {
    key,
    user,
    published_on,
    basis_used: summary.options.basis_used,
    interval_count: summary.options.intervals,
    pause_threshold_s: summary.options.pause_threshold_s,
    recording_time_s: summary.options.recording_time_s,
    typing_time_s: summary.options.typing_time_s,
    speed_chars_per_min: summary.overall.speed_chars_per_min,
    word_count_total: summary.overall.word_count_total,
    deletions_total: summary.overall.deletions_total,
    insertions_total: summary.overall.insertions_total,
    replacements_total: summary.overall.replacements_total,
    pause_time_total_s: summary.overall.pause_time_total_s,
    pause_count_total: summary.overall.pause_count_total,
    has_window_records: summary.has_window_records ? 1 : 0
  };

  const windowSummary = summary.overall.window || {};
  for (let i = 0; i < WINDOW_OVERALL_HEADERS.length; i++) {
    const keyName = WINDOW_OVERALL_HEADERS[i];
    row[keyName] = windowSummary[keyName] ?? '';
  }

  return row;
}

function buildIntervalRows(key, user, published_on, summary) {
  return summary.intervals.map(row => ({
    key,
    user,
    published_on,
    interval: row.interval,
    start_s: row.start_s,
    end_s: row.end_s,
    speed_chars_per_min: row.speed_chars_per_min,
    word_count_total: row.word_count_total,
    word_count_interval: row.word_count_interval,
    deletions_total: row.deletions_total,
    deletions_interval: row.deletions_interval,
    insertions_total: row.insertions_total,
    insertions_interval: row.insertions_interval,
    replacements_total: row.replacements_total,
    replacements_interval: row.replacements_interval,
    pause_time_total_s: row.pause_time_total_s,
    pause_time_interval_s: row.pause_time_interval_s,
    pause_count_total: row.pause_count_total,
    pause_count_interval: row.pause_count_interval
  }));
}

function buildWindowIntervalRows(key, user, published_on, summary) {
  return summary.intervals.map(row => ({
    key,
    user,
    published_on,
    interval: row.interval,
    has_window_records: row.window?.has_records ?? '',
    dwell_writing_total_s: row.window_total?.dwell_writing_s ?? '',
    dwell_writing_interval_s: row.window?.dwell_writing_s ?? '',
    dwell_task_total_s: row.window_total?.dwell_task_s ?? '',
    dwell_task_interval_s: row.window?.dwell_task_s ?? '',
    dwell_upper_total_s: row.window_total?.dwell_upper_s ?? '',
    dwell_upper_interval_s: row.window?.dwell_upper_s ?? '',
    dwell_lower_total_s: row.window_total?.dwell_lower_s ?? '',
    dwell_lower_interval_s: row.window?.dwell_lower_s ?? '',
    writing_to_task_total: row.window_total?.writing_to_task ?? '',
    writing_to_task_interval: row.window?.writing_to_task ?? '',
    writing_to_upper_total: row.window_total?.writing_to_upper ?? '',
    writing_to_upper_interval: row.window?.writing_to_upper ?? '',
    writing_to_lower_total: row.window_total?.writing_to_lower ?? '',
    writing_to_lower_interval: row.window?.writing_to_lower ?? '',
    task_to_writing_total: row.window_total?.task_to_writing ?? '',
    task_to_writing_interval: row.window?.task_to_writing ?? '',
    upper_to_writing_total: row.window_total?.upper_to_writing ?? '',
    upper_to_writing_interval: row.window?.upper_to_writing ?? '',
    lower_to_writing_total: row.window_total?.lower_to_writing ?? '',
    lower_to_writing_interval: row.window?.lower_to_writing ?? '',
    upper_to_lower_total: row.window_total?.upper_to_lower ?? '',
    upper_to_lower_interval: row.window?.upper_to_lower ?? '',
    lower_to_upper_total: row.window_total?.lower_to_upper ?? '',
    lower_to_upper_interval: row.window?.lower_to_upper ?? ''
  }));
}

function buildDetailedSheetRows(entry) {
  const { key, user, published_on, summary } = entry;
  const rows = [];

  rows.push(['file', key]);
  rows.push(['user', user]);
  rows.push(['published_on', published_on]);
  rows.push([]);
  rows.push(['options']);
  rows.push(['basis_used', summary.options.basis_used]);
  rows.push(['interval_count', summary.options.intervals]);
  rows.push(['pause_threshold_s', summary.options.pause_threshold_s]);
  rows.push(['recording_time_s', summary.options.recording_time_s]);
  rows.push(['typing_time_s', summary.options.typing_time_s]);
  rows.push([]);
  rows.push(['overall']);
  rows.push([
    'speed_chars_per_min',
    'word_count_total',
    'deletions_total',
    'insertions_total',
    'replacements_total',
    'pause_time_total_s',
    'pause_count_total'
  ]);
  rows.push([
    summary.overall.speed_chars_per_min,
    summary.overall.word_count_total,
    summary.overall.deletions_total,
    summary.overall.insertions_total,
    summary.overall.replacements_total,
    summary.overall.pause_time_total_s,
    summary.overall.pause_count_total
  ]);

  if (summary.has_window_records) {
    rows.push([]);
    rows.push(['window_overall']);
    rows.push(WINDOW_OVERALL_HEADERS);
    rows.push(WINDOW_OVERALL_HEADERS.map(header => summary.overall.window?.[header] ?? ''));
  }

  rows.push([]);
  rows.push(['intervals']);
  rows.push(INTERVAL_HEADERS.slice(3));
  for (let i = 0; i < summary.intervals.length; i++) {
    const row = summary.intervals[i];
    rows.push([
      row.interval,
      row.start_s,
      row.end_s,
      row.speed_chars_per_min,
      row.word_count_total,
      row.word_count_interval,
      row.deletions_total,
      row.deletions_interval,
      row.insertions_total,
      row.insertions_interval,
      row.replacements_total,
      row.replacements_interval,
      row.pause_time_total_s,
      row.pause_time_interval_s,
      row.pause_count_total,
      row.pause_count_interval
    ]);
  }

  if (summary.has_window_records) {
    rows.push([]);
    rows.push(['window_intervals']);
    rows.push(WINDOW_INTERVAL_HEADERS.slice(3));
    for (let i = 0; i < summary.intervals.length; i++) {
      const row = summary.intervals[i];
      rows.push([
        row.interval,
        row.window?.has_records ?? '',
        row.window_total?.dwell_writing_s ?? '',
        row.window?.dwell_writing_s ?? '',
        row.window_total?.dwell_task_s ?? '',
        row.window?.dwell_task_s ?? '',
        row.window_total?.dwell_upper_s ?? '',
        row.window?.dwell_upper_s ?? '',
        row.window_total?.dwell_lower_s ?? '',
        row.window?.dwell_lower_s ?? '',
        row.window_total?.writing_to_task ?? '',
        row.window?.writing_to_task ?? '',
        row.window_total?.writing_to_upper ?? '',
        row.window?.writing_to_upper ?? '',
        row.window_total?.writing_to_lower ?? '',
        row.window?.writing_to_lower ?? '',
        row.window_total?.task_to_writing ?? '',
        row.window?.task_to_writing ?? '',
        row.window_total?.upper_to_writing ?? '',
        row.window?.upper_to_writing ?? '',
        row.window_total?.lower_to_writing ?? '',
        row.window?.lower_to_writing ?? '',
        row.window_total?.upper_to_lower ?? '',
        row.window?.upper_to_lower ?? '',
        row.window_total?.lower_to_upper ?? '',
        row.window?.lower_to_upper ?? ''
      ]);
    }
  }

  return rows;
}

async function generateWorkbookBlob(sheetSpecs, onProgress) {
  const zip = new JSZip();
  const usedSheetNames = new Set();
  const normalizedSheets = sheetSpecs.map((sheet, index) => ({
    id: index + 1,
    name: makeUniqueSheetName(sheet.name, usedSheetNames),
    rows: sheet.rows
  }));

  zip.file('[Content_Types].xml', buildContentTypesXml(normalizedSheets.length));
  zip.file('_rels/.rels', buildRootRelsXml());
  zip.file('xl/workbook.xml', buildWorkbookXml(normalizedSheets));
  zip.file('xl/_rels/workbook.xml.rels', buildWorkbookRelsXml(normalizedSheets.length));
  zip.file('xl/styles.xml', buildStylesXml());

  for (let i = 0; i < normalizedSheets.length; i++) {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, buildWorksheetXml(normalizedSheets[i].rows));
  }

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    onProgress
  );
}

function buildWorksheetXml(rows) {
  const sheetRows = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];
    const cells = [];
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const value = row[colIndex];
      if (value === null || value === undefined || value === '') continue;
      const ref = `${columnNumberToName(colIndex + 1)}${rowIndex + 1}`;
      cells.push(buildCellXml(ref, value));
    }
    sheetRows.push(`<row r="${rowIndex + 1}">${cells.join('')}</row>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    sheetRows.join(''),
    '</sheetData>',
    '</worksheet>'
  ].join('');
}

function buildCellXml(ref, value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function buildContentTypesXml(sheetCount) {
  const overrides = [
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  ];

  for (let i = 1; i <= sheetCount; i++) {
    overrides.push(`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    overrides.join(''),
    '</Types>'
  ].join('');
}

function buildRootRelsXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>'
  ].join('');
}

function buildWorkbookXml(sheets) {
  const xmlSheets = sheets.map(sheet =>
    `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`
  );

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<sheets>',
    xmlSheets.join(''),
    '</sheets>',
    '</workbook>'
  ].join('');
}

function buildWorkbookRelsXml(sheetCount) {
  const rels = [];
  for (let i = 1; i <= sheetCount; i++) {
    rels.push(`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`);
  }
  rels.push(`<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    rels.join(''),
    '</Relationships>'
  ].join('');
}

function buildStylesXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>',
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>',
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
    '</styleSheet>'
  ].join('');
}

function rowsFromObjects(entries, headers) {
  const rows = [headers];
  for (let i = 0; i < entries.length; i++) {
    rows.push(headers.map(header => entries[i][header] ?? ''));
  }
  return rows;
}

function makeUniqueSheetName(rawName, usedSheetNames) {
  const base = String(rawName || 'Sheet')
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Sheet';

  let candidate = base.slice(0, 31);
  let suffix = 1;
  while (usedSheetNames.has(candidate)) {
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
  usedSheetNames.add(candidate);
  return candidate;
}

function columnNumberToName(columnNumber) {
  let n = columnNumber;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const WINDOW_OVERALL_HEADERS = [
  'dwell_writing_s',
  'dwell_task_s',
  'dwell_upper_s',
  'dwell_lower_s',
  'writing_to_task',
  'writing_to_upper',
  'writing_to_lower',
  'task_to_writing',
  'upper_to_writing',
  'lower_to_writing',
  'upper_to_lower',
  'lower_to_upper'
];

const SUMMARY_HEADERS = [
  'key',
  'user',
  'published_on',
  'basis_used',
  'interval_count',
  'pause_threshold_s',
  'recording_time_s',
  'typing_time_s',
  'speed_chars_per_min',
  'word_count_total',
  'deletions_total',
  'insertions_total',
  'replacements_total',
  'pause_time_total_s',
  'pause_count_total',
  'has_window_records',
  ...WINDOW_OVERALL_HEADERS
];

const INTERVAL_HEADERS = [
  'key',
  'user',
  'published_on',
  'interval',
  'start_s',
  'end_s',
  'speed_chars_per_min',
  'word_count_total',
  'word_count_interval',
  'deletions_total',
  'deletions_interval',
  'insertions_total',
  'insertions_interval',
  'replacements_total',
  'replacements_interval',
  'pause_time_total_s',
  'pause_time_interval_s',
  'pause_count_total',
  'pause_count_interval'
];

const WINDOW_INTERVAL_HEADERS = [
  'key',
  'user',
  'published_on',
  'interval',
  'has_window_records',
  'dwell_writing_total_s',
  'dwell_writing_interval_s',
  'dwell_task_total_s',
  'dwell_task_interval_s',
  'dwell_upper_total_s',
  'dwell_upper_interval_s',
  'dwell_lower_total_s',
  'dwell_lower_interval_s',
  'writing_to_task_total',
  'writing_to_task_interval',
  'writing_to_upper_total',
  'writing_to_upper_interval',
  'writing_to_lower_total',
  'writing_to_lower_interval',
  'task_to_writing_total',
  'task_to_writing_interval',
  'upper_to_writing_total',
  'upper_to_writing_interval',
  'lower_to_writing_total',
  'lower_to_writing_interval',
  'upper_to_lower_total',
  'upper_to_lower_interval',
  'lower_to_upper_total',
  'lower_to_upper_interval'
];

const ERROR_HEADERS = ['key', 'user', 'published_on', 'reason', 'raw'];
