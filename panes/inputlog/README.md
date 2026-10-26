# Inputlog General Analysis Prototype

JavaScript adaptation of the local Inputlog sources in
`InputlogHTML/Core/Analyses/General/`, `Analyses/Analysis.cs`,
`Analyses/EventToString.cs`, and `IO/XML/Input/Xml{Win,Word}LogReader.cs`.

## Run

```sh
node tools/inputlog_general_analysis.js webscriptlog_idfx --out-dir /tmp/inputlog-general
node tools/inputlog_general_analysis.js webscriptlog_idfx --json --out-dir /tmp/inputlog-general-json
node --test tools/inputlog/general_analysis.test.js
```

Single-file output goes to stdout. Directory inputs produce one TSV or JSON file
per IDFX. TSV keeps the original event ID and includes output, position,
document length, start/end/action/pause times, pause location, character
production, two interval indices and mouse coordinates. JSON also contains
metadata, session fields, a small summary, options, ignored event types and
warnings. All times are milliseconds. Null means unavailable, not zero.

Open `panes/inputlog/index.html` for the standalone browser prototype. It uses
the same JavaScript core, accepts multiple files and exports TSV/JSON. It is
not yet wired into the main application's tabs.

## What Is Ported

- IDFX XML reading, metadata/session dictionaries, event IDs and parts;
  XML entities and Inputlog's `\uNNNN` escapes are decoded separately.
- Keyboard, focus, mouse, replacement and insertion general-analysis rows.
  Selection and statistics events are filtered out, as in GeneralAnalysis.
- Keyboard output formatting, optional control-key representation and composite
  event merging (`controlKeys` in the core API).
- Timing-state behavior from `Analysis.DeterminePauseTime`: keyboard/focus
  preceding events contribute their **start** time, mouse events their **end**.
  Keyboard pause time is consequently not key release to next key press.
- Document-length decreases, cumulative character production, and deferred
  insertion/replacement position/document-length backfilling.
- Configurable start offset, interval count and interval duration.

## Limits And Deliberate Differences

This is an initial port, **not verified numerical parity with the C# executable**.
The installed environment has no C#/.NET runtime for comparison.

Inputlog's linguistic pause locations depend on `PauseLocationMarker`,
`PauseParser/FSMRules.txt` and its configurable finite-state-machine engine.
That engine is not ported yet. By default keyboard locations are UNDETERMINED;
nonlinguistic change/mouse locations are available. An optional
`--simple-pause-locations` classifier supplies approximate linguistic labels;
the output explicitly marks them `simplified` and includes a warning.
Do not treat those labels as Inputlog-equivalent measurements.

Eye tracking and Dragon speech parts are retained by the reader as raw fields,
but their analysis is not implemented. Unsupported event types are counted and
warned about. Duplicate-control preprocessing, double-click recognition,
revision XML annotations, full-clock formatting and Inputlog report XML/HTML
are not implemented. Missing keyup is represented as a zero-duration action,
following Inputlog; the original end time remains in the parsed event.

Several apparent source defects are deliberately corrected: analysis state is
local to each run; interval indices start at 1, stay bounded and handle large
time jumps; negative action duration is clamped and warned about; pending
change backfilling works at position 0 and targets the change row itself.
These differences should be considered when comparing with native reports.
The summary here is a convenience, not a port of Inputlog's separate Summary
Analysis.

## XML Dependency

Node uses vendored `@xmldom/xmldom` 0.9.12 in `ext_js/xmldom/` (MIT; license
included); browsers use their native DOMParser. The package was downloaded
from the npm registry. No npm installation is required to run the tool.
DTD/entity declarations and malformed XML are rejected.
