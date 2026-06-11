// Emulation helpers and synthetic session generation
class EmulationStoppedError extends Error {
  constructor() {
    super('Emulation stopped');
    this.name = 'EmulationStoppedError';
  }
}

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(base, jitter) {
  return Math.max(0, base + Math.floor(Math.random() * (jitter + 1)));
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled(items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

let emulateBusy = false;
let emulateCancelRequested = false;
let emulateInternalStop = false;
let emulationClipboard = '';

const FALLBACK_HARVARD_SENTENCES = [
  'The birch canoe slid on the smooth planks.',
  'Glue the sheet to the dark blue background.',
  "It's easy to tell the depth of a well.",
  'These days a chicken leg is a rare dish.',
  'Rice is often served in round bowls.',
  'The juice of lemons makes fine punch.',
  'The box was thrown beside the parked truck.',
  'The hogs were fed chopped corn and garbage.',
  'Four hours of steady work faced us.',
  'A large size in stockings is hard to sell.',
  'The boy was there when the sun rose.',
  'A rod is used to catch pink salmon.',
  'The source of the huge river is the clear spring.',
  'Kick the ball straight and follow through.',
  'Help the woman get back to her feet.'
];

function requestEmulationStop() {
  if (emulateBusy && !emulateInternalStop) emulateCancelRequested = true;
}

function assertEmulationActive() {
  if (emulateCancelRequested || !recorder?.recording) throw new EmulationStoppedError();
}

async function waitEmulation(ms) {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    assertEmulationActive();
    await sleepMs(Math.min(40, end - Date.now()));
  }
  assertEmulationActive();
}

function stripHTMLToSentences(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  return Array.from(doc.querySelectorAll('li'))
    .map((li) => li.textContent.replace(/\s+/g, ' ').trim())
    .filter((text) => /[.!?]$/.test(text) && text.length > 15);
}

async function loadHarvardSentences() {
  try {
    const response = await fetch('harvard.html', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const sentences = stripHTMLToSentences(await response.text());
    if (sentences.length >= 10) return sentences;
  } catch (err) {
    console.warn('Could not load harvard.html for emulation; using fallback sentences.', err);
  }
  return FALLBACK_HARVARD_SENTENCES;
}

async function pickEmulationScenario() {
  const sentences = await loadHarvardSentences();
  const selected = shuffled(sentences).slice(0, Math.min(10, sentences.length));
  return {
    target: selected.join('\n'),
    sentences: selected
  };
}

async function setSelectionByMouse(start, end = start, delayMs = 16) {
  assertEmulationActive();
  const s = Math.max(0, Math.min(start, recorder.value.length));
  const e = Math.max(0, Math.min(end, recorder.value.length));
  recorder.focus();
  recorder.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await waitEmulation(delayMs);
  recorder.setSelectionRange(s, e);
  recorder.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await waitEmulation(delayMs);
}

function replaceCurrentSelection(text) {
  assertEmulationActive();
  const s = recorder.selectionStart;
  const e = recorder.selectionEnd;
  recorder.value = recorder.value.slice(0, s) + text + recorder.value.slice(e);
  const p = s + text.length;
  recorder.setSelectionRange(p, p);
  recorder.dispatchEvent(new Event('input', { bubbles: true }));
}

async function keyTypeChar(ch, { baseDelay = 70, jitter = 80 } = {}) {
  assertEmulationActive();
  const key = ch === '\n' ? 'Enter' : ch;
  recorder.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await waitEmulation(8);
  // Synthetic key events do not trigger browser text insertion, so apply the edit explicitly.
  replaceCurrentSelection(key === 'Enter' ? '\n' : ch);
  await waitEmulation(8);
  recorder.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  await waitEmulation(randomDelay(baseDelay, jitter));
}

async function emulateTyping(text, { baseDelay = 70, jitter = 80 } = {}) {
  assertEmulationActive();
  recorder.focus();
  for (let i = 0; i < text.length; i++) {
    await keyTypeChar(text[i], { baseDelay, jitter });
  }
}

async function pressBackspace(times = 1, { baseDelay = 55, jitter = 60 } = {}) {
  for (let i = 0; i < times; i++) {
    assertEmulationActive();
    recorder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    await waitEmulation(8);
    const s = recorder.selectionStart;
    const e = recorder.selectionEnd;
    if (s !== e) {
      replaceCurrentSelection('');
    } else if (s > 0) {
      recorder.value = recorder.value.slice(0, s - 1) + recorder.value.slice(e);
      recorder.setSelectionRange(s - 1, s - 1);
      recorder.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await waitEmulation(8);
    recorder.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', bubbles: true }));
    await waitEmulation(randomDelay(baseDelay, jitter));
  }
}

async function pressDelete({ baseDelay = 55, jitter = 60 } = {}) {
  assertEmulationActive();
  recorder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
  await waitEmulation(8);
  const s = recorder.selectionStart;
  const e = recorder.selectionEnd;
  if (s !== e) {
    replaceCurrentSelection('');
  } else if (e < recorder.value.length) {
    recorder.value = recorder.value.slice(0, s) + recorder.value.slice(e + 1);
    recorder.setSelectionRange(s, s);
    recorder.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await waitEmulation(8);
  recorder.dispatchEvent(new KeyboardEvent('keyup', { key: 'Delete', bubbles: true }));
  await waitEmulation(randomDelay(baseDelay, jitter));
}

async function pressDeleteTimes(times = 1, opts = {}) {
  for (let i = 0; i < times; i++) {
    await pressDelete(opts);
  }
}

async function dispatchControlChord(key, delayMs = 22, effectFn = null) {
  assertEmulationActive();
  recorder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true, ctrlKey: true }));
  await waitEmulation(delayMs);
  recorder.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ctrlKey: true }));
  await waitEmulation(delayMs);
  if (typeof effectFn === 'function') {
    effectFn();
    await waitEmulation(delayMs);
  }
  recorder.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ctrlKey: true }));
  await waitEmulation(delayMs);
  recorder.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }));
  await waitEmulation(delayMs);
}

async function copySelection() {
  const s = recorder.selectionStart;
  const e = recorder.selectionEnd;
  emulationClipboard = recorder.value.slice(Math.min(s, e), Math.max(s, e));
  await dispatchControlChord('c');
}

async function cutSelection() {
  const s = recorder.selectionStart;
  const e = recorder.selectionEnd;
  emulationClipboard = recorder.value.slice(Math.min(s, e), Math.max(s, e));
  await dispatchControlChord('x', 22, () => replaceCurrentSelection(''));
}

async function pasteClipboard() {
  await dispatchControlChord('v', 22, () => replaceCurrentSelection(emulationClipboard));
}

async function moveByArrows(delta, { baseDelay = 18, jitter = 20, maxSteps = Infinity } = {}) {
  const key = delta < 0 ? 'ArrowLeft' : 'ArrowRight';
  let steps = Math.min(Math.abs(delta), maxSteps);
  while (steps > 0) {
    assertEmulationActive();
    recorder.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await waitEmulation(6);
    const p = recorder.selectionStart + (delta < 0 ? -1 : 1);
    const clamped = Math.max(0, Math.min(p, recorder.value.length));
    recorder.setSelectionRange(clamped, clamped);
    await waitEmulation(6);
    recorder.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    steps -= 1;
    await waitEmulation(randomDelay(baseDelay, jitter));
  }
}

function estimateVisualColumnWidth() {
  if (!recorder) return 56;
  const cols = Number(recorder.getAttribute('cols')) || 80;
  return Math.max(32, Math.min(90, Math.floor(cols * 0.8)));
}

function getLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function getLineColumnAtPosition(pos) {
  const starts = getLineStarts(recorder.value);
  const safePos = Math.max(0, Math.min(pos, recorder.value.length));
  let line = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= safePos) line = i;
    else break;
  }
  return { line, column: safePos - starts[line], starts };
}

function positionFromLineColumn(line, column) {
  const starts = getLineStarts(recorder.value);
  const targetLine = Math.max(0, Math.min(line, starts.length - 1));
  const lineStart = starts[targetLine];
  const nextStart = starts[targetLine + 1] ?? (recorder.value.length + 1);
  const lineEnd = Math.max(lineStart, nextStart - 1);
  return Math.max(lineStart, Math.min(lineEnd, lineStart + Math.max(0, column)));
}

function approximateVerticalPosition(pos, deltaLines) {
  const here = getLineColumnAtPosition(pos);
  return positionFromLineColumn(here.line + deltaLines, here.column);
}

async function moveByVerticalArrows(deltaLines, { baseDelay = 22, jitter = 24 } = {}) {
  const key = deltaLines < 0 ? 'ArrowUp' : 'ArrowDown';
  let steps = Math.abs(deltaLines);
  while (steps > 0) {
    assertEmulationActive();
    recorder.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await waitEmulation(6);
    const nextPos = approximateVerticalPosition(recorder.selectionStart, deltaLines < 0 ? -1 : 1);
    recorder.setSelectionRange(nextPos, nextPos);
    await waitEmulation(6);
    recorder.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    steps -= 1;
    await waitEmulation(randomDelay(baseDelay, jitter));
  }
}

async function pressBoundaryKey(key, { baseDelay = 20, jitter = 20 } = {}) {
  assertEmulationActive();
  recorder.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  await waitEmulation(6);
  const pos = recorder.selectionStart;
  const before = recorder.value.slice(0, pos);
  const lineStart = before.lastIndexOf('\n') + 1;
  const nextBreak = recorder.value.indexOf('\n', pos);
  const lineEnd = nextBreak < 0 ? recorder.value.length : nextBreak;
  const target = key === 'Home' ? lineStart : lineEnd;
  recorder.setSelectionRange(target, target);
  await waitEmulation(6);
  recorder.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  await waitEmulation(randomDelay(baseDelay, jitter));
}

async function pressDocumentBoundaryKey(key, { baseDelay = 20, jitter = 20 } = {}) {
  assertEmulationActive();
  recorder.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ctrlKey: true }));
  await waitEmulation(6);
  const target = key === 'Home' ? 0 : recorder.value.length;
  recorder.setSelectionRange(target, target);
  await waitEmulation(6);
  recorder.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ctrlKey: true }));
  return waitEmulation(randomDelay(baseDelay, jitter));
}

function findWordRange(word, fromIndex = 0) {
  const i = recorder.value.indexOf(word, Math.max(0, fromIndex));
  if (i < 0) return null;
  return { start: i, end: i + word.length };
}

function findAllWordRanges(text, word) {
  const ranges = [];
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'g');
  let match;
  while ((match = re.exec(text))) {
    ranges.push({ start: match.index, end: match.index + word.length, word });
  }
  return ranges;
}

function corruptWord(word) {
  if (word.length < 4) return word + word[word.length - 1];
  const mode = randomChoice(['drop', 'double', 'swap', 'neighbor']);
  const idx = Math.max(1, Math.min(word.length - 2, Math.floor(Math.random() * (word.length - 2)) + 1));
  if (mode === 'drop') return word.slice(0, idx) + word.slice(idx + 1);
  if (mode === 'double') return word.slice(0, idx) + word[idx] + word.slice(idx);
  if (mode === 'neighbor') return word.slice(0, idx) + randomChoice(['a', 'e', 'i', 'o', 'n', 'r', 's', 't']) + word.slice(idx + 1);
  return word.slice(0, idx - 1) + word[idx] + word[idx - 1] + word.slice(idx + 1);
}

function buildCorruptedDraft(target, maxFixes) {
  const candidates = Array.from(new Set((target.match(/\b[A-Za-z]{5,}\b/g) || []))).filter(word => word.length > 5);
  const selected = shuffled(candidates).slice(0, Math.max(1, Math.min(maxFixes, candidates.length)));
  let draft = target;
  const fixes = [];

  for (let i = 0; i < selected.length; i++) {
    const right = selected[i];
    const wrong = corruptWord(right);
    if (wrong === right) continue;
    const at = draft.indexOf(right);
    if (at >= 0) {
      draft = draft.slice(0, at) + wrong + draft.slice(at + right.length);
      fixes.push({ kind: 'word', wrong, right });
    }
  }

  return { draft, fixes };
}

async function navigateToPosition(pos, strategy) {
  assertEmulationActive();
  const target = Math.max(0, Math.min(pos, recorder.value.length));
  const current = recorder.selectionStart;
  let mode = strategy || 'shortest';
  if (mode === 'shortest') {
    const directDistance = Math.abs(target - current);
    if (directDistance <= 40) mode = 'arrows';
    else {
      const currentLoc = getLineColumnAtPosition(current);
      const targetLoc = getLineColumnAtPosition(target);
      const lineDelta = Math.abs(targetLoc.line - currentLoc.line);
      const columnDelta = Math.abs(targetLoc.column - currentLoc.column);
      const sameLine = lineDelta === 0;
      const currentLineStart = currentLoc.starts[currentLoc.line];
      const nextStart = currentLoc.starts[currentLoc.line + 1] ?? (recorder.value.length + 1);
      const currentLineEnd = Math.max(currentLineStart, nextStart - 1);
      const homeEndDistance = Math.min(
        Math.abs(current - currentLineStart) + Math.abs(target - currentLineStart),
        Math.abs(currentLineEnd - current) + Math.abs(currentLineEnd - target)
      );
      if (!sameLine) mode = 'vertical';
      else if (sameLine && homeEndDistance + 4 < directDistance) mode = 'home_end';
      else mode = 'arrows';
    }
  }

  if (mode === 'mouse') {
    await setSelectionByMouse(target, target);
    return;
  }

  if (mode === 'home_end') {
    const currentLineStart = recorder.value.lastIndexOf('\n', current - 1) + 1;
    const nextBreak = recorder.value.indexOf('\n', current);
    const currentLineEnd = nextBreak < 0 ? recorder.value.length : nextBreak;
    const useLineBoundary = target >= currentLineStart && target <= currentLineEnd;
    if (useLineBoundary) {
      const useHome = Math.abs(target - currentLineStart) <= Math.abs(currentLineEnd - target);
      await pressBoundaryKey(useHome ? 'Home' : 'End');
    } else {
      const useHome = target <= Math.floor(recorder.value.length / 2);
      await pressDocumentBoundaryKey(useHome ? 'Home' : 'End');
    }
    await navigateToPosition(target, 'vertical');
    return;
  }

  if (mode === 'vertical') {
    const currentLoc = getLineColumnAtPosition(recorder.selectionStart);
    const targetLoc = getLineColumnAtPosition(target);
    let lineDelta = targetLoc.line - currentLoc.line;
    if (lineDelta !== 0) await moveByVerticalArrows(lineDelta);
    const horizontalDelta = target - recorder.selectionStart;
    if (Math.abs(horizontalDelta) > 24) {
      const loc = getLineColumnAtPosition(target);
      const currentLineStart = loc.starts[loc.line];
      const nextStart = loc.starts[loc.line + 1] ?? (recorder.value.length + 1);
      const currentLineEnd = Math.max(currentLineStart, nextStart - 1);
      const useHome = Math.abs(target - currentLineStart) <= Math.abs(currentLineEnd - target);
      await pressBoundaryKey(useHome ? 'Home' : 'End');
    }
    await moveByArrows(target - recorder.selectionStart);
    return;
  }

  await moveByArrows(target - current);
  if (recorder.selectionStart !== target) recorder.setSelectionRange(target, target);
}

function getWordRanges(minLength = 4) {
  const ranges = [];
  const re = /\b[A-Za-z][A-Za-z']{3,}\b/g;
  let match;
  while ((match = re.exec(recorder.value))) {
    if (match[0].length >= minLength) {
      ranges.push({ start: match.index, end: match.index + match[0].length, word: match[0] });
    }
  }
  return ranges;
}

async function selectRangeForRevision(range, method = randomChoice(['mouse', 'keyboard'])) {
  if (!range) return false;
  if (method === 'mouse') {
    await setSelectionByMouse(range.start, range.end, 18);
    return true;
  }
  await navigateToPosition(range.start, randomChoice(['vertical', 'home_end']));
  recorder.setSelectionRange(range.start, range.end);
  await waitEmulation(randomDelay(40, 30));
  return true;
}

async function pasteClipboardAt(pos, method = randomChoice(['mouse', 'keyboard'])) {
  const safePos = Math.max(0, Math.min(pos, recorder.value.length));
  if (method === 'mouse') await setSelectionByMouse(safePos, safePos, 18);
  else await navigateToPosition(safePos, randomChoice(['vertical', 'home_end']));
  await pasteClipboard();
}

function wordInsertionPointNear(range) {
  const after = Math.max(0, Math.min(range.end, recorder.value.length));
  if (after < recorder.value.length && recorder.value[after] !== ' ' && recorder.value[after] !== '\n') return after;
  return after;
}

async function performWordDisruptions() {
  let ranges = shuffled(getWordRanges(5));
  if (ranges.length < 6) return;

  // 1. Cut a word and leave it missing.
  let cutMissing = ranges[0];
  await selectRangeForRevision(cutMissing, 'mouse');
  await cutSelection();
  await waitEmulation(randomDelay(180, 120));

  // 2. Cut-paste: move another word to a different line/position.
  ranges = shuffled(getWordRanges(5));
  const moveSource = ranges[0];
  const moveTarget = ranges.find((range) => Math.abs(range.start - moveSource.start) > 80) || ranges[ranges.length - 1];
  await selectRangeForRevision(moveSource, 'keyboard');
  await cutSelection();
  await waitEmulation(randomDelay(150, 100));
  if (emulationClipboard && !emulationClipboard.startsWith(' ')) emulationClipboard = ` ${emulationClipboard}`;
  if (emulationClipboard && !emulationClipboard.endsWith(' ')) emulationClipboard = `${emulationClipboard} `;
  await pasteClipboardAt(wordInsertionPointNear(moveTarget), 'mouse');
  await waitEmulation(randomDelay(180, 120));

  // 3. Copy-paste: duplicate a word elsewhere, creating a superfluous word.
  ranges = shuffled(getWordRanges(5));
  const copySource = ranges[0];
  const copyTarget = ranges.find((range) => Math.abs(range.start - copySource.start) > 80) || ranges[ranges.length - 1];
  await selectRangeForRevision(copySource, 'mouse');
  await copySelection();
  await waitEmulation(randomDelay(150, 100));
  if (emulationClipboard && !emulationClipboard.startsWith(' ')) emulationClipboard = ` ${emulationClipboard}`;
  if (emulationClipboard && !emulationClipboard.endsWith(' ')) emulationClipboard = `${emulationClipboard} `;
  await pasteClipboardAt(wordInsertionPointNear(copyTarget), 'keyboard');
}

async function deleteRangeByForwardDelete(start, length) {
  await navigateToPosition(start, 'shortest');
  await pressDeleteTimes(length, { baseDelay: 42, jitter: 45 });
}

async function deleteRangeByBackspace(start, length) {
  await navigateToPosition(start + length, 'shortest');
  await pressBackspace(length, { baseDelay: 42, jitter: 45 });
}

async function deleteRangeBySelection(start, length) {
  await selectRangeForRevision({ start, end: start + length }, randomChoice(['mouse', 'keyboard']));
  await pressDelete({ baseDelay: 42, jitter: 45 });
}

function firstEditTokenLength(text) {
  const value = String(text || '');
  if (!value) return 0;
  const word = value.match(/^[A-Za-z']+/);
  if (word) return word[0].length;
  const space = value.match(/^\s+/);
  if (space) return Math.min(space[0].length, 1);
  return 1;
}

function makeBoundedRestoreStep(diff) {
  const deletedLength = firstEditTokenLength(diff.deleted);
  const insertedLength = firstEditTokenLength(diff.inserted);
  return {
    start: diff.start,
    deleted: diff.deleted.slice(0, deletedLength),
    inserted: diff.inserted.slice(0, insertedLength)
  };
}

function getLineStartFromLines(lines, lineIndex) {
  let start = 0;
  for (let i = 0; i < lineIndex; i++) start += (lines[i] || '').length + 1;
  return start;
}

function getNextIncorrectLine(target) {
  const currentLines = recorder.value.split('\n');
  const targetLines = String(target || '').split('\n');
  const lineCount = Math.max(currentLines.length, targetLines.length);
  for (let i = 0; i < lineCount; i++) {
    if ((currentLines[i] || '') !== (targetLines[i] || '')) {
      return {
        index: i,
        start: getLineStartFromLines(currentLines, i),
        current: currentLines[i] || '',
        target: targetLines[i] || ''
      };
    }
  }
  return null;
}

function isSmallInWordEdit(step) {
  if (!step.deleted && !step.inserted) return false;
  if (step.deleted.length > 3 || step.inserted.length > 3) return false;
  const before = recorder.value[step.start - 1] || '';
  const after = recorder.value[step.start + step.deleted.length] || '';
  return /[A-Za-z']/.test(before) || /[A-Za-z']/.test(after) || /[A-Za-z']/.test(step.deleted + step.inserted);
}

async function applySmallInWordEdit(step, nav) {
  await navigateToPosition(step.start, nav);
  if (step.deleted.length > 0 && step.inserted.length > 0) {
    recorder.setSelectionRange(step.start, step.start + step.deleted.length);
    await emulateTyping(step.inserted, { baseDelay: 45, jitter: 55 });
    return;
  }
  if (step.deleted.length > 0) {
    if (Math.random() < 0.5) await deleteRangeByForwardDelete(step.start, step.deleted.length);
    else await deleteRangeByBackspace(step.start, step.deleted.length);
    return;
  }
  await emulateTyping(step.inserted, { baseDelay: 45, jitter: 55 });
}

async function reviseCurrentTextToTarget(target) {
  const deleteStrategies = ['forward_delete', 'backspace', 'selection_delete'];
  const navigationStrategies = ['shortest', 'shortest', 'shortest', 'mouse'];
  let deleteIndex = 0;
  let navIndex = 0;
  let guard = 0;

  while (recorder.value !== target && guard < 180) {
    assertEmulationActive();
    const line = getNextIncorrectLine(target);
    if (!line) break;
    const diff = getTextChangeDiff(line.current, line.target);
    if (!diff.deleted.length && !diff.inserted.length) break;
    const step = makeBoundedRestoreStep({
      start: line.start + diff.start,
      deleted: diff.deleted,
      inserted: diff.inserted
    });
    if (!step.deleted.length && !step.inserted.length) break;

    const nav = navigationStrategies[navIndex % navigationStrategies.length];
    navIndex += 1;

    if (isSmallInWordEdit(step)) {
      await applySmallInWordEdit(step, nav);
    } else if (step.deleted.length > 3 && step.inserted.length > 3) {
      const strategy = deleteStrategies[deleteIndex % deleteStrategies.length];
      deleteIndex += 1;
      if (strategy === 'forward_delete') {
        await deleteRangeByForwardDelete(step.start, step.deleted.length);
      } else if (strategy === 'backspace') {
        await deleteRangeByBackspace(step.start, step.deleted.length);
      } else {
        await deleteRangeBySelection(step.start, step.deleted.length);
      }
    } else if (step.deleted.length > 0 && step.inserted.length > 0) {
      await selectRangeForRevision(
        { start: step.start, end: step.start + step.deleted.length },
        nav === 'mouse' ? 'mouse' : 'keyboard'
      );
      await emulateTyping(step.inserted, { baseDelay: 45, jitter: 55 });
    } else if (step.deleted.length > 0) {
      const strategy = deleteStrategies[deleteIndex % deleteStrategies.length];
      deleteIndex += 1;
      if (strategy === 'forward_delete') {
        await deleteRangeByForwardDelete(step.start, step.deleted.length);
      } else if (strategy === 'backspace') {
        await deleteRangeByBackspace(step.start, step.deleted.length);
      } else {
        await deleteRangeBySelection(step.start, step.deleted.length);
      }
    } else if (step.inserted.length > 0) {
      await navigateToPosition(step.start, nav);
      await emulateTyping(step.inserted, { baseDelay: 45, jitter: 55 });
    }

    await waitEmulation(randomDelay(180, 140));
    guard += 1;
  }
}

async function saveRecordsToRealLogs(records, code, source = 'emulate') {
  const response = await fetch('php/save_real_log.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code,
      source,
      records
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !payload.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload.filename;
}

async function emulateRecordingSession(opts = {}) {
  if (emulateBusy) return;
  emulateBusy = true;
  emulateCancelRequested = false;
  emulateInternalStop = false;

  try {
    const editCount = Math.max(0, Math.min(12, Number(opts.editCount ?? 6) || 0));
    const codeRaw = String(opts.code || i_code.value || 'TST001').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const code = (codeRaw + 'AAAAAA').substring(0, 6);
    const scenario = await pickEmulationScenario();
    const corruptionPlan = buildCorruptedDraft(scenario.target, Math.max(2, Math.min(10, editCount || 2)));

    i_code.value = code;
    checkUserCode(i_code);

    if ($('#b_record').prop('disabled')) {
      messages.value += 'Emulation failed: START is disabled.\n';
      messages.scrollTop = messages.scrollHeight;
      return;
    }

    document.getElementById('b_record')?.click();
    await waitEmulation(220);

    await emulateTyping(corruptionPlan.draft, { baseDelay: 55, jitter: 75 });
    await waitEmulation(randomDelay(260, 180));

    await performWordDisruptions();
    await waitEmulation(randomDelay(260, 180));
    await reviseCurrentTextToTarget(scenario.target);

    await waitEmulation(260);
    emulateInternalStop = true;
    await stopRecording();
    emulateInternalStop = false;

    const records = getCurrentRecordSet();
    const linearValidation = validateLinearRepresentation(records);
    let savedFilename = '';

    try {
      savedFilename = await saveRecordsToRealLogs(records, code, 'emulate');
    } catch (saveErr) {
      console.error('Could not save emulated log to real_logs:', saveErr);
    }

    messages.value += `Emulation complete for code ${code} (edits=${editCount}).\n`;
    messages.value += `Harvard sentences: ${scenario.sentences.length}, draft errors: ${corruptionPlan.fixes.length}.\n`;
    messages.value += `Linear final text match: ${linearValidation.final_text_matches ? 'yes' : 'no'}.\n`;
    messages.value += `Linear roundtrip match: ${linearValidation.roundtrip_linear_matches ? 'yes' : 'no'}.\n`;
    if (savedFilename) messages.value += `Saved emulated log to real_logs/${savedFilename}.\n`;
    else messages.value += 'Could not save emulated log to real_logs.\n';
    messages.scrollTop = messages.scrollHeight;
  } catch (err) {
    if (err instanceof EmulationStoppedError) {
      if (recorder?.recording) {
        emulateInternalStop = true;
        await stopRecording();
        emulateInternalStop = false;
      }
      messages.value += 'Emulation stopped before completion.\n';
      messages.scrollTop = messages.scrollHeight;
    } else {
      throw err;
    }
  } finally {
    emulateBusy = false;
    emulateCancelRequested = false;
    emulateInternalStop = false;
  }
}

async function emulateRecordingFromUI() {
  const editInput = document.getElementById('emulateEditCount');
  const editCount = editInput ? Number(editInput.value) : 6;
  await emulateRecordingSession({ editCount });
}
