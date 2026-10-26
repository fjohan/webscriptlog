(function (root) {
    'use strict';
    const mounted = new WeakSet();
    function mount(host) {
        if (!host || mounted.has(host)) return host;
        mounted.add(host);
        const get = name => host.querySelector('[data-conversion="' + name + '"]');
        const state = { inputs: [], results: [], busy: false };
        function invalidate() {
            state.results = []; get('results').replaceChildren(); get('download').disabled = true;
            get('convert').disabled = !state.inputs.length || state.busy;
        }
        function status(text) { get('status').textContent = text; }
        function download(text, name, type = 'text/plain;charset=utf-8') {
            const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
            const link = document.createElement('a'); link.href = url; link.download = name; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        function cell(row, text) { const td = document.createElement('td'); td.textContent = text; row.appendChild(td); return td; }
        function render() {
            get('results').replaceChildren();
            for (const item of state.results) {
                const row = document.createElement('tr');
                cell(row, item.name); cell(row, item.result ? LogConversions.formats[item.result.from].label : '');
                cell(row, item.outputName || '');
                const detail = cell(row, item.error || (item.result.summary.events + ' events; ' + item.result.summary.finalLength + ' characters'));
                if (item.result?.warnings.length) {
                    const disclosure = document.createElement('details'), summary = document.createElement('summary'), list = document.createElement('ul');
                    summary.textContent = item.result.warnings.length + ' conversion notes';
                    for (const text of item.result.warnings) { const li = document.createElement('li'); li.textContent = text; list.appendChild(li); }
                    disclosure.append(summary, list); detail.appendChild(disclosure);
                }
                const action = cell(row, '');
                if (item.result) {
                    const button = document.createElement('button'); button.type = 'button'; button.className = 'sl_button'; button.textContent = 'Download';
                    button.addEventListener('click', () => download(item.result.text, item.outputName)); action.appendChild(button);
                }
                if (item.error) row.className = 'conversions-error';
                get('results').appendChild(row);
            }
        }
        get('files').addEventListener('change', function () {
            state.inputs = Array.from(this.files).map(file => ({ name: file.name, read: () => file.text() }));
            invalidate(); status(state.inputs.length + ' files selected.');
        });
        get('current').addEventListener('click', function () {
            try {
                const records = root.getCurrentWebScriptLogRecords?.();
                if (!records?.header_records || records.header_records.starttime == null || records.header_records.endtime == null) throw new Error('Load a completed recording first.');
                const source = LogConversionCore.stringify(records);
                state.inputs = [{ name: 'current-recording_webscriptlog.txt', read: async () => source }];
                get('files').value = ''; invalidate(); status('Current recording selected.');
            } catch (error) { status(error.message); }
        });
        for (const name of ['from', 'to', 'replace', 'labels']) get(name).addEventListener('change', function () {
            invalidate(); status(state.inputs.length ? 'Ready to convert ' + state.inputs.length + ' files.' : 'Choose files or use the current recording.');
        });
        get('convert').addEventListener('click', async function () {
            if (state.busy) return;
            state.busy = true; invalidate();
            for (const control of host.querySelectorAll('input, select, button')) control.disabled = true;
            host.setAttribute('aria-busy', 'true');
            const options = { from: get('from').value, to: get('to').value, replaceInsertions: get('replace').checked, labels: get('labels').checked };
            try {
                const names = state.inputs.map(input => LogConversions.filename(input.name, options.to));
                for (let i = 0; i < state.inputs.length; i++) {
                    const input = state.inputs[i]; status('Converting ' + (i + 1) + '/' + state.inputs.length + ': ' + input.name);
                    await new Promise(resolve => setTimeout(resolve, 0));
                    try {
                        if (names.filter(name => name === names[i]).length > 1) throw new Error('Multiple inputs map to ' + names[i] + '; rename the input files.');
                        const result = LogConversions.convert(await input.read(), options);
                        state.results.push({ name: input.name, outputName: names[i], result });
                    } catch (error) { state.results.push({ name: input.name, error: error.message }); }
                }
                render(); const success = state.results.filter(item => item.result).length;
                status(success + ' converted, ' + (state.results.length - success) + ' failed.');
            } finally {
                state.busy = false; host.removeAttribute('aria-busy');
                for (const control of host.querySelectorAll('input, select, button')) control.disabled = false;
                get('download').disabled = !state.results.some(item => item.result);
                get('convert').disabled = !state.inputs.length;
            }
        });
        get('download').addEventListener('click', async function () {
            try {
                const successes = state.results.filter(item => item.result);
                if (!successes.length) return;
                if (successes.length === 1) { download(successes[0].result.text, successes[0].outputName); return; }
                if (!root.JSZip) throw new Error('ZIP library unavailable. Use the individual download buttons.');
                this.disabled = true;
                const zip = new root.JSZip();
                for (const item of successes) zip.file(item.outputName, item.result.text);
                zip.file('conversion-report.json', LogConversionCore.stringify(state.results.map(item => ({
                    input: item.name, output: item.outputName, error: item.error, from: item.result?.from, to: item.result?.to,
                    summary: item.result?.summary, warnings: item.result?.warnings
                }))));
                download(await zip.generateAsync({ type: 'blob' }), 'conversions.zip');
            } catch (error) { status(error.message); }
            finally { this.disabled = false; }
        });
        return host;
    }
    root.ConversionsPane = { mount };
}(globalThis));
