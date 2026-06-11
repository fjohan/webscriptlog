# WebScriptLog Working Export

This directory is a cleaned working export from the development `uilab` directory.

Included:

- main browser app: `index.html`, `main.css`, runtime JS files
- dashboard, replay, linear/writing-score, emulator, batch ZIP exporters
- active IDFX converter: `dist/webscriptlog_format_converters.js`
- DiffKeys Direct converter: `diffkeys-direct-recorder/converter.js`
- browser dependencies: `ext_js/`, `helpers_js/`
- PHP endpoints used by the app: `php/`
- `harvard.html` for the emulator
- empty `real_logs/` target directory for `php/save_real_log.php`

Excluded:

- checkpoint and workflow notes
- user prompt logs
- IDFX investigation folders
- large test bundles/corpora
- `inputlog-libreoffice`
- development tools and standalone experiments
- backup converter files

Notes:

- Server fetch/save still depends on the deployment-specific PHP database include paths used by `php/getdata.php` and `php/putdata.php`.
- `php/save_real_log.php` was copied from `php-noload/` because the emulator posts to `php/save_real_log.php`.
- IDFX import/export remains experimental.
