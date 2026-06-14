(function (root) {
  "use strict";

  const recordUtils = root.WebScriptLogRecordUtils || (typeof require === "function" ? require("./webscriptlog_record_utils.js") : null);

  function sortedEntries(recordObject) {
    return recordUtils.sortedEntries(recordObject || {});
  }

  function formatSeconds(ts, startTime) {
    if (!Number.isFinite(ts)) return "";
    const base = Number.isFinite(startTime) ? startTime : 0;
    return ((ts - base) / 1000).toFixed(3);
  }

  function diffSpan(previousText, currentText) {
    let prefixLength = 0;
    const maxPrefix = Math.min(previousText.length, currentText.length);
    while (prefixLength < maxPrefix && previousText[prefixLength] === currentText[prefixLength]) prefixLength += 1;

    let suffixLength = 0;
    while (
      suffixLength < previousText.length - prefixLength &&
      suffixLength < currentText.length - prefixLength &&
      previousText[previousText.length - 1 - suffixLength] === currentText[currentText.length - 1 - suffixLength]
    ) {
      suffixLength += 1;
    }

    return {
      prefixLength,
      suffixLength,
      totalLength: currentText.length,
      removed: previousText.slice(prefixLength, previousText.length - suffixLength),
      inserted: currentText.slice(prefixLength, currentText.length - suffixLength)
    };
  }

  function changedTextFromSpan(span) {
    if (span.removed && span.inserted) return `${span.removed} -> ${span.inserted}`;
    if (span.removed) return `DEL: ${span.removed}`;
    return span.inserted;
  }

  function keyValueFromRaw(raw, prefix) {
    const value = String(raw || "");
    return value.startsWith(prefix) ? value.slice(prefix.length) : "";
  }

  function findMatchingKeyup(keyEntries, keydownEntry) {
    if (!keydownEntry) return null;
    const key = keyValueFromRaw(keydownEntry.value, "keydown: ");
    if (!key) return null;

    for (const entry of keyEntries) {
      if (entry.ts <= keydownEntry.ts) continue;
      const raw = String(entry.value || "");
      if (raw.startsWith("keyup: ") && keyValueFromRaw(raw, "keyup: ") === key) return entry;
    }

    return null;
  }

  function buildDiffKeysRows(records = {}) {
    const normalized = recordUtils.normalizeRecords(records);
    const textEntries = sortedEntries(normalized.text_records);
    const keyEntries = sortedEntries(normalized.key_records);
    const startTime = Number(normalized.header_records?.starttime);
    const keydowns = keyEntries.filter((entry) => String(entry.value || "").startsWith("keydown: "));
    const rows = [];
    let previousText = "";
    let keydownIndex = 0;

    for (let i = 0; i < textEntries.length; i++) {
      const entry = textEntries[i];
      const currentText = String(entry.value ?? "");
      const span = diffSpan(previousText, currentText);

      while (keydownIndex < keydowns.length && keydowns[keydownIndex].ts <= entry.ts) keydownIndex += 1;
      const precedingKeydown = keydownIndex > 0 ? keydowns[keydownIndex - 1] : null;
      const matchingKeyup = findMatchingKeyup(keyEntries, precedingKeydown);
      const keydownValue = keyValueFromRaw(precedingKeydown?.value, "keydown: ");
      const keyupValue = keyValueFromRaw(matchingKeyup?.value, "keyup: ");

      rows.push({
        id: i + 1,
        textDataTimestamp: entry.ts,
        prefixLength: span.prefixLength,
        totalLength: currentText.length,
        keydownTime: formatSeconds(precedingKeydown?.ts, startTime),
        keyupTime: formatSeconds(matchingKeyup?.ts, startTime),
        keydownValue,
        keyupValue,
        keyMatch: precedingKeydown ? (matchingKeyup ? "matched" : "missing-keyup") : "missing-keydown",
        changedText: changedTextFromSpan(span),
        removed: span.removed,
        inserted: span.inserted
      });

      previousText = currentText;
    }

    return rows;
  }

  function getDiffMatchPatch() {
    if (typeof root.diff_match_patch === "function") return new root.diff_match_patch();
    if (root.myDmp) return root.myDmp;
    throw new Error("diff_match_patch is not available");
  }

  function buildTextData(records = {}) {
    const normalized = recordUtils.normalizeRecords(records);
    const headerStart = Number(normalized.header_records?.starttime);
    const ftr = {};
    if (Number.isFinite(headerStart)) ftr[String(headerStart)] = "";
    Object.assign(ftr, normalized.text_records || {});

    return sortedEntries(ftr).map((entry, index) => ({
      index,
      time: entry.ts,
      text: String(entry.value ?? "")
    }));
  }

  function buildFinalTextCharacterRows(records = {}) {
    const dmp = getDiffMatchPatch();
    const textData = buildTextData(records);
    const textList = [];

    for (let index = 1; index < textData.length; index++) {
      const item = textData[index];
      const prev = textData[index - 1];
      const diffs = dmp.diff_main(prev.text, item.text);
      dmp.diff_cleanupSemantic(diffs);

      let currentPosition = 0;
      diffs.forEach(([operation, text]) => {
        if (operation === 0) {
          currentPosition += text.length;
          return;
        }
        if (operation === 1) {
          const timeSincePrev = item.time - prev.time;
          const timeUntilNext = (textData[index + 1] ? textData[index + 1].time : item.time) - item.time;
          for (const character of text) {
            textList.splice(currentPosition, 0, {
              character,
              textDataIndex: item.index,
              textDataTimestamp: item.time,
              timeSincePrev,
              timeUntilNext
            });
            currentPosition += 1;
          }
          return;
        }
        if (operation === -1) {
          for (let i = 0; i < text.length; i++) textList.splice(currentPosition, 1);
        }
      });
    }

    return textList.map((item, position) => ({
      position,
      character: item.character,
      textDataIndex: item.textDataIndex,
      textDataTimestamp: item.textDataTimestamp,
      timeSincePrev: item.timeSincePrev,
      timeUntilNext: item.timeUntilNext
    }));
  }

  function joinFinalTextAnalysisAndDiffKeys(records = {}) {
    const ftRows = buildFinalTextCharacterRows(records);
    const dkRows = buildDiffKeysRows(records);
    const dkById = new Map(dkRows.map((row) => [row.id, row]));
    const matchedIds = new Set();

    const joined = ftRows.map((ft) => {
      const dk = dkById.get(ft.textDataIndex) || null;
      if (dk) matchedIds.add(dk.id);
      return {
        position: ft.position,
        character: ft.character,
        textDataIndex_id: ft.textDataIndex,
        textDataTimestamp: ft.textDataTimestamp,
        timeSincePrev: ft.timeSincePrev,
        timeUntilNext: ft.timeUntilNext,
        dk_prefixLength: dk?.prefixLength ?? "",
        dk_totalLength: dk?.totalLength ?? "",
        dk_keydownTime: dk?.keydownTime ?? "",
        dk_keyupTime: dk?.keyupTime ?? "",
        dk_keydownValue: dk?.keydownValue ?? "",
        dk_keyupValue: dk?.keyupValue ?? "",
        dk_keyMatch: dk?.keyMatch ?? "",
        dk_changedText: dk?.changedText ?? "",
        dk_removed: dk?.removed ?? "",
        dk_inserted: dk?.inserted ?? ""
      };
    });

    return {
      joined,
      leftovers: dkRows.filter((row) => !matchedIds.has(row.id))
    };
  }

  function getFinalWords(joinedRows) {
    const finalText = joinedRows.map((row) => row.character).join("");
    const words = [];
    const re = /[^\s]+/gu;
    let match;

    while ((match = re.exec(finalText)) !== null) {
      words.push({
        index: words.length + 1,
        word: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }

    return words;
  }

  function numericId(row) {
    const value = Number(row?.textDataIndex_id);
    return Number.isFinite(value) ? value : null;
  }

  function numericValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function insertedLength(row) {
    return String(row?.dk_inserted ?? "").length;
  }

  function isBoundaryChar(char) {
    return char == null || /\s/u.test(String(char));
  }

  function isSingleCharacterInsertionAt(row, position) {
    return numericValue(row?.dk_prefixLength) === position && insertedLength(row) === 1 && !row?.dk_removed;
  }

  function isSingleCharacterInsertion(row) {
    return insertedLength(row) === 1 && !row?.dk_removed;
  }

  function classifyInitialBoundaryTiming(joinedRows, word) {
    const first = joinedRows[word.start];
    const previous = word.start > 0 ? joinedRows[word.start - 1] : null;
    const firstId = numericId(first);
    const previousId = numericId(previous);

    if (!first) return "missing-word-initial";
    if (!isBoundaryChar(previous?.character)) return "no-preceding-boundary";
    if (firstId == null) return "missing-source-id";
    if (previous && previousId === firstId) return "same-edit-as-boundary";
    if (previous && previousId != null && firstId === previousId + 1 && isSingleCharacterInsertion(first)) return "typed-after-boundary";
    if (!previous && isSingleCharacterInsertionAt(first, word.start)) return "typed-after-start-boundary";
    if (previous && previousId != null && firstId > previousId + 1 && isSingleCharacterInsertion(first)) return "inserted-after-boundary-later";
    return "not-boundary-timed";
  }

  function classifyInitialEdgeProvenance(joinedRows, word) {
    const first = joinedRows[word.start];
    const next = word.start + 1 < word.end ? joinedRows[word.start + 1] : null;
    const firstId = numericId(first);
    const nextId = numericId(next);

    if (!first) return "missing-word-initial";
    if (firstId == null) return "missing-source-id";
    if (next && nextId != null && nextId === firstId + 1 && isSingleCharacterInsertion(first)) return "simple-initial";
    if (numericValue(first.dk_prefixLength) === word.start && isSingleCharacterInsertion(first)) {
      if (next && nextId != null && nextId !== firstId + 1) return "inserted-initial-later";
      return "simple-initial";
    }
    if (numericValue(first.dk_prefixLength) === word.start) return "nonsingle-initial-edit";
    if (next && nextId != null && firstId !== nextId - 1) return "revised-initial-context";
    return "nonconsecutive-initial";
  }

  function classifyFinalBoundaryTiming(joinedRows, word) {
    const last = joinedRows[word.end - 1];
    const next = word.end < joinedRows.length ? joinedRows[word.end] : null;
    const lastId = numericId(last);
    const nextId = numericId(next);

    if (!last) return "missing-word-final";
    if (!next) return "end-of-text";
    if (!isBoundaryChar(next.character)) return "no-following-boundary";
    if (lastId == null) return "missing-source-id";
    if (nextId === lastId) return "same-edit-as-boundary";
    if (nextId != null && nextId === lastId + 1 && isSingleCharacterInsertion(next)) return "typed-before-boundary";
    if (nextId != null && nextId > lastId + 1 && isSingleCharacterInsertion(next)) return "boundary-inserted-later";
    if (nextId != null && nextId < lastId && isSingleCharacterInsertion(last)) return "inserted-before-boundary-later";
    return "not-boundary-timed";
  }

  function classifyFinalEdgeProvenance(joinedRows, word) {
    const last = joinedRows[word.end - 1];
    const previous = word.end - 2 >= word.start ? joinedRows[word.end - 2] : null;
    const lastId = numericId(last);
    const previousId = numericId(previous);

    if (!last) return "missing-word-final";
    if (lastId == null) return "missing-source-id";
    if (previous && previousId != null && lastId !== previousId + 1 && isSingleCharacterInsertion(last)) return "inserted-final-later";
    if (isSingleCharacterInsertion(last)) return "simple-final";
    if (numericValue(last.dk_prefixLength) === word.end - 1) return "nonsingle-final-edit";
    if (previous && previousId != null && lastId !== previousId + 1) return "revised-final-context";
    return "nonconsecutive-final";
  }

  function boundaryPair(left, right) {
    const leftId = numericId(left);
    const rightId = numericId(right);
    return `[${leftId == null ? "-" : leftId}/${rightId == null ? "-" : rightId}]`;
  }

  function longestConsecutiveRunLength(ids) {
    const sortedIds = [...new Set(ids.filter((id) => id != null))].sort((a, b) => a - b);
    let longest = 0;
    let current = 0;
    let previous = null;
    for (const id of sortedIds) {
      current = previous != null && id === previous + 1 ? current + 1 : 1;
      if (current > longest) longest = current;
      previous = id;
    }
    return longest;
  }

  function buildWordHistoryEventRows(records = {}) {
    const dkRows = buildDiffKeysRows(records);
    const charList = [];
    const editEvents = [];
    let nextCharId = 1;

    for (const row of dkRows) {
      const start = Math.max(0, Math.min(Number(row.prefixLength) || 0, charList.length));
      const deleteCount = String(row.removed || "").length;
      const beforeChar = start > 0 ? charList[start - 1] : null;
      const afterChar = start + deleteCount < charList.length ? charList[start + deleteCount] : null;
      const removedChars = charList.slice(start, start + deleteCount);
      const insertedChars = Array.from(String(row.inserted || "")).map((char) => ({
        id: nextCharId++,
        char,
        createdByDkId: row.id,
        finalPosition: null,
        finalWordIndex: null
      }));

      charList.splice(start, deleteCount, ...insertedChars);
      editEvents.push({ row, beforeChar, afterChar, removedChars, insertedChars });
    }

    const finalText = charList.map((item) => item.char).join("");
    const words = [];
    const re = /[^\s]+/gu;
    let match;
    while ((match = re.exec(finalText)) !== null) {
      words.push({
        wordIndex: words.length + 1,
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
        eventIds: new Set()
      });
    }

    const wordByIndex = new Map(words.map((word) => [word.wordIndex, word]));
    for (let pos = 0; pos < charList.length; pos++) {
      const char = charList[pos];
      char.finalPosition = pos;
      const word = words.find((item) => pos >= item.start && pos < item.end);
      if (word) {
        char.finalWordIndex = word.wordIndex;
        word.eventIds.add(char.createdByDkId);
      }
    }

    for (const event of editEvents) {
      const targetWordIndexes = new Set();
      event.insertedChars.forEach((char) => {
        if (char.finalWordIndex) targetWordIndexes.add(char.finalWordIndex);
      });
      if (event.removedChars.length > 0) {
        if (event.beforeChar?.finalWordIndex) targetWordIndexes.add(event.beforeChar.finalWordIndex);
        if (event.afterChar?.finalWordIndex) targetWordIndexes.add(event.afterChar.finalWordIndex);
      }
      targetWordIndexes.forEach((wordIndex) => {
        const word = wordByIndex.get(wordIndex);
        if (!word) return;
        word.eventIds.add(event.row.id);
        event.removedChars.forEach((removed) => {
          if (removed.createdByDkId) word.eventIds.add(removed.createdByDkId);
        });
      });
    }

    return words.map((word) => ({
      wordIndex: word.wordIndex,
      eventIds: [...word.eventIds].sort((a, b) => a - b)
    }));
  }

  function calculateWordPurity(word, historyWord, joined) {
    const finalSourceIds = joined.slice(word.start, word.end).map((row) => numericId(row)).filter((id) => id != null);
    const historyEventIds = new Set((historyWord?.eventIds || []).filter((id) => Number.isFinite(Number(id))).map(Number));
    const finalSourceIdSet = new Set(finalSourceIds);
    const extraHistoryEvents = [...historyEventIds].filter((id) => !finalSourceIdSet.has(id)).length;
    const mainRunLength = longestConsecutiveRunLength(finalSourceIds);
    const extraFinalSourceEvents = Math.max(0, finalSourceIds.length - mainRunLength);
    return extraHistoryEvents + extraFinalSourceEvents;
  }

  function buildWordBoundaryTiming(records = {}) {
    const { joined } = joinFinalTextAnalysisAndDiffKeys(records);
    const words = getFinalWords(joined);
    const historyRows = buildWordHistoryEventRows(records);
    const historyByIndex = new Map(historyRows.map((word) => [word.wordIndex, word]));

    return words.map((word) => {
      const first = joined[word.start];
      const last = joined[word.end - 1];
      const previous = word.start > 0 ? joined[word.start - 1] : null;
      const next = word.end < joined.length ? joined[word.end] : null;
      return {
        index: word.index,
        word: word.word,
        start: word.start,
        end: word.end,
        wordPurity: calculateWordPurity(word, historyByIndex.get(word.index), joined),
        wordInitialTimeSincePrev: first?.timeSincePrev ?? "",
        wordInitialTextDataIndexPair: boundaryPair(previous, first),
        wordInitialBoundaryTiming: classifyInitialBoundaryTiming(joined, word),
        wordInitialEdgeProvenance: classifyInitialEdgeProvenance(joined, word),
        wordFinalTimeUntilNext: last?.timeUntilNext ?? "",
        wordFinalTextDataIndexPair: boundaryPair(last, next),
        wordFinalBoundaryTiming: classifyFinalBoundaryTiming(joined, word),
        wordFinalEdgeProvenance: classifyFinalEdgeProvenance(joined, word)
      };
    });
  }

  const api = {
    buildDiffKeysRows,
    buildFinalTextCharacterRows,
    joinFinalTextAnalysisAndDiffKeys,
    buildWordBoundaryTiming,
    buildWordHistoryRows: buildWordBoundaryTiming
  };

  root.WebScriptLogAnalysisCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
