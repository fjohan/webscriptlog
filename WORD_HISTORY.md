# Word History

Word History is currently a word-level analysis of the final text. It joins Final Text Analysis character provenance with DiffKeys rows using:

`finalTextCharacter.textDataIndex === diffKeys.id`

The browser pane and `tools/word_boundary_timing.js` output one row per final-text word.

## Columns

- `wordPurity`: rough count of edits affecting the word; `0` means the word was typed once as one continuous run and not touched again.
- `wordInitialTimeSincePrev`: FTA timing for the first character of the final word.
- `wordInitialTextDataIndexPair`: `[precedingBoundaryId/currentInitialId]`.
- `wordInitialBoundaryTiming`: whether the initial timing is interpretable as true boundary-to-word timing.
- `wordInitialEdgeProvenance`: whether the first character itself is simple or edited.
- `wordFinalTimeUntilNext`: FTA timing for the final character of the final word.
- `wordFinalTextDataIndexPair`: `[currentFinalId/followingBoundaryId]`.
- `wordFinalBoundaryTiming`: whether the final timing is interpretable as true word-to-boundary timing.
- `wordFinalEdgeProvenance`: whether the final character itself is simple or edited.

## Boundary Timing Labels

Boundary timing labels describe whether the pause value can be treated as real word-boundary timing.

### Initial Boundary Timing

`typed-after-start-boundary`

The word starts the text and its first character was typed normally.

Example:

`[-/1] in`

`typed-after-boundary`

The preceding boundary character and the first word character were consecutive source events.

Example:

`[108/109] lifestyle,`

The space is id `108`, the `l` is id `109`; the initial `timeSincePrev` is interpretable.

`inserted-after-boundary-later`

The first final character was inserted after an already-existing boundary. The timing may reflect a later revision, not online word start.

Example:

`[49/107] 1in`

The word originally began as `in`; `1` was inserted before it later.

`same-edit-as-boundary`

The boundary and word-initial character came from the same text snapshot, often paste or multi-character insertion.

`not-boundary-timed`

There is a boundary in the final text, but the source ids do not support a simple boundary timing interpretation.

`no-preceding-boundary`

The preceding final character is not whitespace. This can happen with tokenization edge cases.

### Final Boundary Timing

`typed-before-boundary`

The word-final character and following boundary were consecutive source events.

Example:

`[126/127] lifestyle,`

The comma is id `126`, the space is id `127`; the final `timeUntilNext` is interpretable.

`inserted-before-boundary-later`

The final character was inserted before an already-existing boundary. The final timing is not true word-final-to-boundary timing.

Example:

`[174/119] in1`

The space is old id `119`; `1` was inserted before it later.

`boundary-inserted-later`

The word-final character is simple, but the following boundary was inserted later.

Example:

`[106/115] 8replaced`

The word-final `d` is old; a newline boundary was added later.

`end-of-text`

There is no following boundary because the word ends the final text.

`same-edit-as-boundary`

The word-final character and boundary came from the same text snapshot.

`not-boundary-timed`

There is a following boundary in the final text, but the source ids do not support a simple timing interpretation.

`no-following-boundary`

The next final character is not whitespace.

## Edge Provenance Labels

Edge provenance labels describe the character at the edge of the word itself, independent of whether the boundary timing is valid.

### Initial Edge Provenance

`simple-initial`

The first character was typed as part of the main word creation run.

`inserted-initial-later`

The first character was inserted later before the original word.

Example:

`1in`: the `1` was inserted before `in`.

`nonsingle-initial-edit`

The first character came from an edit snapshot that inserted more than one character or otherwise was not a simple single-character insertion.

`revised-initial-context` / `nonconsecutive-initial`

The source ids near the initial edge are not a clean consecutive run.

### Final Edge Provenance

`simple-final`

The final character was typed as part of the main word creation run.

`inserted-final-later`

The final character was inserted later after the original word.

Examples:

- `in1`: the `1` was appended later.
- `lifestyle,`: the comma is final and came after punctuation revision.

`nonsingle-final-edit`

The final character came from a non-single-character edit.

`revised-final-context` / `nonconsecutive-final`

The source ids near the final edge are not a clean consecutive run.

## Purity

`wordPurity` is a deliberately rough edit score.

Current rule:

`purity = extra history events + extra final-source events outside the main continuous source-id run`

Interpretation:

- `0`: the word was typed once as a continuous run and not touched again.
- `1`: one extra edit affected the word.
- higher values: more edits, replacements, deleted precursors, or later insertions affected the word.

Examples:

`in`

Typed as `i`, then `n`, never touched:

`wordPurity = 0`

`1in`

Original word `in`, later `1` inserted before it:

`wordPurity = 1`

`today's`

Original `todays`, later apostrophe inserted:

`wordPurity = 1`

`interesting`

Typed with a wrong final character and corrected:

`wordPurity = 3`

`lifestyle,`

Includes `u -> y` correction plus punctuation trials before final comma:

`wordPurity = 10`

The score is not yet linguistically weighted. Insertions, deletions, and replacements all count through the same simple event logic. Future versions could separate number of insertions, deletions, replacements, locality, and whether the edits were consecutive.
