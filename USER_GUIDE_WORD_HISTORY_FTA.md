# Word History And Final Text Analysis

These panes examine the **final text of a recording**, using the writing process
to explain how its surviving characters and words were produced. Text deleted
before the end is not displayed, although its history may affect a word's score.

## Getting Started

Load a recording in Playback. Use **LOAD PANES** to populate the dashboard, then
choose **Word History** or **Final Text Analysis** from a panel's pane selector.
Use the same recording in both panes: FTA gives a visual overview; Word History
provides the detailed word-level table.

## Word History

There is one row per word in the final text. Words are separated by whitespace,
so punctuation can remain attached: `today,` is one entry.

| Column | How to read it |
| --- | --- |
| `purity` | Rough editing score: **0 means a simple continuous typing run with no detected later editing**. Higher values indicate more editing or a less continuous origin. Despite the name, lower is less edited. |
| `initial timeSincePrev` | Milliseconds between the text update that created the word's surviving first character and the previous text update. |
| `final timeUntilNext` | Milliseconds between the update that created its surviving last character and the next text update. |
| `initial ids` / `final ids` | Source-event pairs for the adjacent boundary and word edge. Useful for checking the corresponding DiffKeys rows; these are not character positions or times. |
| `initial timing` / `final timing` | Whether the timing can be interpreted as a word-boundary interval. |
| `initial provenance` / `final provenance` | Whether that edge character was typed simply, inserted later or produced by a more complex edit. |

**Read the timing label before interpreting the number.** For example, in
`the cat`, `typed-after-boundary` means the space and `c` were consecutive source
events. The initial interval is then a useful boundary-to-word measure.
If the writer returned later and replaced the `c`, its timing can instead describe
the correction, not the original start of `cat`.

Common labels:

- `typed-after-boundary` / `typed-before-boundary`: consecutive boundary and edge events support the timing interpretation.
- `inserted-after-boundary-later` / `inserted-before-boundary-later`: the edge was inserted beside an older boundary; treat the number as revision-related.
- `boundary-inserted-later`: the following space or newline was added later.
- `same-edit-as-boundary`: both arrived in one update, such as a paste; there is no separately observed interval between them.
- `not-boundary-timed`: the history does not support a simple boundary interpretation.
- `typed-after-start-boundary` / `end-of-text`: a text edge, rather than an ordinary inter-word boundary.

Timing and provenance answer different questions. A word can have valid
`typed-before-boundary` timing but `inserted-final-later` provenance: its final
character was revised, then followed normally by a space.

Purity is exploratory, not a count of mistakes or a writing-quality rating.
A single correction can increase it by more than one. See [WORD_HISTORY.md](WORD_HISTORY.md)
for the scoring rules and further examples.

## Final Text Analysis (FTA)

FTA displays the final text with words coloured by the same purity score:
**green means less edited; yellow/orange/red means more edited**. Hover over a
character to inspect `B` (time before), `A` (time after), `C` (source text-update
index) and `P` (word purity). `B` and `A` are milliseconds; `C` is not elapsed time.

Select a word or passage to mark it. Desktop mouse selection normally marks it
automatically; **Mark selected** provides an explicit action, including on touch
devices. Click a marked passage to remove its mark, or use **Clear marks**.

Press **Generate Table** to list marked passages with **Time Before** from their
first character and **Time After** from their last character. These are edge
intervals, **not the total time spent writing the passage**. Generating the table
also saves the marks locally for that recording in the same browser.

## Interpreting Both Panes

The times follow **text updates**, not necessarily physical keystrokes. A paste,
autocorrection or mobile composition can create several characters together.
The intervals can include navigation, revisions or time away from the editor;
they do not directly measure thinking time. A final character's zero time-after
can simply mean that no later text update exists. Use Word History's timing and
provenance labels alongside FTA's colours and marked-passage table.
