(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./conversion_core'), require('./webscriptlog_codec'), require('./idfx_codec'));
    else root.LogConversions = factory(root.LogConversionCore, root.WebScriptLogConversion, root.IDFXConversion);
}(globalThis, function (C, W, I) {
    'use strict';
    const formats = { json: { label: 'ScriptLogLite JSON', suffix: '.json' }, raw: { label: 'ScriptLogLite raw', suffix: '_raw.txt' },
        webscriptlog: { label: 'WebScriptLog', suffix: '_webscriptlog.txt' }, idfx: { label: 'Inputlog IDFX', suffix: '.idfx' } };
    function detect(source) {
        const text = C.string(source).replace(/^\uFEFF/, '').trimStart();
        if (text.startsWith('<')) return 'idfx';
        if (text.startsWith('[')) return 'json';
        if (text.startsWith('{')) {
            const data = C.parseJSON(text);
            if (data.header_records && data.text_records) return 'webscriptlog';
        }
        if (/^#\r?$/m.test(text)) return 'raw';
        throw new Error('Unrecognized log format');
    }
    function read(source, format = 'auto') {
        source = source.replace(/^\uFEFF/, '');
        const detected = detect(source);
        if (format !== 'auto' && format !== detected && !(format === 'scriptloglite' && ['json', 'raw'].includes(detected))) throw new Error('Expected ' + format + ', detected ' + detected);
        const log = detected === 'json' ? C.fromNative(C.parseJSON(source)) : detected === 'raw' ? C.readRaw(source) : detected === 'idfx' ? I.read(source) : W.read(source);
        return { log, format: detected };
    }
    function write(log, format, options = {}) {
        if (!Object.hasOwn(formats, format)) throw new Error('Unknown target format');
        if (format === 'json') return { text: C.stringify(C.nativeRows(log, options)), warnings: [] };
        if (format === 'raw') return { text: C.writeRaw(log, options), warnings: [] };
        return format === 'idfx' ? I.write(log, options) : W.write(log, options);
    }
    function convert(source, options = {}) {
        const { log, format } = read(source, options.from || 'auto');
        const result = write(log, options.to || 'json', options);
        return { ...result, from: format, to: options.to || 'json', warnings: [...new Set(log.warnings.concat(result.warnings))],
            summary: { events: log.events.length, finalLength: log.finalText.length, durationSeconds: Number(log.durationNs) / 1e9 } };
    }
    function filename(name, format) {
        if (!Object.hasOwn(formats, format)) throw new Error('Unknown target format');
        const base = name.replace(/\.[^.]*$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'recording';
        return base + formats[format].suffix;
    }
    return { formats, detect, read, write, convert, filename };
}));
