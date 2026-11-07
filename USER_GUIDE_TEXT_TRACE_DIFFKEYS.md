# Text Trace And DiffKeys

These panes show **how the text changed during a recording**, including text
that was later deleted. They complement Word History and Final Text Analysis,
which organise their results around the surviving final text.

## Getting Started

Load a recording in Playback and use **LOAD PANES** to populate the dashboard.
Choose **Text Trace** or **DiffKeys** from a panel's pane selector. Keep Text Replay
visible alongside them when investigating an edit.

## Text Trace

Text Trace presents the recording as chronological groups of writing actions,
using the same notation as Writing Score. A row can combine several text updates;
it is not necessarily one word, one keystroke or one revision.

| Column | How to read it |
| --- | --- |
| `source_ts` | Time in **seconds from recording start**. A range gives the first and last source times in the group. |
| `linear_items` | Inserted text and action tokens describing the group. |

Click the first timestamp to position Text Replay just before the group's first
source event. Where a second timestamp is shown, click it to position replay
through the group's last source event. Use replay's edit-step controls to examine
what happened in between.

Common items:

- Plain text: inserted text.
- `<ENTER>`: a newline.
- `<DEL>` / `<DEL3>`: backspace deletion of one / three characters.
- `<FDEL>`: forward deletion.
- `<LEFT>`, `<RIGHT>`, `<HOME>`, etc.: navigation actions.
- `<CLICK12>`: caret placement at position 12; `<SEL4:8>`: a selection range.
- `<NAV12>`: an explicit resolved caret position when navigation alone does not determine it.
- `<0.750>`: a 0.750-second pause, subject to the pause threshold.

For example, `cot<DEL2>at` inserts `cot`, deletes `ot`, then inserts `at`, leaving
`cat`. This describes the text effect; it is not a classification of the writer's
intention. The pause threshold controls which pauses appear, so absence of a
pause token does not mean there was no interval between actions.

## DiffKeys

DiffKeys has **one row per recorded text snapshot**, linking the text change to
nearby keyboard events. It is not a complete list of physical keypresses: keys
that produced no text snapshot need not have a separate row.

| Column | How to read it |
| --- | --- |
| `id` | Source text-update ID, also used to link final-text characters to DiffKeys. |
| `prefix length` | Number of unchanged characters before the changed span, measured in that update's text context. It is not a position in the final text. |
| `text length` | Total text length after the update. |
| `keydown time` / `keyup time` | **Seconds from recording start**, shown to three decimal places. |
| `keydown value` / `keyup value` | Recorded key names associated with the update. |
| `key match` | `matched`, `missing-keyup` or `missing-keydown`. |
| `lc word transition ms` | Eligible lowercase-letter transition time in **milliseconds**; blank means the row was not eligible. |
| `text changed` | Inserted text, `DEL: text` for deletion, or `old -> new` for replacement. An unchanged snapshot can have an empty change. |

For example, changing `cat` to `cats` gives prefix length **3**, text length **4**,
and changed text `s`. Changing `cot` to `cat` gives prefix length **1** and `o -> a`.

The associated keydown is the latest preceding recorded `keydown`; the keyup is
a later release of the same key. `matched` means a release was found, **not proof
that this key alone caused the text change**. Paste, autocorrection and mobile
composition can change several characters or report keys such as `Process`.
Missing keyboard data is not reconstructed from the resulting text.

## Lowercase Transition Statistics

The transition column measures **current keydown minus previous row's keydown**
when both updates insert one lowercase Unicode letter, neither deletes text,
and the second insertion immediately follows the first in the document.
For ordinary typing of `cat`, `c -> a` and `a -> t` can qualify. Uppercase letters,
spaces, replacements and multi-character insertions do not qualify.

Below the table, **n** is the number of eligible transitions and **median** is
their median duration. It is not average key-hold duration or overall writing
speed. Eligibility is a structural rule, not a guarantee of uninterrupted typing;
inspect unusual rows before interpreting the statistic. The same measurement is
also available in Info statistics for the whole recording and its intervals.

Use Text Trace to locate and replay a sequence, then DiffKeys to inspect its
individual text changes and keyboard associations. Neither pane by itself
establishes the writer's intention or cognitive cause of a pause.
