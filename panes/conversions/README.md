# Conversions

JavaScript adaptation of ScriptLogLite's typed event history and conversion
codecs. Shared code runs in browsers and Node. The **Conversions** dashboard
pane is independent of the existing IDFX pane; saved layouts migrate to add it.

Supported inputs/outputs: ScriptLogLite JSON (`[[metadata], [events]]`),
ScriptLogLite raw (`#` header separator), WebScriptLog snapshot JSON, and
Inputlog IDFX. Other historical ScriptLog formats are not implied by these names.

## Browser

Choose multiple files or use the current completed recording, select the target
format and Convert. Each result has its own download and conversion notes.
Download results saves one file, or a ZIP with one output per input plus a
report for batches. Duplicate output names fail explicitly. Conversion does not
replace the loaded recording or write to IndexedDB.

## Node

```sh
node tools/convert_logs.js INPUT OUTPUT --to json|raw|webscriptlog|idfx
node tools/convert_logs.js webscriptlog_idfx /tmp/converted --to json
node tools/convert_logs.js INPUT_DIR OUTPUT_DIR --to idfx --recursive
node tools/conversions.test.js
node tools/validate_conversion_roundtrips.js --report CONVERSION_ROUNDTRIPS.md
```

Options: `--from auto|scriptloglite|json|raw|webscriptlog|idfx`, `--dry-run`,
`--overwrite`, `--dialect recorded|replace`, `--no-lite-labels`.
Default dialect is replace, matching the Java conversion interface; select
recorded to retain insertion event names. Existing destinations are skipped
unless overwrite is explicit. Batch conversion continues after individual
failures, preserves relative directories, and protects inputs from overwriting.
Known `manifest.json` and `conversion-report.json` sidecars are skipped in batches.

## Modules

- `conversion_core.js`: exact JSON integer parsing/serialization, nanosecond
  timeline, reversible edits, validation, ScriptLogLite JSON/raw codecs.
- `webscriptlog_codec.js`: snapshot/edit conversion, cursor-aware difference
  ranges, key identities and timestamp collision reporting.
- `idfx_codec.js`: XML reader/writer, native Word reconstruction, key pairing,
  ScriptLogLite extension labels and the existing WebScriptLog IDFX dialect.
- `conversions.js`: detection and conversion API.
- `conversions_pane.js`: UI only; the same API is used by the CLI.

The canonical history contains `epochNs`, `durationNs`, `initialText`, metadata,
and ordered events. Each event has an elapsed `time` in BigInt nanoseconds.
Edits have `offset`, `removed`, `inserted`; every edit must match the current
document. Strings and offsets use UTF-16, as in Java. Original nanosecond integer
tokens are preserved before JSON.parse can round them. Wall-clock ISO fractions
are also retained to nanosecond precision. No Java runtime is required.

## Fidelity

ScriptLogLite JSON/raw retain exact counters, key details, selections and edits.
WebScriptLog exports snapshots at millisecond precision. Conflicting timestamps
are shifted and counted rather than overwriting records. Selection direction
and horizontal scroll cannot be represented. Snapshot imports do not invent
physical keys from text; IME/paste/autocorrection remain text edits.

IDFX uses native Word pre-edit document lengths including the final paragraph
mark; paragraph marks map to LF internally and the mandatory final mark is
omitted. Known `webscriptlog` IDFX exports use a separate, explicitly identified
document-length convention. Other undocumented dialects fail validation rather
than silently adopting a guessed convention.

Native IDFX untimed edits use the preceding causal time. Word insertion
ambiguities and unsupported event types fail explicitly. Selected-range cuts
and delayed Delete operations follow the Java importer rules, with inferred
operations reported. Mouse/focus/statistics are retained as ancillary metadata,
not translated into document edits. Missing releases are not fabricated.

IDFX exports identify themselves as conversions, not native Word recordings.
ScriptLogLite-compatible labels preserve metadata, precise timing, selection
direction and viewport. Additional WebScriptLog labels retain original key
details and null insertions. Turning extensions off intentionally loses that
information. Unpaired key releases cannot be represented as native IDFX
keyboard strokes and are omitted with a count. No page-layout/Word document,
native reports, or approximate document statistics are generated.

The Java Swing interface, replay checkpoints and filesystem UI are not ported.
Native Java AWT key codes are mapped explicitly; unknown keys retain their
observed names when available. Tests cover format pairs and edge cases, but
this is not a claim that arbitrary historical IDFX files are all supported.

Verification included all 16 format pairs, all five supplied WebScriptLog IDFX
files, native ScriptLogLite JSON/raw samples and three native Inputlog samples.
For `JF_97.idfx`, the 1,756-event reconstructed history matched Java in timing,
edits, selections and observed key values (AWT Windows-key code mapping differs).
Java successfully read JavaScript-generated IDFX with matching edit timing.
The UI wiring and saved-layout migration have automated checks; interactive
browser testing remains to be done.

The three supplied action testbeds (`testbed-ilog.idfx`, `testbed-sll.json`,
`testbed-wscr.txt`) also pass all 12 source -> intermediate -> source routes.
The regression checks every edit payload and successive text state, reverse
replay, key actions, caret observations, and viewport observations. All original
WebScriptLog record maps/timestamps survive exactly. JSON/raw/labelled-IDFX
timing is exact; routes through web have at most 2 ms edit displacement in these
fixtures. Regenerated IDFX can add derived carets, as in the Java implementation.
See `CONVERSION_ROUNDTRIPS.md` for measurements and reproduction instructions.
