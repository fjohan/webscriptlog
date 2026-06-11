# CHECKPOINT05

## Scope

This checkpoint summarizes the main work done after `CHECKPOINT04`, starting from a WebScriptLog app focused on stable linear representation, writing-score display, and linear roundtrip validation.

The session shifted attention from the core linear model toward the browser UI as an interactive dashboard, richer replay/analysis coordination, IDFX/CSV conversion, import/export workflows, and browser-based emulation of writing sessions.

This summary is user-input-centric: it follows the larger requests made during the session and omits small incidental fixes unless they clarify the state of a feature.

Relevant files include:

- `index.html`
- `main.css`
- `ui.js`
- `webscriptlog_main.js`
- `webscriptlog_dashboard.js`
- `webscriptlog_linear.js`
- `webscriptlog_emulation.js`
- `dist/webscriptlog_format_converters.js`

## Starting Point

At the start of this session, the app already had:

- stable linear representation generation and validation
- styled writing score output
- pause tokens and pause-threshold handling
- cursor/selection roundtrip support in the linear layer
- support for cut/copy/paste, undo/redo, and shift-selection in linear representation
- tools for trace inspection and validation, especially `tools/trace_key_linear_map.js`

The main gap was that much of this functionality was still exposed through separate buttons and separate tab areas rather than as coordinated interactive analysis panels.

## Text Trace Table From Linear Build Trace

The first major UI request was to expose the grouped linear-build trace in the interface.

Implemented direction:

- Added a Text Trace table derived from grouped linear trace rows, especially rows where `source_kind=text`.
- Displayed the associated `linear_items` for each row.
- Added `source_ts` display as seconds from log start in `s.ddd` format.
- Made timestamps clickable so the text replayer can jump to that point.
- Added both start and end timestamps for text rows.
- Treated start and end timestamps differently:
  - start timestamp jumps to the state before the row's linear text contribution
  - end timestamp jumps inclusively to the state after the row's final text contribution

This made it possible to inspect parts of the linear representation and directly replay from the corresponding point in the original log.

## Faster Linear Analysis In The Browser

The user noted that the trace script was fast, while browser-side analysis felt slow.

Implemented direction:

- Investigated the browser analysis path vs. the faster trace/linear tooling path.
- Integrated a faster linear-analysis route for the UI so writing score/text trace generation no longer relied only on the slower path.
- Kept the output aligned with the existing linear representation behavior while improving responsiveness for larger files.

## Grid Layout And Load Grid Workflow

The user requested a new `Grid` layout under Settings, combining replay and analysis elements in a 2x2 view.

Implemented direction:

- Added a `Grid` layout option.
- Built an initial 2x2 Playback grid containing:
  - text replay window
  - text trace
  - writing score
  - process/progress graph
- Moved the existing right-hand Playback control stack below the grid.
- Added `LOAD GRID`, which loads the selected IndexedDB log and populates the replay, text trace, writing score, process graph, and later other dashboard panes in one action.
- Moved analysis views out of the old Analyze-tab flow where appropriate.
- Reworked pane heights so large panes such as text trace and writing score stay bounded and scroll internally.
- Made process graph sizing respond to dashboard pane resizing.

This was the first step toward treating the UI as a dashboard rather than a fixed tabbed analysis page.

## Process Graph

The original progress graph was renamed and expanded.

User-requested changes implemented:

- Renamed Progress graph to Process graph.
- Added additional series:
  - Process
  - Product
  - Position
  - Pause
- Restyled the graph toward the supplied `process-graph.png` reference, while intentionally excluding the background tint and zero-time red line from that image.
- Added graph-specific pause threshold controls.
- Added pause min/max controls to focus the pause y-axis range when long pauses obscure shorter pauses.
- Debounced threshold/range updates so rapid input changes do not redraw the graph unnecessarily.
- Hooked the graph to replay:
  - replay updates a vertical marker in the graph
  - clicking the graph seeks the text replayer to the corresponding time

The process graph became an interactive navigation surface, not just a static analysis output.

## Modular Dashboard Panels

The user requested a more ambitious dashboard system made of independent, swappable panels/tools.

Implemented direction:

- Added `webscriptlog_dashboard.js` with a dashboard/module registry architecture.
- Dashboard modules/panes include:
  - Text Replay
  - Text Trace
  - Writing Score
  - Process Graph
  - Revision Table
  - Final Text Analysis
  - Log Object Manager
  - Info Window
  - IDFX/CSV
- Added pane selectors so panel content can be changed at runtime.
- Added layout serialization/migration support so layouts can be saved/restored/generated programmatically.
- Added pane controls:
  - Add pane
  - Delete pane
  - 1x1
  - 2x1
  - 1x2
  - 2x2
  - Full
- Guarded against deleting the last pane.
- Made panel sizing more robust so panes span the intended 2-column grid without forcing unrelated rows to grow.
- Fixed panel moving behavior so selecting an already-used pane type moves it immediately rather than requiring the old pane to be emptied first.

The UI is now much closer to a dashboard/workspace model where tools are independent modules that can be composed and rearranged.

## Pane-Specific Controls

The user pushed controls down into the relevant panes instead of keeping them in old global Analyze-tab controls.

Implemented direction:

- Writing Score pane:
  - own pause threshold control
  - independent from statistics/inspect threshold
  - bounded pane with internal scrolling
- Text Trace pane:
  - removed from old Analyze flow
  - bounded pane with internal scrolling
- Process Graph pane:
  - own pause threshold
  - pause min/max controls
- Info Window pane:
  - contains Inspect button
  - contains interval, time-basis, and pause-threshold controls used by inspect/statistics
- Log Object Manager pane:
  - contains IndexedDB listbox and log-management controls
  - Playback transport buttons moved into the Text Replay pane

This established the pattern that pane-specific views own their own settings unless the setting is explicitly global.

## Replay Controls And Replay State

The user requested several changes to the text replayer.

Implemented direction:

- Moved replay, fast-forward, stop, and pause/resume controls into the Text Replay pane.
- Added a pause/resume replay button.
- Reset the replay view when loading a new log.
- Linked timestamp clicks in Text Trace and Revision Table to replay seeking.
- Reworked timestamp seeking so text/cursor/scroll are resolved as a coherent replay state instead of as unrelated nearest records.
- Added options to experiment with replay sizing:
  - Use recorder size
  - Keep edit line visible
- Added caret-visible scrolling logic so replay follows the current edit position even when replay pane dimensions differ from recording dimensions.

## Native vs Virtual Replay Cursor

A significant part of the session focused on replay caret/selection visibility across browsers and mobile devices.

User observations:

- Native cursor behavior differed between Firefox and Chrome.
- Virtual overlay cursor/selection could drift on some browsers.
- Focusable replay textareas cause mobile browsers to open the virtual keyboard, covering much of the screen.
- The user wanted a way to compare/use native and virtual cursor modes, but never both and never neither.

Implemented direction:

- Added a `Virtual cursor` checkbox in the Text Replay pane.
- When Virtual cursor is off:
  - virtual overlays are hidden
  - native browser caret/selection are used
- When Virtual cursor is on:
  - native caret is hidden/blurred
  - virtual caret/selection overlays are shown
- Ensured the two modes are exclusive.
- Kept replay protected against editing while still allowing browser cursor placement when native mode is active.

Current practical state:

- Native mode is useful for browser comparison and Chrome behavior.
- Virtual mode remains available when focus avoidance is more important, especially on mobile.

## Revision Table And Final Text Analysis Panels

The user asked to move the Revision Table and Final Text Analysis into dashboard panes and remove old analysis-tab remnants.

Implemented direction:

- Revision Table now works inside a dashboard pane.
- Final Text Analysis now works as a pane.
- `LOAD GRID` wires final text analysis generation along with the other major panes.
- Kept the `Generate Table` button because it is needed after marking words.
- Added a mobile-friendly alternative to double-click word marking in final text analysis.
- Removed obsolete analysis-tab headers/linear-data sections after the dashboard pane workflow became the main interface.

## Inspect / Info Window Changes

The user requested cleanup of inspect output and additional statistics.

Implemented direction:

- Stopped printing bulky `<writing-score>` and `<linear-representation>` sections in the inspect output.
- Added `mousedown` mouse-click count to the light statistics block.
- Moved inspect controls into the Info Window pane.

## IDFX / CSV Conversion And Pane

A large part of the session focused on converting WebScriptLog logs to/from external logger formats, especially FlexKeyLogger and Inputlog IDFX.

User-requested work:

- Inspect FlexKeyLogger in `dist/` to understand CSV and IDFX output.
- Convert current WebScriptLog records to Flex-style CSV and IDFX.
- Reverse the process, especially IDFX -> WebScriptLog.
- Investigate `inputlog-libreoffice`, a Java logger that writes IDFX.
- Determine whether the Inputlog route is richer than FlexLogger IDFX and whether a reasonable reverse conversion is possible.
- Implement a separate Inputlog/LibreOffice-style route so FlexLogger-style and Inputlog-style outputs can be compared.
- Support importing Inputlog-generated IDFX.
- Decouple conversion UI from the Info Window and create a dedicated `IDFX/CSV` dashboard pane.

Implemented direction:

- Added `dist/webscriptlog_format_converters.js`.
- Implemented WebScriptLog -> Flex-style CSV/IDFX.
- Implemented WebScriptLog -> Inputlog/LibreOffice-style IDFX as a separate route.
- Implemented IDFX -> WebScriptLog import.
- Added an `IDFX/CSV` dashboard pane with its own textarea and controls.
- Added an experimental note in the pane.
- Added IDFX download and upload/import controls.
- Set `_LogProgramVersion` to `7.0.0.2` in generated IDFX.
- Allowed IDFX download without first printing IDFX in the pane.
- Made upload/import save the imported log into IndexedDB.

## IDFX Compatibility Work

The user supplied actual IDFX files and roundtrip mismatch examples.

Issues investigated and addressed:

- Inputlog-generated IDFX contained XML quirks such as illegal Backspace character references.
- Keyboard replay plus explicit insert/replacement events could double-apply text, causing duplicated letters.
- Swedish characters `å`, `ä`, `ö` needed correct virtual-key mapping.
- Ctrl-combos for cut/copy/paste/select all/undo/redo were initially interpreted as literal letters.
- Real Inputlog control-combo samples showed that modified key events should be non-replayable and carry keyboard state.

Implemented direction:

- Sanitized problematic IDFX XML before DOM parsing.
- Avoided double application of keyboard replay and explicit text operations during import.
- Added better handling for Swedish character key mapping.
- Added modifier-aware handling for Ctrl/Alt/Meta combinations.
- Used supplied `actual.idfx`, `control-key-combos.idfx`, `original.txt`, and `imported.txt` to refine import/export behavior.

The IDFX/CSV feature remains explicitly marked experimental.

## IndexedDB Import Persistence

The user repeatedly noted that imported/uploaded logs could load into replay and analysis but not appear in the IndexedDB listbox.

Implemented direction:

- IDFX upload/import now saves imported WebScriptLog records into IndexedDB.
- The IndexedDB listbox is refreshed and the imported key selected.
- Import flow was split so parsing/loading UI cannot prevent saving to IndexedDB.
- WebScriptLog file upload through the Log Object Manager now also saves uploaded logs to IndexedDB.
- Uploaded WebScriptLog files receive generated `wslog_uploaded_...` keys, with suffixes added for uniqueness.

This aligned IDFX import and native WebScriptLog upload with the expected Log Object Manager workflow.

## Emulator Rework

The user substantially redefined the `EMULATE` button behavior.

Initial request:

- Stop using the small random story.
- Read `harvard.html`.
- Pick 10 random Harvard sentences.
- Introduce errors randomly.
- Go back and correct them.
- Avoid long left/right sequences; use up/down to navigate closer.
- Include selection/replace revision strategies.
- Respect the STOP button so emulation can be cancelled mid-run.

Implemented direction:

- Emulator now reads `harvard.html` and picks 10 random sentences.
- Sentences are written one per line.
- Synthetic errors are introduced into the draft.
- STOP cancels the async emulation rather than allowing it to keep dispatching edits.

The user then iterated on the desired revision behavior. Intermediate variants included:

- richer cut/copy/paste and delete strategies
- occasional mouse navigation
- simplified click-and-correct behavior
- numbered-line experiment with moving line 2 and renumbering

Current requested behavior implemented:

- Write 10 Harvard sentences, one per line, no numbering.
- Introduce spelling errors during initial writing.
- After writing all lines, perform a few word-level disruptions:
  - cut one word and leave it missing
  - cut-paste another word elsewhere
  - copy-paste another word elsewhere, creating superfluous text
- Restore the intended final text by:
  - correcting errors
  - retyping missing words/text
  - deleting superfluous words/text
  - using both arrow keys and mouse clicks for navigation
  - using both forward delete and backspace
  - using selection-based deletion/replacement

Further refinements made in response to user feedback:

- Restore no longer deletes large spans and retypes them.
- A restore step is bounded to at most one word, one whitespace, or one punctuation token.
- In-word errors are corrected as small character-level edits where possible.
- The restore pass is line-local: it identifies the next incorrect sentence line and skips lines that already exactly match the target.
- Navigation was changed to avoid odd Home/End jumps when a shorter route exists.
- Current navigation preference:
  - if the target is on a different line, use up/down to get to that line
  - then use left/right to narrow in to the target word/position
  - mouse clicks are still used occasionally
  - Home/End is only used when it is plausibly shorter within a line

This emulator is now intended to generate more realistic writing-process logs with errors, local corrections, word movement, and mixed navigation.

## Current High-Level State

By the end of this session, the app has moved from a mostly fixed replay/analyze interface toward a modular dashboard for writing-process analysis.

Major current capabilities added or reshaped in this session:

- Dashboard-style panel layout with swappable modules.
- `LOAD GRID` workflow to populate replay and analysis panes from one selected log.
- Text Trace table linked to replay timestamps.
- Interactive Process Graph linked bidirectionally with replay.
- Pane-owned controls for writing score, text trace, process graph, inspect, and IDFX/CSV.
- Dedicated IDFX/CSV pane with experimental conversion, import, upload, and download.
- IndexedDB persistence for imported IDFX and uploaded WebScriptLog files.
- Replay cursor modes for native vs. virtual cursor/selection display.
- Harvard-sentence browser emulator with cancellable execution and more realistic correction behavior.

## Known Sensitivities / Open Areas

- IDFX support is still experimental and should be validated against more real Inputlog files.
- Native vs. virtual cursor behavior remains browser-dependent, especially Chrome vs. Firefox and mobile keyboard behavior.
- Replay text layout can differ from recording layout because original recorder dimensions are not always known; the recorder-size and caret-visible options are exploratory controls for this.
- The emulator behavior is intentionally synthetic and still being tuned to produce plausible editing patterns rather than perfect human behavior.
