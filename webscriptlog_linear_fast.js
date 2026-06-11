// Experimental fast-path encoder for linear representation.
// This file intentionally leaves webscriptlog_linear.js untouched.

function buildFastSortedRecordEntries(recordObject) {
  return Object.keys(recordObject || {})
    .map((k) => ({ ts: Number(k), value: recordObject[k] }))
    .filter((entry) => Number.isFinite(entry.ts))
    .sort((a, b) => a.ts - b.ts);
}

function buildFastCursorIndex(cursorRecords) {
  const entries = buildFastSortedRecordEntries(cursorRecords);
  const byTs = new Map();

  for (let i = 0; i < entries.length; i++) {
    const parsed = parseCursorRecord(entries[i].value);
    entries[i] = {
      ts: entries[i].ts,
      value: entries[i].value,
      parsed
    };
    byTs.set(entries[i].ts, parsed);
  }

  return { entries, byTs };
}

function createCursorBeforeTracker(cursorEntries) {
  return {
    entries: cursorEntries,
    index: 0,
    chosen: null
  };
}

function getCursorStateBeforeFast(tracker, ts) {
  while (tracker.index < tracker.entries.length && tracker.entries[tracker.index].ts < ts) {
    tracker.chosen = tracker.entries[tracker.index].parsed;
    tracker.index += 1;
  }
  return tracker.chosen;
}

function findCursorForNavigationKeyFast(keyEntries, keyIndex, keyName, cursorByTs) {
  const keyEntry = keyEntries[keyIndex];
  let lastSeen = null;

  for (let i = keyIndex + 1; i < keyEntries.length; i++) {
    const raw = String(keyEntries[i]?.value || '');
    const cursor = cursorByTs.get(keyEntries[i].ts) || null;
    if (cursor && (raw === `repeat: ${keyName}` || raw === `keyup: ${keyName}`)) {
      lastSeen = cursor;
    }
    if (raw === `keyup: ${keyName}`) {
      return lastSeen;
    }
    if (raw.startsWith('keydown: ') && raw !== `keydown: ${keyName}`) break;
  }

  return lastSeen || cursorByTs.get(keyEntry.ts) || null;
}

function appendLinearRunNavigationTokenFast(parts, keyName, currentText, currentState, finalCursor) {
  if (!finalCursor || finalCursor.start !== finalCursor.end) return false;

  const textLength = String(currentText || '').length;
  const currentPos = currentState.start;
  const finalPos = finalCursor.start;
  const hasSelection = currentState.start !== currentState.end;
  const leftEdge = Math.min(currentState.start, currentState.end);
  const rightEdge = Math.max(currentState.start, currentState.end);

  if (hasSelection) {
    if (keyName === 'ArrowLeft' && finalPos === currentState.start) {
      parts.push(makeLinearCountToken('LEFT', 1));
      return true;
    }
    if (keyName === 'ArrowRight' && finalPos === currentState.end) {
      parts.push(makeLinearCountToken('RIGHT', 1));
      return true;
    }
    if (keyName === 'ArrowLeft' && finalPos > leftEdge && finalPos < rightEdge) {
      return false;
    }
    if (keyName === 'ArrowRight' && finalPos > leftEdge && finalPos < rightEdge) {
      return false;
    }
    if (keyName === 'ArrowLeft' && finalPos < leftEdge) {
      parts.push(makeLinearCountToken('LEFT', 1));
      const extra = Math.max(0, leftEdge - finalPos);
      if (finalPos === 0) parts.push('<LEFT_TO_START>');
      else if (extra > 0) parts.push(makeLinearCountToken('LEFT', extra));
      return true;
    }
    if (keyName === 'ArrowRight' && finalPos > rightEdge) {
      parts.push(makeLinearCountToken('RIGHT', 1));
      const extra = Math.max(0, finalPos - rightEdge);
      if (finalPos === textLength) parts.push('<RIGHT_TO_END>');
      else if (extra > 0) parts.push(makeLinearCountToken('RIGHT', extra));
      return true;
    }
  }

  if (keyName === 'ArrowLeft') {
    if (finalPos === 0) {
      parts.push('<LEFT_TO_START>');
      return true;
    }
    const count = Math.max(0, currentPos - finalPos);
    if (count > 0) {
      parts.push(makeLinearCountToken('LEFT', count));
      return true;
    }
    return false;
  }

  if (keyName === 'ArrowRight') {
    if (finalPos === textLength) {
      parts.push('<RIGHT_TO_END>');
      return true;
    }
    const count = Math.max(0, finalPos - currentPos);
    if (count > 0) {
      parts.push(makeLinearCountToken('RIGHT', count));
      return true;
    }
    return false;
  }

  if (keyName === 'ArrowUp') {
    if (finalPos === 0) {
      parts.push('<UP_TO_START>');
      return true;
    }
    return false;
  }

  if (keyName === 'ArrowDown') {
    if (finalPos === textLength) {
      parts.push('<DOWN_TO_END>');
      return true;
    }
    return false;
  }

  return false;
}

function appendLinearShiftRunNavigationTokenFast(parts, keyName, currentState, finalCursor) {
  if (!finalCursor || finalCursor.start === finalCursor.end) return null;
  if (keyName !== 'ArrowLeft' && keyName !== 'ArrowRight') return null;

  const anchor = Math.max(0, Number(currentState.anchor) || 0);
  const focus = Math.max(0, Number(currentState.focus) || 0);
  let finalFocus = null;

  if (finalCursor.start === anchor) finalFocus = finalCursor.end;
  else if (finalCursor.end === anchor) finalFocus = finalCursor.start;
  else return null;

  const count = Math.abs(finalFocus - focus);
  if (count <= 0) return null;

  if (keyName === 'ArrowLeft') {
    if (finalFocus >= focus) return null;
    parts.push(makeLinearCountToken('SLEFT', count));
  } else if (keyName === 'ArrowRight') {
    if (finalFocus <= focus) return null;
    parts.push(makeLinearCountToken('SRIGHT', count));
  }

  return makeSelectionStateFromAnchorFocus(anchor, finalFocus);
}

function appendLinearNavigationEventFast(parts, keyEntries, keyIndex, cursorByTs, currentText, currentState, modifiers) {
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
    const cursor = cursorByTs.get(keyEntry.ts) || null;
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
  const cursor = findCursorForNavigationKeyFast(keyEntries, keyIndex, keyName, cursorByTs);
  const predicted = modifiers.shift
    ? applyShiftNavigationKeyToSelection(keyName, currentText, currentState.anchor, currentState.focus, 1)
    : applyNavigationKeyToSelection(keyName, currentText, currentState.start, currentState.end);
  let emitted = false;

  if (
    !modifiers.shift &&
    (keyName === 'ArrowLeft' || keyName === 'ArrowRight' || keyName === 'ArrowUp' || keyName === 'ArrowDown') &&
    runInfo.keyupIndex !== -1 &&
    cursor &&
    cursor.start === cursor.end
  ) {
    const emittedRun = appendLinearRunNavigationTokenFast(parts, keyName, currentText, currentState, cursor);
    if (emittedRun) {
      return {
        ...makeCollapsedSelectionState(cursor.start),
        consumed: runInfo.keyupIndex - keyIndex + 1,
        activityTs: keyEntries[runInfo.keyupIndex].ts,
        navigated: true
      };
    }
  }

  if (
    modifiers.shift &&
    (keyName === 'ArrowLeft' || keyName === 'ArrowRight') &&
    runInfo.keyupIndex !== -1 &&
    cursor &&
    cursor.start !== cursor.end
  ) {
    const nextSelection = appendLinearShiftRunNavigationTokenFast(parts, keyName, currentState, cursor);
    if (nextSelection) {
      return {
        ...nextSelection,
        consumed: runInfo.keyupIndex - keyIndex + 1,
        activityTs: keyEntries[runInfo.keyupIndex].ts,
        navigated: true
      };
    }
  }

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

function recordsToLinearRepresentationFast(records) {
  const normalized = {
    text_records: records?.text_records || {},
    cursor_records: records?.cursor_records || {},
    key_records: records?.key_records || {}
  };
  const textEntries = buildFastSortedRecordEntries(normalized.text_records);
  const keyEntries = buildFastSortedRecordEntries(normalized.key_records);
  const cursorIndex = buildFastCursorIndex(normalized.cursor_records);
  const cursorTracker = createCursorBeforeTracker(cursorIndex.entries);
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
      const partsBeforePause = parts.length;
      appendPauseToken(parts, lastActivityTs, keyTs, pauseThresholdSeconds);
      const nextState = appendLinearNavigationEventFast(
        parts,
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
        keyIndex += Math.max(1, Number(nextState.consumed) || 1);
        continue;
      } else {
        parts.length = partsBeforePause;
      }
      keyIndex += 1;
    }

    const cursorBefore = getCursorStateBeforeFast(cursorTracker, ts);

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
    const cursorAtTextTs = cursorIndex.byTs.get(ts) || null;
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
    const nextState = appendLinearNavigationEventFast(
      parts,
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

function validateLinearRepresentationFast(records) {
  const linearRaw = recordsToLinearRepresentationFast(records);
  const linearCanonical = canonicalizeLinearRepresentation(linearRaw);
  const reconstructed = reconstructTextFromLinearRepresentation(linearRaw);
  const synthetic = linearRepresentationToSyntheticRecords(linearRaw, Number(records.header_records?.starttime) || 0);
  const roundTripLinearRaw = recordsToLinearRepresentationFast(synthetic);
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
