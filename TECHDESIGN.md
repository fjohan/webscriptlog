# Technical Design: Bare WebScriptLog Application

This document describes the bare application made from `index.html` and the current `webscriptlog_main.js`. It is intended to be sufficient to rebuild those parts from scratch while preserving the contracts used by the extracted pane modules.

## Scope

In scope:

- HTML shell, templates, IDs, script load order, and button/pane placeholders from `index.html`.
- Core recorder, storage/loading, replay, process graph, and compatibility glue from `webscriptlog_main.js`.
- Public globals/functions that extracted panes and older call sites depend on.

Out of scope:

- Internal implementation of extracted panes under `panes/*`.
- Internal implementation of `ui.js`, `webscriptlog_dashboard.js`, `webscriptlog_record_utils.js`, `webscriptlog_analysis_core.js`, linear/IDFX modules, and fetch/export helpers.
- CSS details except where required by DOM behavior.

## Runtime Model

The app is a classic browser app using global scripts, not ES modules. Scripts are loaded in `index.html`, and `<body onload="init()">` starts the app.

Important load-order constraints:

1. Utility modules load before `webscriptlog_main.js`:
   - `i18n.js`
   - `webscriptlog_record_utils.js`
   - `webscriptlog_analysis_core.js`
   - `panes/info/inspect_core.js`
2. `webscriptlog_main.js` defines global record state and core functions.
3. Pane modules load after main and override/provide pane-facing globals:
   - `renderDiffKeysPane`
   - `renderWordHistoryPane`
   - `makeFTAnalysis`
   - `makeRevisionTable`
   - `inspectRecords`
   - `initMobileNotesPrototype`
4. Replay/linear/dashboard modules load after pane modules.
5. External libraries load late but are expected before user actions:
   - `idbStore`
   - `diff_match_patch`
   - `FileSaver`
   - `d3`
   - `pako`
   - `jQuery`

The design depends heavily on global variables and global function names. A rebuild should preserve these names until all remaining modules are modernized.

## HTML Shell

`index.html` contains:

- `<div id="tabs"></div>`: populated by `ui.js`.
- `<template id="panel-RECORD">`: recorder UI.
- `<template id="panel-MOBILE_NOTES">`: mobile notes UI.
- `<template id="panel-REPLAY">`: dashboard workspace and module bank.
- `<template id="panel-ANALYZE">`: now mostly empty; analysis panes live in replay dashboard.
- `<template id="panel-SETTINGS">`: language/layout controls.

The UI system clones/moves template content into visible panels. Code in `webscriptlog_main.js` assumes the relevant template content has been installed before `init()` resolves DOM references.

### Required IDs

Recorder:

- `recorderFrame`
- `recorder`
- `recorderImageOverlay`
- `recorderButtons`
- `userCode`
- `linearRepInput`
- `b_linearlog`
- `messageLabel`

Mobile notes:

- `mobileNotesApp`
- `mobileNotesHome`
- `mobileNotesStatus`
- `mobileNotesCode`
- `mobileNotesOverview`
- `mobileNotesNew`
- `mobileNotesCommitActive`
- `mobileNotesGrid`
- `mobileNotesEditorShell`
- `mobileNotesTitle`
- `mobileNotesCommitOpen`
- `mobileNotesEditor`
- `mobileNotesCaret`

Replay/dashboard:

- `playbackLayoutShell`
- `playbackDashboard`
- `dashboardModuleBank`
- `replayFrame`
- `replayTransportControls`
- `replayUseRecorderSize`
- `replayEnsureCaretVisible`
- `replayVirtualCursor`
- `playback`
- `replaySelectionOverlay`
- `replayCaretOverlay`
- `playbackTextTraceOutput`
- `playbackWritingScorePauseCrit`
- `playbackWritingScoreOutput`
- `playbackProgressGraph`
- `diffKeysOutput`
- `wordHistoryOutput`
- `lb_load`
- `div_fetch`
- `startlimit`
- `endlimit`
- `sentenceDiffTable`
- `content`
- `label`
- `table-container`
- `messages`
- `inspectIntervals`
- `inspectBasis`
- `pauseCrit`
- `idfxCsvOutput`

Settings:

- `lang`
- `layoutMode`

## Record Data Model

A WebScriptLog recording is an object with record maps keyed by millisecond timestamps encoded as object keys:

```js
{
  header_records: {
    starttime: Number,
    endtime: Number,
    _indexeddb_key?: String
  },
  text_records: {
    [timestamp]: String
  },
  cursor_records: {
    [timestamp]: "start:end"
  },
  key_records: {
    [timestamp]: "keydown: X" | "keyup: X" | "repeat: X" |
                 "mousedown: yes" | "mouseup: yes" | "mousemove: yes"
  },
  scroll_records: {
    [timestamp]: String|Number
  },
  image_records: {
    [timestamp]: "show" | "hide"
  },
  window_records: {
    [timestamp]: Object
  }
}
```

The current in-memory globals mirror this schema:

- `header_record`
- `text_record`
- `cursor_record`
- `key_record`
- `scroll_record`
- `image_record`
- `window_record`

Timer-holder maps used only during replay:

- `text_record_keeper`
- `cursor_record_keeper`
- `scroll_record_keeper`

Other key globals:

- `recorder`
- `playback`
- `messages`
- `lb_load`
- `linoutput`
- `i_code`
- `myDmp`
- `sid`

## Initialization

`init()` performs the application bootstrap.

Required behavior:

1. Call `initUI()` from `ui.js`.
2. Read URL parameter `sid`; fall back to `sessionStorage.sid`; update all `.sidLabel` elements.
3. If `sid` exists, reveal fetch controls (`#div_fetch`).
4. Resolve and initialize DOM globals:
   - `recorder`
   - `playback`
   - `messages`
   - `lb_load`
   - `linoutput`
   - `i_code`
5. Initialize all record maps to empty objects.
6. Initialize `myDmp = new diff_match_patch()`.
7. Call `initMobileNotesPrototype()`.
8. Call `updateListbox()`.
9. Disable recording buttons until a valid user code is entered.
10. Bind global delegated listeners:
   - writing-score pause threshold input
   - process graph controls
   - replay size/caret/virtual cursor options
   - resize behavior for recorder image overlay

`checkUserCode(input)` enables recording and linear import when `input.value.length === 6`; otherwise disables them.

## Recording Flow

### Start

`startRecording()`:

- Rejects if `recorder.recording` is true.
- Clears `recorder.value`.
- Calls `doRecording()`.

`continueRecording()`:

- Calls `doRecording()` without clearing text.

`doRecording()`:

- Resets all live record maps.
- Attaches recorder listeners:
  - `keydown` -> `recordKeyDown`
  - `keyup` -> `recordKeyUp`
  - `mousedown` -> `recordMouseDown`
  - `mouseup` -> `recordMouseUp`
  - `mousemove` -> `recordMouseMove`
  - `input` -> `recordInput`
  - `scroll` -> `recordScroll`
- Sets visual recording state.
- Stores `header_record.starttime = Date.now()`.
- Writes status to `messages`.

### Event Capture

`recordKeyDown(e)`:

- If key is not in global `keySet`, add it and record `keydown: ${e.key}`.
- If key already down, record `repeat: ${e.key}` and current cursor range.

`recordKeyUp(e)`:

- If key exists in `keySet`, delete it.
- Record `keyup: ${e.key}` and current cursor range.

Mouse events:

- `recordMouseDown`, `recordMouseUp`, `recordMouseMove` record mouse event strings in `key_record` and cursor range in `cursor_record`.
- `mousemove` is recorded only while buttons are pressed.

`recordInput()`:

- Calculates text diff against `current_text`.
- Updates `text_record[timestamp] = recorder.value`.
- Updates `cursor_record[timestamp] = "selectionStart:selectionEnd"`.
- Updates `current_text`.

`recordScroll()`:

- Records `recorder.scrollTop` in `scroll_record`.

### Stop and Save

`stopRecording()`:

- Stops emulation if present.
- Rejects if not recording.
- Sets `header_record.endtime = Date.now()`.
- Removes recorder event listeners.
- Disables recording state and restores UI.
- Requires at least one text record.
- Builds records object from live maps.
- Serializes JSON with tabs.
- Compresses with `pako.deflate`.
- Saves to IndexedDB via `idbStore.setItem(key, compressed)`.
- Key is built from user code and timestamp.
- Calls `updateListbox()`.
- Optionally uploads to server if `sid` exists.

## Storage and Loading

IndexedDB access is via `idbStore`.

### Keys

`makeWebScriptLogStorageKey(prefix, records, fallbackName)`:

- Builds a stable `wslog_*` style key.
- Includes date/time and fallback name where available.

`makeUniqueWebScriptLogIDBKey(baseKey)`:

- Checks IDB and appends a suffix if needed.

`makeStorageKeyForCode(code)`:

- Legacy key helper using `wslog_${code}_DD-MM-YYYY_HH:MM:SS`.

### Saving

`saveWebScriptLogRecordsToIndexedDB(records, baseKey)`:

- Ensures unique key.
- JSON serializes records.
- Compresses with `pako.deflate`.
- Saves bytes to IDB.
- Refreshes and selects the listbox key.

### Loading

`updateListbox()`:

- Lists IDB keys and populates `#lb_load`.

`getJsonFromIDB(key)`:

- Reads stored value.
- Handles compressed byte arrays, Blob-like objects, and strings.
- Inflates compressed data with `pako.inflate({ to: "string" })`.

`loadFromListbox()`:

- Stops replay.
- Reads selected IDB item.
- Parses JSON.
- Normalizes missing groups.
- Assigns live record globals.
- Writes status.
- Calls:
  - `makeRevisionTable()`
  - `renderDiffKeysPane()`
  - `renderWordHistoryPane()`
  - dashboard event `log:loaded`

`applyWebScriptLogRecords(records, key)`:

- Same assignment path as load, used by uploads/importers/mobile notes.

`openFile(event)`:

- Reads a selected local `.txt`/JSON file.
- Parses and normalizes records.
- Saves to IndexedDB when possible.
- Applies records to live state.

Other listbox actions:

- `clearListbox()`: remove selected item.
- `emptyListbox()`: clear all local items.
- `dlFromListbox()`: download stored JSON.
- `dlFinalTextFromListbox()`: download final text only.
- `fetchFromStorage()` / `fetchPlusFromStorage()`: server fetch routes using PHP endpoints.

## Replay System

Replay renders the loaded text/cursor/scroll timeline into `#playback`.

### Entry Points

- `replayNormal()` -> `replayStart(1)`
- `replayFast()` -> `replayStart(0.1)`
- `replayPauseToggle()`
- `replayStop()`
- `replayStepEditForward()`
- `replayStepEditBackward()`
- `replayGoToEnd()`
- `setReplayStartTimestamp(timestamp, mode)`

### Replay State

`replayState`:

```js
{
  active: Boolean,
  paused: Boolean,
  speedup: Number,
  mark: Number,
  startedAt: Number,
  currentTs: Number|null,
  pausedAtLogicalTs: Number|null
}
```

`groupTime` tracks manual replay jump position, especially from revision-table rows.

### Starting Replay

`replayStart(speedup)`:

- Calls `replayStop()`.
- Rejects if recording is active.
- Uses `groupTime` or `header_record.starttime` as the mark.
- Schedules `setTimeout` callbacks for:
  - `text_record` -> `changeValueCallback`
  - `cursor_record` -> `changeCursorCallback`
  - `scroll_record` -> `changeScrollCallback`
- Starts process graph marker loop.

Callbacks update:

- `playback.value`
- selection/cursor
- scroll position
- replay virtual cursor overlays
- process graph marker

### Stepping

`getReplayTextEditEntries()` returns sorted text records.

`replayStepEditForward()`:

- Finds next text event after current logical timestamp.
- Calls `setReplayStartTimestamp(next.ts, "inclusive")`.

`replayStepEditBackward()`:

- Finds previous text event before current logical timestamp.
- Calls `setReplayStartTimestamp(previous.ts, "inclusive")`.

`replayGoToEnd()`:

- Jumps to `header_record.endtime` or last text timestamp.

### Cursor and View

Replay supports:

- Native textarea selection.
- Virtual cursor/caret overlay.
- Selection overlay for replayed ranges.
- Optional matching of recorder dimensions.
- Optional scroll-to-caret behavior.

Important functions:

- `parseReplayCursorRecord`
- `resolveReplayStateAtTimestamp`
- `syncReplayCursorMode`
- `updateReplayCaretOverlay`
- `updateReplaySelectionOverlay`
- `ensureReplayCaretVisible`
- `syncReplayRecorderSize`

## Process Graph

`processGraphFormat()` builds graph data from current records and calls `drawSvg()`.

Data series:

- `textSeries`: elapsed time, product length, process length.
- `positionSeries`: cursor position over time.
- `pauseSeries`: pause events from `getPauseEvents()`.

Controls:

- `#processGraphPauseThreshold`
- `#processGraphPauseMin`
- `#processGraphPauseMax`

Graph output:

- SVG element `#playbackProgressGraph`.
- D3 renders axes, lines, pause markers, and replay marker.

Replay marker:

- `updateProcessGraphReplayMarker(timestamp)`
- `startProcessGraphReplayMarkerLoop()`
- `stopProcessGraphReplayMarkerLoop()`

Resize handling:

- `bindProcessGraphResizeObserver()`
- `scheduleProcessGraphRefresh()`

## Image Overlay Recording

The recorder has a placeholder image overlay controlled by `toggleRecorderImageOverlay()`.

Behavior:

- Toggles `recorderImageOverlayActive`.
- Records `"show"` / `"hide"` in `image_record`.
- Adds/removes CSS class `image-overlay-active` on `#recorderFrame`.
- Sets recorder read-only while overlay is active.
- Draws placeholder content into `#recorderImageOverlay`.

`makeImageClickTextTimeline()` creates a text timeline around image show events for debugging/analysis.

## Compatibility With Extracted Panes

`webscriptlog_main.js` intentionally exposes thin wrappers:

- `normalizeWebScriptLogRecords`
- `getCurrentWebScriptLogRecords`
- `escapeDiffKeysHtml`
- `buildDiffKeysRows`
- `buildWordHistoryRows`
- `buildFinalTextCharacterRows`
- `joinFinalTextAnalysisAndDiffKeys`
- `normalizeInspectMetricRecords`
- `getSortedRecordEntries`
- `getPauseEvents`
- `buildInspectMetricsFromRecords`

Pane modules are expected to provide:

- `renderDiffKeysPane`
- `renderWordHistoryPane`
- `makeFTAnalysis`
- `makeRevisionTable`
- `inspectRecords`
- `initMobileNotesPrototype`
- `showWritingScore`

Linear modules are expected to provide:

- `makeLinearRepresentationReport`
- `recordsToLinearRepresentation`
- `validateLinearRepresentation`
- `saveLinearRepresentationFromUI`

IDFX modules are expected to provide:

- `printWebScriptLogIDFX`
- `printPendingDiffKeysDirectIDFX`
- `importIDFXFromIDFXCSVPane`
- `downloadIDFXFromIDFXCSVPane`
- `uploadIDFXToIDFXCSVPane`

Dashboard/UI modules are expected to provide:

- `initUI`
- `window.dashboardEvents`
- `window.activateWebScriptLogTab`

## Server Interaction

The app can operate offline via IndexedDB. If `sid` is present, server fetch/upload behavior is enabled.

Server endpoints:

- `php/getdata.php`
- upload path used in `stopRecording()` via `fetch`

Fetch helpers:

- `fetchFromStorage()`
- `fetchPlusFromStorage()`
- batch/export helpers loaded as separate scripts.

Server data is line-oriented JSON or compressed JSON depending on path. Rebuild should preserve current input tolerance.

## Error Handling Principles

Current behavior is pragmatic:

- Most user-visible errors append text to `#messages`.
- Console errors are used for developer/debug context.
- Failed IDB refresh after save logs warning but does not abort save.
- File upload/load catches parse/save errors and reports to messages.
- Missing pane functions are mostly assumed to exist after script load.

## Bare Rebuild Checklist

To rebuild `index.html` and `webscriptlog_main.js` from scratch:

1. Recreate the HTML templates and required IDs listed above.
2. Preserve classic script loading order and global execution model.
3. Implement global record maps and DOM globals.
4. Implement `init()` with UI init, SID handling, DOM lookup, empty record initialization, and event binding.
5. Implement recorder lifecycle:
   - start/continue/stop
   - key/mouse/input/scroll event capture
   - image overlay events
6. Implement WebScriptLog record schema and normalization bridge.
7. Implement IndexedDB save/load/list/delete/download operations with `pako` compression.
8. Implement `applyWebScriptLogRecords()` and ensure it triggers moved panes and dashboard events.
9. Implement replay:
   - timer scheduling
   - jump/step/end controls
   - cursor/scroll replay
   - virtual cursor overlays
10. Implement process graph generation and D3 rendering.
11. Preserve compatibility wrappers used by panes and legacy call sites.
12. Keep extracted pane internals outside the bare rebuild, but preserve their DOM targets and global entry points.

## Main-Owned Systems Still Not Extracted

The current main file still owns:

- record pane and recording lifecycle
- storage/loading/fetch/listbox integration
- text replay engine
- replay cursor/selection overlays
- process graph rendering
- image overlay recording
- several compatibility wrappers

These are the next candidates for extraction after the pane reorganization.
