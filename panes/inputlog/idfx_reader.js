(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('../../ext_js/xmldom').DOMParser);
    } else {
        root.InputlogIDFX = factory(root.DOMParser);
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (DOMParser) {
    'use strict';

    function children(node, name) {
        return Array.from(node.childNodes || []).filter(function (child) {
            return child.nodeType === 1 && (!name || child.nodeName === name);
        });
    }

    function value(node, name) {
        const child = children(node, name)[0];
        return child ? child.textContent : '';
    }

    function number(node, name) {
        const raw = value(node, name);
        if (raw === '') return null;
        const result = Number(raw);
        if (!Number.isSafeInteger(result) || (['startTime', 'endTime', 'documentLength'].includes(name) && result < 0)) {
            throw new Error('Invalid IDFX ' + name + ': ' + raw);
        }
        return result;
    }

    function unescape(text) {
        return text.replace(/\\u([0-9a-f]{4})/gi, function (_, hex) {
            return String.fromCharCode(parseInt(hex, 16));
        });
    }

    function readIDFX(xml) {
        if (typeof xml !== 'string') throw new TypeError('Expected IDFX XML text');
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('IDFX DTDs are not supported');
        const errors = [];
        const doc = new DOMParser({
            onError: function (level, message) { errors.push(message); }
        }).parseFromString(xml.replace(/^\uFEFF/, ''), 'application/xml');
        if (errors.length || doc.getElementsByTagName('parsererror').length) {
            throw new Error('Invalid IDFX XML: ' + (errors[0] || 'XML parse error'));
        }
        const log = doc.documentElement;
        if (!log || log.nodeName !== 'log') throw new Error('Expected IDFX <log> root');
        function entries(name) {
            const section = children(log, name)[0];
            return Object.fromEntries(children(section || {}, 'entry').map(function (entry) {
                return [value(entry, 'key'), value(entry, 'value')];
            }));
        }
        const ids = new Set();
        const events = children(log, 'event').map(function (node) {
            const id = node.getAttribute('id');
            if (id === null || id === '' || ids.has(id)) throw new Error('Missing or duplicate event id: ' + id);
            ids.add(id);
            const parts = children(node, 'part').map(function (part) {
                const fields = Object.fromEntries(children(part).map(function (field) {
                    return [field.nodeName, field.textContent];
                }));
                const key = value(part, 'key');
                let text = unescape(value(part, 'value'));
                if (text === '\\w') text = ' ';
                if (text === 'BACKSPACE') text = '\b';
                if (key === 'VK_RETURN' || text === 'NEWLINE') text = '\r\n';
                return {
                    type: part.getAttribute('type'), fields: fields,
                    startTime: number(part, 'startTime'), endTime: number(part, 'endTime'),
                    position: number(part, 'position'), documentLength: number(part, 'documentLength'),
                    start: number(part, 'start'), end: number(part, 'end'),
                    key: key, value: text,
                    keyboardState: children(children(part, 'keyboardstate')[0] || {}, 'key').map(function (n) { return n.textContent; }),
                    before: unescape(value(part, 'before')), after: unescape(value(part, 'after')),
                    newText: unescape(value(part, 'newtext'))
                };
            });
            return { id: id, type: node.getAttribute('type'), parts: parts };
        });
        return { meta: entries('meta'), session: entries('session'), events: events };
    }

    return { readIDFX: readIDFX };
}));
