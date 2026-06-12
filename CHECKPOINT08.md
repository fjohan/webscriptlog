# CHECKPOINT08

## Scope

This checkpoint covers the Word History / word-boundary analysis work.

## Standalone Tools

Added exploratory Node tools:

- `tools/final_text_analysis_chars.js`
- `tools/join_fta_diffkeys.js`
- `tools/word_history_from_join.js`
- `tools/word_boundary_timing.js`

The key result is that Final Text Analysis character provenance can be joined to DiffKeys via:

`FTA textDataIndex === DiffKeys id`

This gives each final-text character its source text snapshot, timing, and corresponding edit/key event.

## Word Boundary Timing

`tools/word_boundary_timing.js` now outputs one row per final-text word with:

- word index and word
- rough `wordPurity`
- word-initial `timeSincePrev`
- word-final `timeUntilNext`
- initial/final textData id pairs
- boundary timing labels
- edge provenance labels

Important split:

- boundary timing says whether the pause value is interpretable as true boundary timing
- edge provenance says whether the word edge itself was simple or edited

Example distinction:

- `typed-before-boundary` can coexist with `inserted-final-later`
- this means the final character-to-space timing is valid, but the final character had revision history

## Browser Integration

Replaced the browser dashboard `Word History` pane with the same word-boundary table.

The browser implementation mirrors `tools/word_boundary_timing.js` and includes:

- `wordPurity`
- initial/final id pairs
- initial/final boundary timing
- initial/final edge provenance

## Validation

Ran syntax checks:

- `node --check webscriptlog_main.js`
- `node --check webscriptlog_dashboard.js`
- `node --check tools/word_boundary_timing.js`

Compared browser helper output against `tools/word_boundary_timing.js`; rows matched for:

- `real_logs/wslog_MOBILE_mobile_Note-15`
- `real_logs/0073_hig_kt_100-0_2023-04-28`
