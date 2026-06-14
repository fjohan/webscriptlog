# CHECKPOINT09

## Pane extraction and hierarchy reorg

Several analysis/UI panes have been extracted out of `webscriptlog_main.js` and organized under `panes/`.

Current pane hierarchy:

```text
panes/
  diffkeys/diffkeys_pane.js
  word_history/word_history_pane.js
  final_text_analysis/final_text_analysis_pane.js
  revision_table/revision_table_pane.js
  info/inspect_core.js
  info/info_window_pane.js
  mobile_notes/mobile_notes.js
  linear/webscriptlog_linear.js
  linear/webscriptlog_linear_fast.js
  linear/webscriptlog_linear_runtime.js
  idfx/webscriptlog_format_converters.js
```

Shared non-pane utilities currently remain at top level:

```text
webscriptlog_record_utils.js
webscriptlog_analysis_core.js
```

`index.html` now loads the pane modules from `panes/*/`.

## Extraction status

- DiffKeys: moved; rendering in `panes/diffkeys`, core in `webscriptlog_analysis_core.js`.
- Word History: moved; rendering in `panes/word_history`, core in `webscriptlog_analysis_core.js`.
- Final Text Analysis: moved; rendering/highlight handling in `panes/final_text_analysis`, core character rows in `webscriptlog_analysis_core.js`.
- Revision Table: moved to `panes/revision_table`; replay jump helpers remain in main.
- Info/Inspect: split into `panes/info/inspect_core.js` and `panes/info/info_window_pane.js`.
- Mobile Notes: moved to `panes/mobile_notes`.
- Linear/Text Trace/Writing Score: grouped under `panes/linear`.
- IDFX: moved under `panes/idfx`.

## Remaining in `webscriptlog_main.js`

The main file still owns the larger systems not yet extracted:

- recorder / record pane
- text replay engine and replay cursor/selection behavior
- process graph rendering
- loading/storage/fetch integration
- shared compatibility wrappers used by older call sites

Some functions remain as thin delegates in `webscriptlog_main.js` so older callers continue to work while panes are moved.

## Verification

- Ran syntax checks for relocated pane scripts.
- Checked that all `index.html` script paths exist.
- Ran VM smoke tests for relocated DiffKeys, Word History, Final Text Analysis, and Info/Inspect panes.
