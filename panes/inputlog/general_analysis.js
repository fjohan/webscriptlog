(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.InputlogGeneralAnalysis = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const supported = new Set(['keyboard', 'focus', 'mouse', 'insert', 'replacement']);
    const revisions = new Set(['VK_BACK', 'VK_DELETE', 'VK_CLEAR', 'VK_ESCAPE']);
    const capitals = new Set(['VK_SHIFT', 'VK_LSHIFT', 'VK_RSHIFT', 'VK_CAPITAL']);
    const combinations = new Set([...capitals, 'VK_CONTROL', 'VK_LCONTROL', 'VK_RCONTROL', 'VK_MENU', 'VK_LMENU', 'VK_RMENU']);
    const columns = ['id', 'type', 'output', 'position', 'docLength', 'startTime', 'endTime',
        'actionTime', 'pauseTime', 'pauseLocation', 'pauseLocationMethod', 'charProduction',
        'fixedNumberInterval', 'fixedSizeInterval', 'x', 'y'];

    function keyName(key) {
        return ({ VK_MENU: 'ALT', VK_LMENU: 'LALT', VK_RMENU: 'RALT', VK_CONTROL: 'CTRL',
            VK_LCONTROL: 'LCTRL', VK_RCONTROL: 'RCTRL', VK_CAPITAL: 'CAPS LOCK' })[key] || key.replace(/^VK_/, '');
    }

    function keyboardOutput(part, controlKeys) {
        const state = part.keyboardState.filter(function (key) { return controlKeys.has(key) && key !== part.key; });
        const prefix = state.filter(function (key) { return !capitals.has(key) || controlKeys.has(part.key); })
            .map(keyName).map(function (name) { return name + ' + '; }).join('');
        const text = part.value;
        let output = keyName(part.key);
        if (text.length === 1) {
            output = ({ '\n': 'ENTER', '\t': 'TAB', ' ': 'SPACE' })[text] ||
                (/\p{Cc}/u.test(text) ? part.key.replace(/^VK_/, '') : text);
        }
        return { output: prefix + output, composite: state.length > 0 };
    }

    // This deliberately small classifier is not the Inputlog FSMRules.txt engine.
    function simplePauseLocations(events) {
        let firstLetter = true;
        let previousValue = '';
        let sentenceBoundary = false;
        let paragraphBoundary = false;
        const labels = events.map(function (event) {
            if (event.type === 'mouse') return 'MOUSE';
            if (event.type !== 'keyboard') return 'CHANGE';
            const part = event.parts.find(function (p) { return p.type === 'winlog'; });
            if (!part) return 'UNDETERMINED';
            if (combinations.has(part.key) || (!part.value && part.keyboardState.some(function (k) { return combinations.has(k); }))) return 'COMBINATION_KEY';
            if (revisions.has(part.key)) return 'REVISION';
            const text = part.value;
            let label = 'UNDETERMINED';
            if (/^[\r\n\f]+$/.test(text)) {
                label = 'BEFORE_PARAGRAPHS'; paragraphBoundary = true;
            } else if (/^[.!?]$/.test(text)) {
                label = 'AFTER_SENTENCES'; sentenceBoundary = true;
            } else if (/^[ \t]$/.test(text)) {
                label = paragraphBoundary ? 'BEFORE_PARAGRAPHS' : sentenceBoundary ? 'BEFORE_SENTENCES' :
                    /^[ \t]$/.test(previousValue) ? 'BEFORE_WORDS' : 'AFTER_WORDS';
            } else if (/^[\p{L}\p{N}'`@_~-]$/u.test(text)) {
                label = paragraphBoundary ? 'AFTER_PARAGRAPHS' : (firstLetter || sentenceBoundary) ? 'BEFORE_SENTENCES' :
                    /^[ \t]$/.test(previousValue) ? 'BEFORE_WORDS' : 'WITHIN_WORDS';
                if (/^[\p{L}\p{N}]$/u.test(text)) firstLetter = false;
                paragraphBoundary = false; sentenceBoundary = false;
            } else if (/^[&|\\"(\u00a7^{}\/> ,;:=+%*]$/.test(text)) label = 'AFTER_WORDS';
            previousValue = text;
            return label;
        });
        return labels;
    }

    function buildGeneralAnalysis(record, options) {
        options = options || {};
        const offset = options.startOffsetMs === undefined ? 0 : options.startOffsetMs;
        const count = options.numberOfIntervals === undefined ? 10 : options.numberOfIntervals;
        const intervalMs = options.intervalSizeMs === undefined ? 60000 : options.intervalSizeMs;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(count) || count < 1 ||
            !Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new Error('Invalid interval or offset options');
        const warnings = [];
        const ignoredEventTypes = {};
        const events = record.events.filter(function (event) {
            if (supported.has(event.type)) return true;
            ignoredEventTypes[event.type] = (ignoredEventTypes[event.type] || 0) + 1;
            return false;
        });
        Object.keys(ignoredEventTypes).filter(function (type) { return type !== 'selection' && type !== 'statistics'; })
            .forEach(function (type) { warnings.push('Unsupported event type: ' + type); });
        const timed = events.map(function (event) { return event.parts.find(function (part) { return part.type === 'winlog' && part.startTime !== null; }); });
        const first = timed.find(Boolean);
        const last = timed.filter(Boolean).at(-1);
        const relative = function (time) { return time >= offset ? time - offset : time; };
        const firstTime = first ? relative(first.startTime) : 0;
        const lastTime = last ? relative(last.endTime || last.startTime) : 0;
        const controlKeys = new Set(options.controlKeys || []);
        const labels = options.simplePauseLocations ? simplePauseLocations(events) : [];
        if (options.simplePauseLocations) warnings.push('Pause locations use a simplified classifier; not equivalent to Inputlog FSM rules.');
        else warnings.push('Linguistic pause locations are undetermined: the Inputlog FSM rule engine is not yet ported.');
        const rows = [];
        let docLength = 0, deleted = 0, replaced = 0;
        let lastCurrent = 0, lastPrevious = 0, previousEvent = null, previousTimed = null;
        let previousComposite = false, pendingChange = null;
        let numberInterval = 1, sizeInterval = 1;
        events.forEach(function (event, index) {
            const time = timed[index];
            const word = event.parts.find(function (part) { return part.type === 'wordlog'; });
            const row = { id: event.id, type: event.type, output: '', position: null, docLength: null,
                startTime: null, endTime: null, actionTime: null, pauseTime: 0,
                pauseLocation: labels[index] || (event.type === 'keyboard' ? 'UNDETERMINED' : event.type === 'mouse' ? 'MOUSE' : 'CHANGE'),
                pauseLocationMethod: options.simplePauseLocations ? 'simplified' : 'partial',
                charProduction: null, fixedNumberInterval: numberInterval, fixedSizeInterval: sizeInterval, x: null, y: null };
            if (time) {
                row.startTime = relative(time.startTime);
                row.endTime = time.endTime ? relative(time.endTime) : row.startTime;
                row.actionTime = Math.max(0, row.endTime - row.startTime);
                if (time.endTime && time.endTime < time.startTime) warnings.push('Event ' + event.id + ': end precedes start; action time clamped to zero.');
                if (time.startTime >= offset) {
                    numberInterval = lastTime > 0 ? Math.min(count, Math.max(1, Math.ceil(row.startTime / (lastTime / count)))) : 1;
                    sizeInterval = Math.max(1, Math.ceil((row.startTime - firstTime) / intervalMs));
                }
                row.fixedNumberInterval = numberInterval; row.fixedSizeInterval = sizeInterval;
            }
            // Inputlog retains timing state across untimed changes, but returns zero
            // immediately when the preceding event is a replacement or insertion.
            if (!time || event.type === 'keyboard' || event.type === 'mouse') {
                if (time && time.startTime > 0) lastCurrent = time.startTime;
                if (!previousEvent) row.pauseTime = relative(lastCurrent);
                else if (previousTimed) {
                    if (previousEvent.type === 'keyboard' || previousEvent.type === 'focus') {
                        if (previousTimed.startTime > 0) lastPrevious = previousTimed.startTime;
                    } else if (previousEvent.type === 'mouse' && previousTimed.endTime > 0) lastPrevious = previousTimed.endTime;
                    row.pauseTime = Math.abs(lastCurrent - lastPrevious);
                } else row.pauseTime = Math.abs(lastCurrent - lastPrevious);
                if (previousEvent && ['replacement', 'insert'].includes(previousEvent.type) && previousTimed) row.pauseTime = 0;
            }
            let composite = false;
            if (event.type === 'keyboard') {
                if (time) {
                    const representation = keyboardOutput(time, controlKeys);
                    row.output = representation.output; composite = representation.composite;
                }
                if (word && word.documentLength !== null) {
                    row.position = word.position; row.docLength = word.documentLength;
                    deleted += Math.max(0, docLength - row.docLength);
                    docLength = row.docLength;
                }
            } else if (event.type === 'focus') row.output = time ? time.fields.title || '' : '';
            else if (event.type === 'mouse' && time) {
                row.output = time.fields.type === 'movement' ? 'Movement' : time.fields.type === 'scroll' ? 'Scroll' : (time.fields.button || '') + ' Click';
                row.x = time.fields.x === undefined ? null : Number(time.fields.x);
                row.y = time.fields.y === undefined ? null : Number(time.fields.y);
            } else if (event.type === 'replacement' && word) {
                row.output = '[' + word.start + ':' + word.end + '] ' + word.newText;
                row.actionTime = 0;
                pendingChange = { row: row, index: rows.length, word: word, oldLength: docLength };
            } else if (event.type === 'insert' && word) {
                row.output = '[' + word.before + ']'; row.actionTime = 0;
                const previous = rows.at(-1);
                if (previous && previous.docLength === docLength && word.before.length > 0) {
                    docLength += word.before.length; row.docLength = docLength;
                }
                row.position = previous && previous.docLength !== null ? previous.docLength + 1 : null;
                pendingChange = { row: row, index: rows.length, word: word, oldLength: docLength };
            }
            row.charProduction = docLength + deleted + replaced;
            if (pendingChange && pendingChange.row !== row && row.position !== null && row.docLength !== null) {
                const pending = pendingChange;
                pending.row.position = row.position; pending.row.docLength = row.docLength;
                if (pending.row.type === 'replacement' && pending.oldLength !== row.docLength) {
                    const length = pending.word.end - pending.word.start;
                    const extra = pending.word.newText.length;
                    if (length > 0 && extra > 0 && length - extra === Math.abs(pending.oldLength - row.docLength)) {
                        replaced += extra;
                        for (let i = pending.index; i < rows.length; i++) rows[i].charProduction += extra;
                        row.charProduction += extra;
                    }
                }
                pendingChange = null;
            }
            if (composite && !previousComposite && rows.length) {
                const previous = rows.pop();
                if (previous.startTime !== null && row.endTime !== null) row.actionTime = Math.max(0, row.endTime - previous.startTime);
                row.pauseTime = previous.pauseTime;
            }
            previousComposite = composite;
            rows.push(row); previousEvent = event; previousTimed = time;
        });
        return { meta: record.meta, session: record.session, rows: rows, warnings: warnings,
            ignoredEventTypes: ignoredEventTypes, options: { startOffsetMs: offset, numberOfIntervals: count, intervalSizeMs: intervalMs },
            summary: { inputEventCount: record.events.length, analyzedEventCount: rows.length,
                finalDocumentLength: docLength, deletedCharacters: deleted, replacedCharacters: replaced,
                characterProduction: docLength + deleted + replaced, durationMs: lastTime - firstTime } };
    }

    function toTSV(result) {
        function cell(value) {
            return value === null || value === undefined ? '' : String(value).replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        }
        return [columns.join('\t'), ...result.rows.map(function (row) { return columns.map(function (name) { return cell(row[name]); }).join('\t'); })].join('\n') + '\n';
    }
    return { buildGeneralAnalysis: buildGeneralAnalysis, toTSV: toTSV, columns: columns };
}));
