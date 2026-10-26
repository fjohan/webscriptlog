(function () {
    'use strict';
    const get = function (id) { return document.getElementById(id); };
    let files = [], result = null;
    let generation = 0;
    const head = document.createElement('tr');
    InputlogGeneralAnalysis.columns.forEach(function (column) {
        const th = document.createElement('th'); th.textContent = column; head.appendChild(th);
    });
    get('head').appendChild(head);
    async function analyze() {
        const current = ++generation;
        result = null; get('tsv').disabled = get('json').disabled = true;
        get('rows').replaceChildren(); get('warnings').textContent = '';
        const file = files[Number(get('selected').value) || 0];
        if (!file) return;
        get('status').textContent = 'Loading ' + file.name;
        try {
            const xml = await file.text();
            if (current !== generation) return;
            result = InputlogGeneralAnalysis.buildGeneralAnalysis(InputlogIDFX.readIDFX(xml), {
                numberOfIntervals: Number(get('count').value), intervalSizeMs: Number(get('size').value),
                simplePauseLocations: get('simple').checked
            });
            const fragment = document.createDocumentFragment();
            result.rows.forEach(function (row) {
                const tr = document.createElement('tr');
                InputlogGeneralAnalysis.columns.forEach(function (column) {
                    const td = document.createElement('td'); td.textContent = row[column] == null ? '' : String(row[column]); tr.appendChild(td);
                });
                fragment.appendChild(tr);
            });
            get('rows').appendChild(fragment);
            get('status').textContent = file.name + ' | ' + result.rows.length + ' events | final length ' + result.summary.finalDocumentLength +
                ' | production ' + result.summary.characterProduction + ' | ' + (result.summary.durationMs / 1000).toFixed(3) + ' s';
            get('warnings').textContent = result.warnings.join('\n');
            get('tsv').disabled = get('json').disabled = false;
        } catch (error) { get('status').textContent = error.message; }
    }
    get('files').addEventListener('change', function () {
        files = Array.from(get('files').files); get('selected').replaceChildren();
        files.forEach(function (file, index) {
            const option = document.createElement('option'); option.value = index; option.textContent = file.name; get('selected').appendChild(option);
        });
        get('selected').hidden = files.length < 2;
        analyze();
    });
    ['selected', 'count', 'size', 'simple'].forEach(function (id) { get(id).addEventListener('change', analyze); });
    ['tsv', 'json'].forEach(function (format) {
        get(format).addEventListener('click', function () {
            if (!result) return;
            const content = format === 'json' ? JSON.stringify(result, null, 2) : InputlogGeneralAnalysis.toTSV(result);
            const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/tab-separated-values' }));
            const anchor = document.createElement('a'); anchor.href = url;
            anchor.download = files[Number(get('selected').value) || 0].name.replace(/\.idfx$/i, '') + '.general.' + format;
            anchor.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
    });
}());
