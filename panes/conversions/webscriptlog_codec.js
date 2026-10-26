(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./conversion_core'));
    else root.WebScriptLogConversion = factory(root.LogConversionCore);
}(globalThis, function (C) {
    'use strict';
    const named = { Backspace: 8, Tab: 9, Enter: 10, Shift: 16, Control: 17, Alt: 18, Pause: 19, CapsLock: 20, Escape: 27,
        PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
        Delete: 127, Insert: 155, Meta: 157, AltGraph: 65406, NumLock: 144, ScrollLock: 145, ContextMenu: 525 };
    const punctuation = { ';': 59, '=': 61, ',': 44, '-': 45, '.': 46, '/': 47, '`': 192, '[': 91, '\\': 92, ']': 93, "'": 222, ' ': 32 };
    function keyCode(name) {
        if (Object.hasOwn(named, name)) return named[name];
        if (/^F(?:[1-9]|1[0-2])$/.test(name)) return 111 + Number(name.slice(1));
        if (/^[a-z0-9]$/i.test(name)) return name.toUpperCase().charCodeAt(0);
        return punctuation[name] || 0;
    }
    function keyName(event) {
        if (event.keyText && !event.keyText.startsWith('VK_')) return event.keyText;
        if (event.keyChar && event.keyChar !== 'undefined' && Array.from(event.keyChar).length === 1 && !/[\x00-\x1f]/.test(event.keyChar)) return event.keyChar;
        return Object.keys(named).find(k => named[k] === event.keyCode) || Object.keys(punctuation).find(k => punctuation[k] === event.keyCode) ||
            (event.keyCode >= 65 && event.keyCode <= 90 ? String.fromCharCode(event.keyCode) : event.keyCode >= 48 && event.keyCode <= 57 ? String.fromCharCode(event.keyCode) :
                event.keyCode >= 112 && event.keyCode <= 123 ? 'F' + (event.keyCode - 111) : 'Unidentified');
    }
    function boundary(text, p) {
        return p === 0 || p === text.length || !(text.charCodeAt(p - 1) >= 0xd800 && text.charCodeAt(p - 1) <= 0xdbff && text.charCodeAt(p) >= 0xdc00 && text.charCodeAt(p) <= 0xdfff);
    }
    function difference(old, next, dot, mark, after, key) {
        let p = 0, s = 0;
        while (p < old.length && p < next.length && old[p] === next[p]) p++;
        if (!boundary(old, p) || !boundary(next, p)) p--;
        while (s < old.length - p && s < next.length - p && old[old.length - s - 1] === next[next.length - s - 1]) s++;
        if (!boundary(old, old.length - s) || !boundary(next, next.length - s)) s--;
        let remove = old.length - p - s, add = next.length - p - s;
        function candidate(offset, count, length) {
            if (offset < 0 || count < 0 || length < 0 || offset + count > old.length || offset + length > next.length ||
                !boundary(old, offset) || !boundary(old, offset + count) || !boundary(next, offset) || !boundary(next, offset + length)) return;
            if (old.slice(0, offset) + next.slice(offset, offset + length) + old.slice(offset + count) === next) { p = offset; remove = count; add = length; }
        }
        if (after && after[0] === after[1]) {
            let offset = remove === 0 ? after[0] - add : add === 0 ? after[0] : Math.min(dot, mark);
            let count = remove, length = add;
            if (remove > 0 && add > 0 && dot !== mark) { count = Math.abs(dot - mark); length = next.length - old.length + count; }
            candidate(offset, count, length);
        }
        if (dot !== mark) candidate(Math.min(dot, mark), Math.abs(dot - mark), next.length - old.length + Math.abs(dot - mark));
        else if (!remove && !after) candidate(dot, remove, add);
        else if (!add && key === 8) candidate(dot - remove, remove, add);
        else if (!add && key === 127) candidate(dot, remove, add);
        return { type: remove === 0 ? 'insertString' : add === 0 ? 'remove' : 'replace', offset: p, removed: old.slice(p, p + remove), inserted: add === 0 ? null : next.slice(p, p + add) };
    }
    function read(source) {
        const root = typeof source === 'string' ? C.parseJSON(source.replace(/^\uFEFF/, '')) : source;
        if (!root || !root.header_records || !root.text_records) throw new Error('Expected WebScriptLog record maps');
        const h = root.header_records, start = C.integer(h.starttime), end = C.integer(h.endtime);
        if (start < 0n || end < start) throw new Error('Invalid WebScriptLog recording interval');
        const records = [], after = new Map(), pointers = [], events = [], warnings = [];
        for (const [section, priority] of [['key_records', 0], ['text_records', 1], ['cursor_records', 2], ['scroll_records', 2]]) {
            const map = root[section] || {};
            if (typeof map !== 'object' || Array.isArray(map)) throw new Error('Invalid ' + section);
            for (const [stamp, value] of Object.entries(map)) {
                if (!/^\d+$/.test(stamp)) throw new Error('Invalid timestamp');
                const time = BigInt(stamp);
                if (time < start || time > end) throw new Error(section + ' timestamp outside recording');
                if (section !== 'scroll_records') C.string(value, section);
                records.push({ time, section, value, priority: section === 'key_records' && value.startsWith('keyup:') ? 3 : priority });
            }
        }
        records.sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : a.priority - b.priority);
        function caret(value) {
            const match = /^(\d+):(\d+)$/.exec(value);
            if (!match) throw new Error('Invalid cursor range');
            const range = [C.index(Number(match[1])), C.index(Number(match[2]))];
            if (range[1] < range[0]) throw new Error('Inverted cursor range'); return range;
        }
        for (const record of records) if (record.section === 'cursor_records') after.set(record.time, caret(record.value));
        let text = '', dot = 0, mark = 0, lastKey = 0, unknown = 0;
        for (const r of records) {
            const time = (r.time - start) * C.nsPerMs;
            if (r.section === 'text_records') {
                if (text === r.value) continue;
                events.push({ ...difference(text, r.value, dot, mark, after.get(r.time), lastKey), time });
                text = r.value; dot = Math.min(dot, text.length); mark = Math.min(mark, text.length); lastKey = 0;
            } else if (r.section === 'cursor_records') {
                [mark, dot] = caret(r.value); if (dot > text.length) throw new Error('Cursor outside document');
                events.push({ type: 'caretUpdate', time, dot, mark });
            } else if (r.section === 'scroll_records') events.push({ type: 'scrollChange', time, viewX: 0, viewY: C.index(r.value) });
            else {
                const match = /^(keydown|keyup|repeat|mousedown|mouseup|mousemove|focus|blur): ?([\s\S]*)$/.exec(r.value);
                if (!match) throw new Error('Unsupported key record: ' + r.value);
                if (match[1].startsWith('mouse') || ['focus', 'blur'].includes(match[1])) { pointers.push({ when: r.time, record: r.value }); continue; }
                const name = match[2], code = keyCode(name);
                if (!code && Array.from(name).length !== 1) unknown++;
                if (match[1] !== 'keyup') lastKey = code;
                events.push({ type: match[1] === 'keyup' ? 'keyReleased' : 'keyPressed', time, keyCode: code, keyText: name,
                    keyChar: Array.from(name).length === 1 ? name : code === 10 ? '\n' : code === 9 ? '\t' : code ? '' : 'undefined',
                    keyLocation: 0, repeat: match[1] === 'repeat' });
            }
        }
        warnings.push('Snapshots become reversible contiguous edits; paste, composition and autocorrection are not inferred as physical keys.');
        warnings.push('Initial text assumed empty; selection direction is unavailable.');
        if (unknown) warnings.push(unknown + ' key records have unavailable identities.');
        if (pointers.length) warnings.push(pointers.length + ' pointer/focus records retained in metadata without document edits.');
        const metadata = { sourceFormat: 'WebScriptLog', webScriptLogHeader: h, webScriptLogPointerRecords: pointers };
        for (const [key, value] of Object.entries(root)) if (!['header_records', 'text_records', 'cursor_records', 'key_records'].includes(key)) metadata['webScriptLog_' + key] = value;
        metadata.webScriptLogImportReport = { warnings };
        return C.validate({ metadata, epochNs: start * C.nsPerMs, initialText: '', events, durationNs: (end - start) * C.nsPerMs, warnings });
    }
    function write(log) {
        C.validate(log);
        const start = log.epochNs / C.nsPerMs;
        if (start < 0n) throw new Error('WebScriptLog requires nonnegative epoch');
        const items = []; let text = log.initialText, shifted = 0, unknown = 0, backward = 0, horizontal = 0, rounded = 0;
        if (text) items.push({ original: start, section: 'text_records', priority: 1, value: text });
        for (const e of log.events) {
            const time = (log.epochNs + e.time) / C.nsPerMs;
            if ((log.epochNs + e.time) % C.nsPerMs) rounded++;
            if (C.edits.has(e.type)) { text = C.apply(text, e); items.push({ original: time, section: 'text_records', priority: 1, value: text }); }
            else if (e.type === 'caretUpdate' && !e.generated) {
                if (e.dot < e.mark) backward++;
                items.push({ original: time, section: 'cursor_records', priority: 2, value: Math.min(e.dot, e.mark) + ':' + Math.max(e.dot, e.mark) });
            } else if (e.type === 'scrollChange') {
                if (e.viewX) horizontal++;
                items.push({ original: time, section: 'scroll_records', priority: 2, value: e.viewY });
            } else if (e.type === 'keyPressed' || e.type === 'keyReleased') {
                const name = keyName(e); if (name === 'Unidentified') unknown++;
                items.push({ original: time, section: 'key_records', priority: e.type === 'keyReleased' ? 3 : 0,
                    value: (e.type === 'keyReleased' ? 'keyup: ' : e.repeat ? 'repeat: ' : 'keydown: ') + name });
            }
        }
        for (const p of log.metadata.webScriptLogPointerRecords || []) items.push({ original: C.integer(p.when), section: 'key_records', priority: -1, value: C.string(p.record) });
        items.sort((a, b) => a.original < b.original ? -1 : a.original > b.original ? 1 : log.metadata.webScriptLogHeader ? a.priority - b.priority : 0);
        const output = { header_records: { ...(log.metadata.webScriptLogHeader || {}), starttime: start, endtime: (log.epochNs + log.durationNs) / C.nsPerMs },
            text_records: {}, cursor_records: {}, key_records: {}, scroll_records: {} };
        for (const [key, value] of Object.entries(log.metadata)) {
            if (key.startsWith('webScriptLog_') && !Object.hasOwn(output, key.slice(13))) output[key.slice(13)] = value;
        }
        let last = start, phase = -1; const lastSection = new Map();
        for (const item of items) {
            let time = item.original > last ? item.original : last;
            if ((lastSection.has(item.section) && time <= lastSection.get(item.section)) || (time === last && item.priority >= 0 && item.priority < phase)) time++;
            if (time !== item.original) shifted++;
            if (time !== last) phase = -1;
            last = time; if (item.priority >= 0) phase = item.priority;
            lastSection.set(item.section, time); output[item.section][time.toString()] = item.value;
        }
        if (last > output.header_records.endtime) output.header_records.endtime = last;
        const warnings = [shifted + ' timestamps adjusted to preserve millisecond ordering.', unknown + ' keys exported as Unidentified.',
            backward + ' selections lost direction.', horizontal + ' horizontal scroll offsets omitted.', rounded + ' event times rounded down to milliseconds.'];
        return { text: C.stringify(output), warnings };
    }
    return { read, write, difference, keyCode, keyName, named };
}));
