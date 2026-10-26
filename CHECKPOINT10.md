# CHECKPOINT10

## First Inputlog conversion

Started porting the C# IDFX reader and `InputlogHTML/Core/Analyses/General/` to JavaScript, with shared Node/browser code:

- `panes/inputlog/idfx_reader.js`: reads IDFX metadata, session fields and event parts, preserving IDs and decoding XML/Unicode escapes.
- `panes/inputlog/general_analysis.js`: produces keyboard, focus, mouse, insertion and replacement rows with output, position, document length, timing, character production and interval indices. Selection/statistics events are filtered out.
- `tools/inputlog_general_analysis.js`: CLI producing TSV or JSON, one output per input when using `--out-dir`.
- `panes/inputlog/index.html` and `prototype.js`: standalone browser prototype with file selection, table and exports; not integrated into the main application yet.

```sh
node tools/inputlog_general_analysis.js webscriptlog_idfx --out-dir /tmp/inputlog-general
node tools/inputlog_general_analysis.js webscriptlog_idfx --json --out-dir /tmp/inputlog-general-json
```

Inputlog keyboard pause times generally measure keydown-to-keydown, not keyup-to-keydown. Node uses vendored MIT-licensed `@xmldom/xmldom` 0.9.12 in `ext_js/xmldom`; browsers use native DOMParser.

## Limits and verification

The linguistic pause-location FSM is not ported: keyboard labels default to `UNDETERMINED`; optional `--simple-pause-locations` labels are explicitly approximate. Eye-tracking/speech analysis, duplicate-control preprocessing, double-click recognition and native report generation remain pending.

State isolation, interval handling, negative action durations and change-row backfilling deliberately differ from apparent C# defects. Numerical parity with the C# executable has not been verified; no C# runtime is installed. The convenience summary is not Inputlog's separate Summary Analysis.

All five supplied IDFX files and a native Inputlog corpus file were processed successfully. Six tests passed, covering parsing, timing, deletion/backfilling, intervals, real files and shared browser-global/Node behavior; syntax checks passed. Browser UI interaction has not been tested in a live browser.

Further details: `panes/inputlog/README.md`. Tests: `node tools/inputlog/general_analysis.test.js`.
