# Checkpoint 02: Linear Analysis Status

## Scope
This checkpoint summarizes the current state of the linear-analysis and roundtrip work after the recent stabilization pass.

Relevant files:
- `webscriptlog_linear.js`
- `tools/validate_real_logs.js`
- `tools/generate_emulated_log.js`
- `webscriptlog_emulation.js`

Current headline status:
- all 100 logs in `real_logs/` validate
- `final_text_matches = yes` for all 100
- `roundtrip_linear_matches = yes` for all 100

## Main Goal
The linear-analysis pipeline is designed to support this full cycle:

1. `log -> linear representation`
2. `linear representation -> replay / reconstruction`
3. `linear representation -> synthetic log`
4. `synthetic log -> linear representation`

The target is not only correct final text, but also a stable and readable representation of the writing process.

## Main Functions
In `webscriptlog_linear.js`:

- `validateLinearRepresentation(records)`
  - main validator for final-text replay and linear roundtrip
- `recordsToLinearRepresentation(records)`
  - converts recorded logs to the linear form
- `canonicalizeLinearRepresentation(linear)`
  - normalizes equivalent linear strings before roundtrip comparison
- `parseLinearRepresentation(linear)`
  - parses linear text into actions
- `serializeLinearActions(actions)`
  - converts parsed actions back to linear text
- `reconstructTextFromLinearRepresentation(linear)`
  - replays the linear actions and reconstructs text
- `linearRepresentationToSyntheticRecords(linear, starttime)`
  - creates synthetic log objects from linear input
- `appendTextDiffTokens(parts, diffInfo, selectionStart, selectionEnd)`
  - converts text diffs into linear delete/insert operations

Canonicalization helpers:
- `normalizeSelectionLeadClicks(actions)`
- `normalizeBidirectionalDeleteClusters(actions)`
- `normalizeDeleteEffectClusters(actions)`

## Conversion Model
The conversion from logs to linear form is based mainly on:
- `text_records`
- `cursor_records`
- `key_records`

The encoder works chronologically.

For each text change:
1. it processes logged navigation before the change
2. it resolves caret/selection state
3. it computes the text diff
4. it emits the smallest useful linear edit sequence

Important principle:
- prefer real logged keys and mouse actions
- do not invent navigation sequences that were not logged
- only add explicit positional directives when they are actually needed

## Current Linear Codes

### Inserted text
Plain inserted text is written directly.

Examples:
- `abc`
- `Jag har haft denna känsla`

Escapes:
- newline -> `<ENTER>`
- `<` -> `<LT>`
- `>` -> `<GT>`

### Backspace / delete
- `<DEL>` = one backspace
- `<DEL7>` = seven backspaces
- `<FDEL>` = one forward delete
- `<FDEL3>` = three forward deletes

Single commands omit `1`.

### Horizontal navigation
- `<LEFT>`
- `<LEFT5>`
- `<RIGHT>`
- `<RIGHT12>`

### Vertical navigation
- `<UP>`
- `<UP4>`
- `<DOWN>`
- `<DOWN3>`

### Boundary navigation
- `<HOME>`
- `<END>`

### Mouse navigation
- `<CLICK0>`
- `<CLICK35>`

Meaning: a mouse click that placed the caret at an absolute position.

### Selection
- `<SEL10:15>`

Meaning: a selection from position `10` to `15`.

### Explicit navigation resolution
- `<NAV26>`

Meaning: a logged navigation action occurred, but the final caret landing could not be predicted safely from key semantics alone, so the caret is explicitly resolved to position `26`.

This is mainly used after:
- `ArrowUp`
- `ArrowDown`
- some complex navigation situations

### Bidirectional delete
- `<BDEL5:4>`

Meaning: from a collapsed caret, delete `5` characters to the left and `4` to the right.

This is used for local collapsed-caret bidirectional delete patterns that cannot be represented faithfully with only `DEL` or `FDEL`.

### Fallback key token
- `<KEY:...>`

This remains available for unmodeled keys.

## Replay Semantics
`reconstructTextFromLinearRepresentation(linear)` replays:
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
- `BDEL`

Important detail:
- `UP` and `DOWN` do not try to compute visual caret movement
- if actual landing matters, the encoder emits `NAV`

This avoids pretending to know layout-dependent cursor movement.

## Synthetic Log Generation
`linearRepresentationToSyntheticRecords(linear, starttime)` generates:
- `header_records`
- `text_records`
- `cursor_records`
- `key_records`
- `scroll_records`
- `image_records`
- `window_records`

Supported synthetic key/navigation events include:
- `Backspace`
- `Delete`
- `ArrowLeft`
- `ArrowRight`
- `ArrowUp`
- `ArrowDown`
- `Home`
- `End`
- mouse-based `mousedown` / `mouseup` for `CLICK` and `SEL`

`NAV` is represented as cursor repositioning in the synthetic records, not as fabricated extra keypresses.

## Canonicalization Rules
Roundtrip comparison no longer compares raw linear strings directly. It compares canonicalized equivalents.

Current canonicalization steps:

1. `normalizeBidirectionalDeleteClusters(actions)`
- collapses some collapsed-caret mixed delete clusters to `BDEL`

2. `normalizeDeleteEffectClusters(actions)`
- collapses pure delete-effect clusters into canonical delete-effect markers

3. `normalizeSelectionLeadClicks(actions)`
- removes `CLICK` immediately followed by `SEL` in canonical comparison
- reason: the click position is redundant if the next action is the same explicit selection

### Canonical `CDEL`
Canonical comparison uses an internal pure-delete marker:
- `<CDEL>`

Important:
- `CDEL` is comparison-only
- it is not part of the replay format shown to users
- it exists because equivalent pure-delete clusters often differ slightly in exact span decomposition on re-encoding

Examples of equivalent forms that now compare equal:
- `<DEL4>`
- `<DEL3><FDEL>`
- `<DEL6><FDEL><SEL...><DEL>`

This was the key fix for the last pure-delete leftovers.

## What Was Fixed in This Phase

### 1. Navigation fidelity
Earlier versions produced fabricated long `LEFT` / `RIGHT` runs.

Current behavior:
- preserve actual logged `HOME`, `END`, `UP`, `DOWN`, `CLICK`
- use `NAV` only when landing position must be made explicit

### 2. Bidirectional delete handling
Some logs contained collapsed-caret mixed delete patterns that were not stable under roundtrip.

Current behavior:
- use `BDEL` for explicit bidirectional collapsed-caret delete patterns

### 3. Pure-delete canonicalization
Several logs failed because a compact delete and an expanded delete cluster represented the same effect but serialized differently.

Current behavior:
- canonical comparison collapses those to `CDEL`

### 4. Click-before-selection canonicalization
The last remaining mismatch (`0095`) came down to:
- one side using `<CLICK452><SEL...>`
- the other using `<CLICK448><SEL...>`

Current behavior:
- canonical comparison removes `CLICK` directly before `SEL`
- this fixed the final mismatch without changing replay semantics

## Validation

### In-browser / programmatic validation
`validateLinearRepresentation(records)` now does:
- raw log -> raw linear
- raw linear -> replayed final text
- raw linear -> synthetic log -> raw linear
- canonical comparison only for roundtrip equality

Important implementation detail:
- replay uses the raw linear string
- synthetic-log generation uses the raw linear string
- canonicalization is used only for equality checking

This separation fixed a serious regression where canonical-only tokens leaked into replay.

### Batch validator
Run:
```bash
node tools/validate_real_logs.js
```

Or streamed:
```bash
node tools/validate_real_logs.js --stream
```

The validator reports:
- `final_text_matches`
- `roundtrip_linear_matches`
- `linear_len`
- `nav_preserved`
- `nav_missed`
- `nav_made_up`
- `nav_count`

## Terminal-Side Synthetic Generation
Node tool:
- `tools/generate_emulated_log.js`

Example:
```bash
node tools/generate_emulated_log.js --code EMU123 --edits 5
```

This:
- generates a synthetic session
- creates a linear representation
- converts it to synthetic logs
- validates final text and roundtrip
- writes the log to `real_logs/`

## Current Status
- all 100 current real logs validate
- final-text replay is stable
- roundtrip linear comparison is stable
- the main remaining risk area is not correctness, but future canonicalization drift if new kinds of edit clusters appear

## Practical Summary
The linear-analysis layer now has:
- a stable log -> linear conversion
- a replayable linear format
- a synthetic log generator from linear input
- a canonical roundtrip comparison that tolerates equivalent local edit decompositions

The main design principles remain:
- preserve real logged navigation
- avoid redundant position encoding
- add explicit position only when needed
- compare equivalent edit effects canonically, not just literally
