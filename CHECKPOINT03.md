# Checkpoint 03: Linear Analysis Status

## Scope
This checkpoint summarizes the current state of the linear-analysis layer after:
- full roundtrip stabilization on the 100-log set
- addition of pause tokens
- addition of a styled `WRITING SCORE` view in the UI

Relevant files:
- `webscriptlog_linear.js`
- `webscriptlog_main.js`
- `tools/validate_real_logs.js`
- `tools/generate_emulated_log.js`
- `webscriptlog_emulation.js`

Current headline status:
- all 100 logs in `real_logs/` validate
- `final_text_matches = yes` for all 100
- `roundtrip_linear_matches = yes` for all 100

## Main Goal
The linear-analysis pipeline supports this full cycle:

1. `log -> linear representation`
2. `linear representation -> replay / reconstruction`
3. `linear representation -> synthetic log`
4. `synthetic log -> linear representation`

The target is not just final-text correctness. The target is also a compact process notation that:
- reflects actual writing actions
- preserves real navigation
- shows pauses
- avoids unnecessary position codes
- roundtrips stably

## Main Functions
In `webscriptlog_linear.js`:

- `showWritingScore()`
  - renders the current linear string into the Analyze tab
- `renderWritingScoreHtml(linear)`
  - styles the linear string by token type
- `refreshWritingScoreIfVisible()`
  - rerenders the score when pause threshold changes
- `validateLinearRepresentation(records)`
  - validates replay and roundtrip
- `getCurrentLinearPauseThreshold()`
  - reads the current pause threshold from `pauseCrit`
- `appendPauseToken(parts, previousTs, nextTs, thresholdSeconds)`
  - emits pause tokens during encoding
- `recordsToLinearRepresentation(records)`
  - converts logs to linear representation
- `canonicalizeLinearRepresentation(linear)`
  - normalizes equivalent linear strings before comparison
- `normalizeSelectionLeadClicks(actions)`
  - removes redundant click-before-selection patterns in canonical comparison
- `normalizeBidirectionalDeleteClusters(actions)`
  - canonicalizes some collapsed-caret bidirectional delete clusters
- `normalizeDeleteEffectClusters(actions)`
  - canonicalizes pure delete-effect clusters
- `parseLinearRepresentation(linear)`
  - parses the linear string into actions
- `serializeLinearActions(actions)`
  - serializes parsed actions back to ordinary linear form
- `serializeCanonicalLinearActions(actions)`
  - serializes canonical comparison form
- `reconstructTextFromLinearRepresentation(linear)`
  - replays the linear representation
- `linearRepresentationToSyntheticRecords(linear, starttime)`
  - generates synthetic logs from linear input

## Conversion Model
The encoder primarily uses:
- `text_records`
- `cursor_records`
- `key_records`

It works chronologically.

For each text change:
1. process logged navigation before the text change
2. add pause token if the gap from the previous activity exceeds threshold
3. resolve caret / selection state
4. compute the text diff
5. emit the smallest useful linear edit sequence

Main design principle:
- preserve actual logged keys and clicks
- do not invent navigation sequences
- do not add positions unless needed
- express pauses only when they exceed the active threshold

## Current Linear Codes

### Inserted text
Inserted text is written directly.

Examples:
- `abc`
- `Jag har haft denna känsla`

Escapes:
- newline -> `<ENTER>`
- `<` -> `<LT>`
- `>` -> `<GT>`

### Pause
- `<13.03>`
- `<0.528>`
- `<2>`

Meaning:
- pause duration in seconds
- at most 3 decimals
- only emitted if pause duration is at or above the current pause threshold

Pause threshold source:
- browser UI: current value of `#pauseCrit`
- validator / non-UI context: default `0.3`

### Backspace / forward delete
- `<DEL>`
- `<DEL7>`
- `<FDEL>`
- `<FDEL3>`

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

Meaning:
- a click placing the caret at an absolute position

### Selection
- `<SEL10:15>`

Meaning:
- selection from position `10` to `15`

### Explicit navigation resolution
- `<NAV26>`

Meaning:
- a navigation action occurred
- the final caret landing could not be safely derived from the key alone
- the caret is explicitly resolved to position `26`

Used mainly after:
- `ArrowUp`
- `ArrowDown`
- complex navigation contexts

### Bidirectional delete
- `<BDEL5:4>`

Meaning:
- from a collapsed caret, delete `5` characters to the left and `4` to the right

Used for local collapsed-caret mixed delete patterns that are not faithfully expressible with only `DEL` or `FDEL`.

### Fallback key token
- `<KEY:...>`

Used for unmodeled keys.

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

Pause behavior:
- `PAUSE` tokens are parsed
- but ignored in text replay
- they affect no text content

Important:
- `UP` and `DOWN` do not try to compute layout-dependent visual movement
- if actual landing matters, `NAV` is emitted

## Synthetic Log Generation
`linearRepresentationToSyntheticRecords(linear, starttime)` generates:
- `header_records`
- `text_records`
- `cursor_records`
- `key_records`
- `scroll_records`
- `image_records`
- `window_records`

Supported synthetic actions:
- ordinary inserted characters
- `Backspace`
- `Delete`
- `ArrowLeft`
- `ArrowRight`
- `ArrowUp`
- `ArrowDown`
- `Home`
- `End`
- mouse `mousedown` / `mouseup` for `CLICK` and `SEL`
- `NAV`
- `BDEL`

Pause behavior:
- pauses are converted back into timestamp gaps
- the generator now tracks the last relevant activity timestamp so pause roundtrip remains stable

This was important because pauses must attach to the next meaningful activity, especially for:
- text-producing actions
- clicks
- selections
- navigation

## Canonicalization Rules
Roundtrip equality is based on canonicalized linear strings, not raw strings.

Current canonicalization pipeline:

1. `normalizeSelectionLeadClicks(actions)`
2. `normalizeDeleteEffectClusters(actions)`
3. `normalizeBidirectionalDeleteClusters(actions)`
4. `serializeCanonicalLinearActions(actions)`

### Click-before-selection normalization
Canonical comparison removes a `CLICK` that is immediately followed by `SEL`.

Current important detail:
- this rule now skips over intervening `PAUSE` tokens

Reason:
- after pauses were introduced, some equivalent patterns became:
  - `<CLICK452><0.403><SEL...>`
  - versus `<CLICK448><0.403><SEL...>`
- the selection makes the preceding click position redundant for comparison

This was the key final fix for `0095` after pause support was added.

### Pure delete canonicalization
Canonical comparison uses:
- `<CDEL>`

Important:
- `CDEL` is comparison-only
- it is not part of the user-visible replay syntax

Reason:
- equivalent pure-delete clusters were being decomposed differently on re-encoding

Examples that now compare equal:
- `<DEL4>`
- `<DEL3><FDEL>`
- `<DEL6><FDEL><SEL...><DEL>`

### Bidirectional delete canonicalization
Some collapsed-caret mixed delete clusters are normalized to:
- `<BDELleft:right>`

This allows stable roundtrip comparison for local bidirectional delete patterns.

## Writing Score UI
A dedicated `WRITING SCORE` button now exists in the Analyze tab.

Behavior:
- it prints the current linear representation string above the Final text-analysis block
- it is not just raw text anymore; it is styled by token type

Current color mapping:
- inserted character: green
- delete / forward delete / bidirectional delete: red
- mouse / selection / navigation: blue
- pause: black
- other / fallback: grey

Live update:
- when `pauseCrit` changes, the visible writing score is recalculated and rerendered
- rerender happens on both `input` and `change`
- this only happens after the writing score has been shown at least once

## Validation

### Validation workflow
`validateLinearRepresentation(records)` does:
- `log -> raw linear`
- `raw linear -> replayed final text`
- `raw linear -> synthetic log -> raw linear`
- `canonical(raw original) === canonical(raw roundtrip)` for roundtrip equality

Important separation:
- replay uses raw linear
- synthetic-log generation uses raw linear
- canonicalization is comparison-only

This prevents comparison-only tokens such as `CDEL` from leaking into replay.

### Batch validator
Run:
```bash
node tools/validate_real_logs.js
```

Or streamed:
```bash
node tools/validate_real_logs.js --stream
```

Current validator behavior with pauses:
- yes, pause support is active
- it uses pause threshold `0.3` in non-UI contexts

Reported fields include:
- `final_text_matches`
- `roundtrip_linear_matches`
- `linear_len`
- `nav_preserved`
- `nav_missed`
- `nav_made_up`
- `nav_count`

## What Was Added / Fixed In This Phase

### 1. Pause tokens
- introduced `<s.ddd>` syntax
- emitted only above the active threshold
- integrated into:
  - log -> linear
  - parse
  - replay
  - synthetic log generation

### 2. Pause roundtrip stabilization
- pause tokens initially drifted in synthetic-log timing
- generator now aligns pause gaps to the next relevant activity

### 3. Pause-click ordering
- pause before click/selection/navigation is now emitted before the corresponding token
- not after it

### 4. Pause-sensitive click-selection canonicalization
- `CLICK` before `SEL` is now normalized even if a `PAUSE` token lies between them

This restored stable roundtrip for `0095` after pauses were introduced.

### 5. Writing-score display
- added `WRITING SCORE` button
- added styled score rendering
- added live refresh when pause threshold changes

## Current Status
- all 100 current real logs validate
- final-text replay is stable
- roundtrip linear comparison is stable
- pause representation is part of the linear syntax
- writing score can now be inspected directly in the Analyze tab

## Practical Summary
The linear-analysis layer now has:
- stable `log -> linear` conversion
- stable replay from linear
- stable `linear -> synthetic log -> linear` roundtrip
- explicit pause representation
- styled writing-score display

The main design principles remain:
- preserve real logged navigation
- avoid invented movement
- avoid redundant position coding
- use explicit positions only when needed
- treat equivalent local edit effects canonically for comparison
