# WebScriptLog Feature Timeline

Reconstructed on 2026-11-02 from the local Git history, checkpoints, source
snapshots and development conversation. File modification times were not used.

**An introduction commit is not necessarily the day development began.**
"Present by" means the feature exists in that snapshot, but its actual addition
date is unknown. In particular, the initial commit already contains a working
application, and the next substantial snapshot bundles several months of work.

## Dated Timeline

| Date / bound | Feature or change | Evidence and qualification |
| --- | --- | --- |
| Before or on 2025-12-18 | Core recorder: text snapshots, keydown/repeat/keyup, cursor ranges, mouse activity and scrolling | Already implemented in initial commit `f15da4e`; development predates the available history. |
| Before or on 2025-12-18 | Recording storage/loading, IndexedDB list, database fetch, upload/open, log download and final-text download | Implementations already in `f15da4e`. Some referenced helper scripts were not themselves tracked until June. |
| Before or on 2025-12-18 | Text Replayer, normal/fast playback, cursor and scroll replay | Already in `f15da4e`. Later replay controls are separate additions below. |
| Before or on 2025-12-18 | Final Text Analysis, character timing and interactive text selection/marking | `makeFTAnalysis()` and the FTA interface exist in `f15da4e`. This was not introduced by the June pane extraction. |
| Before or on 2025-12-18 | Revision Table, grouped differences, classifications and replay from a row | Already in `f15da4e`. |
| Before or on 2025-12-18 | Process Graph, Info/Inspect statistics and legacy linear output | `processGraphFormat()`, `inspectRecords()` and `makeLINfile()` exist in `f15da4e`. The later linear round-trip pipeline is a separate development. |
| 2025-12-18 | Temporary additional plots; pause-criteria setting | `a5646c5` adds plots; `26db65c` removes the experimental plots later that day and adds the pause setting. This does not mean Process Graph was removed. |
| 2025-12-19 | UI update and saving/restoring FTA highlight spans | `81a9887`; includes localStorage persistence for marked text ranges. |
| After 2025-12-19 and present by 2026-06-11 | Modern linear representation: reconstruction, synthetic logs, validation, navigation fidelity and canonical round trips | First tracked together in `3fb3c51`; CHECKPOINT01-04 establish development order, not calendar dates. |
| Same interval, present by 2026-06-11 | Writing Score with pause tokens and threshold-controlled display | CHECKPOINT03 and `3fb3c51`. Distinct from the older linear output already in December. |
| Same interval, present by 2026-06-11 | Text Trace, fast browser linear encoder, modular dashboard, grid layout and LOAD GRID | CHECKPOINT05 and `3fb3c51`. |
| Same interval, present by 2026-06-11 | Richer Process Graph, replay pause/resume, virtual replay cursor, sizing experiments and coordinated replay marker | CHECKPOINT05 and `3fb3c51`; extensions to existing replay/graph functionality. |
| Same interval, present by 2026-06-11 | Expanded Info statistics, interval/basis controls and batch export workflows | CHECKPOINT05-06 and the files included in `3fb3c51`. Batch scripts include logs, final texts, statistics ZIP/XLSX, IDFX ZIP and Writing Score ZIP. Their individual start dates are not recoverable from this commit. |
| Same interval, present by 2026-06-11 | Browser emulation and terminal synthetic-log/validation tools | CHECKPOINT01-06 and `3fb3c51`; tools are documented even where their files are ignored by Git. |
| Same interval, present by 2026-06-11 | Experimental IDFX/CSV pane, IDFX import/export, persistence of imported logs and compatibility work | CHECKPOINT05-06 and `3fb3c51`. This predates the separate October Conversions pane. |
| Same interval, present by 2026-06-11 | DiffKeys pane and DOM-free DiffKeys Direct IDFX conversion | CHECKPOINT06 and `3fb3c51`. |
| 2026-06-11 | Server-side file storage fallback when MySQL is unavailable | Dedicated commit `526b99b`. |
| 2026-06-11 | Fix for repeated redundant selection/navigation tokens in log -> linear | Dedicated commit `d336e93`; both normal and fast encoders updated. CHECKPOINT07 records the held-key/shift-arrow cause. |
| 2026-06-11 | Experimental Mobile Notes recorder | Dedicated commit `c2eaac9`: multiple drafts, reopening, note-switch data, deletion and snapshot commits into playback/analysis. Drafts remain available after committing. |
| 2026-06-12 | Word History / word-boundary timing table | Dedicated commit `4d4082b` and CHECKPOINT08: FTA-DiffKeys join, source IDs, boundary timing/provenance labels and edit-count purity. Exploratory tools precede browser integration in the conversation, but lack separate dated commits. |
| 2026-06-12 | Purity colouring in Final Text Analysis | Dedicated commit `90e451a`. |
| 2026-06-12 | Replay stepping one edit backward/forward and go-to-end | Dedicated commit `e0e8d45`. |
| 2026-06-13 | Documentation of Word History boundary labels and purity | `165ef78`, followed by clarification in `daa2ffb`; documentation changes rather than a newly introduced analysis. |
| 2026-06-14 | Shared record utilities and analysis core; pane extraction and `panes/*/` hierarchy | `164d442`, CHECKPOINT09. This is primarily code reorganisation, not the introduction of the analyses whose files moved. |
| 2026-06-18 | Mobile selection-handling correction and technical design document | `37d82eb`: stops forcing selection ranges during caret visibility updates; adds TECHDESIGN.md. |
| 2026-09-21 | Lowercase in-word transition times in DiffKeys; counts/medians in overall and interval Info statistics and exports | Dedicated commit `a08cce1`. |
| October 2026, present in Git by 2026-10-26 | First C# Inputlog General Analysis adaptation | CHECKPOINT10 and `016b62e`: shared IDFX reader/core, Node tool and standalone browser prototype. Not integrated as a main dashboard analysis; linguistic pause-location FSM remains unported. The checkpoint has no independent date. |
| 2026-10-19-20 development conversation; committed 2026-10-26 | Separate Conversions pane based on Java ScriptLogLite codecs | Conversation dates distinguish implementation/testing from commit `016b62e`. Supports ScriptLogLite JSON/raw, WebScriptLog and Inputlog IDFX, shared Node/browser code, exact nanosecond counters and batch downloads. |
| 2026-10-20 development conversation; report committed 2026-10-26 | Three-testbed conversion round-trip validation | CONVERSION_ROUNDTRIPS.md in `016b62e`: 12 routes, intermediate text states, edit payloads, reverse reconstruction and timing checks. The report itself is undated; October 20 comes from the conversation. |
| 2026-10-26 development conversation only | Margin-style Mobile Notes editing experiment, then rollback | Auto-growing textarea/native caret presentation was tried while retaining the logging handlers. Reverted at the user's request. The original editor is active; experimental files remain untracked for comparison. This is not a currently enabled feature. |

## Recoverable Order Within The Large June Snapshot

CHECKPOINT01-06 were all first committed in `3fb3c51` on 2026-06-11. Their
numbering and explicit references to previous checkpoints establish this order,
but do not establish six distinct dates:

| Stage | Main development |
| --- | --- |
| [CHECKPOINT01](CHECKPOINT01.md) | Log -> linear -> replay/synthetic-log pipeline; explicit navigation and NAV resolution; terminal and browser generators. |
| [CHECKPOINT02](CHECKPOINT02.md) | Stabilisation across the then-current 100-log corpus; bidirectional deletion and canonical comparison of equivalent edits. |
| [CHECKPOINT03](CHECKPOINT03.md) | Pause tokens, pause-sensitive round trips and styled Writing Score display. |
| [CHECKPOINT04](CHECKPOINT04.md) | Cursor/selection fidelity, shift-arrow selection, cut/copy/paste and undo/redo representation. |
| [CHECKPOINT05](CHECKPOINT05.md) | Text Trace, fast encoding, dashboard/grid, richer replay/graph coordination and experimental IDFX/CSV import/export. |
| [CHECKPOINT06](CHECKPOINT06.md) | DiffKeys, DiffKeys Direct IDFX conversion, Inputlog compatibility testing and additional batch export routes. |

## Remaining Gaps

- **Pre-Git development:** the first commit is 2025-12-18, not the application's
  birth date. The available history cannot date the original recorder or analyses.
- **December-to-June gap:** there are no intervening commits between the
  2025-12-19 snapshot and the large 2026-06-11 snapshot. Exact dates for the modern
  linear pipeline, dashboard, Text Trace, DiffKeys and initial IDFX work are unknown.
- **Ignored tools:** exploratory Node scripts and database-fetch/export tools are
  not consistently tracked. Their existence and relative order are documented in
  checkpoints/conversation, but a reliable introduction date is often unavailable.
- **Commit versus implementation:** the October commit includes earlier work.
  October 26 must not be presented as the implementation date of every file it adds.
- **Refactoring dates:** June 14 is the extraction/reorganisation date for many
  pane files. It should not replace the earlier feature dates above.
- **Recording timestamps:** dates inside research logs describe recordings, not
  necessarily the implementation date of the current feature or converter.

## Evidence And Reproduction

Primary Git anchors: `f15da4e`, `81a9887`, `3fb3c51`, `526b99b`, `d336e93`,
`c2eaac9`, `4d4082b`, `90e451a`, `e0e8d45`, `164d442`, `37d82eb`, `a08cce1`,
`016b62e`. Dates were checked against the actual commit timestamps; author and
committer timestamps agree for the checkpoint-introduction commits examined.

Useful commands:

```sh
git log --reverse --date=iso-strict --format='%h %ad %s'
git show f15da4e:webscriptlog_main.js
git show 3fb3c51 --stat
git show 164d442 --stat
git log --follow -- panes/mobile_notes/mobile_notes.js
```

Later summaries: [CHECKPOINT07](CHECKPOINT07.md), [CHECKPOINT08](CHECKPOINT08.md),
[CHECKPOINT09](CHECKPOINT09.md), [CHECKPOINT10](CHECKPOINT10.md),
[conversion round-trip report](CONVERSION_ROUNDTRIPS.md).
