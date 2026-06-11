// Linear representation and replay helpers
let writingScoreVisible = false;

function makeLinearRepresentationReport() {
  const records = getCurrentRecordSet();
  const validation = validateLinearRepresentation(records);
  const linear = validation.original_linear;

  lastLinearRepresentation = linear;
  lastLinearRepresentationValidation = validation;
  window.lastLinearRepresentation = linear;
  window.lastLinearRepresentationValidation = validation;

  const lines = ['<linear-representation>'];
  lines.push(linear);
  lines.push('</linear-representation>');
  lines.push('<linear-representation-check>');
  lines.push(`final_text_matches\t${validation.final_text_matches ? 'yes' : 'no'}`);
  lines.push(`roundtrip_linear_matches\t${validation.roundtrip_linear_matches ? 'yes' : 'no'}`);
  if (!validation.final_text_matches) {
    lines.push(`expected_final\t${JSON.stringify(validation.expected_final_text)}`);
    lines.push(`actual_final\t${JSON.stringify(validation.reconstructed_final_text)}`);
  }
  if (!validation.roundtrip_linear_matches) {
    lines.push(`original_linear\t${validation.original_linear}`);
    lines.push(`roundtrip_linear\t${validation.roundtrip_linear}`);
  }
  lines.push('</linear-representation-check>');

  return lines.join('\n') + '\n';
}

function showWritingScore() {
  const records = getCurrentRecordSet();
  const validation = validateLinearRepresentation(records);
  const traceRows = getWritingScoreGroupedTextRows(records);
  writingScoreVisible = true;
  window.lastWritingScore = validation.original_linear || '';
  window.lastWritingScoreTraceRows = traceRows;

  const scoreHtml = `<div class="writing-score-line">${renderWritingScoreHtml(validation.original_linear || '')}</div>`;
  const traceHtml = renderWritingScoreTraceTableHtml(traceRows, records);

  const scoreTargets = document.querySelectorAll('.writing-score-main-host');
  scoreTargets.forEach((target) => {
    target.innerHTML = scoreHtml;
  });

  const traceTargets = document.querySelectorAll('.writing-score-trace-host');
  traceTargets.forEach((target) => {
    target.innerHTML = traceHtml;
    bindWritingScoreTraceClicks(target);
  });
}

function escapeWritingScoreHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderWritingScoreHtml(linear) {
  const actions = parseLinearRepresentation(linear);
  const chunks = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.type === 'char' || action.type === 'literal-token') {
      chunks.push(`<span style="color:#1f8a3b;">${escapeWritingScoreHtml(serializeLinearActions([action]))}</span>`);
      continue;
    }

    if (action.type !== 'command') continue;

    if (action.command === 'DEL' || action.command === 'FDEL' || action.command === 'BDEL') {
      chunks.push(`<span style="color:#b22222;">${escapeWritingScoreHtml(serializeLinearActions([action]))}</span>`);
      continue;
    }

    if (action.command === 'CLICK' || action.command === 'SEL' || action.command === 'NAV' || action.command === 'LEFT' || action.command === 'RIGHT' || action.command === 'UP' || action.command === 'DOWN' || action.command === 'SLEFT' || action.command === 'SRIGHT' || action.command === 'SUP' || action.command === 'SDOWN' || action.command === 'LEFT_TO_START' || action.command === 'RIGHT_TO_END' || action.command === 'UP_TO_START' || action.command === 'DOWN_TO_END' || action.command === 'HOME' || action.command === 'END') {
      chunks.push(`<span style="color:#1f5fbf;">${escapeWritingScoreHtml(serializeLinearActions([action]))}</span>`);
      continue;
    }

    if (action.command === 'PAUSE') {
      chunks.push(`<span style="color:#111111;">${escapeWritingScoreHtml(serializeLinearActions([action]))}</span>`);
      continue;
    }

    chunks.push(`<span style="color:#777777;">${escapeWritingScoreHtml(serializeLinearActions([action]))}</span>`);
  }

  return chunks.join('');
}

function renderWritingScoreTraceTableHtml(traceRows, records) {
  const rows = Array.isArray(traceRows) ? traceRows : [];
  if (!rows.length) {
    return '<div class="writing-score-trace-empty">No grouped text trace rows available.</div>';
  }

  const startTs = Number(records?.header_records?.starttime) || 0;
  const body = rows.map((row) => {
    const firstSourceTs = row.source_ts.length ? Number(row.source_ts[0]) : NaN;
    const lastSourceTs = row.source_ts.length ? Number(row.source_ts[row.source_ts.length - 1]) : NaN;
    const firstLabel = formatWritingScoreRelativeTimestamp(firstSourceTs, startTs);
    const lastLabel = formatWritingScoreRelativeTimestamp(lastSourceTs, startTs);
    const linearItems = normalizeLinearParts(row.linear_tokens).join('');
    const safeItems = escapeWritingScoreHtml(linearItems);
    const firstTsAttr = Number.isFinite(firstSourceTs) ? String(firstSourceTs) : '';
    const lastTsAttr = Number.isFinite(lastSourceTs) ? String(lastSourceTs) : '';
    const sameTs = firstTsAttr && firstTsAttr === lastTsAttr;
    return `
      <tr>
        <td class="writing-score-trace-ts">
          <button type="button" class="writing-score-jump" data-source-ts="${firstTsAttr}" data-jump-mode="before">${escapeWritingScoreHtml(firstLabel)}</button>
          ${sameTs ? '' : `<span class="writing-score-trace-ts-sep"> - </span><button type="button" class="writing-score-jump" data-source-ts="${lastTsAttr}" data-jump-mode="inclusive">${escapeWritingScoreHtml(lastLabel)}</button>`}
        </td>
        <td class="writing-score-trace-items">${safeItems}</td>
      </tr>`;
  }).join('');

  return `
    <div class="writing-score-trace">
      <div class="writing-score-trace-title">Text Trace</div>
      <table class="writing-score-trace-table">
        <thead>
          <tr>
            <th>source_ts</th>
            <th>linear_items</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function bindWritingScoreTraceClicks(container) {
  const buttons = container?.querySelectorAll?.('.writing-score-jump');
  if (!buttons) return;

  buttons.forEach((button) => {
    button.addEventListener('click', function onWritingScoreJumpClick() {
      const sourceTs = Number(button.getAttribute('data-source-ts'));
      const jumpMode = button.getAttribute('data-jump-mode') || 'before';
      if (!Number.isFinite(sourceTs)) return;
      if (typeof setReplayStartTimestamp === 'function') {
        setReplayStartTimestamp(sourceTs, jumpMode);
      }
    });
  });
}

function formatWritingScoreRelativeTimestamp(ts, startTs) {
  if (!Number.isFinite(ts) || !Number.isFinite(startTs)) return '-';
  return ((ts - startTs) / 1000).toFixed(3);
}

function appendWritingScoreTraceRow(rows, sourceKind, sourceTsList, tokens) {
  const values = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  if (!values.length) return;
  rows.push({
    source_kind: sourceKind,
    source_ts: sourceTsList.map(String),
    linear_tokens: values
  });
}

function groupWritingScoreTraceRows(tokenRows) {
  const grouped = [];
  const rows = Array.isArray(tokenRows) ? tokenRows : [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const last = grouped.length ? grouped[grouped.length - 1] : null;
    const canMergeText = last && last.source_kind === 'text' && row.source_kind === 'text';

    if (canMergeText) {
      last.source_ts.push(...row.source_ts);
      last.linear_tokens.push(...row.linear_tokens);
      continue;
    }

    grouped.push({
      source_kind: row.source_kind,
      source_ts: [...row.source_ts],
      linear_tokens: [...row.linear_tokens]
    });
  }

  return grouped;
}

function getWritingScoreGroupedTextRowsSlow(records) {
  const normalized = {
    text_records: records?.text_records || {},
    cursor_records: records?.cursor_records || {},
    key_records: records?.key_records || {}
  };
  const textEntries = getSortedRecordEntries(normalized.text_records);
  const keyEntries = getSortedRecordEntries(normalized.key_records);
  const tokenRows = [];
  const traceParts = [];
  const recordingStartTs = Number(records?.header_records?.starttime);
  let simulatedText = '';
  let selectionStart = 0;
  let selectionEnd = 0;
  let selectionAnchor = 0;
  let selectionFocus = 0;
  let keyIndex = 0;
  let sawExplicitNavigation = false;
  let lastActivityTs = Number.isFinite(recordingStartTs) ? recordingStartTs : null;
  let shiftActive = false;
  let controlActive = false;
  let metaActive = false;
  const pauseThresholdSeconds = getCurrentLinearPauseThreshold();

  for (let i = 0; i < textEntries.length; i++) {
    const ts = textEntries[i].ts;
    const targetText = String(textEntries[i].value ?? '');

    while (keyIndex < keyEntries.length && keyEntries[keyIndex].ts < ts) {
      const keyTs = keyEntries[keyIndex].ts;
      const raw = String(keyEntries[keyIndex].value || '');
      if (raw === 'keydown: Shift') {
        shiftActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Shift') {
        shiftActive = false;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keydown: Control') {
        controlActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Control') {
        controlActive = false;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keydown: Meta') {
        metaActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Meta') {
        metaActive = false;
        keyIndex += 1;
        continue;
      }

      const partsBeforePause = traceParts.length;
      appendPauseToken(traceParts, lastActivityTs, keyTs, pauseThresholdSeconds);
      const navPartStart = traceParts.length;
      const nextState = appendLinearNavigationEvent(
        traceParts,
        keyEntries,
        keyIndex,
        normalized.cursor_records,
        simulatedText,
        { start: selectionStart, end: selectionEnd, anchor: selectionAnchor, focus: selectionFocus },
        { shift: shiftActive, ctrl: controlActive, meta: metaActive }
      );
      if (nextState) {
        selectionStart = nextState.start;
        selectionEnd = nextState.end;
        selectionAnchor = nextState.anchor;
        selectionFocus = nextState.focus;
        if (nextState.navigated) sawExplicitNavigation = true;
        lastActivityTs = nextState.activityTs || keyTs;
        const consumed = Math.max(1, Number(nextState.consumed) || 1);
        const sourceTs = [];
        for (let k = keyIndex; k < Math.min(keyEntries.length, keyIndex + consumed); k++) {
          sourceTs.push(keyEntries[k].ts);
        }
        appendWritingScoreTraceRow(tokenRows, 'key', sourceTs, traceParts.slice(navPartStart));
        keyIndex += consumed;
        continue;
      }
      traceParts.length = partsBeforePause;
      keyIndex += 1;
    }

    const cursorBefore = getCursorStateBefore(normalized.cursor_records, ts);
    if (cursorBefore && sawExplicitNavigation) {
      appendNavigationResolutionTokens(traceParts, selectionStart, selectionEnd, cursorBefore.start, cursorBefore.end);
      selectionStart = cursorBefore.start;
      selectionEnd = cursorBefore.end;
      selectionAnchor = cursorBefore.start;
      selectionFocus = cursorBefore.end;
    }

    const diffInfo = refineTextChangeDiffForSelection(
      simulatedText,
      targetText,
      getTextChangeDiff(simulatedText, targetText),
      selectionStart,
      selectionEnd
    );

    const alignedSelection = alignSelectionForTextDiff(traceParts, diffInfo, selectionStart, selectionEnd);
    selectionStart = alignedSelection.start;
    selectionEnd = alignedSelection.end;

    appendPauseToken(traceParts, lastActivityTs, ts, pauseThresholdSeconds);
    const textPartStart = traceParts.length;
    appendTextDiffTokens(traceParts, diffInfo, selectionStart, selectionEnd);
    const textTokens = traceParts.slice(textPartStart);
    appendWritingScoreTraceRow(tokenRows, 'text', [ts], textTokens);

    simulatedText = targetText;
    selectionStart = diffInfo.start + diffInfo.inserted.length;
    selectionEnd = selectionStart;
    selectionAnchor = selectionStart;
    selectionFocus = selectionStart;
    const cursorAtTextTs = parseCursorRecord(normalized.cursor_records[String(ts)] ?? normalized.cursor_records[ts]);
    if (cursorAtTextTs && (selectionStart !== cursorAtTextTs.start || selectionEnd !== cursorAtTextTs.end)) {
      const navPartStart = traceParts.length;
      appendNavigationResolutionTokens(traceParts, selectionStart, selectionEnd, cursorAtTextTs.start, cursorAtTextTs.end);
      appendWritingScoreTraceRow(tokenRows, 'text-cursor', [ts], traceParts.slice(navPartStart));
      selectionStart = cursorAtTextTs.start;
      selectionEnd = cursorAtTextTs.end;
      selectionAnchor = cursorAtTextTs.start;
      selectionFocus = cursorAtTextTs.end;
    }

    sawExplicitNavigation = false;
    lastActivityTs = ts;
  }

  return groupWritingScoreTraceRows(tokenRows).filter((row) => row.source_kind === 'text');
}

function getWritingScoreGroupedTextRowsFast(records) {
  const normalized = {
    text_records: records?.text_records || {},
    cursor_records: records?.cursor_records || {},
    key_records: records?.key_records || {}
  };
  const textEntries = buildFastSortedRecordEntries(normalized.text_records);
  const keyEntries = buildFastSortedRecordEntries(normalized.key_records);
  const cursorIndex = buildFastCursorIndex(normalized.cursor_records);
  const cursorTracker = createCursorBeforeTracker(cursorIndex.entries);
  const tokenRows = [];
  const traceParts = [];
  const recordingStartTs = Number(records?.header_records?.starttime);
  let simulatedText = '';
  let selectionStart = 0;
  let selectionEnd = 0;
  let selectionAnchor = 0;
  let selectionFocus = 0;
  let keyIndex = 0;
  let sawExplicitNavigation = false;
  let lastActivityTs = Number.isFinite(recordingStartTs) ? recordingStartTs : null;
  let shiftActive = false;
  let controlActive = false;
  let metaActive = false;
  const pauseThresholdSeconds = getCurrentLinearPauseThreshold();

  for (let i = 0; i < textEntries.length; i++) {
    const ts = textEntries[i].ts;
    const targetText = String(textEntries[i].value ?? '');

    while (keyIndex < keyEntries.length && keyEntries[keyIndex].ts < ts) {
      const keyTs = keyEntries[keyIndex].ts;
      const raw = String(keyEntries[keyIndex].value || '');
      if (raw === 'keydown: Shift') {
        shiftActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Shift') {
        shiftActive = false;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keydown: Control') {
        controlActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Control') {
        controlActive = false;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keydown: Meta') {
        metaActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Meta') {
        metaActive = false;
        keyIndex += 1;
        continue;
      }

      const partsBeforePause = traceParts.length;
      appendPauseToken(traceParts, lastActivityTs, keyTs, pauseThresholdSeconds);
      const navPartStart = traceParts.length;
      const nextState = appendLinearNavigationEventFast(
        traceParts,
        keyEntries,
        keyIndex,
        cursorIndex.byTs,
        simulatedText,
        { start: selectionStart, end: selectionEnd, anchor: selectionAnchor, focus: selectionFocus },
        { shift: shiftActive, ctrl: controlActive, meta: metaActive }
      );
      if (nextState) {
        selectionStart = nextState.start;
        selectionEnd = nextState.end;
        selectionAnchor = nextState.anchor;
        selectionFocus = nextState.focus;
        if (nextState.navigated) sawExplicitNavigation = true;
        lastActivityTs = nextState.activityTs || keyTs;
        const consumed = Math.max(1, Number(nextState.consumed) || 1);
        const sourceTs = [];
        for (let k = keyIndex; k < Math.min(keyEntries.length, keyIndex + consumed); k++) {
          sourceTs.push(keyEntries[k].ts);
        }
        appendWritingScoreTraceRow(tokenRows, 'key', sourceTs, traceParts.slice(navPartStart));
        keyIndex += consumed;
        continue;
      }
      traceParts.length = partsBeforePause;
      keyIndex += 1;
    }

    const cursorBefore = getCursorStateBeforeFast(cursorTracker, ts);
    if (cursorBefore && sawExplicitNavigation) {
      appendNavigationResolutionTokens(traceParts, selectionStart, selectionEnd, cursorBefore.start, cursorBefore.end);
      selectionStart = cursorBefore.start;
      selectionEnd = cursorBefore.end;
      selectionAnchor = cursorBefore.start;
      selectionFocus = cursorBefore.end;
    }

    const diffInfo = refineTextChangeDiffForSelection(
      simulatedText,
      targetText,
      getTextChangeDiff(simulatedText, targetText),
      selectionStart,
      selectionEnd
    );

    const alignedSelection = alignSelectionForTextDiff(traceParts, diffInfo, selectionStart, selectionEnd);
    selectionStart = alignedSelection.start;
    selectionEnd = alignedSelection.end;

    appendPauseToken(traceParts, lastActivityTs, ts, pauseThresholdSeconds);
    const textPartStart = traceParts.length;
    appendTextDiffTokens(traceParts, diffInfo, selectionStart, selectionEnd);
    const textTokens = traceParts.slice(textPartStart);
    appendWritingScoreTraceRow(tokenRows, 'text', [ts], textTokens);

    simulatedText = targetText;
    selectionStart = diffInfo.start + diffInfo.inserted.length;
    selectionEnd = selectionStart;
    selectionAnchor = selectionStart;
    selectionFocus = selectionStart;
    const cursorAtTextTs = cursorIndex.byTs.get(ts) || null;
    if (cursorAtTextTs && (selectionStart !== cursorAtTextTs.start || selectionEnd !== cursorAtTextTs.end)) {
      const navPartStart = traceParts.length;
      appendNavigationResolutionTokens(traceParts, selectionStart, selectionEnd, cursorAtTextTs.start, cursorAtTextTs.end);
      appendWritingScoreTraceRow(tokenRows, 'text-cursor', [ts], traceParts.slice(navPartStart));
      selectionStart = cursorAtTextTs.start;
      selectionEnd = cursorAtTextTs.end;
      selectionAnchor = cursorAtTextTs.start;
      selectionFocus = cursorAtTextTs.end;
    }

    sawExplicitNavigation = false;
    lastActivityTs = ts;
  }

  return groupWritingScoreTraceRows(tokenRows).filter((row) => row.source_kind === 'text');
}

function getWritingScoreGroupedTextRows(records) {
  if (
    typeof buildFastSortedRecordEntries === 'function' &&
    typeof buildFastCursorIndex === 'function' &&
    typeof createCursorBeforeTracker === 'function' &&
    typeof getCursorStateBeforeFast === 'function' &&
    typeof appendLinearNavigationEventFast === 'function'
  ) {
    return getWritingScoreGroupedTextRowsFast(records);
  }

  return getWritingScoreGroupedTextRowsSlow(records);
}

function refreshWritingScoreIfVisible() {
  if (!writingScoreVisible) return;
  showWritingScore();
}

function validateLinearRepresentation(records) {
  const linearRaw = recordsToLinearRepresentation(records);
  const linearCanonical = canonicalizeLinearRepresentation(linearRaw);
  const reconstructed = reconstructTextFromLinearRepresentation(linearRaw);
  const synthetic = linearRepresentationToSyntheticRecords(linearRaw, Number(records.header_records?.starttime) || 0);
  const roundTripLinearRaw = recordsToLinearRepresentation(synthetic);
  const roundTripLinearCanonical = canonicalizeLinearRepresentation(roundTripLinearRaw);
  const finalTextEntries = getSortedRecordEntries(records.text_records);
  const finalExpected = finalTextEntries.length ? String(finalTextEntries[finalTextEntries.length - 1].value ?? '') : '';

  return {
    final_text_matches: reconstructed.final_text === finalExpected,
    roundtrip_linear_matches: linearCanonical === roundTripLinearCanonical,
    original_linear: linearRaw,
    roundtrip_linear: roundTripLinearRaw,
    original_linear_canonical: linearCanonical,
    roundtrip_linear_canonical: roundTripLinearCanonical,
    original_linear_raw: linearRaw,
    roundtrip_linear_raw: roundTripLinearRaw,
    expected_final_text: finalExpected,
    reconstructed_final_text: reconstructed.final_text
  };
}

function getCurrentLinearPauseThreshold() {
  const pauseValue = Number(document?.getElementById?.('playbackWritingScorePauseCrit')?.value);
  return Number.isFinite(pauseValue) ? Math.max(0, pauseValue) : 0.3;
}

function formatLinearPauseToken(seconds) {
  const rounded = Math.max(0, Math.round(Number(seconds || 0) * 1000) / 1000);
  const text = rounded.toFixed(3).replace(/\.?0+$/, '');
  return `<${text}>`;
}

function appendPauseToken(parts, previousTs, nextTs, thresholdSeconds) {
  if (!Number.isFinite(previousTs) || !Number.isFinite(nextTs)) return;
  const pauseMs = nextTs - previousTs;
  if (pauseMs <= 0) return;
  const pauseSeconds = pauseMs / 1000;
  if (pauseSeconds < thresholdSeconds) return;
  parts.push(formatLinearPauseToken(pauseSeconds));
}

function getCurrentRecordSet() {
  return {
    header_records: header_record,
    text_records: text_record,
    key_records: key_record,
    cursor_records: cursor_record,
    window_records: window_record
  };
}

function serializeInspectMetrics(summary) {
  const lines = ['<inspect-metrics>'];
  lines.push(`basis_used\t${summary.options.basis_used}`);
  lines.push(`interval_count\t${summary.options.intervals}`);
  lines.push(`pause_threshold_s\t${summary.options.pause_threshold_s.toFixed(3)}`);
  lines.push(`recording_time_s\t${summary.options.recording_time_s.toFixed(3)}`);
  lines.push(`typing_time_s\t${summary.options.typing_time_s.toFixed(3)}`);
  lines.push('overall');
  lines.push('speed_chars_per_min\tword_count_total\tdeletions_total\tinsertions_total\treplacements_total\tpause_time_total_s\tpause_count_total');
  lines.push([
    summary.overall.speed_chars_per_min.toFixed(3),
    summary.overall.word_count_total,
    summary.overall.deletions_total,
    summary.overall.insertions_total,
    summary.overall.replacements_total,
    summary.overall.pause_time_total_s.toFixed(3),
    summary.overall.pause_count_total
  ].join('\t'));
  if (summary.has_window_records) {
    lines.push('window_overall');
    lines.push('has_window_records\tdwell_writing_s\tdwell_task_s\tdwell_upper_s\tdwell_lower_s\twriting_to_task\twriting_to_upper\twriting_to_lower\ttask_to_writing\tupper_to_writing\tlower_to_writing\tupper_to_lower\tlower_to_upper');
    lines.push([
      summary.overall.window.has_records,
      summary.overall.window.dwell_writing_s.toFixed(3),
      summary.overall.window.dwell_task_s.toFixed(3),
      summary.overall.window.dwell_upper_s.toFixed(3),
      summary.overall.window.dwell_lower_s.toFixed(3),
      summary.overall.window.writing_to_task,
      summary.overall.window.writing_to_upper,
      summary.overall.window.writing_to_lower,
      summary.overall.window.task_to_writing,
      summary.overall.window.upper_to_writing,
      summary.overall.window.lower_to_writing,
      summary.overall.window.upper_to_lower,
      summary.overall.window.lower_to_upper
    ].join('\t'));
  }
  lines.push('intervals');
  lines.push('interval\tstart_s\tend_s\tspeed_chars_per_min\tword_count_total\tword_count_interval\tdeletions_total\tdeletions_interval\tinsertions_total\tinsertions_interval\treplacements_total\treplacements_interval\tpause_time_total_s\tpause_time_interval_s\tpause_count_total\tpause_count_interval');

  for (let i = 0; i < summary.intervals.length; i++) {
    const row = summary.intervals[i];
    lines.push([
      row.interval,
      row.start_s.toFixed(3),
      row.end_s.toFixed(3),
      row.speed_chars_per_min.toFixed(3),
      row.word_count_total,
      row.word_count_interval,
      row.deletions_total,
      row.deletions_interval,
      row.insertions_total,
      row.insertions_interval,
      row.replacements_total,
      row.replacements_interval,
      row.pause_time_total_s.toFixed(3),
      row.pause_time_interval_s.toFixed(3),
      row.pause_count_total,
      row.pause_count_interval
    ].join('\t'));
  }
  if (summary.has_window_records) {
    lines.push('window_intervals');
    lines.push('interval\thas_window_records\tdwell_writing_total_s\tdwell_writing_interval_s\tdwell_task_total_s\tdwell_task_interval_s\tdwell_upper_total_s\tdwell_upper_interval_s\tdwell_lower_total_s\tdwell_lower_interval_s\twriting_to_task_total\twriting_to_task_interval\twriting_to_upper_total\twriting_to_upper_interval\twriting_to_lower_total\twriting_to_lower_interval\ttask_to_writing_total\ttask_to_writing_interval\tupper_to_writing_total\tupper_to_writing_interval\tlower_to_writing_total\tlower_to_writing_interval\tupper_to_lower_total\tupper_to_lower_interval\tlower_to_upper_total\tlower_to_upper_interval');
    for (let i = 0; i < summary.intervals.length; i++) {
      const row = summary.intervals[i];
      lines.push([
        row.interval,
        row.window.has_records,
        row.window_total.dwell_writing_s.toFixed(3),
        row.window.dwell_writing_s.toFixed(3),
        row.window_total.dwell_task_s.toFixed(3),
        row.window.dwell_task_s.toFixed(3),
        row.window_total.dwell_upper_s.toFixed(3),
        row.window.dwell_upper_s.toFixed(3),
        row.window_total.dwell_lower_s.toFixed(3),
        row.window.dwell_lower_s.toFixed(3),
        row.window_total.writing_to_task,
        row.window.writing_to_task,
        row.window_total.writing_to_upper,
        row.window.writing_to_upper,
        row.window_total.writing_to_lower,
        row.window.writing_to_lower,
        row.window_total.task_to_writing,
        row.window.task_to_writing,
        row.window_total.upper_to_writing,
        row.window.upper_to_writing,
        row.window_total.lower_to_writing,
        row.window.lower_to_writing,
        row.window_total.upper_to_lower,
        row.window.upper_to_lower,
        row.window_total.lower_to_upper,
        row.window.lower_to_upper
      ].join('\t'));
    }
  }

  lines.push('</inspect-metrics>');
  return lines.join('\n') + '\n';
}

function buildWritingScoreFromRecords(records) {
  const normalized = normalizeInspectMetricRecords(records);
  const startTime = Number(normalized.header_records?.starttime) || 0;
  const textEntries = getSortedRecordEntries(normalized.text_records);
  const operations = [];
  const events = [];
  let previousText = '';
  let expectedPos = 0;

  for (let i = 0; i < textEntries.length; i++) {
    const ts = textEntries[i].ts;
    const currentText = String(textEntries[i].value ?? '');
    const built = getWritingScoreOps(previousText, currentText, ts, startTime, expectedPos);
    const ops = built.operations;
    expectedPos = built.next_expected_pos;
    events.push({
      ts,
      time_s: (ts - startTime) / 1000,
      operation_count: ops.length
    });
    for (let j = 0; j < ops.length; j++) {
      operations.push(ops[j]);
    }
    previousText = currentText;
  }

  return {
    starttime: startTime,
    operations,
    events
  };
}

function getWritingScoreOps(previousText, currentText, ts, startTime, initialExpectedPos = 0) {
  const diff = myDmp.diff_main(previousText || '', currentText || '');
  myDmp.diff_cleanupSemantic(diff);

  let pos = 0;
  const ops = [];
  let expectedPos = initialExpectedPos;

  for (let i = 0; i < diff.length; i++) {
    const op = diff[i][0];
    const chunk = diff[i][1] || '';

    if (op === DIFF_EQUAL) {
      pos += chunk.length;
      continue;
    }

    if (op === DIFF_DELETE) {
      const actualPos = pos === expectedPos ? null : pos;
      const resolvedPos = actualPos === null ? expectedPos : actualPos;
      ops.push({
        ts,
        time_s: (ts - startTime) / 1000,
        type: 'delete',
        expected_pos: expectedPos,
        actual_pos: actualPos,
        count: chunk.length
      });
      expectedPos = resolvedPos;
      continue;
    }

    if (op === DIFF_INSERT) {
      const actualPos = pos === expectedPos ? null : pos;
      const resolvedPos = actualPos === null ? expectedPos : actualPos;
      ops.push({
        ts,
        time_s: (ts - startTime) / 1000,
        type: 'insert',
        expected_pos: expectedPos,
        actual_pos: actualPos,
        text: chunk
      });
      expectedPos = resolvedPos + chunk.length;
      pos += chunk.length;
    }
  }

  return {
    operations: ops,
    next_expected_pos: expectedPos
  };
}

function getWritingScoreOperationPosition(op) {
  const expected = Number(op.expected_pos);
  const actual = op.actual_pos === null || op.actual_pos === '' || op.actual_pos === undefined
    ? null
    : Number(op.actual_pos);
  if (Number.isFinite(actual)) return actual;
  return Number.isFinite(expected) ? expected : 0;
}

function applyWritingScoreOperation(text, op) {
  const safePos = Math.max(0, Math.min(getWritingScoreOperationPosition(op), text.length));
  if (op.type === 'insert') {
    return text.slice(0, safePos) + op.text + text.slice(safePos);
  }
  if (op.type === 'delete') {
    return text.slice(0, safePos) + text.slice(safePos + op.count);
  }
  return text;
}

function reconstructTextFromWritingScore(score) {
  let text = '';
  const states = [];

  for (let i = 0; i < score.operations.length; i++) {
    const op = score.operations[i];
    text = applyWritingScoreOperation(text, op);
    states.push({
      ts: op.ts,
      text
    });
  }

  return {
    final_text: text,
    states
  };
}

function parseWritingScore(serializedScore) {
  const lines = String(serializedScore || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const operations = [];
  let inside = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '<writing-score>') {
      inside = true;
      continue;
    }
    if (line === '</writing-score>') break;
    if (!inside || line === 'time_s\top\texpected_pos\tactual_pos\targ') continue;

    const parts = line.split('\t');
    if (parts.length !== 5) continue;

    const timeS = Number(parts[0]);
    const typeCode = parts[1];
    const expectedPos = Number(parts[2]);
    const actualPos = parts[3] === '' ? null : Number(parts[3]);
    const arg = parts[4];

    if (!Number.isFinite(timeS) || !Number.isFinite(expectedPos)) continue;

    if (typeCode === 'I') {
      operations.push({
        ts: null,
        time_s: timeS,
        type: 'insert',
        expected_pos: expectedPos,
        actual_pos: Number.isFinite(actualPos) ? actualPos : null,
        text: JSON.parse(arg)
      });
    } else if (typeCode === 'D') {
      operations.push({
        ts: null,
        time_s: timeS,
        type: 'delete',
        expected_pos: expectedPos,
        actual_pos: Number.isFinite(actualPos) ? actualPos : null,
        count: Number(arg)
      });
    }
  }

  return {
    starttime: 0,
    operations,
    events: []
  };
}

function validateWritingScore(score, records) {
  const normalized = normalizeInspectMetricRecords(records);
  const textEntries = getSortedRecordEntries(normalized.text_records);
  const reconstruction = reconstructTextFromWritingScore(score);
  const byTs = new Map();
  let currentText = '';

  for (let i = 0; i < score.operations.length; i++) {
    currentText = applyWritingScoreOperation(currentText, score.operations[i]);
    byTs.set(score.operations[i].ts, currentText);
  }

  const mismatches = [];
  for (let i = 0; i < textEntries.length; i++) {
    const ts = textEntries[i].ts;
    const expected = String(textEntries[i].value ?? '');
    const actual = byTs.has(ts) ? byTs.get(ts) : '';
    if (actual !== expected) {
      mismatches.push({
        ts,
        time_s: score.starttime ? (ts - score.starttime) / 1000 : 0,
        expected,
        actual
      });
    }
  }

  const finalExpected = textEntries.length ? String(textEntries[textEntries.length - 1].value ?? '') : '';

  return {
    event_count: textEntries.length,
    operation_count: score.operations.length,
    matches_all: mismatches.length === 0,
    mismatches,
    final_text_matches: reconstruction.final_text === finalExpected,
    reconstructed_final_text: reconstruction.final_text
  };
}

function recordsToLinearRepresentation(records, options = {}) {
  const normalized = {
    text_records: records?.text_records || {},
    cursor_records: records?.cursor_records || {},
    key_records: records?.key_records || {}
  };
  const textEntries = getSortedRecordEntries(normalized.text_records);
  const keyEntries = getSortedRecordEntries(normalized.key_records);
  const parts = [];
  const recordingStartTs = Number(records?.header_records?.starttime);
  const recordingEndTs = Number(records?.header_records?.endtime);
  let simulatedText = '';
  let selectionStart = 0;
  let selectionEnd = 0;
  let selectionAnchor = 0;
  let selectionFocus = 0;
  let keyIndex = 0;
  let sawExplicitNavigation = false;
  let lastActivityTs = Number.isFinite(recordingStartTs) ? recordingStartTs : null;
  let shiftActive = false;
  let controlActive = false;
  let metaActive = false;
  const optionThreshold = Number(options.pauseThresholdSeconds);
  const pauseThresholdSeconds = Number.isFinite(optionThreshold)
    ? Math.max(0, optionThreshold)
    : getCurrentLinearPauseThreshold();

  for (let i = 0; i < textEntries.length; i++) {
    const ts = textEntries[i].ts;
    const targetText = String(textEntries[i].value ?? '');

    while (keyIndex < keyEntries.length && keyEntries[keyIndex].ts < ts) {
      const keyTs = keyEntries[keyIndex].ts;
      const raw = String(keyEntries[keyIndex].value || '');
      if (raw === 'keydown: Shift') {
        shiftActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Shift') {
        shiftActive = false;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keydown: Control') {
        controlActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Control') {
        controlActive = false;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keydown: Meta') {
        metaActive = true;
        keyIndex += 1;
        continue;
      }
      if (raw === 'keyup: Meta') {
        metaActive = false;
        keyIndex += 1;
        continue;
      }
      const partsBeforePause = parts.length;
      appendPauseToken(parts, lastActivityTs, keyTs, pauseThresholdSeconds);
      const nextState = appendLinearNavigationEvent(
        parts,
        keyEntries,
        keyIndex,
        normalized.cursor_records,
        simulatedText,
        { start: selectionStart, end: selectionEnd, anchor: selectionAnchor, focus: selectionFocus },
        { shift: shiftActive, ctrl: controlActive, meta: metaActive }
      );
      if (nextState) {
        selectionStart = nextState.start;
        selectionEnd = nextState.end;
        selectionAnchor = nextState.anchor;
        selectionFocus = nextState.focus;
        if (nextState.navigated) sawExplicitNavigation = true;
        lastActivityTs = nextState.activityTs || keyTs;
        keyIndex += Math.max(1, Number(nextState.consumed) || 1);
        continue;
      } else {
        parts.length = partsBeforePause;
      }
      keyIndex += 1;
    }

    const cursorBefore = getCursorStateBefore(normalized.cursor_records, ts);

    if (cursorBefore && sawExplicitNavigation) {
      appendNavigationResolutionTokens(parts, selectionStart, selectionEnd, cursorBefore.start, cursorBefore.end);
      selectionStart = cursorBefore.start;
      selectionEnd = cursorBefore.end;
      selectionAnchor = cursorBefore.start;
      selectionFocus = cursorBefore.end;
    }

    const diffInfo = refineTextChangeDiffForSelection(
      simulatedText,
      targetText,
      getTextChangeDiff(simulatedText, targetText),
      selectionStart,
      selectionEnd
    );

    const alignedSelection = alignSelectionForTextDiff(parts, diffInfo, selectionStart, selectionEnd);
    selectionStart = alignedSelection.start;
    selectionEnd = alignedSelection.end;
    appendPauseToken(parts, lastActivityTs, ts, pauseThresholdSeconds);
    appendTextDiffTokens(parts, diffInfo, selectionStart, selectionEnd);

    simulatedText = targetText;
    selectionStart = diffInfo.start + diffInfo.inserted.length;
    selectionEnd = selectionStart;
    selectionAnchor = selectionStart;
    selectionFocus = selectionStart;
    const cursorAtTextTs = parseCursorRecord(normalized.cursor_records[String(ts)] ?? normalized.cursor_records[ts]);
    if (cursorAtTextTs && (selectionStart !== cursorAtTextTs.start || selectionEnd !== cursorAtTextTs.end)) {
      appendNavigationResolutionTokens(parts, selectionStart, selectionEnd, cursorAtTextTs.start, cursorAtTextTs.end);
      selectionStart = cursorAtTextTs.start;
      selectionEnd = cursorAtTextTs.end;
      selectionAnchor = cursorAtTextTs.start;
      selectionFocus = cursorAtTextTs.end;
    }
    sawExplicitNavigation = false;
    lastActivityTs = ts;
  }

  while (keyIndex < keyEntries.length) {
    const keyTs = keyEntries[keyIndex].ts;
    const raw = String(keyEntries[keyIndex].value || '');
    if (raw === 'keydown: Shift') {
      shiftActive = true;
      keyIndex += 1;
      continue;
    }
    if (raw === 'keyup: Shift') {
      shiftActive = false;
      keyIndex += 1;
      continue;
    }
    if (raw === 'keydown: Control') {
      controlActive = true;
      keyIndex += 1;
      continue;
    }
    if (raw === 'keyup: Control') {
      controlActive = false;
      keyIndex += 1;
      continue;
    }
    if (raw === 'keydown: Meta') {
      metaActive = true;
      keyIndex += 1;
      continue;
    }
    if (raw === 'keyup: Meta') {
      metaActive = false;
      keyIndex += 1;
      continue;
    }
    const partsBeforePause = parts.length;
    appendPauseToken(parts, lastActivityTs, keyTs, pauseThresholdSeconds);
    const nextState = appendLinearNavigationEvent(
      parts,
      keyEntries,
      keyIndex,
      normalized.cursor_records,
      simulatedText,
      { start: selectionStart, end: selectionEnd, anchor: selectionAnchor, focus: selectionFocus },
      { shift: shiftActive, ctrl: controlActive, meta: metaActive }
    );
    if (nextState) {
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
       selectionAnchor = nextState.anchor;
       selectionFocus = nextState.focus;
      lastActivityTs = nextState.activityTs || keyTs;
      keyIndex += Math.max(1, Number(nextState.consumed) || 1);
      continue;
    } else {
      parts.length = partsBeforePause;
    }
    keyIndex += 1;
  }

  if (parts.length > 0 && Number.isFinite(recordingEndTs)) {
    appendPauseToken(parts, lastActivityTs, recordingEndTs, pauseThresholdSeconds);
  }

  return finalizeLinearParts(parts);
}

function encodeLinearKeyToken(keyName) {
  if (keyName === 'Enter') return '<ENTER>';
  if (keyName === '<') return '<LT>';
  if (keyName === '>') return '<GT>';
  if (keyName.length === 1) return keyName;
  return `<KEY:${keyName}>`;
}

function encodeLinearText(text) {
  let out = '';
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n') out += '<ENTER>';
    else if (ch === '<') out += '<LT>';
    else if (ch === '>') out += '<GT>';
    else out += ch;
  }
  return out;
}

function makeLinearCountToken(command, count) {
  const n = Math.max(1, Number(count) || 1);
  return n === 1 ? `<${command}>` : `<${command}${n}>`;
}

function makeLinearUndoRedoToken(command, count, saturated) {
  if (saturated) return `<${command}*>`;
  return makeLinearCountToken(command, count);
}

function isControlModifierKeyName(keyName) {
  const name = String(keyName || '').trim();
  return name === 'Control' || name === 'Meta';
}

function getLinearChordToken(keyName, modifiers, currentState) {
  const hasModifier = !!(modifiers && (modifiers.ctrl || modifiers.meta));
  if (!hasModifier) return null;
  const lower = String(keyName || '').trim().toLowerCase();
  const hasSelection = Number(currentState?.start) !== Number(currentState?.end);

  if (lower === 'c') return hasSelection ? '<COPY>' : null;
  if (lower === 'x') return hasSelection ? '<CUT>' : null;
  if (lower === 'v') return '<PASTE>';
  if (lower === 'z') return '<UNDO>';
  if (lower === 'y') return '<REDO>';
  if (lower === 'a') return '<SELECTALL>';
  return null;
}


function findNavigationRunEnd(keyEntries, keyIndex, keyName) {
  let endIndex = keyIndex;

  for (let i = keyIndex + 1; i < keyEntries.length; i++) {
    const raw = String(keyEntries[i]?.value || '');
    if (raw === `repeat: ${keyName}`) {
      endIndex = i;
      continue;
    }
    if (raw === `keyup: ${keyName}`) {
      return { endIndex: i, keyupIndex: i };
    }
    break;
  }

  return { endIndex, keyupIndex: -1 };
}

function makeCollapsedSelectionState(pos) {
  const value = Math.max(0, Number(pos) || 0);
  return {
    start: value,
    end: value,
    anchor: value,
    focus: value
  };
}

function makeSelectionStateFromAnchorFocus(anchor, focus) {
  const a = Math.max(0, Number(anchor) || 0);
  const f = Math.max(0, Number(focus) || 0);
  return {
    start: Math.min(a, f),
    end: Math.max(a, f),
    anchor: a,
    focus: f
  };
}

function makeSelectionStateFromRange(start, end, preferFocus) {
  const s = Math.max(0, Number(start) || 0);
  const e = Math.max(0, Number(end) || 0);
  if (s === e) return makeCollapsedSelectionState(s);
  if (preferFocus === 'start') return makeSelectionStateFromAnchorFocus(e, s);
  return makeSelectionStateFromAnchorFocus(s, e);
}

function applyShiftNavigationKeyToSelection(keyName, currentText, anchor, focus, count = 1) {
  const textLength = String(currentText || '').length;
  const n = Math.max(1, Number(count) || 1);
  const baseAnchor = Math.max(0, Number(anchor) || 0);
  const baseFocus = Math.max(0, Number(focus) || 0);

  if (keyName === 'ArrowLeft') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, Math.max(0, baseFocus - n));
  }
  if (keyName === 'ArrowRight') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, Math.min(textLength, baseFocus + n));
  }
  if (keyName === 'Home') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, 0);
  }
  if (keyName === 'End') {
    return makeSelectionStateFromAnchorFocus(baseAnchor, textLength);
  }

  return makeSelectionStateFromAnchorFocus(baseAnchor, baseFocus);
}

function normalizeLinearParts(parts) {
  const normalized = [];

  for (let i = 0; i < parts.length; i++) {
    const token = parts[i];
    const prev = normalized.length ? normalized[normalized.length - 1] : null;
    const tokenMatch = /^<(DEL|FDEL|LEFT|RIGHT|UP|DOWN|SLEFT|SRIGHT|SUP|SDOWN|UNDO|REDO)(\d+)?>$/.exec(token);
    const prevMatch = prev ? /^<(DEL|FDEL|LEFT|RIGHT|UP|DOWN|SLEFT|SRIGHT|SUP|SDOWN|UNDO|REDO)(\d+)?>$/.exec(prev) : null;

    if (tokenMatch && prevMatch && tokenMatch[1] === prevMatch[1]) {
      const prevCount = prevMatch[2] ? Number(prevMatch[2]) : 1;
      const tokenCount = tokenMatch[2] ? Number(tokenMatch[2]) : 1;
      normalized[normalized.length - 1] = makeLinearCountToken(tokenMatch[1], prevCount + tokenCount);
      continue;
    }

    normalized.push(token);
  }

  return normalized;
}

function isUndoRedoEffectAction(action) {
  if (!action || typeof action !== 'object') return false;
  if (action.type === 'char' || action.type === 'literal-token') return true;
  if (action.type !== 'command') return false;
  return action.command === 'DEL' || action.command === 'FDEL' || action.command === 'BDEL' || action.command === 'CDEL';
}

function isUndoRedoCursorResolutionAction(action) {
  if (!action || action.type !== 'command') return false;
  return action.command === 'NAV' || action.command === 'CLICK' || action.command === 'SEL';
}

function estimateUndoRedoEffectUnits(actions) {
  const source = Array.isArray(actions) ? actions : [];
  let total = 0;

  for (let i = 0; i < source.length; i++) {
    const action = source[i];
    if (!action) continue;
    if (action.type === 'char') {
      total += 1;
      continue;
    }
    if (action.type === 'literal-token') {
      total += Math.max(1, String(action.value || '').length);
      continue;
    }
    if (action.type !== 'command') continue;
    if (action.command === 'DEL' || action.command === 'FDEL') {
      total += Math.max(1, Number(action.count) || 1);
      continue;
    }
    if (action.command === 'BDEL' || action.command === 'CDEL') {
      total += 1;
    }
  }

  return total;
}

function sameLinearAction(a, b) {
  if (!a || !b) return false;
  return serializeLinearActions([a]) === serializeLinearActions([b]);
}

function parseTrailingUndoRedoUnit(actions, startIndex) {
  const source = Array.isArray(actions) ? actions : [];
  let i = startIndex;
  const effects = [];
  if (!isUndoRedoEffectAction(source[i])) return null;

  // Keep tie reordering local: only a short contiguous effect segment
  // directly adjacent to UNDO/REDO (optionally with one cursor resolution).
  while (i < source.length && isUndoRedoEffectAction(source[i]) && effects.length < 2) {
    effects.push(source[i]);
    i += 1;
  }
  if (!effects.length) return null;
  if (i < source.length && isUndoRedoEffectAction(source[i])) return null;
  if (effects.length !== 1) return null;

  let cursorResolution = null;
  if (i < source.length && isUndoRedoCursorResolutionAction(source[i])) {
    cursorResolution = source[i];
    i += 1;
  }
  if (!cursorResolution) return null;

  const tail = source[i];
  if (!tail || tail.type !== 'command' || (tail.command !== 'UNDO' && tail.command !== 'REDO')) return null;
  const count = Math.max(1, Number(tail.count) || 1);
  // Only reorder strict tie-like units. Large undo/redo bursts must keep
  // original temporal position even if pause tokens are filtered out.
  if (count !== 1 || tail.saturated) return null;

  return {
    endIndex: i + 1,
    command: tail.command,
    count,
    effects,
    cursorResolution
  };
}

function parseLeadingUndoRedoUnit(actions, startIndex) {
  const source = Array.isArray(actions) ? actions : [];
  const head = source[startIndex];
  if (!head || head.type !== 'command' || (head.command !== 'UNDO' && head.command !== 'REDO')) return null;

  const command = head.command;
  const count = Math.max(1, Number(head.count) || 1);
  let i = startIndex + 1;
  const effects = [];

  while (i < source.length && isUndoRedoEffectAction(source[i])) {
    effects.push(source[i]);
    i += 1;
  }

  let cursorResolution = null;
  if (i < source.length && isUndoRedoCursorResolutionAction(source[i])) {
    cursorResolution = source[i];
    i += 1;
  }

  return {
    endIndex: i,
    command,
    count,
    effects,
    cursorResolution
  };
}

function normalizeUndoRedoEffectBursts(actions) {
  const source = Array.isArray(actions) ? actions : [];
  const normalized = [];

  for (let i = 0; i < source.length; i++) {
    const action = source[i];
    if (
      action &&
      action.type === 'command' &&
      (action.command === 'UNDO' || action.command === 'REDO')
    ) {
      const leadingUnit = parseLeadingUndoRedoUnit(source, i);
      const commandName = leadingUnit.command;
      let count = leadingUnit.count;
      const payload = [...leadingUnit.effects];
      let endIndex = leadingUnit.endIndex;

      if (leadingUnit.cursorResolution) {
        payload.push(leadingUnit.cursorResolution);
        let j = leadingUnit.endIndex;
        while (j < source.length) {
          const betweenPauses = [];
          let k = j;
          while (k < source.length && source[k] && source[k].type === 'command' && source[k].command === 'PAUSE') {
            betweenPauses.push(source[k]);
            k += 1;
          }
          const nextUnit = parseLeadingUndoRedoUnit(source, k);
          if (!nextUnit) break;
          if (nextUnit.command !== commandName) break;
          if (!nextUnit.cursorResolution) break;

          count += nextUnit.count;
          payload.push(...betweenPauses);
          payload.push(...nextUnit.effects);
          payload.push(nextUnit.cursorResolution);
          j = nextUnit.endIndex;
        }
        endIndex = j;
      } else {
        let j = leadingUnit.endIndex;
        while (j < source.length) {
          const nextUnit = parseLeadingUndoRedoUnit(source, j);
          if (!nextUnit) break;
          if (nextUnit.command !== commandName) break;
          if (nextUnit.cursorResolution) break;
          count += nextUnit.count;
          payload.push(...nextUnit.effects);
          j = nextUnit.endIndex;
        }
        endIndex = j;
      }

      normalized.push({ type: 'command', command: commandName, count });
      const headIndex = normalized.length - 1;
      normalized.push(...payload);
      const effectUnits = estimateUndoRedoEffectUnits(payload);
      if (count >= 20 && count - effectUnits >= 3) {
        normalized[headIndex] = { ...normalized[headIndex], saturated: true };
      }
      i = endIndex - 1;
      continue;
    }

    const trailingUnit = parseTrailingUndoRedoUnit(source, i);
    if (trailingUnit) {
      const commandName = trailingUnit.command;
      let count = trailingUnit.count;
      const payload = [...trailingUnit.effects];
      const cursorResolution = trailingUnit.cursorResolution;
      let endIndex = trailingUnit.endIndex;

      if (cursorResolution) {
        if (cursorResolution) payload.push(cursorResolution);
        let j = trailingUnit.endIndex;
        while (j < source.length) {
          const betweenPauses = [];
          let k = j;
          while (k < source.length && source[k] && source[k].type === 'command' && source[k].command === 'PAUSE') {
            betweenPauses.push(source[k]);
            k += 1;
          }
          const nextUnit = parseTrailingUndoRedoUnit(source, k);
          if (!nextUnit) break;
          if (nextUnit.command !== commandName) break;
          if (!nextUnit.cursorResolution) break;

          count += nextUnit.count;
          payload.push(...betweenPauses);
          payload.push(...nextUnit.effects);
          payload.push(nextUnit.cursorResolution);
          j = nextUnit.endIndex;
        }
        endIndex = j;
      } else {
        let j = trailingUnit.endIndex;
        while (j < source.length) {
          const nextUnit = parseTrailingUndoRedoUnit(source, j);
          if (!nextUnit) break;
          if (nextUnit.command !== commandName) break;
          if (nextUnit.cursorResolution) break;
          count += nextUnit.count;
          payload.push(...nextUnit.effects);
          j = nextUnit.endIndex;
        }
        endIndex = j;
      }

      normalized.push({ type: 'command', command: commandName, count });
      const headIndex = normalized.length - 1;
      normalized.push(...payload);
      const effectUnits = estimateUndoRedoEffectUnits(payload);
      if (count >= 20 && count - effectUnits >= 3) {
        normalized[headIndex] = { ...normalized[headIndex], saturated: true };
      }
      i = endIndex - 1;
      continue;
    }

    normalized.push(action);
  }

  return normalized;
}

function compactCountCommandActions(actions) {
  const source = Array.isArray(actions) ? actions : [];
  const out = [];
  const mergeable = new Set(['DEL', 'FDEL', 'LEFT', 'RIGHT', 'UP', 'DOWN', 'SLEFT', 'SRIGHT', 'SUP', 'SDOWN', 'UNDO', 'REDO']);

  for (let i = 0; i < source.length; i++) {
    const action = source[i];
    const prev = out.length ? out[out.length - 1] : null;
    if (
      action &&
      prev &&
      action.type === 'command' &&
      prev.type === 'command' &&
      action.command === prev.command &&
      mergeable.has(action.command) &&
      !action.saturated &&
      !prev.saturated
    ) {
      const prevCount = Math.max(1, Number(prev.count) || 1);
      const curCount = Math.max(1, Number(action.count) || 1);
      out[out.length - 1] = { ...prev, count: prevCount + curCount };
      continue;
    }
    out.push(action);
  }

  return out;
}

function normalizeRepeatedCommandEffectPairs(actions) {
  const source = Array.isArray(actions) ? actions : [];
  const out = [];

  for (let i = 0; i < source.length; i++) {
    const head = source[i];
    const next = source[i + 1];
    const isHeadUndoRedo =
      head &&
      head.type === 'command' &&
      (head.command === 'UNDO' || head.command === 'REDO');
    const isEffectDelete =
      next &&
      next.type === 'command' &&
      (next.command === 'DEL' || next.command === 'FDEL');

    if (!isHeadUndoRedo || !isEffectDelete) {
      out.push(head);
      continue;
    }

    const headCommand = head.command;
    const effectCommand = next.command;
    let headCount = Math.max(1, Number(head.count) || 1);
    let effectCount = Math.max(1, Number(next.count) || 1);
    const saturated = !!head.saturated;
    let j = i + 2;

    while (j + 1 < source.length) {
      const h2 = source[j];
      const e2 = source[j + 1];
      const ok =
        h2 &&
        e2 &&
        h2.type === 'command' &&
        e2.type === 'command' &&
        h2.command === headCommand &&
        e2.command === effectCommand &&
        !h2.saturated &&
        !e2.saturated;
      if (!ok) break;
      headCount += Math.max(1, Number(h2.count) || 1);
      effectCount += Math.max(1, Number(e2.count) || 1);
      j += 2;
    }

    out.push({ ...head, count: headCount, saturated });
    out.push({ ...next, count: effectCount });
    i = j - 1;
  }

  return out;
}

function finalizeLinearParts(parts) {
  const compactParts = normalizeLinearParts(parts);
  const compactLinear = compactParts.join('');
  let normalizedActions = parseLinearRepresentation(compactLinear);
  normalizedActions = normalizeUndoRedoEffectBursts(normalizedActions);
  normalizedActions = normalizeUndoRedoEffectBursts(normalizedActions);
  normalizedActions = compactCountCommandActions(normalizedActions);
  normalizedActions = normalizeRepeatedCommandEffectPairs(normalizedActions);
  normalizedActions = compactCountCommandActions(normalizedActions);
  return serializeLinearActions(normalizedActions);
}

function canonicalizeLinearRepresentation(linear) {
  return serializeCanonicalLinearActions(
    stripCanonicalPauses(
      normalizeHorizontalNavigationBursts(
        normalizeBoundaryIntentPairs(
          normalizeSelectionLeadClicks(
            normalizeSelectionDeletes(
              normalizeDeleteEffectClusters(
                normalizeMicroCommandPauses(
                  normalizePauses(
                    normalizeBidirectionalDeleteClusters(parseLinearRepresentation(linear))
                  )
                )
              )
            )
          )
        )
      )
    )
  );
}

function stripCanonicalPauses(actions) {
  return actions.filter((action) => !(action?.type === 'command' && action.command === 'PAUSE'));
}

function normalizePauses(actions) {
  return actions.map((action) => {
    if (action?.type !== 'command' || action.command !== 'PAUSE') return action;
    return {
      ...action,
      seconds: Math.round(Number(action.seconds || 0) * 2) / 2
    };
  });
}

function normalizeMicroCommandPauses(actions) {
  const normalized = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const prev = normalized.length ? normalized[normalized.length - 1] : null;
    const next = actions[i + 1] || null;

    if (
      action?.type === 'command' &&
      action.command === 'PAUSE' &&
      (
        (Number(action.seconds || 0) <= 1.0 &&
          prev?.type === 'command' &&
          prev.command !== 'PAUSE' &&
          next?.type === 'command' &&
          next.command !== 'PAUSE') ||
        (Number(action.seconds || 0) <= 0.5 &&
          isNonTextAction(prev) &&
          isNonTextAction(next))
      )
    ) {
      continue;
    }

    normalized.push(action);
  }

  return normalized;
}

function isNonTextAction(action) {
  return Boolean(action) && action.type !== 'char';
}

function normalizeBoundaryIntentPairs(actions) {
  const normalized = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let j = i + 1;
    while (
      j < actions.length &&
      actions[j]?.type === 'command' &&
      actions[j].command === 'PAUSE'
    ) {
      j += 1;
    }
    const next = actions[j];

    if (
      action?.type === 'command' &&
      action.command === 'RIGHT_TO_END' &&
      next?.type === 'command' &&
      (next.command === 'NAV' || next.command === 'SRIGHT' || next.command === 'SEL')
    ) {
      continue;
    }

    if (
      action?.type === 'command' &&
      action.command === 'LEFT_TO_START' &&
      next?.type === 'command' &&
      (next.command === 'NAV' || next.command === 'SLEFT' || next.command === 'SEL')
    ) {
      continue;
    }

    if (
      action?.type === 'command' &&
      action.command === 'RIGHT' &&
      next?.type === 'command' &&
      next.command === 'RIGHT_TO_END'
    ) {
      normalized.push({ type: 'command', command: 'RIGHT_TO_END' });
      i = j;
      continue;
    }

    if (
      action?.type === 'command' &&
      action.command === 'LEFT' &&
      next?.type === 'command' &&
      next.command === 'LEFT_TO_START'
    ) {
      normalized.push({ type: 'command', command: 'LEFT_TO_START' });
      i = j;
      continue;
    }

    if (
      action?.type === 'command' &&
      (action.command === 'RIGHT' || action.command === 'RIGHT_TO_END' || action.command === 'LEFT' || action.command === 'LEFT_TO_START') &&
      next?.type === 'command' &&
      (next.command === 'NAV' || next.command === 'SRIGHT' || next.command === 'SLEFT' || next.command === 'SEL')
    ) {
      continue;
    }

    normalized.push(action);
  }

  return normalized;
}

function normalizeHorizontalNavigationBursts(actions) {
  const normalized = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (!isHorizontalNavigationAction(action)) {
      normalized.push(action);
      continue;
    }

    const burst = [action];
    let j = i + 1;
    while (j < actions.length) {
      const candidate = actions[j];
      if (
        candidate?.type === 'command' &&
        candidate.command === 'PAUSE' &&
        isHorizontalNavigationAction(actions[j + 1])
      ) {
        j += 1;
        continue;
      }
      if (!isHorizontalNavigationAction(candidate)) break;
      burst.push(candidate);
      j += 1;
    }

    let lastDirection = '';
    for (let k = 0; k < burst.length; k++) {
      const direction =
        (burst[k].command === 'RIGHT' || burst[k].command === 'RIGHT_TO_END')
          ? 'RIGHT'
          : 'LEFT';
      if (direction !== lastDirection) {
        normalized.push({
          type: 'command',
          command: direction === 'RIGHT' ? 'EDGE_RIGHT' : 'EDGE_LEFT'
        });
        lastDirection = direction;
      }
    }

    i = j - 1;
  }

  return normalized;
}

function isHorizontalNavigationAction(action) {
  return (
    action?.type === 'command' &&
    (action.command === 'RIGHT' ||
      action.command === 'RIGHT_TO_END' ||
      action.command === 'LEFT' ||
      action.command === 'LEFT_TO_START')
  );
}

function normalizeSelectionLeadClicks(actions) {
  const normalized = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let j = i + 1;
    while (
      j < actions.length &&
      actions[j]?.type === 'command' &&
      actions[j].command === 'PAUSE'
    ) {
      j += 1;
    }
    const next = j < actions.length ? actions[j] : null;

    if (
      action?.type === 'command' &&
      action.command === 'CLICK' &&
      next?.type === 'command' &&
      next.command === 'SEL'
    ) {
      continue;
    }

    normalized.push(action);
  }

  return normalized;
}

function normalizeSelectionDeletes(actions) {
  const normalized = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const next = actions[i + 1];

    if (
      action?.type === 'command' &&
      action.command === 'SEL' &&
      next?.type === 'command' &&
      (next.command === 'DEL' ||
        next.command === 'FDEL' ||
        next.command === 'BDEL' ||
        next.command === 'CDEL')
    ) {
      normalized.push({ type: 'command', command: 'CDEL' });
      i += 1;
      continue;
    }

    normalized.push(action);
  }

  return normalized;
}

function normalizeBidirectionalDeleteClusters(actions) {
  const normalized = [];
  const state = {
    length: estimateActionTextLength(actions),
    start: 0,
    end: 0
  };

  let i = 0;
  while (i < actions.length) {
    const action = actions[i];
    if (!isDeleteClusterAction(action)) {
      normalized.push(action);
      applyActionToLinearState(state, action);
      i += 1;
      continue;
    }

    let j = i;
    const cluster = [];
    const startState = { length: state.length, start: state.start, end: state.end };
    const working = { length: state.length, start: state.start, end: state.end };

    while (j < actions.length && isDeleteClusterAction(actions[j])) {
      cluster.push(actions[j]);
      applyActionToLinearState(working, actions[j]);
      j += 1;
    }

    const nextAction = j < actions.length ? actions[j] : null;
    const deletedCount = startState.length - working.length;
    const leftCount = startState.start - working.start;
    const rightCount = deletedCount - leftCount;
    const canCollapse =
      nextAction &&
      isInsertionAction(nextAction) &&
      startState.start === startState.end &&
      working.start === working.end &&
      deletedCount > 0 &&
      leftCount > 0 &&
      rightCount > 0;

    if (canCollapse) {
      const bdel = { type: 'command', command: 'BDEL', left: leftCount, right: rightCount };
      normalized.push(bdel);
      applyActionToLinearState(state, bdel);
    } else {
      for (let k = 0; k < cluster.length; k++) {
        normalized.push(cluster[k]);
        applyActionToLinearState(state, cluster[k]);
      }
    }

    i = j;
  }

  return normalized;
}

function normalizeDeleteEffectClusters(actions) {
  const normalized = [];
  const state = {
    length: estimateActionTextLength(actions),
    start: 0,
    end: 0
  };

  let i = 0;
  while (i < actions.length) {
    const clusterEnd = findDeleteEffectClusterEnd(actions, i);
    if (clusterEnd === i) {
      normalized.push(actions[i]);
      applyActionToLinearState(state, actions[i]);
      i += 1;
      continue;
    }

    const startState = { length: state.length, start: state.start, end: state.end };
    const working = { length: state.length, start: state.start, end: state.end };
    let sawDelete = false;

    for (let j = i; j < clusterEnd; j++) {
      if (isDeleteEffectCommand(actions[j])) sawDelete = true;
      applyActionToLinearState(working, actions[j]);
    }

    if (
      sawDelete &&
      startState.start === startState.end &&
      working.start === working.end &&
      working.length <= startState.length
    ) {
      normalized.push({
        type: 'command',
        command: 'CDEL',
        count: startState.length - working.length,
        pos: working.start
      });
      state.length = working.length;
      state.start = working.start;
      state.end = working.end;
      i = clusterEnd;
      continue;
    }

    for (let j = i; j < clusterEnd; j++) {
      normalized.push(actions[j]);
      applyActionToLinearState(state, actions[j]);
    }
    i = clusterEnd;
  }

  return normalized;
}

function findDeleteEffectClusterEnd(actions, startIndex) {
  let j = startIndex;
  let sawDelete = false;

  while (j < actions.length) {
    const action = actions[j];
    if (isDeleteEffectClusterSupportAction(action)) {
      if (isDeleteEffectCommand(action)) sawDelete = true;
      j += 1;
      continue;
    }
    break;
  }

  return sawDelete ? j : startIndex;
}

function estimateActionTextLength(actions) {
  let inserted = 0;
  let maxPos = 0;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action.type === 'char') inserted += String(action.value || '').length;
    else if (action.type === 'literal-token') inserted += String(action.value || '').length;
    if (action.type === 'command') {
      if (action.command === 'SEL') maxPos = Math.max(maxPos, action.start, action.end);
      else if (action.command === 'CLICK' || action.command === 'NAV') maxPos = Math.max(maxPos, action.pos);
    }
  }
  return Math.max(32, maxPos + inserted + 32);
}

function isDeleteClusterAction(action) {
  return action?.type === 'command' && (action.command === 'DEL' || action.command === 'FDEL' || action.command === 'SEL');
}

function isDeleteEffectCommand(action) {
  return action?.type === 'command' && (action.command === 'DEL' || action.command === 'FDEL' || action.command === 'BDEL');
}

function isDeleteEffectClusterSupportAction(action) {
  return action?.type === 'command' && (
    action.command === 'DEL' ||
    action.command === 'FDEL' ||
    action.command === 'BDEL' ||
    action.command === 'SEL' ||
    action.command === 'NAV'
  );
}

function isInsertionAction(action) {
  return action && (action.type === 'char' || action.type === 'literal-token');
}

function applyActionToLinearState(state, action) {
  if (!action) return;

  if (action.type === 'char') {
    const n = String(action.value || '').length;
    const start = Math.min(state.start, state.end);
    const end = Math.max(state.start, state.end);
    state.length += n - (end - start);
    state.start = start + n;
    state.end = state.start;
    return;
  }

  if (action.type === 'literal-token') {
    const n = String(action.value || '').length;
    const start = Math.min(state.start, state.end);
    const end = Math.max(state.start, state.end);
    state.length += n - (end - start);
    state.start = start + n;
    state.end = state.start;
    return;
  }

  if (action.type !== 'command') return;

  if (action.command === 'SEL') {
    state.start = Math.max(0, Math.min(action.start, state.length));
    state.end = Math.max(0, Math.min(action.end, state.length));
    return;
  }

  if (action.command === 'CLICK' || action.command === 'NAV') {
    const pos = Math.max(0, Math.min(action.pos, state.length));
    state.start = pos;
    state.end = pos;
    return;
  }

  if (action.command === 'DEL') {
    const count = Math.max(1, Number(action.count) || 1);
    if (state.start !== state.end) {
      const start = Math.min(state.start, state.end);
      const end = Math.max(state.start, state.end);
      state.length -= (end - start);
      state.start = start;
      state.end = start;
    } else if (state.start > 0) {
      const deleteCount = Math.min(count, state.start);
      state.length -= deleteCount;
      state.start -= deleteCount;
      state.end = state.start;
    }
    return;
  }

  if (action.command === 'FDEL') {
    const count = Math.max(1, Number(action.count) || 1);
    if (state.start !== state.end) {
      const start = Math.min(state.start, state.end);
      const end = Math.max(state.start, state.end);
      state.length -= (end - start);
      state.start = start;
      state.end = start;
    } else if (state.start < state.length) {
      const deleteCount = Math.min(count, state.length - state.start);
      state.length -= deleteCount;
      state.end = state.start;
    }
    return;
  }

  if (action.command === 'BDEL') {
    const left = Math.max(0, Number(action.left) || 0);
    const right = Math.max(0, Number(action.right) || 0);
    const cursor = state.end;
    const leftStart = Math.max(0, cursor - left);
    state.length -= left + right;
    state.start = leftStart;
    state.end = leftStart;
    return;
  }

  if (action.command === 'LEFT') {
    const cursor = Math.min(state.start, state.end);
    state.start = Math.max(0, cursor - action.count);
    state.end = state.start;
    return;
  }

  if (action.command === 'RIGHT') {
    const cursor = Math.max(state.start, state.end);
    state.start = Math.min(state.length, cursor + action.count);
    state.end = state.start;
    return;
  }

  if (action.command === 'LEFT_TO_START') {
    state.start = 0;
    state.end = 0;
    return;
  }

  if (action.command === 'RIGHT_TO_END') {
    state.start = state.length;
    state.end = state.length;
    return;
  }

  if (action.command === 'SLEFT') {
    const anchor = Math.max(state.start, state.end);
    const focus = Math.max(0, Math.min(state.start, state.end) - action.count);
    state.start = Math.min(anchor, focus);
    state.end = Math.max(anchor, focus);
    return;
  }

  if (action.command === 'SRIGHT') {
    const anchor = Math.min(state.start, state.end);
    const focus = Math.min(state.length, Math.max(state.start, state.end) + action.count);
    state.start = Math.min(anchor, focus);
    state.end = Math.max(anchor, focus);
    return;
  }

  if (action.command === 'SUP' || action.command === 'SDOWN') {
    return;
  }

  if (action.command === 'HOME') {
    state.start = 0;
    state.end = 0;
    return;
  }

  if (action.command === 'END') {
    state.start = state.length;
    state.end = state.length;
  }
}

function findCursorForNavigationKey(keyEntries, keyIndex, keyName, cursorRecords) {
  const keyEntry = keyEntries[keyIndex];
  const direct = parseCursorRecord(cursorRecords[String(keyEntry.ts)] ?? cursorRecords[keyEntry.ts]);
  if (direct) return direct;

  for (let i = keyIndex + 1; i < keyEntries.length; i++) {
    const raw = String(keyEntries[i]?.value || '');
    if (raw === `keyup: ${keyName}`) {
      const cursor = parseCursorRecord(cursorRecords[String(keyEntries[i].ts)] ?? cursorRecords[keyEntries[i].ts]);
      if (cursor) return cursor;
      break;
    }
    if (raw.startsWith('keydown: ') && raw !== `keydown: ${keyName}`) break;
  }

  return null;
}

function appendLinearNavigationEvent(parts, keyEntries, keyIndex, cursorRecords, currentText, currentState, modifiers) {
  const keyEntry = keyEntries[keyIndex];
  const raw = String(keyEntry?.value || '');
  const isRepeat = raw.startsWith('repeat: ');
  if (raw.startsWith('nav: ')) {
    const pos = Number(raw.slice(5).trim());
    if (!Number.isFinite(pos)) return null;
    parts.push(`<NAV${pos}>`);
    return { ...makeCollapsedSelectionState(pos), consumed: 1, activityTs: keyEntry.ts, navigated: true };
  }

  if (raw.startsWith('mouseup')) {
    const cursor = parseCursorRecord(cursorRecords[String(keyEntry.ts)] ?? cursorRecords[keyEntry.ts]);
    if (!cursor) return null;

    if (cursor.start === cursor.end) parts.push(`<CLICK${cursor.start}>`);
    else parts.push(`<SEL${cursor.start}:${cursor.end}>`);

    return { ...makeSelectionStateFromRange(cursor.start, cursor.end), consumed: 1, activityTs: keyEntry.ts, navigated: true };
  }

  let keyName = '';
  if (raw.startsWith('keydown: ')) keyName = raw.slice(9).trim();
  else if (raw.startsWith('repeat: ')) keyName = raw.slice(8).trim();
  else return null;

  const chordToken = getLinearChordToken(keyName, modifiers, currentState);
  if (chordToken) {
    parts.push(chordToken);
    return { ...currentState, consumed: 1, activityTs: keyEntry.ts, navigated: false };
  }

  const runInfo = findNavigationRunEnd(keyEntries, keyIndex, keyName);
  const cursor = findCursorForNavigationKey(keyEntries, keyIndex, keyName, cursorRecords);
  const predicted = modifiers.shift
    ? applyShiftNavigationKeyToSelection(keyName, currentText, currentState.anchor, currentState.focus, 1)
    : applyNavigationKeyToSelection(keyName, currentText, currentState.start, currentState.end);
  let emitted = false;

  if (modifiers.shift && keyName === 'ArrowLeft') {
    parts.push(makeLinearCountToken('SLEFT', 1));
    emitted = true;
  } else if (modifiers.shift && keyName === 'ArrowRight') {
    parts.push(makeLinearCountToken('SRIGHT', 1));
    emitted = true;
  } else if (modifiers.shift && keyName === 'ArrowUp') {
    parts.push(makeLinearCountToken('SUP', 1));
    emitted = true;
  } else if (modifiers.shift && keyName === 'ArrowDown') {
    parts.push(makeLinearCountToken('SDOWN', 1));
    emitted = true;
  } else if (keyName === 'ArrowLeft') {
    parts.push(makeLinearCountToken('LEFT', 1));
    emitted = true;
  } else if (keyName === 'ArrowRight') {
    parts.push(makeLinearCountToken('RIGHT', 1));
    emitted = true;
  } else if (keyName === 'ArrowUp') {
    parts.push(makeLinearCountToken('UP', 1));
    emitted = true;
  } else if (keyName === 'ArrowDown') {
    parts.push(makeLinearCountToken('DOWN', 1));
    emitted = true;
  } else if (keyName === 'Home') {
    parts.push('<HOME>');
    emitted = true;
  } else if (keyName === 'End') {
    parts.push('<END>');
    emitted = true;
  }

  if (!emitted) return null;
  if (
    !modifiers.shift &&
    (keyName === 'ArrowLeft' || keyName === 'ArrowRight') &&
    runInfo.keyupIndex !== -1 &&
    cursor &&
    cursor.start === cursor.end
  ) {
    const boundaryPos = keyName === 'ArrowLeft' ? 0 : String(currentText || '').length;
    if (cursor.start === boundaryPos) {
      parts.pop();
      parts.push(keyName === 'ArrowLeft' ? '<LEFT_TO_START>' : '<RIGHT_TO_END>');
      return {
        ...makeCollapsedSelectionState(cursor.start),
        consumed: runInfo.keyupIndex - keyIndex + 1,
        activityTs: keyEntries[runInfo.keyupIndex].ts,
        navigated: true
      };
    }
  }
  if (
    isRepeat &&
    predicted.start === currentState.start &&
    predicted.end === currentState.end &&
    predicted.anchor === currentState.anchor &&
    predicted.focus === currentState.focus &&
    (
      !cursor ||
      (cursor.start === currentState.start && cursor.end === currentState.end)
    )
  ) {
    return null;
  }
  if (!cursor) return { ...predicted, consumed: 1, activityTs: keyEntry.ts, navigated: true };

  if (predicted.start !== cursor.start || predicted.end !== cursor.end) {
    if (cursor.start === cursor.end) parts.push(`<NAV${cursor.start}>`);
    else parts.push(`<SEL${cursor.start}:${cursor.end}>`);
  }

  if (modifiers.shift) {
    if (keyName === 'ArrowLeft' || keyName === 'ArrowUp') return { ...makeSelectionStateFromRange(cursor.start, cursor.end, 'start'), consumed: 1, activityTs: keyEntry.ts, navigated: true };
    if (keyName === 'ArrowRight' || keyName === 'ArrowDown') return { ...makeSelectionStateFromRange(cursor.start, cursor.end, 'end'), consumed: 1, activityTs: keyEntry.ts, navigated: true };
  }
  return { ...makeSelectionStateFromRange(cursor.start, cursor.end), consumed: 1, activityTs: keyEntry.ts, navigated: true };
}

function applyNavigationKeyToSelection(keyName, currentText, currentStart, currentEnd) {
  const textLength = String(currentText || '').length;
  const cursorMin = Math.min(currentStart, currentEnd);
  const cursorMax = Math.max(currentStart, currentEnd);
  const hasSelection = cursorMin !== cursorMax;

  if (keyName === 'ArrowLeft') {
    const pos = hasSelection ? cursorMin : Math.max(0, cursorMin - 1);
    return { start: pos, end: pos };
  }
  if (keyName === 'ArrowRight') {
    const pos = hasSelection ? cursorMax : Math.min(textLength, cursorMax + 1);
    return { start: pos, end: pos };
  }
  if (keyName === 'Home') return { start: 0, end: 0 };
  if (keyName === 'End') return { start: textLength, end: textLength };
  if (keyName === 'ArrowUp' || keyName === 'ArrowDown') return { start: currentStart, end: currentEnd };
  return { start: currentStart, end: currentEnd };
}

function parseCursorRecord(raw) {
  const parts = String(raw || '').split(':');
  if (parts.length !== 2) return null;
  const start = Number(parts[0]);
  const end = Number(parts[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

function getCursorStateBefore(cursorRecords, ts) {
  const entries = getSortedRecordEntries(cursorRecords);
  let chosen = null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].ts < ts) chosen = parseCursorRecord(entries[i].value);
    else break;
  }
  return chosen;
}

function getTextChangeDiff(previousText, currentText) {
  const prev = String(previousText || '');
  const curr = String(currentText || '');
  const start = myDmp.diff_commonPrefix(prev, curr);
  let prevTail = prev.substring(start);
  let currTail = curr.substring(start);
  const suffix = myDmp.diff_commonSuffix(prevTail, currTail);
  prevTail = prevTail.substring(0, prevTail.length - suffix);
  currTail = currTail.substring(0, currTail.length - suffix);

  return {
    start,
    deleted: prevTail,
    inserted: currTail
  };
}

function refineTextChangeDiffForSelection(previousText, currentText, diffInfo, selectionStart, selectionEnd) {
  const prev = String(previousText || '');
  const curr = String(currentText || '');
  const preferredStart = Number(selectionStart);
  const preferredEnd = Number(selectionEnd);
  const delta = curr.length - prev.length;
  const hasFiniteSelection = Number.isFinite(preferredStart) && Number.isFinite(preferredEnd);

  if (hasFiniteSelection && preferredStart !== preferredEnd) {
    const selStart = Math.max(0, Math.min(preferredStart, preferredEnd));
    const selEnd = Math.max(0, Math.max(preferredStart, preferredEnd));
    const inserted = curr.slice(selStart, selStart + Math.max(0, delta + (selEnd - selStart)));
    if (prev.slice(0, selStart) + inserted + prev.slice(selEnd) === curr) {
      return {
        start: selStart,
        deleted: prev.slice(selStart, selEnd),
        inserted
      };
    }
  }

  if (
    diffInfo.deleted.length === 0 &&
    diffInfo.inserted.length > 0 &&
    selectionStart === selectionEnd &&
    Number.isFinite(preferredStart) &&
    delta > 0 &&
    preferredStart >= 0 &&
    preferredStart <= prev.length
  ) {
    const inserted = curr.slice(preferredStart, preferredStart + delta);
    if (prev.slice(0, preferredStart) + inserted + prev.slice(preferredStart) === curr) {
      return {
        start: preferredStart,
        deleted: '',
        inserted
      };
    }
  }

  if (
    hasFiniteSelection &&
    preferredStart === preferredEnd &&
    diffInfo.deleted.length > 0
  ) {
    const collapsed = preferredStart;
    const backspaceStart = collapsed - diffInfo.deleted.length;
    if (backspaceStart >= 0) {
      const inserted = curr.slice(backspaceStart, backspaceStart + diffInfo.inserted.length);
      if (prev.slice(0, backspaceStart) + inserted + prev.slice(collapsed) === curr) {
        return {
          start: backspaceStart,
          deleted: prev.slice(backspaceStart, collapsed),
          inserted
        };
      }
    }

    const forwardEnd = collapsed + diffInfo.deleted.length;
    if (forwardEnd <= prev.length) {
      const inserted = curr.slice(collapsed, collapsed + diffInfo.inserted.length);
      if (prev.slice(0, collapsed) + inserted + prev.slice(forwardEnd) === curr) {
        return {
          start: collapsed,
          deleted: prev.slice(collapsed, forwardEnd),
          inserted
        };
      }
    }
  }

  return diffInfo;
}

function appendCursorAdjustmentTokens(parts, currentStart, currentEnd, targetStart, targetEnd) {
  if (currentStart === targetStart && currentEnd === targetEnd) return;

  if (targetStart !== targetEnd) {
    parts.push(`<SEL${targetStart}:${targetEnd}>`);
    return;
  }

  if (currentStart !== currentEnd) {
    parts.push(`<SEL${targetStart}:${targetEnd}>`);
    return;
  }

  const delta = targetStart - currentStart;
  if (delta < 0) parts.push(makeLinearCountToken('LEFT', Math.abs(delta)));
  else if (delta > 0) parts.push(makeLinearCountToken('RIGHT', delta));
}

function appendNavigationResolutionTokens(parts, currentStart, currentEnd, targetStart, targetEnd) {
  if (currentStart === targetStart && currentEnd === targetEnd) return;

  if (targetStart !== targetEnd) {
    parts.push(`<SEL${targetStart}:${targetEnd}>`);
    return;
  }

  parts.push(`<NAV${targetStart}>`);
}

function alignSelectionForTextDiff(parts, diffInfo, selectionStart, selectionEnd) {
  const deleteCount = diffInfo.deleted.length;
  const insertCount = diffInfo.inserted.length;
  const deleteStart = diffInfo.start;
  const deleteEnd = diffInfo.start + deleteCount;
  const cursorCollapsed = selectionStart === selectionEnd;

  if (deleteCount === 0 && insertCount > 0) {
    if (!cursorCollapsed || selectionStart !== deleteStart) {
      appendNavigationResolutionTokens(parts, selectionStart, selectionEnd, deleteStart, deleteStart);
      return { start: deleteStart, end: deleteStart };
    }
    return { start: selectionStart, end: selectionEnd };
  }

  if (deleteCount > 0) {
    if (selectionStart === deleteStart && selectionEnd === deleteEnd) {
      return { start: selectionStart, end: selectionEnd };
    }
    if (cursorCollapsed && selectionStart === deleteEnd) {
      return { start: selectionStart, end: selectionEnd };
    }
    if (cursorCollapsed && selectionStart === deleteStart) {
      return { start: selectionStart, end: selectionEnd };
    }
    if (cursorCollapsed && insertCount === 0 && selectionStart > deleteStart && selectionStart < deleteEnd) {
      return { start: selectionStart, end: selectionEnd };
    }

    appendNavigationResolutionTokens(parts, selectionStart, selectionEnd, deleteStart, deleteEnd);
    return { start: deleteStart, end: deleteEnd };
  }

  return { start: selectionStart, end: selectionEnd };
}

function appendTextDiffTokens(parts, diffInfo, selectionStart, selectionEnd) {
  const deleteCount = diffInfo.deleted.length;
  const insertText = diffInfo.inserted;
  const cursorCollapsed = selectionStart === selectionEnd;
  const deleteStart = diffInfo.start;
  const deleteEnd = diffInfo.start + deleteCount;

  if (deleteCount > 0) {
    if (!(selectionStart === deleteStart && selectionEnd === deleteEnd)) {
      if (cursorCollapsed && deleteEnd === selectionStart) {
        parts.push(makeLinearCountToken('DEL', deleteCount));
      } else if (cursorCollapsed && deleteStart === selectionStart) {
        parts.push(makeLinearCountToken('FDEL', deleteCount));
      } else if (cursorCollapsed && insertText.length === 0 && selectionStart > deleteStart && selectionStart < deleteEnd) {
        const forwardCount = deleteEnd - selectionStart;
        const backwardCount = selectionStart - deleteStart;
        if (forwardCount > 0) parts.push(makeLinearCountToken('FDEL', forwardCount));
        if (backwardCount > 0) parts.push(makeLinearCountToken('DEL', backwardCount));
      } else if (cursorCollapsed && insertText.length > 0 && selectionStart > deleteStart && selectionStart < deleteEnd) {
        const forwardCount = deleteEnd - selectionStart;
        const backwardCount = selectionStart - deleteStart;
        parts.push(`<BDEL${backwardCount}:${forwardCount}>`);
      } else {
        parts.push(`<SEL${deleteStart}:${deleteEnd}>`);
        parts.push(makeLinearCountToken('DEL', 1));
      }
    } else {
      parts.push(makeLinearCountToken('DEL', 1));
    }
  }

  if (insertText.length > 0) {
    parts.push(encodeLinearText(insertText));
  }
}

function parseLinearRepresentation(linear) {
  const actions = [];
  const text = String(linear || '');
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '<') {
      actions.push({ type: 'char', value: text[i] });
      i += 1;
      continue;
    }

    const end = text.indexOf('>', i);
    if (end === -1) {
      actions.push({ type: 'char', value: text[i] });
      i += 1;
      continue;
    }

    const token = text.slice(i + 1, end);
    if (token === 'ENTER') actions.push({ type: 'char', value: '\n' });
    else if (token === 'LT') actions.push({ type: 'char', value: '<' });
    else if (token === 'GT') actions.push({ type: 'char', value: '>' });
    else if (/^\d+(?:\.\d{1,3})?$/.test(token)) actions.push({ type: 'command', command: 'PAUSE', seconds: Number(token) });
    else if (/^DEL\d*$/.test(token)) actions.push({ type: 'command', command: 'DEL', count: token.length > 3 ? Number(token.slice(3)) : 1 });
    else if (/^FDEL\d*$/.test(token)) actions.push({ type: 'command', command: 'FDEL', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (token === 'LEFT_TO_START') actions.push({ type: 'command', command: 'LEFT_TO_START' });
    else if (token === 'RIGHT_TO_END') actions.push({ type: 'command', command: 'RIGHT_TO_END' });
    else if (token === 'UP_TO_START') actions.push({ type: 'command', command: 'UP_TO_START' });
    else if (token === 'DOWN_TO_END') actions.push({ type: 'command', command: 'DOWN_TO_END' });
    else if (/^LEFT\d*$/.test(token)) actions.push({ type: 'command', command: 'LEFT', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (/^RIGHT\d*$/.test(token)) actions.push({ type: 'command', command: 'RIGHT', count: token.length > 5 ? Number(token.slice(5)) : 1 });
    else if (/^UP\d*$/.test(token)) actions.push({ type: 'command', command: 'UP', count: token.length > 2 ? Number(token.slice(2)) : 1 });
    else if (/^DOWN\d*$/.test(token)) actions.push({ type: 'command', command: 'DOWN', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (/^SLEFT\d*$/.test(token)) actions.push({ type: 'command', command: 'SLEFT', count: token.length > 5 ? Number(token.slice(5)) : 1 });
    else if (/^SRIGHT\d*$/.test(token)) actions.push({ type: 'command', command: 'SRIGHT', count: token.length > 6 ? Number(token.slice(6)) : 1 });
    else if (/^SUP\d*$/.test(token)) actions.push({ type: 'command', command: 'SUP', count: token.length > 3 ? Number(token.slice(3)) : 1 });
    else if (/^SDOWN\d*$/.test(token)) actions.push({ type: 'command', command: 'SDOWN', count: token.length > 5 ? Number(token.slice(5)) : 1 });
    else if (token === 'HOME') actions.push({ type: 'command', command: 'HOME' });
    else if (token === 'END') actions.push({ type: 'command', command: 'END' });
    else if (/^NAV\d+$/.test(token)) actions.push({ type: 'command', command: 'NAV', pos: Number(token.slice(3)) });
    else if (token === 'COPY') actions.push({ type: 'command', command: 'COPY' });
    else if (token === 'CUT') actions.push({ type: 'command', command: 'CUT' });
    else if (token === 'PASTE') actions.push({ type: 'command', command: 'PASTE' });
    else if (/^UNDO\*$/.test(token)) actions.push({ type: 'command', command: 'UNDO', count: 999, saturated: true });
    else if (/^REDO\*$/.test(token)) actions.push({ type: 'command', command: 'REDO', count: 999, saturated: true });
    else if (/^UNDO\d*$/.test(token)) actions.push({ type: 'command', command: 'UNDO', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (/^REDO\d*$/.test(token)) actions.push({ type: 'command', command: 'REDO', count: token.length > 4 ? Number(token.slice(4)) : 1 });
    else if (token === 'SELECTALL') actions.push({ type: 'command', command: 'SELECTALL' });
    else if (/^BDEL\d+:\d+$/.test(token)) {
      const pair = token.slice(4).split(':').map(Number);
      actions.push({ type: 'command', command: 'BDEL', left: pair[0], right: pair[1] });
    }
    else if (/^CLICK\d+$/.test(token)) actions.push({ type: 'command', command: 'CLICK', pos: Number(token.slice(5)) });
    else if (/^SEL\d+:\d+$/.test(token)) {
      const pair = token.slice(3).split(':').map(Number);
      actions.push({ type: 'command', command: 'SEL', start: pair[0], end: pair[1] });
    }
    else if (/^KEY:/.test(token)) actions.push({ type: 'command', command: token });
    else actions.push({ type: 'literal-token', value: `<${token}>` });

    i = end + 1;
  }

  return actions;
}

function serializeLinearActions(actions) {
  const parts = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.type === 'char') {
      parts.push(encodeLinearText(action.value));
      continue;
    }

    if (action.type === 'literal-token') {
      parts.push(action.value);
      continue;
    }

    if (action.command === 'DEL' || action.command === 'FDEL' || action.command === 'LEFT' || action.command === 'RIGHT' || action.command === 'UP' || action.command === 'DOWN' || action.command === 'SLEFT' || action.command === 'SRIGHT' || action.command === 'SUP' || action.command === 'SDOWN') {
      parts.push(makeLinearCountToken(action.command, action.count));
      continue;
    }
    if (action.command === 'UNDO' || action.command === 'REDO') {
      parts.push(makeLinearUndoRedoToken(action.command, action.count, action.saturated));
      continue;
    }
    if (action.command === 'LEFT_TO_START') {
      parts.push('<LEFT_TO_START>');
      continue;
    }
    if (action.command === 'RIGHT_TO_END') {
      parts.push('<RIGHT_TO_END>');
      continue;
    }
    if (action.command === 'UP_TO_START') {
      parts.push('<UP_TO_START>');
      continue;
    }
    if (action.command === 'DOWN_TO_END') {
      parts.push('<DOWN_TO_END>');
      continue;
    }

    if (action.command === 'PAUSE') {
      parts.push(formatLinearPauseToken(action.seconds));
      continue;
    }

    if (action.command === 'HOME') {
      parts.push('<HOME>');
      continue;
    }

    if (action.command === 'END') {
      parts.push('<END>');
      continue;
    }

    if (action.command === 'NAV') {
      parts.push(`<NAV${action.pos}>`);
      continue;
    }
    if (action.command === 'COPY') {
      parts.push('<COPY>');
      continue;
    }
    if (action.command === 'CUT') {
      parts.push('<CUT>');
      continue;
    }
    if (action.command === 'PASTE') {
      parts.push('<PASTE>');
      continue;
    }
    if (action.command === 'UNDO') {
      parts.push('<UNDO>');
      continue;
    }
    if (action.command === 'REDO') {
      parts.push('<REDO>');
      continue;
    }
    if (action.command === 'SELECTALL') {
      parts.push('<SELECTALL>');
      continue;
    }

    if (action.command === 'BDEL') {
      parts.push(`<BDEL${action.left}:${action.right}>`);
      continue;
    }

    if (action.command === 'CLICK') {
      parts.push(`<CLICK${action.pos}>`);
      continue;
    }

    if (action.command === 'SEL') {
      parts.push(`<SEL${action.start}:${action.end}>`);
      continue;
    }

    if (typeof action.command === 'string' && action.command.startsWith('KEY:')) {
      parts.push(`<${action.command}>`);
    }
  }

  return normalizeLinearParts(parts).join('');
}

function serializeCanonicalLinearActions(actions) {
  const parts = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.type === 'char') {
      parts.push(encodeLinearText(action.value));
      continue;
    }

    if (action.type === 'literal-token') {
      parts.push(action.value);
      continue;
    }

    if (action.command === 'CDEL') {
      parts.push('<CDEL>');
      continue;
    }

    if (action.command === 'PAUSE') {
      parts.push(formatLinearPauseToken(action.seconds));
      continue;
    }

    if (action.command === 'EDGE_RIGHT') {
      continue;
    }

    if (action.command === 'EDGE_LEFT') {
      continue;
    }

    if (action.command === 'DEL' || action.command === 'FDEL' || action.command === 'LEFT' || action.command === 'RIGHT' || action.command === 'UP' || action.command === 'DOWN' || action.command === 'SLEFT' || action.command === 'SRIGHT' || action.command === 'SUP' || action.command === 'SDOWN') {
      parts.push(makeLinearCountToken(action.command, action.count));
      continue;
    }
    if (action.command === 'UNDO' || action.command === 'REDO') {
      parts.push(makeLinearUndoRedoToken(action.command, action.count, action.saturated));
      continue;
    }
    if (action.command === 'LEFT_TO_START') {
      parts.push('<LEFT_TO_START>');
      continue;
    }
    if (action.command === 'RIGHT_TO_END') {
      parts.push('<RIGHT_TO_END>');
      continue;
    }
    if (action.command === 'UP_TO_START') {
      parts.push('<UP_TO_START>');
      continue;
    }
    if (action.command === 'DOWN_TO_END') {
      parts.push('<DOWN_TO_END>');
      continue;
    }

    if (action.command === 'HOME') {
      parts.push('<HOME>');
      continue;
    }

    if (action.command === 'END') {
      parts.push('<END>');
      continue;
    }

    if (action.command === 'NAV') {
      parts.push(`<NAV${action.pos}>`);
      continue;
    }
    if (action.command === 'COPY') {
      parts.push('<COPY>');
      continue;
    }
    if (action.command === 'CUT') {
      parts.push('<CUT>');
      continue;
    }
    if (action.command === 'PASTE') {
      parts.push('<PASTE>');
      continue;
    }
    if (action.command === 'UNDO') {
      parts.push('<UNDO>');
      continue;
    }
    if (action.command === 'REDO') {
      parts.push('<REDO>');
      continue;
    }
    if (action.command === 'SELECTALL') {
      parts.push('<SELECTALL>');
      continue;
    }

    if (action.command === 'BDEL') {
      parts.push(`<BDEL${action.left}:${action.right}>`);
      continue;
    }

    if (action.command === 'CLICK') {
      parts.push(`<CLICK${action.pos}>`);
      continue;
    }

    if (action.command === 'SEL') {
      parts.push(`<SEL${action.start}:${action.end}>`);
      continue;
    }

    if (typeof action.command === 'string' && action.command.startsWith('KEY:')) {
      parts.push(`<${action.command}>`);
    }
  }

  return parts.join('');
}

function reconstructTextFromLinearRepresentation(linear) {
  const actions = parseLinearRepresentation(linear);
  let text = '';
  let selectionStart = 0;
  let selectionEnd = 0;
  let selectionAnchor = 0;
  let selectionFocus = 0;

  function insertTextAtSelection(value) {
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    text = text.slice(0, start) + value + text.slice(end);
    selectionStart = start + value.length;
    selectionEnd = selectionStart;
    selectionAnchor = selectionStart;
    selectionFocus = selectionStart;
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.type === 'char') {
      insertTextAtSelection(action.value);
      continue;
    }

    if (action.type === 'literal-token') {
      insertTextAtSelection(action.value);
      continue;
    }

    if (action.command === 'SEL') {
      const nextState = makeSelectionStateFromRange(action.start, action.end);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'PAUSE') {
      continue;
    }

    if (action.command === 'COPY' || action.command === 'CUT' || action.command === 'PASTE' || action.command === 'UNDO' || action.command === 'REDO' || action.command === 'SELECTALL') {
      continue;
    }

    if (action.command === 'CLICK') {
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'NAV') {
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'BDEL') {
      const left = Math.max(0, Number(action.left) || 0);
      const right = Math.max(0, Number(action.right) || 0);
      const cursor = Math.max(0, Math.min(selectionEnd, text.length));
      const rightEnd = Math.min(text.length, cursor + right);
      text = text.slice(0, cursor) + text.slice(rightEnd);
      const leftStart = Math.max(0, cursor - left);
      text = text.slice(0, leftStart) + text.slice(cursor);
      selectionStart = leftStart;
      selectionEnd = leftStart;
      selectionAnchor = leftStart;
      selectionFocus = leftStart;
      continue;
    }

    if (action.command === 'DEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        if (selectionStart !== selectionEnd) {
          insertTextAtSelection('');
        } else if (selectionStart > 0) {
          text = text.slice(0, selectionStart - 1) + text.slice(selectionStart);
          selectionStart -= 1;
          selectionEnd = selectionStart;
          selectionAnchor = selectionStart;
          selectionFocus = selectionStart;
        }
      }
      continue;
    }

    if (action.command === 'FDEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        if (selectionStart !== selectionEnd) {
          insertTextAtSelection('');
        } else if (selectionStart < text.length) {
          text = text.slice(0, selectionStart) + text.slice(selectionStart + 1);
          selectionEnd = selectionStart;
          selectionAnchor = selectionStart;
          selectionFocus = selectionStart;
        }
      }
      continue;
    }

    if (action.command === 'LEFT') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const cursor = Math.min(selectionStart, selectionEnd);
        if (selectionStart !== selectionEnd) selectionStart = cursor;
        else selectionStart = Math.max(0, cursor - 1);
        selectionEnd = selectionStart;
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
      }
      continue;
    }

    if (action.command === 'LEFT_TO_START') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      continue;
    }

    if (action.command === 'RIGHT') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const cursor = Math.max(selectionStart, selectionEnd);
        if (selectionStart !== selectionEnd) selectionStart = cursor;
        else selectionStart = Math.min(text.length, cursor + 1);
        selectionEnd = selectionStart;
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
      }
      continue;
    }

    if (action.command === 'RIGHT_TO_END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
      continue;
    }

    if (action.command === 'UP_TO_START') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      continue;
    }

    if (action.command === 'DOWN_TO_END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
      continue;
    }

    if (action.command === 'SLEFT' || action.command === 'SRIGHT' || action.command === 'SUP' || action.command === 'SDOWN') {
      const keyName = action.command === 'SLEFT'
        ? 'ArrowLeft'
        : action.command === 'SRIGHT'
          ? 'ArrowRight'
          : action.command === 'SUP'
            ? 'ArrowUp'
            : 'ArrowDown';
      const nextState = applyShiftNavigationKeyToSelection(keyName, text, selectionAnchor, selectionFocus, action.count);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      continue;
    }

    if (action.command === 'UP' || action.command === 'DOWN') {
      continue;
    }

    if (action.command === 'HOME') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      continue;
    }

    if (action.command === 'END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
    }
  }

  return { final_text: text, cursor: selectionEnd };
}

function linearRepresentationToSyntheticCheckpointRecords(linear, starttime = 0) {
  const actions = parseLinearRepresentation(linear);
  const records = {
    header_records: {
      starttime,
      endtime: starttime
    },
    text_records: {},
    cursor_records: {},
    key_records: {},
    scroll_records: {},
    image_records: {},
    window_records: {}
  };

  let text = '';
  let selectionStart = 0;
  let selectionEnd = 0;
  let selectionAnchor = 0;
  let selectionFocus = 0;
  let ts = starttime;
  let pendingPauseMs = null;
  let lastRelevantTs = null;

  function nextTs(delayMs = 50) {
    ts += delayMs;
    return ts;
  }

  function consumeDelay(defaultMs = 50) {
    if (pendingPauseMs == null) return defaultMs;
    const delayMs = Math.max(1, pendingPauseMs);
    pendingPauseMs = null;
    return delayMs;
  }

  function stampCursor(atTs) {
    records.cursor_records[atTs] = `${selectionStart}:${selectionEnd}`;
  }

  function stampTextCheckpoint(delayMs = 50) {
    const atTs = nextTs(consumeDelay(delayMs));
    records.text_records[atTs] = text;
    stampCursor(atTs);
    lastRelevantTs = atTs;
    return atTs;
  }

  function stampMouseupCheckpoint(delayMs = 50) {
    const atTs = nextTs(consumeDelay(delayMs));
    records.key_records[atTs] = 'mouseup: yes';
    stampCursor(atTs);
    lastRelevantTs = atTs;
    return atTs;
  }

  function stampNavCheckpoint(delayMs = 50) {
    const atTs = nextTs(consumeDelay(delayMs));
    records.key_records[atTs] = `nav: ${selectionStart}`;
    stampCursor(atTs);
    lastRelevantTs = atTs;
    return atTs;
  }

  function stampChordCheckpoint(chordKeyName, delayMs = 50) {
    const ctrlDownTs = nextTs(consumeDelay(delayMs));
    records.key_records[ctrlDownTs] = 'keydown: Control';
    stampCursor(ctrlDownTs);
    const keyDownTs = nextTs(50);
    records.key_records[keyDownTs] = `keydown: ${chordKeyName}`;
    stampCursor(keyDownTs);
    const keyUpTs = nextTs(50);
    records.key_records[keyUpTs] = `keyup: ${chordKeyName}`;
    stampCursor(keyUpTs);
    const ctrlUpTs = nextTs(50);
    records.key_records[ctrlUpTs] = 'keyup: Control';
    stampCursor(ctrlUpTs);
    lastRelevantTs = ctrlUpTs;
    return ctrlUpTs;
  }

  function insertTextAtSelection(value) {
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    text = text.slice(0, start) + value + text.slice(end);
    selectionStart = start + value.length;
    selectionEnd = selectionStart;
    selectionAnchor = selectionStart;
    selectionFocus = selectionStart;
    stampTextCheckpoint();
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    if (action.type === 'char') {
      insertTextAtSelection(action.value);
      continue;
    }

    if (action.type === 'literal-token') {
      insertTextAtSelection(action.value);
      continue;
    }

    if (action.command === 'PAUSE') {
      pendingPauseMs = Math.max(1, Math.round(Math.max(0, Number(action.seconds) || 0) * 1000));
      continue;
    }

    if (action.command === 'COPY') {
      stampChordCheckpoint('c');
      continue;
    }
    if (action.command === 'CUT') {
      stampChordCheckpoint('x');
      continue;
    }
    if (action.command === 'PASTE') {
      stampChordCheckpoint('v');
      continue;
    }
    if (action.command === 'UNDO') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let k = 0; k < repeatCount; k++) stampChordCheckpoint('z');
      continue;
    }
    if (action.command === 'REDO') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let k = 0; k < repeatCount; k++) stampChordCheckpoint('y');
      continue;
    }
    if (action.command === 'SELECTALL') {
      stampChordCheckpoint('a');
      continue;
    }

    if (action.command === 'SEL') {
      const nextState = makeSelectionStateFromRange(action.start, action.end);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      stampMouseupCheckpoint();
      continue;
    }

    if (action.command === 'CLICK') {
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      stampMouseupCheckpoint();
      continue;
    }

    if (action.command === 'NAV') {
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'BDEL') {
      const left = Math.max(0, Number(action.left) || 0);
      const right = Math.max(0, Number(action.right) || 0);
      const cursor = selectionEnd;
      const rightEnd = Math.min(text.length, cursor + right);
      text = text.slice(0, cursor) + text.slice(rightEnd);
      const leftStart = Math.max(0, cursor - left);
      text = text.slice(0, leftStart) + text.slice(cursor);
      selectionStart = leftStart;
      selectionEnd = leftStart;
      selectionAnchor = leftStart;
      selectionFocus = leftStart;
      stampTextCheckpoint();
      continue;
    }

    if (action.command === 'DEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);
        if (start !== end) {
          text = text.slice(0, start) + text.slice(end);
          selectionStart = start;
          selectionEnd = start;
        } else if (selectionStart > 0) {
          text = text.slice(0, selectionStart - 1) + text.slice(selectionStart);
          selectionStart -= 1;
          selectionEnd = selectionStart;
        }
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
        stampTextCheckpoint();
      }
      continue;
    }

    if (action.command === 'FDEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);
        if (start !== end) {
          text = text.slice(0, start) + text.slice(end);
          selectionStart = start;
          selectionEnd = start;
        } else if (selectionStart < text.length) {
          text = text.slice(0, selectionStart) + text.slice(selectionStart + 1);
          selectionEnd = selectionStart;
        }
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
        stampTextCheckpoint();
      }
      continue;
    }

    if (action.command === 'LEFT') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const cursor = Math.min(selectionStart, selectionEnd);
        selectionStart = selectionStart !== selectionEnd ? cursor : Math.max(0, cursor - 1);
        selectionEnd = selectionStart;
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
      }
      selectionEnd = selectionStart;
      selectionAnchor = selectionStart;
      selectionFocus = selectionStart;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'LEFT_TO_START') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'RIGHT') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        const cursor = Math.max(selectionStart, selectionEnd);
        selectionStart = selectionStart !== selectionEnd ? cursor : Math.min(text.length, cursor + 1);
        selectionEnd = selectionStart;
        selectionAnchor = selectionStart;
        selectionFocus = selectionStart;
      }
      selectionEnd = selectionStart;
      selectionAnchor = selectionStart;
      selectionFocus = selectionStart;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'RIGHT_TO_END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'UP_TO_START') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'DOWN_TO_END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'SLEFT' || action.command === 'SRIGHT' || action.command === 'SUP' || action.command === 'SDOWN') {
      const keyName = action.command === 'SLEFT'
        ? 'ArrowLeft'
        : action.command === 'SRIGHT'
          ? 'ArrowRight'
          : action.command === 'SUP'
            ? 'ArrowUp'
            : 'ArrowDown';
      const nextState = applyShiftNavigationKeyToSelection(keyName, text, selectionAnchor, selectionFocus, action.count);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'UP' || action.command === 'DOWN') {
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'HOME') {
      selectionStart = 0;
      selectionEnd = 0;
      selectionAnchor = 0;
      selectionFocus = 0;
      stampNavCheckpoint();
      continue;
    }

    if (action.command === 'END') {
      selectionStart = text.length;
      selectionEnd = text.length;
      selectionAnchor = text.length;
      selectionFocus = text.length;
      stampNavCheckpoint();
      continue;
    }
  }

  if (pendingPauseMs != null) {
    ts += Math.max(1, pendingPauseMs);
    pendingPauseMs = null;
  }
  records.header_records.endtime = Math.max(ts, lastRelevantTs || starttime);
  return records;
}

function linearRepresentationToSyntheticRecords(linear, starttime = 0) {
  const actions = parseLinearRepresentation(linear);
  const records = {
    header_records: {
      starttime,
      endtime: starttime
    },
    text_records: {},
    cursor_records: {},
    key_records: {},
    scroll_records: {},
    image_records: {},
    window_records: {}
  };

  let text = '';
  let selectionStart = 0;
  let selectionEnd = 0;
  let selectionAnchor = 0;
  let selectionFocus = 0;
  let ts = starttime;
  let pendingPauseMs = null;
  let lastRelevantTs = null;

  function nextTs(delayMs = 50) {
    ts += delayMs;
    return ts;
  }

  function consumePendingPause(defaultMs = 50) {
    const delayMs = pendingPauseMs == null ? defaultMs : Math.max(1, pendingPauseMs);
    pendingPauseMs = null;
    return delayMs;
  }

  function consumeDelayForRelevantOffset(relevantOffsetMs, defaultMs = 50) {
    if (pendingPauseMs == null) return defaultMs;
    const baseTs = lastRelevantTs == null ? ts : lastRelevantTs;
    const targetTs = baseTs + Math.max(1, pendingPauseMs);
    pendingPauseMs = null;
    return Math.max(1, targetTs - ts - relevantOffsetMs);
  }

  function setCursorRecord(atTs) {
    records.cursor_records[atTs] = `${selectionStart}:${selectionEnd}`;
  }

  function addKeyPair(keyName, applyEffect, changedText) {
    const downDelay = changedText
      ? consumeDelayForRelevantOffset(50, 50)
      : consumeDelayForRelevantOffset(0, 50);
    const downTs = nextTs(downDelay);
    records.key_records[downTs] = `keydown: ${keyName}`;
    if (!changedText) lastRelevantTs = downTs;
    applyEffect();
    if (changedText) {
      const inputTs = nextTs(50);
      records.text_records[inputTs] = text;
      setCursorRecord(inputTs);
      lastRelevantTs = inputTs;
    }
    const upTs = nextTs(50);
    records.key_records[upTs] = `keyup: ${keyName}`;
    setCursorRecord(upTs);
  }

  function addChordKeyPair(chordKeyName) {
    const ctrlDownTs = nextTs(consumeDelayForRelevantOffset(0, 50));
    records.key_records[ctrlDownTs] = 'keydown: Control';
    setCursorRecord(ctrlDownTs);
    const keyDownTs = nextTs(50);
    records.key_records[keyDownTs] = `keydown: ${chordKeyName}`;
    setCursorRecord(keyDownTs);
    const keyUpTs = nextTs(50);
    records.key_records[keyUpTs] = `keyup: ${chordKeyName}`;
    setCursorRecord(keyUpTs);
    const ctrlUpTs = nextTs(50);
    records.key_records[ctrlUpTs] = 'keyup: Control';
    setCursorRecord(ctrlUpTs);
    lastRelevantTs = ctrlUpTs;
  }

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action.type === 'char') {
      const keyName = action.value === '\n' ? 'Enter' : action.value;
      addKeyPair(keyName, () => {
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);
        text = text.slice(0, start) + action.value + text.slice(end);
      selectionStart = start + action.value.length;
      selectionEnd = selectionStart;
      selectionAnchor = selectionStart;
      selectionFocus = selectionStart;
    }, true);
      continue;
    }

    if (action.type === 'literal-token') {
      for (let j = 0; j < action.value.length; j++) {
        const ch = action.value[j];
        addKeyPair(ch, () => {
          const start = Math.min(selectionStart, selectionEnd);
          const end = Math.max(selectionStart, selectionEnd);
          text = text.slice(0, start) + ch + text.slice(end);
          selectionStart = start + 1;
          selectionEnd = selectionStart;
        }, true);
      }
      continue;
    }

    if (action.command === 'SEL') {
      const downTs = nextTs(consumeDelayForRelevantOffset(50, 50));
      records.key_records[downTs] = 'mousedown: yes';
      const nextState = makeSelectionStateFromRange(action.start, action.end);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      setCursorRecord(downTs);
      const upTs = nextTs(50);
      records.key_records[upTs] = 'mouseup: yes';
      setCursorRecord(upTs);
      lastRelevantTs = upTs;
      continue;
    }

    if (action.command === 'PAUSE') {
      pendingPauseMs = Math.max(1, Math.round(Math.max(0, Number(action.seconds) || 0) * 1000));
      continue;
    }

    if (action.command === 'COPY') {
      addChordKeyPair('c');
      continue;
    }
    if (action.command === 'CUT') {
      addChordKeyPair('x');
      continue;
    }
    if (action.command === 'PASTE') {
      addChordKeyPair('v');
      continue;
    }
    if (action.command === 'UNDO') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let k = 0; k < repeatCount; k++) addChordKeyPair('z');
      continue;
    }
    if (action.command === 'REDO') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let k = 0; k < repeatCount; k++) addChordKeyPair('y');
      continue;
    }
    if (action.command === 'SELECTALL') {
      addChordKeyPair('a');
      continue;
    }

    if (action.command === 'CLICK') {
      const downTs = nextTs(consumeDelayForRelevantOffset(50, 50));
      records.key_records[downTs] = 'mousedown: yes';
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      setCursorRecord(downTs);
      const upTs = nextTs(50);
      records.key_records[upTs] = 'mouseup: yes';
      setCursorRecord(upTs);
      lastRelevantTs = upTs;
      continue;
    }

    if (action.command === 'NAV') {
      const nextState = makeCollapsedSelectionState(action.pos);
      selectionStart = nextState.start;
      selectionEnd = nextState.end;
      selectionAnchor = nextState.anchor;
      selectionFocus = nextState.focus;
      const navTs = nextTs(consumeDelayForRelevantOffset(0, 50));
      records.key_records[navTs] = `nav: ${selectionStart}`;
      setCursorRecord(navTs);
      lastRelevantTs = navTs;
      continue;
    }

    if (action.command === 'BDEL') {
      const downDelay = consumeDelayForRelevantOffset(50, 50);
      const downTs = nextTs(downDelay);
      records.key_records[downTs] = `bdel: ${action.left}:${action.right}`;
      setCursorRecord(downTs);
      const cursor = selectionEnd;
      const rightEnd = Math.min(text.length, cursor + Math.max(0, Number(action.right) || 0));
      text = text.slice(0, cursor) + text.slice(rightEnd);
      const leftStart = Math.max(0, cursor - Math.max(0, Number(action.left) || 0));
      text = text.slice(0, leftStart) + text.slice(cursor);
      selectionStart = leftStart;
      selectionEnd = leftStart;
      selectionAnchor = leftStart;
      selectionFocus = leftStart;
      const inputTs = nextTs(50);
      records.text_records[inputTs] = text;
      setCursorRecord(inputTs);
      lastRelevantTs = inputTs;
      continue;
    }

    if (action.command === 'DEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        addKeyPair('Backspace', () => {
          if (selectionStart !== selectionEnd) {
            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);
            text = text.slice(0, start) + text.slice(end);
            selectionStart = start;
            selectionEnd = start;
            selectionAnchor = start;
            selectionFocus = start;
          } else if (selectionStart > 0) {
            text = text.slice(0, selectionStart - 1) + text.slice(selectionStart);
            selectionStart -= 1;
            selectionEnd = selectionStart;
            selectionAnchor = selectionStart;
            selectionFocus = selectionStart;
          }
        }, true);
      }
      continue;
    }

    if (action.command === 'FDEL') {
      const repeatCount = Math.max(1, Number(action.count) || 1);
      for (let j = 0; j < repeatCount; j++) {
        addKeyPair('Delete', () => {
          if (selectionStart !== selectionEnd) {
            const start = Math.min(selectionStart, selectionEnd);
            const end = Math.max(selectionStart, selectionEnd);
            text = text.slice(0, start) + text.slice(end);
            selectionStart = start;
            selectionEnd = start;
            selectionAnchor = start;
            selectionFocus = start;
          } else if (selectionStart < text.length) {
            text = text.slice(0, selectionStart) + text.slice(selectionStart + 1);
            selectionEnd = selectionStart;
            selectionAnchor = selectionStart;
            selectionFocus = selectionStart;
          }
        }, true);
      }
      continue;
    }

    if (action.command === 'LEFT') {
      for (let j = 0; j < action.count; j++) {
        addKeyPair('ArrowLeft', () => {
          const cursor = Math.min(selectionStart, selectionEnd);
          selectionStart = selectionStart !== selectionEnd ? cursor : Math.max(0, cursor - 1);
          selectionEnd = selectionStart;
          selectionAnchor = selectionStart;
          selectionFocus = selectionStart;
        }, false);
      }
      continue;
    }

    if (action.command === 'LEFT_TO_START') {
      const moveCount = Math.max(0, selectionStart);
      if (moveCount > 0) {
        const downTs = nextTs(consumeDelayForRelevantOffset(0, 50));
        records.key_records[downTs] = 'keydown: ArrowLeft';
        let currentPos = selectionStart;
        let currentTs = downTs;
        while (currentPos > 0) {
          currentPos -= 1;
          selectionStart = currentPos;
          selectionEnd = currentPos;
          selectionAnchor = currentPos;
          selectionFocus = currentPos;
          records.cursor_records[currentTs] = `${selectionStart}:${selectionEnd}`;
          if (currentPos > 0) {
            currentTs = nextTs(50);
            records.key_records[currentTs] = 'repeat: ArrowLeft';
          }
        }
        const upTs = nextTs(50);
        records.key_records[upTs] = 'keyup: ArrowLeft';
        setCursorRecord(upTs);
        lastRelevantTs = upTs;
      }
      continue;
    }

    if (action.command === 'RIGHT') {
      for (let j = 0; j < action.count; j++) {
        addKeyPair('ArrowRight', () => {
          const cursor = Math.max(selectionStart, selectionEnd);
          selectionStart = selectionStart !== selectionEnd ? cursor : Math.min(text.length, cursor + 1);
          selectionEnd = selectionStart;
          selectionAnchor = selectionStart;
          selectionFocus = selectionStart;
        }, false);
      }
      continue;
    }

    if (action.command === 'RIGHT_TO_END') {
      const target = text.length;
      const moveCount = Math.max(0, target - selectionStart);
      if (moveCount > 0) {
        const downTs = nextTs(consumeDelayForRelevantOffset(0, 50));
        records.key_records[downTs] = 'keydown: ArrowRight';
        let currentPos = selectionStart;
        let currentTs = downTs;
        while (currentPos < target) {
          currentPos += 1;
          selectionStart = currentPos;
          selectionEnd = currentPos;
          selectionAnchor = currentPos;
          selectionFocus = currentPos;
          records.cursor_records[currentTs] = `${selectionStart}:${selectionEnd}`;
          if (currentPos < target) {
            currentTs = nextTs(50);
            records.key_records[currentTs] = 'repeat: ArrowRight';
          }
        }
        const upTs = nextTs(50);
        records.key_records[upTs] = 'keyup: ArrowRight';
        setCursorRecord(upTs);
        lastRelevantTs = upTs;
      }
      continue;
    }

    if (action.command === 'SLEFT' || action.command === 'SRIGHT' || action.command === 'SUP' || action.command === 'SDOWN') {
      const keyName = action.command === 'SLEFT'
        ? 'ArrowLeft'
        : action.command === 'SRIGHT'
          ? 'ArrowRight'
          : action.command === 'SUP'
            ? 'ArrowUp'
            : 'ArrowDown';
      for (let j = 0; j < action.count; j++) {
        const shiftDownTs = nextTs(consumeDelayForRelevantOffset(50, 50));
        records.key_records[shiftDownTs] = 'keydown: Shift';
        setCursorRecord(shiftDownTs);
        const arrowDownTs = nextTs(50);
        records.key_records[arrowDownTs] = `keydown: ${keyName}`;
        const nextState = applyShiftNavigationKeyToSelection(keyName, text, selectionAnchor, selectionFocus, 1);
        selectionStart = nextState.start;
        selectionEnd = nextState.end;
        selectionAnchor = nextState.anchor;
        selectionFocus = nextState.focus;
        const arrowUpTs = nextTs(50);
        records.key_records[arrowUpTs] = `keyup: ${keyName}`;
        setCursorRecord(arrowUpTs);
        lastRelevantTs = arrowUpTs;
        const shiftUpTs = nextTs(50);
        records.key_records[shiftUpTs] = 'keyup: Shift';
        setCursorRecord(shiftUpTs);
      }
      continue;
    }

    if (action.command === 'UP') {
      for (let j = 0; j < action.count; j++) {
        addKeyPair('ArrowUp', () => {}, false);
      }
      continue;
    }

    if (action.command === 'DOWN') {
      for (let j = 0; j < action.count; j++) {
        addKeyPair('ArrowDown', () => {}, false);
      }
      continue;
    }

    if (action.command === 'UP_TO_START') {
      addKeyPair('ArrowUp', () => {
        selectionStart = 0;
        selectionEnd = 0;
        selectionAnchor = 0;
        selectionFocus = 0;
      }, false);
      continue;
    }

    if (action.command === 'DOWN_TO_END') {
      addKeyPair('ArrowDown', () => {
        selectionStart = text.length;
        selectionEnd = text.length;
        selectionAnchor = text.length;
        selectionFocus = text.length;
      }, false);
      continue;
    }

    if (action.command === 'HOME') {
      addKeyPair('Home', () => {
        selectionStart = 0;
        selectionEnd = 0;
        selectionAnchor = 0;
        selectionFocus = 0;
      }, false);
      continue;
    }

    if (action.command === 'END') {
      addKeyPair('End', () => {
        selectionStart = text.length;
        selectionEnd = text.length;
        selectionAnchor = text.length;
        selectionFocus = text.length;
      }, false);
    }
  }

  if (pendingPauseMs != null) {
    ts += Math.max(1, pendingPauseMs);
    pendingPauseMs = null;
  }
  records.header_records.endtime = ts;
  return records;
}


async function saveLinearRepresentationFromUI() {
  const code = String(i_code?.value || '').trim().toUpperCase();
  const input = document.getElementById('linearRepInput');
  const linear = String(input?.value || '').trim();

  if (code.length !== 6) {
    $("#messageLabel").text("Code must be 6 letters/digits.");
    return;
  }
  if (!linear) {
    $("#messageLabel").text("Linear representation is empty.");
    return;
  }

  try {
    const synthetic = linearRepresentationToSyntheticRecords(linear, Date.now());
    const jsonStr = JSON.stringify(synthetic, null, '\t');
    const compressed = pako.deflate(jsonStr);
    const lsString = makeStorageKeyForCode(code);

    await idbStore.setItem(lsString, compressed);
    const saveMessage = t("msg.saveMessage", { lsString });
    $("#messageLabel").text(saveMessage);
    if (messages) {
      messages.value += saveMessage;
      messages.scrollTop = messages.scrollHeight;
    }
    await updateListbox();
  } catch (e) {
    console.error('Linear-to-log save failed:', e);
    $("#messageLabel").text("Could not convert linear representation to log.");
    if (messages) {
      messages.value += "Linear-to-log conversion failed.\n";
      messages.scrollTop = messages.scrollHeight;
    }
  }
}
