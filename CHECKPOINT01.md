# Checkpoint 01: Linear Analysis Status

## Scope
This checkpoint summarizes the current state of the linear analysis work in `uilab`, with emphasis on the conversion between recorded logs and linear representations.

Relevant files:
- `webscriptlog_linear.js`
- `tools/validate_real_logs.js`
- `tools/generate_emulated_log.js`
- `webscriptlog_emulation.js`

## Goal
The main goal of the linear analysis is to support a two-way workflow:

1. log -> linear representation
2. linear representation -> replay/reconstruction
3. linear representation -> synthetic log
4. synthetic log -> linear representation again

The practical target is that the linear representation should:
- preserve what the writer actually did as far as possible
- be replayable
- reconstruct the text correctly
- avoid redundant position information
- avoid inventing navigation sequences that were not in the log

## Current Main Functions
In `webscriptlog_linear.js`:

- `recordsToLinearRepresentation(records)`
  - Converts a saved log object into a linear string.
- `parseLinearRepresentation(linear)`
  - Parses the linear string into actions.
- `reconstructTextFromLinearRepresentation(linear)`
  - Replays the linear actions and reconstructs final text.
- `linearRepresentationToSyntheticRecords(linear, starttime)`
  - Converts the linear string into synthetic `header_records`, `text_records`, `key_records`, `cursor_records`, etc.
- `validateLinearRepresentation(records)`
  - Runs log -> linear -> replay and linear -> synthetic log -> linear checks.
- `canonicalizeLinearRepresentation(linear)`
  - Normalizes equivalent linear strings before comparison.

## Core Conversion Principle
The conversion from log to linear is currently based on:
- `text_records`
- `cursor_records`
- `key_records`

The encoder processes text changes chronologically.

For each text change:
- actual navigation keydowns before the text event are handled first
- then any needed navigation resolution is added
- then the text diff is converted to insertion/deletion tokens

Important change made during this work:
- the encoder no longer invents long left/right sequences when the log actually contains `Home`, `End`, `ArrowUp`, `ArrowDown`, or mouse clicks
- if a navigation key is logged but the exact resulting caret position is not predictable from the key alone, the encoder uses a `NAV` directive rather than making up repeated `LEFT`/`RIGHT`

## Current Linear Codes
The linear representation currently uses the following codes.

### Text insertion
Plain text is inserted directly.

Examples:
- `abc`
- `Jag har haft denna känsla`

Escaping:
- newline -> `<ENTER>`
- `<` -> `<LT>`
- `>` -> `<GT>`

### Deletion and forward deletion
- `<DEL>` = one backspace
- `<DEL7>` = seven backspaces
- `<FDEL>` = one forward delete
- `<FDEL3>` = three forward deletes

Notes:
- single-count commands omit the number
- repeated adjacent commands are collapsed, so `<DEL><DEL>` becomes `<DEL2>`

### Horizontal navigation
- `<LEFT>` / `<LEFT5>`
- `<RIGHT>` / `<RIGHT12>`

These should only appear when the log actually contains corresponding horizontal movement or when a short direct horizontal move is part of the chosen synthetic representation.

### Vertical navigation
- `<UP>` / `<UP4>`
- `<DOWN>` / `<DOWN3>`

These are now preserved from actual `ArrowUp` / `ArrowDown` keydowns in logs.

### Boundary navigation
- `<HOME>`
- `<END>`

These are now preserved from actual `Home` / `End` keydowns in logs.

### Mouse navigation
- `<CLICK0>`
- `<CLICK35>`

This means a mouse click that placed the caret at an absolute position.

### Selection
- `<SEL10:15>`

This means a selection from position 10 to position 15.

### Navigation resolution
- `<NAV26>`

This means: after actual logged navigation, the caret is resolved to position 26, but that final position could not be predicted safely from the navigation key alone.

This is important especially after:
- `ArrowUp`
- `ArrowDown`
- sometimes `Home`/`End` in more complex contexts
- any future navigation with non-trivial visual movement

The design principle is:
- preserve the actual key/mouse action first
- then add `NAV` only if needed
- do not replace real `UP`, `DOWN`, `HOME`, `CLICK` etc. with fabricated long `LEFT`/`RIGHT` runs

### Fallback key token
- `<KEY:...>`

This is retained as a fallback for unmodeled keys, though the current focus is on navigation and text-production relevant actions.

## Replay Semantics
`reconstructTextFromLinearRepresentation(linear)` currently replays:
- inserted text
- `DEL`
- `FDEL`
- `LEFT`
- `RIGHT`
- `UP`
- `DOWN`
- `HOME`
- `END`
- `CLICK`
- `SEL`
- `NAV`

Important detail:
- `UP` and `DOWN` themselves do not attempt to compute visual caret movement during replay
- instead, if their actual landing position matters, the encoder adds `NAV`
- replay then uses that `NAV` position explicitly

This keeps the replay stable without pretending to know layout-dependent caret motion.

## Synthetic Log Generation
`linearRepresentationToSyntheticRecords(linear, starttime)` currently generates synthetic logs containing:
- `header_records`
- `text_records`
- `cursor_records`
- `key_records`
- `scroll_records`
- `image_records`
- `window_records`

Supported synthetic navigation events:
- `Backspace`
- `Delete`
- `ArrowLeft`
- `ArrowRight`
- `ArrowUp`
- `ArrowDown`
- `Home`
- `End`
- mouse `mousedown` / `mouseup` for `CLICK` and `SEL`

`NAV` in synthetic logs is currently represented as a cursor repositioning step with a cursor record, not as a fabricated keypress sequence.

## Validation
### In-browser validation
`validateLinearRepresentation(records)` checks:
- `final_text_matches`
- `roundtrip_linear_matches`

### Batch validation tool
`tools/validate_real_logs.js`

Run:
```bash
node tools/validate_real_logs.js
```

This validates all files in `real_logs/` and reports:
- `final_text_matches`
- `roundtrip_linear_matches`
- `linear_len`
- `nav_preserved`
- `nav_missed`
- `nav_made_up`
- `nav_count`

Interpretation of the navigation metrics:
- `nav_preserved`: rough count of actual logged navigation events that also appear in the linear
- `nav_missed`: rough count of actual logged navigation events not directly represented in the linear
- `nav_made_up`: rough count of navigation tokens in the linear that do not correspond to actual logged navigation events
- `nav_count`: number of `NAV` directives in the linear

This is only a rough measure, but it is useful for comparing versions of the encoder.

## Terminal-side Synthetic Generation
A node tool now exists for terminal-only synthetic generation:

`tools/generate_emulated_log.js`

Run:
```bash
node tools/generate_emulated_log.js --code EMU123 --edits 5
```

This will:
- generate a synthetic scenario
- build a linear representation
- convert it to a synthetic log
- validate final text and linear roundtrip
- save the resulting log file into `real_logs/`

This does not use browser DOM interaction. It uses the linear pipeline directly.

## Browser-side Emulation
A separate browser-side `EMULATE` path also exists in `webscriptlog_emulation.js`.

That path:
- simulates writing in the browser UI
- produces ordinary in-app logs
- validates linear conversion afterward
- can also save the produced log into `real_logs/` through `php/save_real_log.php`

This is useful because it exercises the actual app event handlers.

## Real Progress Achieved
The linear work has moved through several stages:

1. Initial linear representation prototype
- focused mainly on text change reconstruction
- could replay simple examples
- not faithful enough to real navigation

2. Mouse-aware representation
- mouse clicks became explicit `<CLICKn>` instead of being converted into fake left/right runs

3. Real navigation preservation
- `HOME`, `END`, `UP`, `DOWN` are now represented explicitly from logged keydowns
- this fixed cases where the linear previously overused `LEFT`/`RIGHT`

4. `NAV` resolution
- after real navigation keys, uncertain landing positions are now encoded as `NAV`
- this is preferable to inventing navigation that did not happen

5. Batch validation over real logs
- terminal tool added to test correctness and rough navigation faithfulness on actual saved data

## Current Status
At the current checkpoint:
- the log <-> linear <-> synthetic log loop works for several real and synthetic cases
- two-way conversion exists
- explicit navigation preservation is better than before
- `NAV` is now part of the model for uncertain caret placement
- synthetic generation can be run entirely from the terminal

## Known Limitations
1. `NAV` is a necessary fallback, but still a fallback
- ideally we preserve as much direct navigation as possible before resorting to `NAV`

2. Vertical navigation replay is intentionally simplified
- `UP` / `DOWN` alone do not compute visual landing during replay
- layout-sensitive caret placement is deferred to `NAV`

3. Some real logs still fail
- especially larger and more complex files
- current validator output should be used to drive further refinement

4. The node-side synthetic generator is useful, but not identical to the browser-side emulator
- terminal generation uses the linear pipeline directly
- browser emulation uses DOM events and app handlers

## Recommended Next Steps
1. Reduce `nav_missed` in real logs
- expose more actual navigation directly before falling back to `NAV`

2. Continue testing on larger real logs
- use `tools/validate_real_logs.js`

3. Expand the synthetic generator
- multiple logs per run
- fixed seeds
- scenario selection via CLI

4. Keep using `NAV` conservatively
- preserve the actual command sequence first
- use `NAV` only when destination cannot be predicted safely
