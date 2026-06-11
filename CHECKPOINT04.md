# CHECKPOINT04

## Scope
This checkpoint summarizes the current state of the linear representation workflow, with focus on:

1. Cursor/selection roundtrip
2. Shift+Arrow selection
3. Keyboard cut/copy/paste
4. Undo/redo handling

It also includes a survey of scripts in `tools/`.

## Linear Representation: Current State

### 1) Cursor / Selection Roundtrip

- The roundtrip path is stable for text and cursor reconstruction on the current real-log set used during development.
- Core model:
  - Text evolution is derived from `text_records` diffs.
  - Navigation intent is derived primarily from `key_records`, with `cursor_records` used to resolve ambiguous position/selection states.
  - Explicit cursor/selection markers include:
    - `<NAVx>`: resolve caret at index `x`
    - `<CLICKx>`: mouse click at caret `x`
    - `<SELa:b>`: range selection
- Boundary navigation abstractions are in place:
  - `<LEFT_TO_START>`, `<RIGHT_TO_END>`, `<UP_TO_START>`, `<DOWN_TO_END>`
- Roundtrip validation strategy:
  - `log -> linear -> synthetic log -> linear`
  - Compare canonicalized linear outputs + final reconstructed text
- Important recent behavior:
  - For undo/redo+tied effects, ordering is constrained so the representation does not move undo/redo earlier than its true position when pause filtering changes.

### 2) Shift+Arrow Selection

- Shift-selection commands are represented and replayed:
  - `<SLEFT>`, `<SRIGHT>`, `<SUP>`, `<SDOWN>` (+ counted forms)
- Selection anchor/focus is tracked to preserve direction-sensitive behavior.
- Shift+Arrow run handling:
  - Repeats are collapsed where safe.
  - Cursor-record-backed reconciliation is used if predicted vs actual selection diverges.
- Validator work now includes cursor/selection fidelity checks (not only final text).

### 3) Keyboard Cut / Copy / Paste

- Chord tokens are represented as informational linear items:
  - `<COPY>`, `<CUT>`, `<PASTE>`
- Detection:
  - Requires Control/Meta held.
  - `COPY` and `CUT` only render when a non-empty selection exists.
- Semantics:
  - Decorative in replay model (no separate clipboard simulator required for reconstruction).
  - Text effects still come from normal text diffs, so replay consistency is preserved.
- Synthetic-log generation:
  - Emits chord key records (Control + key) for roundtrip consistency.

### 4) Undo / Redo

- Tokens:
  - `<UNDO>`, `<REDO>` and counted forms (`<UNDO7>`, `<REDO3>`)
  - Saturation marker introduced for clear over-repeat bursts: `<UNDO*>`, `<REDO*>`
- Key design:
  - Undo/redo are represented as actions; text effects are represented separately as inserts/deletes.
  - This makes process impact visible and supports analysis of change effects.
- Tie handling:
  - For true local cursor-ties (`effect + NAV/SEL/CLICK + UNDO/REDO`), order can be normalized to action-first while preserving replay.
  - Tie reordering is deliberately restricted to avoid temporal drift when pause threshold changes.
- Compaction:
  - Adjacent undo/redo bursts are compacted.
  - Repeated `UNDO/FDEL` or `REDO/FDEL` pair blocks are re-compacted deterministically after pause filtering, so threshold changes do not fragment them into smaller alternating chunks.
- Threshold sensitivity:
  - Pause tokens are threshold-dependent by design.
  - Non-pause structural chunks are now much more stable across nearby thresholds (e.g., avoiding `REDO3/FDEL3` splitting into `REDO2/FDEL2 + REDO/FDEL`).

## Additional Linear Rules Added Recently

- Start/end boundary pauses:
  - Time from `header.starttime` to first activity can render at beginning.
  - Time from last activity to `header.endtime` can render at end.
- Pause format:
  - `<s.ddd>` up to three decimals, threshold-controlled.

## Tools Survey (`tools/`)

### Core Inspection / Conversion

- `print_linear.js`
  - Print linear representation for one log file.
  - Supports `--pause-threshold` and `--fast|--slow`.

- `trace_key_linear_map.js`
  - Detailed trace view:
    - full linear
    - key-to-linear mapping
    - grouped linear build trace
    - combined timeline
    - key coverage summaries (direct vs inferred text coverage, unmapped keys)

- `compare_trace_linear.js`
  - Compares linear from trace-build path vs canonical print/build path.
  - Used as guardrail for “one output, two views” consistency.

### Validation

- `validate_real_logs.js`
  - Full validation across `real_logs`.
  - Includes final-text/roundtrip checks and navigation fidelity summary.

- `validate_real_logs_fast.js`
  - Faster validation path for larger batches.

- `validate_cursor_logs_fast.js`
  - Cursor/selection-focused fast validation for roundtrip fidelity.

### Performance / Profiling

- `compare_fast_linear.js`
  - Compares original vs fast linear implementations (correctness + timing).

- `profile_linear_performance.js`
  - Function-level timing profile for linear conversion and related hot paths.

### Dataset / Generation Utilities

- `analyze_linear_dataset.js`
  - Dataset-level summary stats for logs in `real_logs` (record counts, simple scale stats).

- `generate_emulated_log.js`
  - Node-side synthetic log generation via emulation routines.
  - Useful for controlled test data without browser interaction.

## Known Remaining Sensitivities

- Undo/redo saturation (`*`) is heuristic and may need further tuning per corpus.
- Threshold changes still legitimately alter pause token placement and therefore local grouping opportunities.
- Some mobile-origin logs with `Unidentified` key values remain inherently ambiguous and depend more heavily on text/cursor reconciliation.

