# JavaScript Conversion Round Trips

Tested the three supplied testbeds with the shared JavaScript conversion core. Input files were read only.

Each route is source -> intermediate format -> source. IDFX extensions are enabled; insertion event names use the replace dialect.

| Input | Final UTF-16 length | Edits | Key actions | Carets | Scrolls |
| --- | ---: | ---: | ---: | ---: | ---: |
| testbed-ilog.idfx | 215 | 670 | 2493 | 1482 | 0 |
| testbed-sll.json | 227 | 455 | 1822 | 981 | 18 |
| testbed-wscr.txt | 234 | 605 | 2262 | 2540 | 74 |

| Source | Via | Result | Max edit drift (ms) | Max key drift (ms) | Additional derived carets |
| --- | --- | --- | ---: | ---: | ---: |
| testbed-ilog.idfx | json | PASS | 0 | 0 | 577 |
| testbed-ilog.idfx | raw | PASS | 0 | 0 | 577 |
| testbed-ilog.idfx | webscriptlog | PASS | 2 | 1 | 548 |
| testbed-ilog.idfx | idfx | PASS | 0 | 0 | 1154 |
| testbed-sll.json | json | PASS | 0 | 0 | 0 |
| testbed-sll.json | raw | PASS | 0 | 0 | 0 |
| testbed-sll.json | webscriptlog | PASS | 0.810027 | 0.812225 | 0 |
| testbed-sll.json | idfx | PASS | 0 | 0 | 381 |
| testbed-wscr.txt | json | PASS | 0 | 0 | 0 |
| testbed-wscr.txt | raw | PASS | 0 | 0 | 0 |
| testbed-wscr.txt | webscriptlog | PASS | 0 | 0 | 0 |
| testbed-wscr.txt | idfx | PASS | 0 | 0 | 0 |

Checks include every edit range and removed/inserted payload, every successive text state, reverse reconstruction to initial text, key action ordering/count, original caret ranges in order, and viewport observations. JSON/raw/labelled IDFX routes additionally require exact edit/key timing, observed key details, epoch and duration.

All WebScriptLog-origin routes require equality of every original record map and timestamp, including duplicate observations and pointer/focus records. The Inputlog-origin web route also checks that its intermediate web maps survive a further labelled-IDFX round trip.

Expected differences: web conversion normalizes selection direction, loses unavailable physical-key fields and rounds timing to milliseconds; collision shifts are reported. The 2 ms drift bound is specific to these testbeds. Labelled IDFX can add derived caret observations, so original caret observations are checked as an ordered subsequence. Regenerated IDFX is semantic history, not byte-identical XML.


Reproduce: `node tools/validate_conversion_roundtrips.js --report CONVERSION_ROUNDTRIPS.md`.
