(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./conversion_core'), require('./webscriptlog_codec'), require('../../ext_js/xmldom').DOMParser);
    else root.IDFXConversion = factory(root.LogConversionCore, root.WebScriptLogConversion, root.DOMParser);
}(globalThis, function (C, W, DOMParser) {
    'use strict';
    const vkCodes = { PRIOR: 33, NEXT: 34, BACK: 8, RETURN: 10, LSHIFT: 16, RSHIFT: 16, SHIFT: 16,
        LCONTROL: 17, RCONTROL: 17, CONTROL: 17, LMENU: 18, RMENU: 18, MENU: 18, LWIN: 524, RWIN: 524,
        OEM_1: 59, OEM_2: 47, OEM_3: 192, OEM_4: 91, OEM_5: 92, OEM_6: 93, OEM_7: 222,
        OEM_MINUS: 45, OEM_PLUS: 61, OEM_COMMA: 44, OEM_PERIOD: 46, SPACE: 32, TAB: 9, DELETE: 127,
        UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, HOME: 36, END: 35, ESCAPE: 27, CAPITAL: 20, INSERT: 155, CLEAR: 12 };
    const xmlEscape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function wordEscape(value) {
        return String(value).replace(/\n/g, '\r').replace(/[\x00-\x1f\\\ufffe\uffff\ud800-\udfff]/g, c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
    }
    const decode = s => s.replace(/\\u([0-9a-f]{4})/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/\r\n|\r/g, '\n');
    const children = (n, name) => Array.from(n?.childNodes || []).filter(c => c.nodeType === 1 && (!name || c.nodeName === name));
    const child = (n, name) => children(n, name)[0];
    function field(n, name, fallback) {
        const node = child(n, name); if (node) return node.textContent;
        if (fallback !== undefined) return fallback; throw new Error('Missing IDFX ' + name);
    }
    const part = (e, type) => children(e, 'part').find(n => n.getAttribute('type') === type);
    function entries(node) { return Object.fromEntries(children(node, 'entry').map(n => [field(n, 'key'), field(n, 'value')])); }
    function label(e, key) {
        for (const node of children(e, 'label')) {
            if (node.getAttribute('key') === key) return node.textContent;
            if (node.getAttribute('key') === 'ScriptLogLite') {
                const obj = C.parseJSON(node.textContent); if (obj[key] !== undefined) return String(obj[key]);
            }
        }
        return null;
    }
    function code(name) {
        if (name === '0') return 0;
        const n = name.replace(/^VK_/, '');
        return vkCodes[n] || (/^[A-Z0-9]$/.test(n) ? n.charCodeAt(0) : /^F(?:[1-9]|1[0-2])$/.test(n) ? 111 + Number(n.slice(1)) : 0);
    }
    function windowsKey(e) {
        if (e.keyText?.startsWith('VK_')) return e.keyText;
        const overrides = { 16: e.keyLocation === 3 ? 'RSHIFT' : 'LSHIFT', 17: 'LCONTROL', 18: 'LMENU', 157: 'LWIN', 524: 'LWIN', 65406: 'LMENU' };
        const n = overrides[e.keyCode] || Object.keys(vkCodes).find(n => vkCodes[n] === e.keyCode);
        if (n) return 'VK_' + n;
        if (e.keyCode >= 48 && e.keyCode <= 57 || e.keyCode >= 65 && e.keyCode <= 90) return 'VK_' + String.fromCharCode(e.keyCode);
        if (e.keyCode >= 112 && e.keyCode <= 123) return 'VK_F' + (e.keyCode - 111);
        return '0';
    }
    function pairKeys(events) {
        const result = new Map(), identified = new Map(), pending = new Map(); let orphan = 0;
        events.forEach(function (e, i) {
            if (!['keyPressed', 'keyReleased'].includes(e.type)) return;
            const identity = e.keyCode + ':' + (e.keyLocation ?? '');
            if (!pending.has(identity)) pending.set(identity, []);
            const queue = pending.get(identity);
            if (e.type === 'keyPressed') { queue.push(i); if (e.strokeId != null) identified.set(e.strokeId, i); }
            else {
                const press = e.strokeId != null ? identified.get(e.strokeId) : queue.at(-1);
                if (press === undefined || result.has(press)) { orphan++; return; }
                result.set(press, i);
                const original = events[press], q = pending.get(original.keyCode + ':' + (original.keyLocation ?? ''));
                q.splice(q.indexOf(press), 1); if (original.strokeId != null) identified.delete(original.strokeId);
            }
        });
        return { pairs: result, orphan };
    }
    function write(log, options = {}) {
        const h = C.header(log, options), extensions = options.labels !== false, { pairs, orphan } = pairKeys(log.events);
        const warnings = ['IDFX uses Word pre-edit UTF-16 positions including one final paragraph mark; no Word document or layout is created.',
            'Missing key releases use endTime=0; ' + orphan + ' unpaired releases omitted.'];
        if (!extensions) warnings.push('Extensions disabled: nanosecond precision, metadata, selection direction and viewport may be lost.');
        const clock = t => 1n + t / C.nsPerMs;
        const fieldXML = (name, value) => '<' + name + '>' + xmlEscape(value) + '</' + name + '>';
        const partXML = (type, body) => '<part type="' + type + '">' + body + '</part>';
        let id = 0, text = '', dot = 0, mark = 0;
        const output = ['<?xml version="1.0" encoding="utf-8"?>\n<log>'];
        function section(name, map) {
            output.push('  <' + name + '>');
            for (const [key, val] of Object.entries(map)) output.push('    <entry>\n      ' + fieldXML('key', key) + '\n      ' + fieldXML('value', val) + '\n    </entry>');
            output.push('  </' + name + '>');
        }
        section('meta', { __LogProgramVersion: '9.7.0.1', __MainDocument: 'ScriptLogLite-export.docx',
            __LogCreationDate: new Date(Number(log.epochNs / C.nsPerMs)).toISOString(), __LogCreationTimeStamp: log.epochNs / C.nsPerMs,
            __LogRelativeCreationDate: 1, __GUID: globalThis.crypto?.randomUUID?.() || 'webscriptlog-' + Date.now(),
            ...(extensions ? { __ScriptLogLiteExporter: 'WebScriptLog JavaScript conversion (ScriptLogLite-compatible; not a Word recording)',
                __ScriptLogLiteHeader: C.stringify(h, 0), __ScriptLogLiteExportReport: C.stringify(warnings, 0) } : {}) });
        section('session', { Participant: h.id_code, 'Text Language': h.textLanguage, Age: h.id_age, Gender: h.id_gender,
            Session: h.id_task, Group: h.id_condition, Experience: '', 'Restricted Logging': '' });
        function event(type, time, body, labels = {}) {
            const all = { 'ScriptLogLite.elapsedNanos': time.toString(), ...labels };
            output.push('  <event type="' + type + '" id="' + id++ + '">' +
                (extensions ? '<label key="ScriptLogLite">' + xmlEscape(C.stringify(all, 0)) + '</label>' : '') + body + '</event>');
        }
        function focus(time) { event('focus', time, partXML('winlog', fieldXML('title', 'WordLog MainDoc') + fieldXML('startTime', clock(time)) + fieldXML('endTime', clock(time)))); }
        function replacement(time, offset, removed, inserted, type, nullInserted = false) {
            event('replacement', time, partXML('wordlog', fieldXML('start', offset) + fieldXML('end', offset + removed.length) + fieldXML('newtext', wordEscape(inserted || ''))),
                { ...(type ? { 'ScriptLogLite.editType': type } : {}), ...(nullInserted ? { 'WebScriptLog.nullInserted': 'true' } : {}) });
        }
        focus(0n);
        if (log.initialText) { replacement(0n, 0, '', log.initialText); text = log.initialText; }
        const consumed = new Set(), held = new Set();
        log.events.forEach(function (e, i) {
            if (e.type === 'keyReleased') { held.delete(e.keyCode); return; }
            if (e.type === 'keyPressed') {
                held.add(e.keyCode);
                const modifiers = e.modifiers ?? ((held.has(16) ? 64 : 0) | (held.has(17) ? 128 : 0) | (held.has(18) || held.has(65406) ? 512 : 0) | (held.has(157) || held.has(524) ? 256 : 0));
                const next = log.events[i + 1], inserted = next?.inserted || '';
                const printable = [10, 9, 32, 222, 192, 91, 93, 59, 44, 46, 47, 92, 61, 45].includes(e.keyCode) || e.keyCode >= 48 && e.keyCode <= 57 || e.keyCode >= 65 && e.keyCode <= 90;
                const typing = next && C.edits.has(next.type) && dot === mark && next.offset === dot && next.removed === '' && inserted.length === 1 && printable &&
                    !(e.keyCode === 10 && (modifiers & 64)) && !(modifiers & (128 | 512 | 256)) && (e.keyChar == null || e.keyChar === 'undefined' || e.keyChar === inserted);
                const backspace = next && C.edits.has(next.type) && dot === mark && e.keyCode === 8 && next.offset === dot - 1 && next.removed.length === 1 && !inserted && !(modifiers & 128);
                const replay = typing || backspace, release = pairs.has(i) ? log.events[pairs.get(i)] : null;
                const val = typing ? inserted : backspace ? '\b' : e.keyChar === 'undefined' ? '' : e.keyChar || '';
                const state = [[64, 'VK_LSHIFT'], [128, 'VK_LCONTROL'], [512, 'VK_LMENU'], [256, 'VK_LWIN']].filter(([mask]) => modifiers & mask).map(([, k]) => fieldXML('key', k)).join('');
                const labels = { 'WebScriptLog.keyDetails': C.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['time', 'type'].includes(k))), 0) };
                if (e.repeat) labels['ScriptLogLite.repeat'] = 'true';
                if (e.keyCode === 65406) labels['ScriptLogLite.keyCode'] = '65406';
                if (replay) labels['ScriptLogLite.editElapsedNanos'] = next.time.toString();
                if (release) { labels['ScriptLogLite.releaseElapsedNanos'] = release.time.toString(); labels['WebScriptLog.releaseDetails'] = C.stringify(Object.fromEntries(Object.entries(release).filter(([k]) => !['time', 'type'].includes(k))), 0); }
                event('keyboard', e.time, partXML('wordlog', fieldXML('position', dot) + fieldXML('documentLength', text.length + 1) + fieldXML('replay', replay ? 'True' : 'False')) +
                    partXML('winlog', fieldXML('startTime', clock(e.time)) + fieldXML('endTime', release ? clock(release.time) : 0) + fieldXML('key', windowsKey(e)) + fieldXML('value', wordEscape(val)) + '<keyboardstate>' + state + '</keyboardstate>'), labels);
                if (replay) { text = C.apply(text, next); consumed.add(i + 1); dot = next.offset + inserted.length; mark = dot; }
            } else if (C.edits.has(e.type)) {
                if (!consumed.has(i)) {
                    replacement(e.time, e.offset, e.removed, e.inserted, e.type, e.inserted === null);
                    text = C.apply(text, e); dot = Math.min(dot, text.length); mark = Math.min(mark, text.length);
                }
            } else if (e.type === 'caretUpdate') {
                dot = e.dot; mark = e.mark;
                event('selection', e.time, partXML('wordlog', fieldXML('start', Math.min(dot, mark)) + fieldXML('end', Math.max(dot, mark))),
                    { 'ScriptLogLite.dot': String(dot), 'ScriptLogLite.mark': String(mark), ...(e.generated ? { 'ScriptLogLite.generatedCaret': 'true' } : {}) });
            } else if (e.type === 'scrollChange' && extensions) {
                event('selection', e.time, partXML('wordlog', fieldXML('start', Math.min(dot, mark)) + fieldXML('end', Math.max(dot, mark))),
                    { 'ScriptLogLite.viewX': String(e.viewX), 'ScriptLogLite.viewY': String(e.viewY) });
            }
        });
        focus(log.durationNs);
        output.push('</log>');
        return { text: output.join('\n'), warnings };
    }

    function read(source) {
        if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('IDFX DTD/entity declarations not supported');
        // Inputlog sometimes encodes backspace as XML-1.0-illegal references.
        source = source.replace(/^\uFEFF/, '').replace(/&#(x[\da-f]+|\d+);/gi, (match, digits) => {
            const n = parseInt(digits.replace(/^x/i, ''), /^x/i.test(digits) ? 16 : 10);
            return n < 32 && ![9, 10, 13].includes(n) ? '\\u' + n.toString(16).padStart(4, '0') : match;
        }).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
        const errors = [];
        const doc = new DOMParser({ onError: (_, msg) => errors.push(msg) }).parseFromString(source, 'application/xml');
        if (errors.length || doc.getElementsByTagName('parsererror').length || doc.documentElement?.nodeName !== 'log') throw new Error('Invalid IDFX XML: ' + (errors[0] || 'expected log root'));
        const root = doc.documentElement, meta = entries(child(root, 'meta')), session = entries(child(root, 'session'));
        const extended = !!meta.__ScriptLogLiteExporter && !!meta.__ScriptLogLiteHeader;
        const webDialect = /^webscriptlog/i.test(meta.__LogProgramVersion || '');
        if (!extended && (!Object.hasOwn(meta, '__LogCreationTimeStamp') || !Object.hasOwn(meta, '__LogRelativeCreationDate'))) throw new Error('Missing IDFX creation timestamp or relative clock');
        const header = extended ? C.parseJSON(meta.__ScriptLogLiteHeader) : {};
        const epochNs = header.recordingStartTime ? C.epochFromISO(header.recordingStartTime) : BigInt(meta.__LogCreationTimeStamp || 0) * C.nsPerMs;
        const clock = BigInt(meta.__LogRelativeCreationDate || 0);
        const sources = children(root, 'event'), events = [], warnings = [], inferred = [], ancillary = [];
        let text = '', dot = 0, mark = 0, causal = 0n, lastClock = clock, lastKey = '', lastControl = false, missing = 0;
        const initialText = extended ? header.initialText || '' : '';
        const rawSource = e => ({ id: e.getAttribute('id'), type: e.getAttribute('type'), xml: e.outerHTML || String(e) });
        const time = stamp => {
            if (stamp < clock) throw new Error('Event precedes log creation'); return (stamp - clock) * C.nsPerMs;
        };
        const coordinate = value => { const n = C.index(Number(value)); if (n > text.length + 1) throw new Error('Word position outside document'); return Math.min(n, text.length); };
        function caret(d, m, generated = extended) { dot = d; mark = m; events.push({ type: 'caretUpdate', time: causal, dot, mark, ...(generated ? { generated: true } : {}) }); }
        function edit(a, b, inserted, type, nullInserted = false) {
            if (a < 0 || b < a || b > text.length) throw new Error('Edit range outside document');
            const removed = text.slice(a, b);
            const event = { type: type || (!removed ? 'insertString' : !inserted ? 'remove' : 'replace'), time: causal, offset: a, removed,
                inserted: type === 'remove' || nullInserted || (!inserted && !type) ? null : inserted };
            text = C.apply(text, event); events.push(event);
        }
        function nextWordLength(index, candidate) {
            for (let i = index + 1; i < sources.length; i++) {
                const e = sources[i], type = e.getAttribute('type'), word = part(e, 'wordlog');
                if (type === 'keyboard' && word) return Number(field(word, 'documentLength')) - 1;
                if (type === 'insert') break;
                if (type === 'replacement') {
                    if (candidate === undefined) break;
                    const a = Number(field(word, 'start')), b = Math.min(Number(field(word, 'end')), candidate.length);
                    let value = decode(field(word, 'newtext'));
                    if (Number(field(word, 'end')) === candidate.length + 1 && value.endsWith('\n')) value = value.slice(0, -1);
                    if (a < 0 || a > b || candidate.slice(a, b) !== value) break;
                }
            }
            return -1;
        }
        function pendingDeletes(index, position, missingLength) {
            let removed = 0;
            for (const e of sources.slice(index + 1)) {
                const type = e.getAttribute('type'), word = part(e, 'wordlog');
                if (type === 'keyboard' && (!word || field(part(e, 'winlog'), 'key') !== 'VK_DELETE' || Number(field(word, 'position')) !== position)) return false;
                if (type === 'insert') return false;
                if (type === 'replacement') {
                    if (Number(field(word, 'start')) !== position || decode(field(word, 'newtext'))) return false;
                    removed += Number(field(word, 'end')) - position; if (removed >= missingLength) return true;
                }
            }
            return false;
        }
        function webLength(index, key, win, word) {
            let candidate = text;
            if (field(word, 'replay').toLowerCase() === 'true') {
                const p = Number(field(word, 'position'));
                let value = decode(field(win, 'value'));
                if (key === 'VK_RETURN' || value === 'NEWLINE') value = '\n';
                if (value === '\\w') value = ' ';
                candidate = key === 'VK_BACK' ? candidate.slice(0, p - 1) + candidate.slice(p) : key === 'VK_DELETE' ? candidate.slice(0, p) + candidate.slice(p + 1) : candidate.slice(0, p) + value + candidate.slice(p);
            }
            for (const next of sources.slice(index + 1)) {
                const type = next.getAttribute('type');
                if (type === 'keyboard') break;
                if (type === 'replacement') {
                    const p = part(next, 'wordlog'), a = Number(field(p, 'start')), b = Number(field(p, 'end'));
                    if (a < 0 || b < a || b > candidate.length) return -1;
                    candidate = candidate.slice(0, a) + decode(field(p, 'newtext')) + candidate.slice(b);
                } else if (type === 'insert') return -1;
            }
            return candidate.length;
        }
        sources.forEach(function (e, i) {
            const type = e.getAttribute('type'), win = part(e, 'winlog'), word = part(e, 'wordlog');
            const start = BigInt(field(win, 'startTime', '0')), end = BigInt(field(win, 'endTime', '0'));
            if (start > lastClock) lastClock = start; if (end > lastClock) lastClock = end;
            if (start > 0n && time(start) > causal) causal = time(start);
            const precise = extended ? label(e, 'ScriptLogLite.elapsedNanos') : null;
            if (precise !== null) causal = BigInt(precise);
            try {
                if (type === 'keyboard') {
                    if (!word) {
                        let title = null, latest = -1n;
                        for (const focus of sources.filter(n => n.getAttribute('type') === 'focus')) {
                            const p = part(focus, 'winlog'), stamp = BigInt(field(p, 'startTime', '0'));
                            if (stamp > 0n && stamp <= start && stamp >= latest) { latest = stamp; title = field(p, 'title', '').toLowerCase(); }
                        }
                        if (title && title !== (meta.__MainDocument || '').toLowerCase() && !/wordlog|maindoc/.test(title)) { ancillary.push(rawSource(e)); lastKey = ''; return; }
                        throw new Error('Keyboard lacks Word coordinates without confirmed external focus');
                    }
                    const key = field(win, 'key'), position = Number(field(word, 'position')), length = Number(field(word, 'documentLength'));
                    const delayed = length < text.length + 1 && lastKey === 'VK_DELETE' && key === 'VK_DELETE' && field(word, 'replay').toLowerCase() === 'false' && pendingDeletes(i, position, text.length + 1 - length);
                    const validLength = webDialect ? length === (key === 'VK_BACK' ? text.length : webLength(i, key, win, word)) : length === text.length + 1 || delayed;
                    if (!validLength) throw new Error('documentLength ' + length + ' disagrees with reconstructed ' + (webDialect ? 'WebScriptLog edit' : 'Word length ' + (text.length + 1)));
                    if (delayed) inferred.push('Delayed explicit Delete replacement at event ' + e.getAttribute('id'));
                    const p = coordinate(position);
                    if (start <= 0n) throw new Error('Missing key press time');
                    let value = decode(field(win, 'value'));
                    if (value === '\\w') value = ' ';
                    if (key === 'VK_RETURN' || value === 'NEWLINE') value = '\n';
                    if (key === 'VK_BACK' || value === 'BACKSPACE') value = '\b';
                    let modifiers = 0;
                    for (const n of children(child(win, 'keyboardstate'), 'key')) {
                        if (n.textContent.includes('SHIFT')) modifiers |= 64;
                        if (n.textContent.includes('CONTROL')) modifiers |= 128;
                        if (n.textContent.includes('MENU')) modifiers |= 512;
                        if (/^VK_[LR]WIN$/.test(n.textContent)) modifiers |= 256;
                    }
                    const keyDetails = extended ? label(e, 'WebScriptLog.keyDetails') : null;
                    const press = { type: 'keyPressed', time: extended ? causal : time(start), keyCode: Number(label(e, 'ScriptLogLite.keyCode') || code(key)),
                        keyText: key, keyChar: value, modifiers, keyLocation: /^VK_L(?:SHIFT|CONTROL|MENU)$/.test(key) ? 2 : /^VK_R(?:SHIFT|CONTROL|MENU)$/.test(key) ? 3 : 1,
                        strokeId: 'idfx:' + e.getAttribute('id'), repeat: label(e, 'ScriptLogLite.repeat') === 'true' };
                    if (keyDetails) {
                        const details = C.parseJSON(keyDetails);
                        for (const k of ['keyCode', 'keyText', 'keyChar', 'modifiers', 'modifiersText', 'keyLocation', 'strokeId', 'repeat']) delete press[k];
                        Object.assign(press, details);
                    }
                    events.push(press);
                    if (end >= start) {
                        const releaseTime = extended && label(e, 'ScriptLogLite.releaseElapsedNanos') !== null ? BigInt(label(e, 'ScriptLogLite.releaseElapsedNanos')) : time(end);
                        const detail = extended ? label(e, 'WebScriptLog.releaseDetails') : null;
                        events.push(detail ? { ...C.parseJSON(detail), type: 'keyReleased', time: releaseTime } : { ...press, type: 'keyReleased', time: releaseTime });
                    } else missing++;
                    if (dot !== p && mark !== p) caret(p, p);
                    const replay = field(word, 'replay').toLowerCase();
                    if (!['true', 'false'].includes(replay)) throw new Error('Invalid replay flag');
                    if (replay === 'true') {
                        if (extended && label(e, 'ScriptLogLite.editElapsedNanos') !== null) causal = BigInt(label(e, 'ScriptLogLite.editElapsedNanos'));
                        if (key === 'VK_BACK') { if (!p) throw new Error('Backspace at document start'); edit(p - 1, p, ''); caret(p - 1, p - 1); }
                        else if (key === 'VK_DELETE') { edit(p, p + 1, ''); caret(p, p); }
                        else {
                            if (!value || /[\x00-\x08\x0b-\x1f]/.test(value)) throw new Error('Unsupported replay key');
                            edit(p, p, value); caret(p + value.length, p + value.length);
                        }
                    }
                    lastKey = key; lastControl = !!(modifiers & 128);
                } else if (type === 'selection') {
                    if (extended && label(e, 'ScriptLogLite.viewX') !== null) events.push({ type: 'scrollChange', time: causal, viewX: Number(label(e, 'ScriptLogLite.viewX')), viewY: Number(label(e, 'ScriptLogLite.viewY')) });
                    else if (extended && label(e, 'ScriptLogLite.dot') !== null) caret(coordinate(Number(label(e, 'ScriptLogLite.dot'))), coordinate(Number(label(e, 'ScriptLogLite.mark'))), label(e, 'ScriptLogLite.generatedCaret') === 'true');
                    else caret(coordinate(Number(field(word, 'end'))), coordinate(Number(field(word, 'start'))), false);
                } else if (type === 'replacement') {
                    let a = Number(field(word, 'start')), b = Number(field(word, 'end')), value = decode(field(word, 'newtext'));
                    if (b === text.length + 1 && value.endsWith('\n')) value = value.slice(0, -1);
                    const expected = nextWordLength(i);
                    const selected = dot !== mark && a === Math.min(dot, mark) && b === Math.max(dot, mark);
                    if ((lastKey === 'VK_BACK' || lastKey === 'VK_DELETE' || lastControl && lastKey === 'VK_X') && selected && value && text.slice(b).startsWith(value) && nextWordLength(i, text.slice(0, a) + text.slice(b)) === text.length - (b - a)) {
                        inferred.push('Selected-range deletion confirmed by later document length at event ' + e.getAttribute('id')); value = '';
                    } else if (lastControl && lastKey === 'VK_X' && dot !== mark && expected >= 0 && text.length - (b - a) + value.length !== expected && text.length - Math.abs(dot - mark) === expected && a === Math.min(dot, mark)) {
                        b = Math.max(dot, mark); value = ''; inferred.push('Ctrl+X cut confirmed by later document length at event ' + e.getAttribute('id'));
                    }
                    a = coordinate(a); b = coordinate(b);
                    const editType = extended ? label(e, 'ScriptLogLite.editType') : null;
                    const isInitial = extended && !text && !events.length && value === initialText;
                    if (isInitial) text = value;
                    else if (text.slice(a, b) !== value || editType) {
                        edit(a, b, value, editType, label(e, 'WebScriptLog.nullInserted') === 'true');
                        // Foreign Word operations imply a caret. Our labelled
                        // history retains recorded caret observations separately.
                        if (!extended) caret(a + value.length, a + value.length);
                        else { dot = Math.min(dot, text.length); mark = Math.min(mark, text.length); }
                    }
                } else if (type === 'insert') {
                    const position = Number(field(word, 'position')), before = decode(field(word, 'before')), after = decode(field(word, 'after'));
                    const size = Math.max(before.length, after.length), expected = nextWordLength(i);
                    if (expected >= 0 && text.length + size !== expected) throw new Error('Insertion contradicts following documentLength');
                    const useBefore = before.length === size && position - size === dot, useAfter = after.length === size && position === dot;
                    if (useBefore === useAfter) throw new Error('Ambiguous before/after insertion');
                    const offset = coordinate(useBefore ? position - size : position), val = useBefore ? before : after;
                    edit(offset, offset, val); caret(offset + val.length, offset + val.length);
                    inferred.push('Insertion resolved using preceding caret at event ' + e.getAttribute('id'));
                } else if (['mouse', 'focus', 'statistics'].includes(type)) ancillary.push(rawSource(e));
                else throw new Error('Unsupported IDFX event type ' + type);
            } catch (error) { throw new Error('IDFX event ' + e.getAttribute('id') + ' (' + type + '): ' + error.message); }
        });
        events.sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0);
        warnings.push('Word paragraph marks mapped to LF; mandatory final paragraph mark omitted.');
        if (webDialect) warnings.push('Recognized WebScriptLog IDFX dialect: post-edit document lengths (pre-edit for Backspace), without a final Word paragraph mark.');
        if (!extended) warnings.push('Untimed Word operations anchored to the preceding event; selection direction unavailable.');
        if (missing) warnings.push(missing + ' missing key releases; none invented.');
        const metadata = { ...header, sourceFormat: 'Inputlog IDFX', inputlogMeta: meta, inputlogSession: session, inputlogAncillaryEvents: ancillary,
            inputlogImportReport: { warnings, inferredEdits: inferred }, id_code: header.id_code ?? session.Participant ?? '', textLanguage: header.textLanguage ?? session['Text Language'] ?? '' };
        let durationNs = extended ? C.integer(header.endTime) - C.integer(header.startTime) : (lastClock - clock) * C.nsPerMs;
        if (events.at(-1)?.time > durationNs) durationNs = events.at(-1).time;
        return C.validate({ metadata, epochNs, initialText, events, durationNs, warnings: warnings.concat(inferred) });
    }
    return { read, write, pairKeys, wordEscape, code, windowsKey };
}));
