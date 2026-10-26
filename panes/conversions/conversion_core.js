(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LogConversionCore = factory();
}(globalThis, function () {
    'use strict';
    const ids = { insertString: 101, remove: 102, replace: 103, caretUpdate: 104, scrollChange: 107, keyPressed: 207, keyReleased: 208 };
    const edits = new Set(['insertString', 'remove', 'replace']);
    const nsPerMs = 1000000n;

    // Preserve integer tokens before JSON.parse can round Java long counters.
    function parseJSON(source) {
        let i = 0;
        function space() { while (/\s/.test(source[i] || '') && i < source.length) i++; }
        function read() {
            space(); const c = source[i];
            if (c === '"') {
                const start = i++;
                while (i < source.length) {
                    if (source[i++] === '\\') i++;
                    else if (source[i - 1] === '"') return JSON.parse(source.slice(start, i));
                }
                throw new Error('Unterminated JSON string');
            }
            if (c === '[' || c === '{') {
                const array = c === '[', end = array ? ']' : '}'; i++;
                const result = array ? [] : Object.create(null); space();
                if (source[i] === end) { i++; return result; }
                for (;;) {
                    if (array) result.push(read());
                    else {
                        space(); if (source[i] !== '"') throw new Error('Expected JSON property');
                        const key = read(); space(); if (source[i++] !== ':') throw new Error('Expected colon');
                        if (Object.hasOwn(result, key)) throw new Error('Duplicate JSON property: ' + key);
                        result[key] = read();
                    }
                    space(); const next = source[i++];
                    if (next === end) return result;
                    if (next !== ',') throw new Error('Expected comma or ' + end);
                }
            }
            const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(i));
            if (!match) throw new Error('Invalid JSON at character ' + i);
            i += match[0].length;
            if (/^-?\d+$/.test(match[0])) {
                const n = BigInt(match[0]); return n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(n) : n;
            }
            const value = JSON.parse(match[0]);
            if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Nonfinite JSON number');
            return value;
        }
        const result = read(); space(); if (i !== source.length) throw new Error('Trailing JSON content'); return result;
    }

    function stringify(value, indent = 2) {
        function encode(item, depth) {
            if (typeof item === 'bigint') return item.toString();
            if (item === null || typeof item !== 'object') {
                const text = JSON.stringify(item); if (text === undefined) throw new Error('Unsupported JSON value'); return text;
            }
            const array = Array.isArray(item), keys = array ? item.map((_, i) => i) : Object.keys(item).filter(k => item[k] !== undefined);
            if (!keys.length) return array ? '[]' : '{}';
            const pad = ' '.repeat(indent * (depth + 1));
            const parts = keys.map(key => (array ? '' : JSON.stringify(key) + (indent ? ': ' : ':')) + encode(item[key], depth + 1));
            return (array ? '[' : '{') + (indent ? '\n' + pad : '') + parts.join(indent ? ',\n' + pad : ',') +
                (indent ? '\n' + ' '.repeat(indent * depth) : '') + (array ? ']' : '}');
        }
        return encode(value, 0);
    }

    function integer(value, label = 'integer') {
        if (typeof value === 'bigint') return value;
        if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
        throw new Error('Expected exact ' + label);
    }
    function index(value, label = 'position') {
        const n = Number(integer(value, label));
        if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid ' + label); return n;
    }
    function string(value, label = 'text') {
        if (typeof value !== 'string') throw new Error('Expected string ' + label); return value;
    }
    function epochFromISO(iso) {
        const match = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(string(iso));
        if (!match) throw new Error('Invalid recordingStartTime');
        const ms = Date.parse(match[1] + match[3]);
        if (!Number.isFinite(ms)) throw new Error('Invalid recordingStartTime');
        return BigInt(ms) * nsPerMs + BigInt((match[2] || '').padEnd(9, '0'));
    }
    function isoFromEpoch(ns) {
        let seconds = ns / 1000000000n, fraction = ns % 1000000000n;
        if (fraction < 0) { seconds--; fraction += 1000000000n; }
        return new Date(Number(seconds * 1000n)).toISOString().replace(/\.\d{3}Z$/, '') +
            (fraction ? '.' + fraction.toString().padStart(9, '0').replace(/0+$/, '') : '') + 'Z';
    }
    function apply(text, event) {
        if (!edits.has(event.type)) return text;
        const offset = index(event.offset), removed = string(event.removed), inserted = event.inserted == null ? '' : string(event.inserted);
        if (offset + removed.length > text.length || text.slice(offset, offset + removed.length) !== removed) throw new Error('Edit does not match document at ' + offset);
        if (event.type === 'insertString' && removed.length) throw new Error('Insertion removes text');
        if (event.type === 'remove' && inserted.length) throw new Error('Removal inserts text');
        return text.slice(0, offset) + inserted + text.slice(offset + removed.length);
    }
    function validate(log) {
        let text = string(log.initialText), previous = 0n;
        integer(log.epochNs, 'epoch');
        log.events.forEach(function (event, i) {
            try {
                if (!Object.hasOwn(ids, event.type)) throw new Error('Unknown event ' + event.type);
                event.time = integer(event.time, 'elapsed nanoseconds');
                if (event.time < previous) throw new Error('Timestamps run backwards'); previous = event.time;
                text = apply(text, event);
                if (event.type === 'caretUpdate') {
                    if (index(event.dot) > text.length || index(event.mark) > text.length) throw new Error('Caret outside document');
                } else if (event.type === 'scrollChange') { index(event.viewX); index(event.viewY); }
                else if (event.type === 'keyPressed' || event.type === 'keyReleased') integer(event.keyCode, 'keyCode');
            } catch (error) { throw new Error('Event ' + (i + 1) + ': ' + error.message); }
        });
        log.finalText = text; log.warnings = log.warnings || []; log.metadata = log.metadata || {};
        log.durationNs = log.durationNs === undefined ? previous : integer(log.durationNs);
        if (log.durationNs < previous) throw new Error('Duration precedes last event');
        return log;
    }
    function header(log, options = {}) {
        validate(log);
        const h = { ...log.metadata };
        for (const key of ['id_age', 'id_language', 'id_task', 'id_condition', 'id_comment', 'id_code', 'id_family_name', 'id_project', 'textLanguage', 'id_first_name', 'id_gender']) h[key] ??= '';
        Object.assign(h, { startTime: integer(h.startTime ?? 0), initialText: log.initialText, recordingStartTime: isoFromEpoch(log.epochNs),
            tokensInFinalText: log.finalText.length, editDialect: options.replaceInsertions ? 'replace' : 'recorded' });
        h.endTime = h.startTime + log.durationNs;
        h.Version ??= 'ScriptLogLite-2'; h.osName ??= 'WebScriptLog conversion'; h.fontFamily ??= 'Monospaced'; h.fontSize ??= 12; h.lineSpacing ??= 1;
        for (const key of ['TextAreaWidth', 'TextAreaHeight', 'TextAreaX', 'TextAreaY']) h[key] ??= 0;
        return h;
    }
    function fromNative(root) {
        if (!Array.isArray(root) || root.length !== 2 || !Array.isArray(root[0]) || root[0].length !== 1 || !root[0][0] || !Array.isArray(root[1])) throw new Error('Expected [[metadata], [events]]');
        const metadata = root[0][0], start = integer(metadata.startTime, 'startTime');
        const log = { metadata: { ...metadata }, epochNs: metadata.recordingStartTime ? epochFromISO(metadata.recordingStartTime) : 0n,
            initialText: string(metadata.initialText ?? ''), events: [], warnings: [], durationNs: integer(metadata.endTime ?? start) - start };
        if (!metadata.recordingStartTime) log.warnings.push('No wall-clock epoch in source; using 1970-01-01.');
        let text = log.initialText;
        root[1].forEach(function (item) {
            const type = /^<(.+)>$/.exec(string(item.event));
            if (!type || ids[type[1]] !== Number(item.eventID)) throw new Error('Unknown event or eventID mismatch');
            const event = { ...item, type: type[1], time: integer(item.when, 'when') - start };
            delete event.event; delete event.eventID; delete event.when; delete event.relativeTime;
            if (edits.has(event.type)) {
                event.offset = index(item.offset); const length = index(item.length, 'length');
                if (event.offset + length > text.length) throw new Error('Edit outside document');
                event.removed = text.slice(event.offset, event.offset + length);
                event.inserted = event.type === 'remove' ? null : item.str;
                if (event.type !== 'remove' && !Object.hasOwn(item, 'str')) throw new Error('Missing inserted str');
                delete event.str; delete event.length;
                text = apply(text, event);
            }
            log.events.push(event);
        });
        return validate(log);
    }
    function nativeRows(log, options = {}) {
        const h = header(log, options);
        const rows = log.events.map(function (event) {
            const type = options.replaceInsertions && event.type === 'insertString' ? 'replace' : event.type;
            const result = { when: h.startTime + event.time, relativeTime: (Number(event.time) / 1e9).toFixed(3), event: '<' + type + '>', eventID: ids[type] };
            if (edits.has(type)) {
                result.offset = event.offset; result.length = event.removed.length;
                if (type !== 'remove') result.str = event.inserted;
            } else {
                const fields = type === 'caretUpdate' ? ['dot', 'mark', 'generated'] : type === 'scrollChange' ? ['viewX', 'viewY'] :
                    ['keyCode', 'keyText', 'keyChar', 'modifiers', 'modifiersText', 'keyLocation', 'strokeId', 'repeat'];
                for (const key of fields) if (event[key] !== undefined && event[key] !== null) result[key] = event[key];
            }
            return result;
        });
        return [[h], rows];
    }
    function rawEncode(text) {
        if (text === null) return '\\N'; if (text === '') return '\\e';
        return string(text).replace(/[\\\s\x00-\x1f]/g, c => ({ ' ': '\\s', '\n': '\\n', '\r': '\\r', '\t': '\\t' })[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    }
    function rawDecode(text) {
        if (text === '\\N') return null; if (text === '\\e') return '';
        let result = '';
        for (let i = 0; i < text.length; i++) {
            if (text[i] !== '\\') result += text[i];
            else {
                const c = text[++i];
                if (c === 'u' && /^[a-f\d]{4}$/i.test(text.slice(i + 1, i + 5))) { result += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16)); i += 4; }
                else if (Object.hasOwn({ s: ' ', n: '\n', r: '\r', t: '\t', '\\': '\\' }, c)) result += ({ s: ' ', n: '\n', r: '\r', t: '\t', '\\': '\\' })[c];
                else throw new Error('Invalid raw escape');
            }
        }
        return result;
    }
    function readRaw(source) {
        const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/), separator = lines.indexOf('#');
        if (separator < 0) throw new Error('Missing raw # separator');
        const metadata = Object.create(null);
        for (const line of lines.slice(0, separator)) {
            const colon = line.indexOf(':'); if (colon < 1) throw new Error('Invalid raw header');
            const key = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
            if (Object.hasOwn(metadata, key)) throw new Error('Duplicate header ' + key);
            if ((key === 'Version' || key.startsWith('id_') || ['osName', 'fontFamily', 'textLanguage', 'recordingStartTime', 'initialText'].includes(key)) && !value.startsWith('"')) metadata[key] = value;
            else { try { metadata[key] = parseJSON(value); } catch (_) { metadata[key] = value; } }
        }
        const rows = [];
        for (const line of lines.slice(separator + 1).filter(s => s.trim())) {
            const p = line.split(' '), match = /^<(.+)>$/.exec(p[2]);
            if (!match || !Object.hasOwn(ids, match[1]) || !/^\d+$/.test(p[0]) || !Number.isFinite(Number(p[1])) || Number(p[1]) < 0) throw new Error('Invalid raw event');
            const type = match[1], row = { when: BigInt(p[0]), relativeTime: p[1], event: p[2], eventID: ids[type] };
            if (edits.has(type)) {
                if (p.length !== (type === 'remove' ? 5 : 6)) throw new Error('Invalid raw edit fields');
                row.offset = Number(p[3]); row.length = Number(p[4]); if (type !== 'remove') row.str = rawDecode(p[5]);
            } else if (type === 'caretUpdate' || type === 'scrollChange') {
                if (p.length !== 5 && !(type === 'caretUpdate' && p.length === 6 && p[5] === 'generated=true')) throw new Error('Invalid raw view fields');
                row[type === 'caretUpdate' ? 'dot' : 'viewX'] = Number(p[3]); row[type === 'caretUpdate' ? 'mark' : 'viewY'] = Number(p[4]);
                if (p.length === 6) row.generated = true;
            } else {
                row.keyCode = Number(p[3]);
                for (const extra of p.slice(4)) {
                    const equal = extra.indexOf('='); if (equal < 1) throw new Error('Invalid raw keyboard detail');
                    const key = extra.slice(0, equal), val = rawDecode(extra.slice(equal + 1));
                    if (['keyCode', 'modifiers', 'keyLocation'].includes(key)) row[key] = Number(val);
                    else row[key] = key === 'repeat' ? val === 'true' : val;
                }
            }
            rows.push(row);
        }
        return fromNative([[metadata], rows]);
    }
    function writeRaw(log, options) {
        const [[h], rows] = nativeRows(log, options);
        return Object.entries(h).map(([k, v]) => k + ': ' + stringify(v, 0)).join('\n') + '\n#\n' + rows.map(function (row) {
            const type = row.event.slice(1, -1), parts = [String(row.when), row.relativeTime, row.event];
            if (edits.has(type)) { parts.push(row.offset, row.length); if (type !== 'remove') parts.push(rawEncode(row.str)); }
            else if (type === 'caretUpdate') { parts.push(row.dot, row.mark); if (row.generated) parts.push('generated=true'); }
            else if (type === 'scrollChange') parts.push(row.viewX, row.viewY);
            else { parts.push(row.keyCode); for (const key of ['keyText', 'keyChar', 'modifiers', 'modifiersText', 'keyLocation', 'strokeId', 'repeat']) if (row[key] != null) parts.push(key + '=' + rawEncode(String(row[key]))); }
            return parts.join(' ');
        }).join('\n') + '\n';
    }
    return { ids, edits, nsPerMs, parseJSON, stringify, integer, index, string, epochFromISO, isoFromEpoch, apply, validate, header, fromNative, nativeRows, readRaw, writeRaw };
}));
