# Mobile Notes Editor

The original editor is currently active again in `mobile_notes.js`, with its
fixed-height textarea, custom caret and original HTML/settings restored.
The experimental Margin-based version is retained in `mobile_notes_margin.js`
and `mobile_notes_editor.js` for comparison; neither is loaded by `index.html`.
The description below applies to that inactive experiment.

`mobile_notes_editor.js` adapts the native-textarea presentation from
`scr-copy-edit/standalone-editor`: auto-growing height, native caret/selection,
spellcheck disabled and autocorrect enabled. Existing large typography is kept.
The custom caret overlay and forced caret scrolling have been removed.

This is a presentation-only adapter, not Margin's recorder. It emits no custom
events and does not attach composition, clipboard, beforeinput or selection
logging hooks. Highlights, patch generation and Margin's event schema are not
included. Native input, selection, clipboard, composition and undo/redo remain
browser behavior.

`mobile_notes.js` retains the existing WebScriptLog handlers: keydown/repeat/keyup
strings, mouse records, full-text snapshots on input, cursor ranges and textarea
scroll offsets. Notes, switching, snapshot commits and analysis integration are
unchanged. Programmatic value changes when opening notes do not dispatch input.
The growing textarea uses page layout rather than a fixed internal scroll area;
page scrolling is not added to the recording schema.

Run `node tools/mobile_notes_editor.test.js` for presentation and logging checks.
A scripted before/after comparison against the old editor also matched notes,
timestamps, record values, switching and committed snapshots exactly. These
checks do not substitute for real-device keyboard/selection testing.
