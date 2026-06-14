/*
 * Converters from WebScriptLog's record maps to FlexKeyLogger-like CSV and IDFX.
 *
 * FlexKeyLogger exports a normalized keylog with these CSV columns:
 * EventID, EventTime, Output, CursorPosition, TextChange, Activity
 *
 * WebScriptLog records key, cursor, scroll, and text snapshots separately. The
 * conversion below joins key/mouse events with the closest following text
 * snapshot before the next key/mouse event, then classifies the text delta.
 */
(function () {
  function sortedEntries(recordObject) {
    return Object.keys(recordObject || {})
      .map((key) => ({ ts: Number(key), value: recordObject[key] }))
      .filter((entry) => Number.isFinite(entry.ts))
      .sort((a, b) => a.ts - b.ts);
  }

  function textAtOrBefore(textEntries, ts) {
    let value = "";
    for (let i = 0; i < textEntries.length; i++) {
      if (textEntries[i].ts > ts) break;
      value = String(textEntries[i].value ?? "");
    }
    return value;
  }

  function textBefore(textEntries, ts) {
    let value = "";
    for (let i = 0; i < textEntries.length; i++) {
      if (textEntries[i].ts >= ts) break;
      value = String(textEntries[i].value ?? "");
    }
    return value;
  }

  function cursorAtOrBefore(cursorEntries, ts, fallback) {
    let value = null;
    for (let i = 0; i < cursorEntries.length; i++) {
      if (cursorEntries[i].ts > ts) break;
      value = cursorEntries[i].value;
    }
    if (value == null) return fallback;
    const parts = String(value).split(":").map(Number);
    return Number.isFinite(parts[1]) ? parts[1] : (Number.isFinite(parts[0]) ? parts[0] : fallback);
  }

  function parseOutput(rawValue) {
    const raw = String(rawValue || "");
    if (raw.startsWith("keydown: ")) {
      const key = raw.slice("keydown: ".length);
      return key === " " ? "Space" : key;
    }
    if (raw.startsWith("mousedown")) return "Leftclick";
    if (raw.startsWith("mouseup")) return "Leftclick";
    return "";
  }

  function isCarrierEvent(rawValue) {
    const raw = String(rawValue || "");
    return raw.startsWith("keydown: ") || raw.startsWith("mousedown");
  }

  function classifyTextChange(previousText, currentText) {
    const prev = String(previousText || "");
    const curr = String(currentText || "");
    if (prev === curr) {
      return {
        activity: "Nonproduction",
        textChange: "NoChange",
        start: Math.min(curr.length, prev.length),
        oldText: "",
        newText: ""
      };
    }

    let prefix = 0;
    const maxPrefix = Math.min(prev.length, curr.length);
    while (prefix < maxPrefix && prev[prefix] === curr[prefix]) prefix++;

    let suffix = 0;
    while (
      suffix < prev.length - prefix &&
      suffix < curr.length - prefix &&
      prev[prev.length - 1 - suffix] === curr[curr.length - 1 - suffix]
    ) {
      suffix++;
    }

    const oldText = prev.slice(prefix, prev.length - suffix);
    const newText = curr.slice(prefix, curr.length - suffix);

    if (!oldText && newText.length === 1) {
      return { activity: "Input", textChange: newText, start: prefix, oldText, newText };
    }
    if (!oldText && newText.length > 1) {
      return { activity: "Paste", textChange: newText, start: prefix, oldText, newText };
    }
    if (oldText && !newText) {
      return { activity: "Remove/Cut", textChange: oldText, start: prefix, oldText, newText };
    }
    return {
      activity: "Replace",
      textChange: `${oldText} => ${newText}`,
      start: prefix,
      oldText,
      newText
    };
  }

  function normalizeRecords(records) {
    return {
      header_records: records?.header_records || {},
      key_records: records?.key_records || {},
      text_records: records?.text_records || {},
      cursor_records: records?.cursor_records || {}
    };
  }

  function webScriptLogRecordsToFlexKeylog(records) {
    const normalized = normalizeRecords(records);
    const startTime = Number(normalized.header_records.starttime) || 0;
    const endTime = Number(normalized.header_records.endtime) || startTime;
    const keyEntries = sortedEntries(normalized.key_records).filter((entry) => isCarrierEvent(entry.value));
    const textEntries = sortedEntries(normalized.text_records);
    const cursorEntries = sortedEntries(normalized.cursor_records);
    const keylog = {
      TaskOnSet: startTime ? [startTime] : [],
      TaskEnd: endTime ? [endTime] : [],
      EventID: [],
      EventTime: [],
      Output: [],
      CursorPosition: [],
      TextChange: [],
      Activity: [],
      FinalProduct: [textEntries.length ? String(textEntries[textEntries.length - 1].value ?? "") : ""],
      _ChangeStart: [],
      _OldText: [],
      _NewText: [],
      _AbsoluteTime: []
    };

    let previousText = "";
    let eventId = 0;
    let textIndex = 0;

    function pushEvent(ts, output, currentText) {
      const change = classifyTextChange(previousText, currentText);
      const cursorFallback = change.start + change.newText.length;
      const cursorPosition = cursorAtOrBefore(cursorEntries, ts, cursorFallback);
      eventId += 1;
      keylog.EventID.push(eventId);
      keylog.EventTime.push(Math.max(0, Math.round(ts - startTime)));
      keylog.Output.push(output || "NA");
      keylog.CursorPosition.push(cursorPosition);
      keylog.TextChange.push(change.textChange);
      keylog.Activity.push(change.activity);
      keylog._ChangeStart.push(change.start);
      keylog._OldText.push(change.oldText);
      keylog._NewText.push(change.newText);
      keylog._AbsoluteTime.push(ts);
      previousText = currentText;
    }

    if (keyEntries.length === 0) {
      for (let i = 0; i < textEntries.length; i++) {
        pushEvent(textEntries[i].ts, "NA", String(textEntries[i].value ?? ""));
      }
      return keylog;
    }

    for (let i = 0; i < keyEntries.length; i++) {
      const event = keyEntries[i];
      const nextTs = i + 1 < keyEntries.length ? keyEntries[i + 1].ts : Infinity;
      let currentText = textAtOrBefore(textEntries, event.ts);

      while (textIndex < textEntries.length && textEntries[textIndex].ts < event.ts) textIndex++;
      while (textIndex < textEntries.length && textEntries[textIndex].ts >= event.ts && textEntries[textIndex].ts < nextTs) {
        currentText = String(textEntries[textIndex].value ?? "");
        textIndex++;
      }

      pushEvent(event.ts, parseOutput(event.value), currentText);
    }

    while (textIndex < textEntries.length) {
      const textEntry = textEntries[textIndex];
      pushEvent(textEntry.ts, "NA", String(textEntry.value ?? ""));
      textIndex++;
    }

    return keylog;
  }

  function csvEscape(value) {
    if (value == null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function flexKeylogToCSV(keylog) {
    const columns = ["EventID", "EventTime", "Output", "CursorPosition", "TextChange", "Activity"];
    const length = Math.max(...columns.map((column) => (keylog[column] || []).length));
    const rows = [columns.join(",")];
    for (let i = 0; i < length; i++) {
      rows.push(columns.map((column) => csvEscape((keylog[column] || [])[i])).join(","));
    }
    return rows.join("\n");
  }

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function xmlEntry(key, value) {
    return `  <entry>\n    <key>${xmlEscape(key)}</key>\n    <value>${xmlEscape(value)}</value>\n  </entry>\n`;
  }

  function xmlEvent(type, id, parts) {
    let out = `  <event type="${xmlEscape(type)}" id="${xmlEscape(id)}">\n`;
    parts.forEach((part) => {
      out += `    <part type="${xmlEscape(part.type)}">\n`;
      Object.keys(part.values).forEach((key) => {
        const value = part.values[key];
        if (value === "NoValue") out += `      <${xmlEscape(key)} />\n`;
        else if (key === "keyboardstate" && /^<key>[\s\S]*<\/key>$/.test(String(value))) {
          out += `      <keyboardstate>\n        ${String(value)}\n      </keyboardstate>\n`;
        }
        else out += `      <${xmlEscape(key)}>${xmlEscape(value)}</${xmlEscape(key)}>\n`;
      });
      out += "    </part>\n";
    });
    out += "  </event>\n";
    return out;
  }

  function outputToVirtualKey(output) {
    const key = String(output || "");
    const named = {
      Leftclick: "VK_LBUTTON",
      Rightclick: "VK_RBUTTON",
      Middleclick: "VK_MBUTTON",
      Backspace: "VK_BACK",
      Delete: "VK_DELETE",
      Enter: "VK_RETURN",
      Space: "VK_SPACE",
      Tab: "VK_TAB",
      Shift: "VK_SHIFT",
      Control: "VK_CONTROL",
      Alt: "VK_MENU",
      CapsLock: "VK_CAPITAL",
      PageUp: "VK_PRIOR",
      PageDown: "VK_NEXT",
      ArrowLeft: "VK_LEFT",
      ArrowRight: "VK_RIGHT",
      ArrowUp: "VK_UP",
      ArrowDown: "VK_DOWN",
      å: "VK_OEM_6",
      Å: "VK_OEM_6",
      ä: "VK_OEM_7",
      Ä: "VK_OEM_7",
      ö: "VK_OEM_3",
      Ö: "VK_OEM_3"
    };
    if (named[key]) return named[key];
    if (key.length === 1 && /[a-z0-9]/i.test(key)) return `VK_${key.toUpperCase()}`;
    return `VK_${key.toUpperCase().replace(/\W+/g, "_") || "UNKNOWN"}`;
  }

  function flexKeylogToIDFX(keylog) {
    const created = Date.now();
    const date = new Date();
    const filename = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    let xml = '<?xml version="1.0" encoding="utf-8"?>\n<log>\n';
    xml += "<meta>\n";
    xml += xmlEntry("__LogProgramVersion", "7.0.0.2");
    xml += xmlEntry("__LogCreationDate", created);
    xml += xmlEntry("__GUID", "0");
    xml += xmlEntry("__LogRelativeCreationDate", created);
    xml += xmlEntry("__LogFileName", filename);
    xml += "</meta>\n";
    xml += "<session>\n";
    xml += xmlEntry("Participant", filename);
    xml += xmlEntry("Text Language", "Unknown");
    xml += xmlEntry("Age", "Unknown");
    xml += xmlEntry("Gender", "Unknown");
    xml += xmlEntry("Session", "1");
    xml += xmlEntry("Keyboard", "Unknown");
    xml += xmlEntry("Group", "1");
    xml += xmlEntry("Experience", "0");
    xml += xmlEntry("Restricted Logging", "0");
    xml += "</session>\n";

    for (let i = 0; i < keylog.EventID.length; i++) {
      const id = keylog.EventID[i];
      const output = String(keylog.Output[i] ?? "NA");
      const activity = String(keylog.Activity[i] ?? "");
      const time = Number(keylog.EventTime[i]) || 0;
      const position = Number(keylog.CursorPosition[i]) || 0;
      const changeStart = Number(keylog._ChangeStart?.[i]) || position;
      const oldText = String(keylog._OldText?.[i] ?? "");
      const newText = String(keylog._NewText?.[i] ?? "");
      const documentLength = Math.max(0, position);
      const isMouse = output.toLowerCase().includes("click");

      xml += xmlEvent(isMouse ? "mouse" : "keyboard", id, [
        {
          type: "wordlog",
          values: {
            position,
            documentLength,
            replay: activity === "Nonproduction" ? "False" : "True"
          }
        },
        {
          type: "winlog",
          values: isMouse
            ? { startTime: time, endTime: time, x: "0", y: "0", type: "click", button: output.replace("click", "").toUpperCase() || "LEFT" }
            : { startTime: time, endTime: time, key: outputToVirtualKey(output), value: output.length === 1 ? output : "NoValue", keyboardstate: "NoValue" }
        }
      ]);

      if (activity === "Input" || activity === "Paste") {
        xml += xmlEvent("insert", `${id}.1`, [
          { type: "wordlog", values: { position: changeStart + newText.length, before: newText, after: "NoValue" } }
        ]);
        xml += xmlEvent("selection", `${id}.2`, [
          { type: "wordlog", values: { start: changeStart + newText.length, end: changeStart + newText.length } }
        ]);
      } else if (activity.includes("Remove/Cut")) {
        xml += xmlEvent("replacement", `${id}.1`, [
          { type: "wordlog", values: { start: changeStart, end: changeStart + oldText.length, newtext: "NoValue" } }
        ]);
        xml += xmlEvent("selection", `${id}.2`, [
          { type: "wordlog", values: { start: changeStart, end: changeStart } }
        ]);
      } else if (activity === "Replace") {
        xml += xmlEvent("replacement", `${id}.1`, [
          { type: "wordlog", values: { start: changeStart, end: changeStart + oldText.length, newtext: newText || "NoValue" } }
        ]);
        xml += xmlEvent("selection", `${id}.2`, [
          { type: "wordlog", values: { start: changeStart + newText.length, end: changeStart + newText.length } }
        ]);
      }
    }

    xml += "</log>";
    return xml;
  }

  function webScriptLogRecordsToCSV(records) {
    return flexKeylogToCSV(webScriptLogRecordsToFlexKeylog(records));
  }

  function webScriptLogRecordsToIDFX(records) {
    return flexKeylogToIDFX(webScriptLogRecordsToFlexKeylog(records));
  }

  function parseCursorValue(value, fallback = { start: 0, end: 0 }) {
    const parts = String(value ?? "").split(":").map(Number);
    const start = Number.isFinite(parts[0]) ? parts[0] : fallback.start;
    const end = Number.isFinite(parts[1]) ? parts[1] : start;
    return { start, end };
  }

  function cursorAtOrBeforeRange(cursorEntries, ts, fallback = { start: 0, end: 0 }) {
    let result = fallback;
    for (let i = 0; i < cursorEntries.length; i++) {
      if (cursorEntries[i].ts > ts) break;
      result = parseCursorValue(cursorEntries[i].value, result);
    }
    return result;
  }

  function cursorBeforeRange(cursorEntries, ts, fallback = { start: 0, end: 0 }) {
    let result = fallback;
    for (let i = 0; i < cursorEntries.length; i++) {
      if (cursorEntries[i].ts >= ts) break;
      result = parseCursorValue(cursorEntries[i].value, result);
    }
    return result;
  }

  function textDiff(previousText, currentText) {
    const prev = String(previousText || "");
    const curr = String(currentText || "");
    if (prev === curr) return { start: curr.length, end: curr.length, oldText: "", newText: "" };

    let prefix = 0;
    const maxPrefix = Math.min(prev.length, curr.length);
    while (prefix < maxPrefix && prev[prefix] === curr[prefix]) prefix++;

    let suffix = 0;
    while (
      suffix < prev.length - prefix &&
      suffix < curr.length - prefix &&
      prev[prev.length - 1 - suffix] === curr[curr.length - 1 - suffix]
    ) {
      suffix++;
    }

    return {
      start: prefix,
      end: prev.length - suffix,
      oldText: prev.slice(prefix, prev.length - suffix),
      newText: curr.slice(prefix, curr.length - suffix)
    };
  }

  function eventStartRelative(event, startTime) {
    return Math.max(0, Math.round(Number(event.ts || 0) - startTime));
  }

  function inputlogKeyNameFromWebKey(keyName) {
    const key = String(keyName || "");
    const named = {
      " ": "VK_SPACE",
      Space: "VK_SPACE",
      Backspace: "VK_BACK",
      Delete: "VK_DELETE",
      Enter: "VK_RETURN",
      Tab: "VK_TAB",
      Escape: "VK_ESCAPE",
      Shift: "VK_LSHIFT",
      Control: "VK_LCONTROL",
      Alt: "VK_LMENU",
      Meta: "VK_LWIN",
      CapsLock: "VK_CAPITAL",
      PageUp: "VK_PRIOR",
      PageDown: "VK_NEXT",
      Home: "VK_HOME",
      End: "VK_END",
      Insert: "VK_INSERT",
      ArrowLeft: "VK_LEFT",
      ArrowRight: "VK_RIGHT",
      ArrowUp: "VK_UP",
      ArrowDown: "VK_DOWN",
      Dead: "VK_OEM_4",
      å: "VK_OEM_6",
      Å: "VK_OEM_6",
      ä: "VK_OEM_7",
      Ä: "VK_OEM_7",
      ö: "VK_OEM_3",
      Ö: "VK_OEM_3"
    };
    if (named[key]) return named[key];
    if (/^F\d{1,2}$/.test(key)) return `VK_${key}`;
    if (/^[a-z0-9]$/i.test(key)) return `VK_${key.toUpperCase()}`;
    const oem = {
      ";": "VK_OEM_1",
      ":": "VK_OEM_1",
      "=": "VK_OEM_PLUS",
      "+": "VK_OEM_PLUS",
      ",": "VK_OEM_COMMA",
      "<": "VK_OEM_COMMA",
      "-": "VK_OEM_MINUS",
      "_": "VK_OEM_MINUS",
      ".": "VK_OEM_PERIOD",
      ">": "VK_OEM_PERIOD",
      "/": "VK_OEM_2",
      "?": "VK_OEM_2",
      "`": "VK_OEM_3",
      "~": "VK_OEM_3",
      "[": "VK_OEM_4",
      "{": "VK_OEM_4",
      "\\": "VK_OEM_5",
      "|": "VK_OEM_5",
      "]": "VK_OEM_6",
      "}": "VK_OEM_6",
      "'": "VK_OEM_7",
      '"': "VK_OEM_7",
      "!": "VK_1",
      "@": "VK_2",
      "#": "VK_3",
      "$": "VK_4",
      "%": "VK_5",
      "^": "VK_6",
      "&": "VK_7",
      "*": "VK_8",
      "(": "VK_9",
      ")": "VK_0"
    };
    if (oem[key]) return oem[key];
    return `VK_${key.toUpperCase().replace(/\W+/g, "_") || "UNKNOWN"}`;
  }

  function inputlogKeyValueFromWebKey(keyName) {
    const key = String(keyName || "");
    if (key === " " || key === "Space") return " ";
    if (key === "Enter") return "\n";
    if (key.length === 1) return key;
    return "NoValue";
  }

  function webInputlogVirtualKeyFromWebKey(keyName) {
    const key = String(keyName || "");
    const lower = key.toLowerCase();
    if (lower === "å") return "VK_OEM_6";
    if (lower === "ä") return "VK_OEM_7";
    if (lower === "ö") return "VK_OEM_3";
    if (/^[a-z]$/i.test(key)) return `VK_${key.toUpperCase()}`;
    if (/^[0-9]$/.test(key)) return `VK_${key}`;
    const named = {
      Enter: "VK_RETURN",
      Backspace: "VK_BACK",
      Delete: "VK_DELETE",
      Tab: "VK_TAB",
      " ": "VK_SPACE",
      Space: "VK_SPACE",
      ",": "VK_OEM_COMMA",
      ".": "VK_OEM_PERIOD",
      PageUp: "VK_PRIOR",
      PageDown: "VK_NEXT",
      End: "VK_END",
      Home: "VK_HOME",
      ArrowLeft: "VK_LEFT",
      ArrowUp: "VK_UP",
      ArrowRight: "VK_RIGHT",
      ArrowDown: "VK_DOWN"
    };
    return named[key] || "NONE";
  }

  function isWebInputlogNavigationVK(vk) {
    return ["VK_PRIOR", "VK_NEXT", "VK_END", "VK_HOME", "VK_LEFT", "VK_UP", "VK_RIGHT", "VK_DOWN"].includes(String(vk || ""));
  }

  function keyboardStateFromRawKey(rawKey) {
    const text = String(rawKey || "");
    const keys = [];
    if (/(^|[+: -])Shift($|[+: -])/i.test(text)) keys.push("VK_LSHIFT");
    if (/(^|[+: -])Control($|[+: -])|Ctrl/i.test(text)) keys.push("VK_LCONTROL");
    if (/(^|[+: -])Alt($|[+: -])/i.test(text)) keys.push("VK_LMENU");
    if (/(^|[+: -])Meta($|[+: -])/i.test(text)) keys.push("VK_LWIN");
    return keys.length
      ? keys.map((key) => `<key>${xmlEscape(key)}</key>`).join("")
      : "NoValue";
  }

  function modifierVirtualKeyFromWebKey(keyName) {
    const key = String(keyName || "");
    if (key === "Shift") return "VK_LSHIFT";
    if (key === "Control") return "VK_LCONTROL";
    if (key === "Alt") return "VK_LMENU";
    if (key === "Meta") return "VK_LWIN";
    return "";
  }

  function activeKeyboardState(activeModifiers, selfKey = "") {
    const keys = Array.from(activeModifiers || []).filter((key) => key && key !== selfKey);
    return keys.length
      ? keys.map((key) => `<key>${xmlEscape(key)}</key>`).join("")
      : "NoValue";
  }

  function hasBlockingModifier(activeModifiers) {
    return activeModifiers?.has("VK_LCONTROL") ||
      activeModifiers?.has("VK_RCONTROL") ||
      activeModifiers?.has("VK_LMENU") ||
      activeModifiers?.has("VK_RMENU") ||
      activeModifiers?.has("VK_LWIN") ||
      activeModifiers?.has("VK_RWIN");
  }

  function keyEntryName(entry) {
    const raw = String(entry?.value || "");
    if (!raw.startsWith("keydown: ") && !raw.startsWith("repeat: ")) return "";
    return raw.slice(raw.indexOf(": ") + 2);
  }

  function findNearestTextCarrierKey(keyEntries, textTs) {
    let candidate = null;
    const activeModifiers = new Set();
    for (let i = 0; i < keyEntries.length; i++) {
      if (keyEntries[i].ts > textTs) break;
      const raw = String(keyEntries[i]?.value || "");
      if (raw.startsWith("keyup: ")) {
        const modifier = modifierVirtualKeyFromWebKey(raw.slice(7));
        if (modifier) activeModifiers.delete(modifier);
        continue;
      }
      const keyName = keyEntryName(keyEntries[i]);
      if (keyName) {
        const modifier = modifierVirtualKeyFromWebKey(keyName);
        candidate = { entry: keyEntries[i], keyName, blockedByModifier: hasBlockingModifier(activeModifiers) && !modifier };
        if (modifier && raw.startsWith("keydown: ")) activeModifiers.add(modifier);
      }
    }
    return candidate;
  }

  function isTextDiffCoveredByKeyboardReplay(diff, textTs, keyEntries) {
    const carrier = findNearestTextCarrierKey(keyEntries, textTs);
    if (!carrier) return false;
    if (carrier.blockedByModifier) return false;
    const keyName = carrier.keyName;
    const keyValue = inputlogKeyValueFromWebKey(keyName);

    if (!diff.oldText && diff.newText.length === 1) {
      return keyValue === diff.newText;
    }

    return false;
  }

  function webScriptLogRecordsToInputlogIDFX(records) {
    const normalized = normalizeRecords(records);
    const startTime = Number(normalized.header_records.starttime) ||
      Math.min(...[
        ...Object.keys(normalized.key_records || {}),
        ...Object.keys(normalized.text_records || {}),
        ...Object.keys(normalized.cursor_records || {})
      ].map(Number).filter(Number.isFinite), Date.now());
    const endTime = Number(normalized.header_records.endtime) || startTime;
    const keyEntries = sortedEntries(normalized.key_records);
    const textEntries = sortedEntries(normalized.text_records);
    const cursorEntries = sortedEntries(normalized.cursor_records);
    const created = Number(normalized.header_records.starttime) || Date.now();
    const date = new Date(created);
    const documentName = normalized.header_records.filename || normalized.header_records.usercode || "webscriptlog";
    const events = [];
    let nextOrder = 0;

    function addEvent(ts, rank, type, parts) {
      events.push({ ts, rank, order: nextOrder++, type, parts });
    }

    function addSelection(ts, start, end, rank = 40) {
      addEvent(ts, rank, "selection", [
        { type: "wordlog", values: { start, end } }
      ]);
    }

    function addTextChange(ts, previousText, currentText) {
      const diff = textDiff(previousText, currentText);
      if (!diff.oldText && !diff.newText) return;
      if (isTextDiffCoveredByKeyboardReplay(diff, ts, keyEntries)) return;
      const cursor = cursorAtOrBeforeRange(cursorEntries, ts, {
        start: diff.start + diff.newText.length,
        end: diff.start + diff.newText.length
      });

      if (!diff.oldText && diff.newText) {
        addEvent(ts, 20, "insert", [
          { type: "wordlog", values: { position: diff.start + diff.newText.length, before: diff.newText, after: "NoValue" } }
        ]);
      } else {
        addEvent(ts, 20, "replacement", [
          {
            type: "wordlog",
            values: {
              start: diff.start,
              end: diff.end,
              newtext: diff.newText || "NoValue"
            }
          }
        ]);
      }
      addSelection(ts, cursor.start, cursor.end, 30);
    }

    const keyupByKey = new Map();
    keyEntries.forEach((entry) => {
      const raw = String(entry.value || "");
      if (!raw.startsWith("keyup: ")) return;
      const key = raw.slice(7);
      if (!keyupByKey.has(key)) keyupByKey.set(key, []);
      keyupByKey.get(key).push(entry.ts);
    });

    function consumeKeyup(key, afterTs) {
      const queue = keyupByKey.get(key);
      if (!queue || !queue.length) return afterTs;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i] >= afterTs) return queue.splice(i, 1)[0];
      }
      return afterTs;
    }

    const activeModifiers = new Set();

    keyEntries.forEach((entry) => {
      const raw = String(entry.value || "");
      const relStart = eventStartRelative(entry, startTime);

      if (raw.startsWith("keyup: ")) {
        const keyName = raw.slice(7);
        const modifier = modifierVirtualKeyFromWebKey(keyName);
        if (modifier) activeModifiers.delete(modifier);
        return;
      }

      if (raw.startsWith("keydown: ") || raw.startsWith("repeat: ")) {
        const keyName = raw.slice(raw.indexOf(": ") + 2);
        const endTs = raw.startsWith("keydown: ") ? consumeKeyup(keyName, entry.ts) : entry.ts;
        const currentText = textBefore(textEntries, entry.ts);
        const cursor = cursorBeforeRange(cursorEntries, entry.ts, {
          start: currentText.length,
          end: currentText.length
        });
        const key = inputlogKeyNameFromWebKey(keyName);
        const modifier = modifierVirtualKeyFromWebKey(keyName);
        const blockedByModifier = hasBlockingModifier(activeModifiers) && !modifier;
        const keyValue = blockedByModifier ? "NoValue" : inputlogKeyValueFromWebKey(keyName);
        const replay = keyValue === "NoValue" || modifier ? "False" : "True";
        const keyboardState = activeKeyboardState(activeModifiers, key);
        addEvent(entry.ts, 10, "keyboard", [
          {
            type: "wordlog",
            values: {
              position: cursor.end,
              documentLength: currentText.length + 1,
              replay
            }
          },
          {
            type: "winlog",
            values: {
              startTime: relStart,
              endTime: Math.max(relStart, Math.round(endTs - startTime)),
              key,
              value: keyValue,
              keyboardstate: keyboardState
            }
          }
        ]);
        if (modifier) activeModifiers.add(modifier);
        return;
      }

      if (raw.startsWith("mousedown")) {
        const mouseup = keyEntries.find((candidate) => candidate.ts >= entry.ts && String(candidate.value || "").startsWith("mouseup"));
        addEvent(entry.ts, 10, "mouse", [
          {
            type: "winlog",
            values: {
              startTime: relStart,
              endTime: Math.max(relStart, Math.round((mouseup?.ts || entry.ts) - startTime)),
              x: "0",
              y: "0",
              type: "click",
              button: "LEFT"
            }
          }
        ]);
        return;
      }

      if (raw.startsWith("mousemove")) {
        addEvent(entry.ts, 10, "mouse", [
          {
            type: "winlog",
            values: {
              startTime: relStart,
              endTime: relStart,
              x: "0",
              y: "0",
              type: "movement"
            }
          }
        ]);
      }
    });

    let previousText = "";
    textEntries.forEach((entry) => {
      const currentText = String(entry.value ?? "");
      addTextChange(entry.ts, previousText, currentText);
      previousText = currentText;
    });

    let lastSelection = null;
    cursorEntries.forEach((entry) => {
      const cursor = parseCursorValue(entry.value);
      const key = `${cursor.start}:${cursor.end}`;
      if (key !== lastSelection) {
        addSelection(entry.ts, cursor.start, cursor.end, 50);
        lastSelection = key;
      }
    });

    events.sort((a, b) => (a.ts - b.ts) || (a.rank - b.rank) || (a.order - b.order));

    let xml = '<?xml version="1.0" encoding="utf-8"?>\r\n<log>\r\n';
    xml += "  <meta>\r\n";
    xml += xmlEntry("__LogProgramVersion", "7.0.0.2");
    xml += xmlEntry("__MainDocument", documentName);
    xml += xmlEntry("__LogCreationDate", date.toLocaleString());
    xml += xmlEntry("__LogCreationTimeStamp", created);
    xml += xmlEntry("__GUID", `${created}`);
    xml += xmlEntry("__LogRelativeCreationDate", 0);
    xml += "  </meta>\r\n";
    xml += "  <session>\r\n";
    xml += xmlEntry("Participant", normalized.header_records.usercode || documentName);
    xml += xmlEntry("Text Language", "Unknown");
    xml += xmlEntry("Age", "Unknown");
    xml += xmlEntry("Gender", "Unknown");
    xml += xmlEntry("Session", "1");
    xml += xmlEntry("Group", "Unknown");
    xml += xmlEntry("Experience", "Unknown");
    xml += xmlEntry("Restricted Logging", "0");
    xml += "  </session>\r\n";

    events.forEach((event, index) => {
      xml += xmlEvent(event.type, index, event.parts);
    });

    const finalText = textEntries.length ? String(textEntries[textEntries.length - 1].value ?? "") : "";
    const nonWhitespace = finalText.replace(/\s/g, "").length;
    const lineCount = finalText ? finalText.split(/\n/).length : 0;
    const paragraphCount = finalText.trim() ? finalText.trim().split(/\n\s*\n/).length : 0;
    const wordCount = finalText.trim() ? finalText.trim().split(/\s+/).length : 0;
    xml += xmlEvent("statistics", events.length, [
      {
        type: "wordlog",
        values: {
          charexclspaces: nonWhitespace,
          charinclspaces: finalText.length,
          fareastcharcount: 0,
          linecount: lineCount,
          pagecount: 1,
          paragraphcount: paragraphCount,
          wordcount: wordCount,
          stcharexclspaces: 0,
          stcharinclspaces: 0,
          stfareastcharcount: 0,
          stlinecount: 0,
          stpagecount: 1,
          stparagraphcount: 0,
          stwordcount: 0
        }
      }
    ]);
    xml += "</log>";
    return xml;
  }

  function webScriptLogRecordsToWebInputlogIDFX(records) {
    const normalized = normalizeRecords(records);
    const startTime = Number(normalized.header_records.starttime) ||
      Math.min(...[
        ...Object.keys(normalized.key_records || {}),
        ...Object.keys(normalized.text_records || {}),
        ...Object.keys(normalized.cursor_records || {})
      ].map(Number).filter(Number.isFinite), Date.now());
    const endTime = Number(normalized.header_records.endtime) || startTime;
    const textEntries = sortedEntries(normalized.text_records);
    const keyEntries = sortedEntries(normalized.key_records);
    const cursorEntries = sortedEntries(normalized.cursor_records);
    const created = Number(normalized.header_records.starttime) || Date.now();
    const date = new Date(created);
    const documentName = normalized.header_records.filename || normalized.header_records.usercode || "webscriptlog";
    const events = [];
    const prev = { selStart: 0, selEnd: 0, text: "", selection: "" };
    let nextId = 0;
    let keyString = "";
    let lastKey = "";

    function relativeTime(ts) {
      return Math.max(0, Math.round(Number(ts || 0) - startTime));
    }

    function addEvent(ts, type, values) {
      events.push({ ts, id: nextId++, type, values });
    }

    function updatePrev(selStart, selEnd, text) {
      prev.selStart = selStart;
      prev.selEnd = selEnd;
      prev.text = text;
      prev.selection = text.substring(selStart, selEnd);
    }

    function emitKeyboard(ts, position, documentLength, replay, key, value, keyboardstate = "") {
      addEvent(ts, "keyboard", {
        position,
        documentLength,
        replay,
        startTime: relativeTime(ts),
        endTime: relativeTime(ts) + 5,
        key,
        value,
        keyboardstate
      });
    }

    function computeWebInputlogChange(currText, selStart, selEnd) {
      if (prev.selection.length > 0) {
        const inserted = currText.substring(prev.selStart, selEnd);
        if (inserted.length > 0) {
          return { changeType: "Replace", offset: prev.selStart, text1length: prev.selection.length, str2: inserted };
        }
        return { changeType: "Remove", offset: prev.selStart, text1length: prev.selection.length, str2: "" };
      }

      const difflen = currText.length - prev.text.length;
      if (difflen > 0) {
        return { changeType: "Replace", offset: prev.selStart, text1length: 0, str2: currText.substring(prev.selStart, selEnd) };
      }
      if (difflen < 0) {
        return { changeType: "Remove", offset: selStart, text1length: Math.abs(difflen), str2: "" };
      }
      return { changeType: "No Change", offset: selStart, text1length: 0, str2: "" };
    }

    function onWebInputlogKeyDown(keyName) {
      lastKey = keyName;
      const vk = webInputlogVirtualKeyFromWebKey(keyName);
      keyString = isWebInputlogNavigationVK(vk) ? vk : "";
    }

    function onWebInputlogSelectionChange(ts, selStart, selEnd, text) {
      if (selStart === prev.selStart && selEnd === prev.selEnd && text === prev.text) return;

      if (selStart !== selEnd) {
        addEvent(ts, "replacement", {
          start: selStart,
          end: selEnd,
          newtext: text.substring(selStart, selEnd)
        });
      }

      if (keyString) {
        emitKeyboard(ts, selStart, prev.text.length + 1, "False", keyString, "");
      }

      addEvent(ts, "selection", { start: selStart, end: selEnd });
      updatePrev(selStart, selEnd, text);
      keyString = "";
    }

    function onWebInputlogInput(ts, text, selStart, selEnd) {
      const result = computeWebInputlogChange(text, selStart, selEnd);

      if (result.changeType === "Remove") {
        let poslen = result.text1length;
        let replay = "True";
        let key = "VK_BACK";
        let value = "&#x8;";
        const lastVK = webInputlogVirtualKeyFromWebKey(lastKey);

        if (lastVK === "VK_DELETE") {
          key = "VK_DELETE";
          value = "";
        }

        if (result.text1length > 1 || lastVK === "VK_DELETE") {
          poslen = 0;
          replay = "False";
        }

        emitKeyboard(ts, result.offset + poslen, prev.text.length + 1, replay, key, value);

        if (result.text1length > 1 || lastVK === "VK_DELETE") {
          addEvent(ts, "replacement", {
            start: result.offset,
            end: result.offset + result.text1length,
            newtext: ""
          });
        }
      }

      if (result.changeType === "Replace") {
        const key = webInputlogVirtualKeyFromWebKey(lastKey);
        const replay = result.text1length > 0 ? "False" : "True";
        const value = key === "VK_RETURN" ? "" : result.str2;

        emitKeyboard(ts, result.offset, prev.text.length + 1, replay, key, value);

        if (result.text1length > 0) {
          addEvent(ts, "replacement", {
            start: result.offset,
            end: result.offset + result.text1length,
            newtext: result.str2
          });
        }
      }

      if (prev.selection.length > 0) {
        addEvent(ts, "selection", { start: selStart, end: selEnd });
      }

      updatePrev(selStart, selEnd, text);
      lastKey = "";
    }

    let textIndex = 0;
    keyEntries.forEach((entry) => {
      while (textIndex < textEntries.length && textEntries[textIndex].ts <= entry.ts) {
        const textEntry = textEntries[textIndex++];
        const text = String(textEntry.value ?? "");
        const cursor = cursorAtOrBeforeRange(cursorEntries, textEntry.ts, { start: text.length, end: text.length });
        onWebInputlogInput(textEntry.ts, text, cursor.start, cursor.end);
      }

      const raw = String(entry.value || "");
      if (raw.startsWith("keydown: ") || raw.startsWith("repeat: ")) {
        onWebInputlogKeyDown(raw.slice(raw.indexOf(": ") + 2));
        return;
      }

      if (raw.startsWith("keyup: ") || raw.startsWith("mouseup")) {
        const text = textBefore(textEntries, entry.ts);
        const cursor = cursorAtOrBeforeRange(cursorEntries, entry.ts, { start: text.length, end: text.length });
        onWebInputlogSelectionChange(entry.ts, cursor.start, cursor.end, text);
      }
    });

    while (textIndex < textEntries.length) {
      const textEntry = textEntries[textIndex++];
      const text = String(textEntry.value ?? "");
      const cursor = cursorAtOrBeforeRange(cursorEntries, textEntry.ts, { start: text.length, end: text.length });
      onWebInputlogInput(textEntry.ts, text, cursor.start, cursor.end);
    }

    events.sort((a, b) => (a.ts - b.ts) || (a.id - b.id));

    let xml = '<?xml version="1.0" encoding="utf-8"?>\r\n<log>\r\n';
    xml += "  <meta>\r\n";
    xml += xmlEntry("__LogProgramVersion", "7.0.0.2");
    xml += xmlEntry("__MainDocument", documentName);
    xml += xmlEntry("__LogCreationDate", date.toLocaleString());
    xml += xmlEntry("__LogCreationTimeStamp", created);
    xml += xmlEntry("__GUID", `${created}`);
    xml += xmlEntry("__LogRelativeCreationDate", 0);
    xml += "  </meta>\r\n";
    xml += "  <session>\r\n";
    xml += xmlEntry("Participant", normalized.header_records.usercode || documentName);
    xml += xmlEntry("Text Language", "Unknown");
    xml += xmlEntry("Age", "Unknown");
    xml += xmlEntry("Gender", "Unknown");
    xml += xmlEntry("Session", "1");
    xml += xmlEntry("Group", "Unknown");
    xml += xmlEntry("Experience", "Unknown");
    xml += xmlEntry("Restricted Logging", "0");
    xml += "  </session>\r\n";

    events.forEach((event, index) => {
      if (event.type === "keyboard") {
        xml += xmlEvent("keyboard", index, [
          {
            type: "wordlog",
            values: {
              position: event.values.position,
              documentLength: event.values.documentLength,
              replay: event.values.replay
            }
          },
          {
            type: "winlog",
            values: {
              startTime: event.values.startTime,
              endTime: event.values.endTime,
              key: event.values.key,
              value: event.values.value,
              keyboardstate: event.values.keyboardstate
            }
          }
        ]);
        return;
      }

      if (event.type === "replacement") {
        xml += xmlEvent("replacement", index, [
          { type: "wordlog", values: { start: event.values.start, end: event.values.end, newtext: event.values.newtext } }
        ]);
        return;
      }

      if (event.type === "selection") {
        xml += xmlEvent("selection", index, [
          { type: "wordlog", values: { start: event.values.start, end: event.values.end } }
        ]);
      }
    });

    xml += xmlEvent("statistics", events.length, [
      {
        type: "wordlog",
        values: {
          startTime: 0,
          endTime: Math.max(0, Math.round(endTime - startTime)),
          keyboard: keyEntries.length,
          mouse: keyEntries.filter((entry) => String(entry.value || "").startsWith("mousedown")).length
        }
      }
    ]);
    xml += "</log>";
    return xml;
  }

  function xmlText(parent, tagName, fallback = "") {
    const element = parent?.getElementsByTagName?.(tagName)?.[0];
    return element ? element.textContent : fallback;
  }

  function getEventParts(eventElement) {
    return Array.from(eventElement.getElementsByTagName("part")).map((part) => ({
      type: part.getAttribute("type") || "",
      element: part
    }));
  }

  function partByType(eventElement, type) {
    return getEventParts(eventElement).find((part) => part.type === type)?.element || null;
  }

  function virtualKeyToOutput(key, value) {
    const rawKey = String(key || "");
    const rawValue = String(value || "");
    const named = {
      VK_BACK: "Backspace",
      VK_DELETE: "Delete",
      VK_RETURN: "Enter",
      VK_SPACE: "Space",
      VK_TAB: "Tab",
      VK_SHIFT: "Shift",
      VK_CONTROL: "Control",
      VK_MENU: "Alt",
      VK_CAPITAL: "CapsLock",
      VK_LEFT: "ArrowLeft",
      VK_RIGHT: "ArrowRight",
      VK_UP: "ArrowUp",
      VK_DOWN: "ArrowDown",
      VK_LBUTTON: "Leftclick",
      VK_RBUTTON: "Rightclick",
      VK_MBUTTON: "Middleclick"
    };
    if (rawValue && rawValue !== "NoValue") return rawValue === "\b" ? "Backspace" : rawValue;
    if (named[rawKey]) return named[rawKey];
    if (/^VK_[A-Z0-9]$/.test(rawKey)) return rawKey.slice(3);
    return rawKey.replace(/^VK_/, "") || "Unidentified";
  }

  function outputToWebScriptLogKeyRecord(output, eventType) {
    const text = String(output || "");
    if (eventType === "mouse" || text.toLowerCase().includes("click")) return "mousedown: yes";
    if (text === "Space") return "keydown:  ";
    return `keydown: ${text}`;
  }

  function xmlBool(value) {
    return /^(true|1|yes)$/i.test(String(value || "").trim());
  }

  function isEmptyXmlElementText(value) {
    return value == null || String(value) === "" || String(value) === "NoValue";
  }

  function applyKeyboardReplayToText(currentText, wordlog, winlog) {
    if (!xmlBool(xmlText(wordlog, "replay", "False"))) return null;
    const key = xmlText(winlog, "key", "");
    const value = xmlText(winlog, "value", "");
    const position = Number(xmlText(wordlog, "position", 0));
    const safePosition = Math.max(0, Math.min(position, currentText.length));

    if (key === "VK_BACK" || value === "\b") {
      const deleteStart = Math.max(0, safePosition - 1);
      return {
        text: currentText.slice(0, deleteStart) + currentText.slice(safePosition),
        cursor: deleteStart
      };
    }

    if (key === "VK_DELETE") {
      return {
        text: currentText.slice(0, safePosition) + currentText.slice(safePosition + 1),
        cursor: safePosition
      };
    }

    if (isEmptyXmlElementText(value)) return null;
    return {
      text: currentText.slice(0, safePosition) + value + currentText.slice(safePosition),
      cursor: safePosition + value.length
    };
  }

  function parseIDFXToWebScriptLogRecords(idfxText, options = {}) {
    const parser = new DOMParser();
    const sanitizedIDFXText = sanitizeIDFXXMLForDOMParser(idfxText);
    const doc = parser.parseFromString(sanitizedIDFXText, "application/xml");
    const parseErrors = doc.getElementsByTagName("parsererror");
    if (parseErrors.length) {
      const detail = String(parseErrors[0].textContent || "").trim().replace(/\s+/g, " ").slice(0, 240);
      throw new Error(`Could not parse IDFX XML${detail ? `: ${detail}` : "."}`);
    }

    const metaEntries = Array.from(doc.querySelectorAll("meta entry"));
    const meta = {};
    metaEntries.forEach((entry) => {
      meta[xmlText(entry, "key")] = xmlText(entry, "value");
    });

    const creationTimestamp = Number(meta.__LogCreationTimeStamp);
    const relativeCreationDate = Number(meta.__LogRelativeCreationDate);
    const starttime = Number(options.starttime || creationTimestamp || Date.now());
    const relativeTimeOffset = Number.isFinite(relativeCreationDate) && relativeCreationDate > 0 ? relativeCreationDate : 0;
    const records = {
      header_records: { starttime, endtime: starttime },
      key_records: {},
      text_records: {},
      cursor_records: {},
      scroll_records: {},
      image_records: {},
      window_records: {}
    };
    const usedTs = new Set();
    let currentText = "";
    let lastRelativeTime = 0;

    const textOperationTimes = new Set();
    let scanRelativeTime = 0;
    Array.from(doc.getElementsByTagName("event")).forEach((eventElement) => {
      const eventType = eventElement.getAttribute("type") || "";
      const winlog = partByType(eventElement, "winlog");
      const relativeTime = Number(xmlText(winlog, "startTime", scanRelativeTime));
      if (Number.isFinite(relativeTime)) scanRelativeTime = relativeTime;
      if (eventType === "insert" || eventType === "replacement") {
        textOperationTimes.add(String(scanRelativeTime));
      }
    });

    function uniqueTs(relativeTime) {
      const base = starttime + Math.max(0, (Number(relativeTime) || 0) - relativeTimeOffset);
      let ts = base;
      while (usedTs.has(String(ts))) ts += 0.001;
      usedTs.add(String(ts));
      records.header_records.endtime = Math.max(records.header_records.endtime, Math.ceil(ts));
      return ts;
    }

    function writeTextSnapshot(relativeTime, text, cursorPosition) {
      const ts = uniqueTs(relativeTime);
      currentText = text;
      records.text_records[ts] = currentText;
      if (Number.isFinite(Number(cursorPosition))) {
        records.cursor_records[ts] = `${Number(cursorPosition)}:${Number(cursorPosition)}`;
      }
      return ts;
    }

    Array.from(doc.getElementsByTagName("event")).forEach((eventElement) => {
      const eventType = eventElement.getAttribute("type") || "";
      const winlog = partByType(eventElement, "winlog");
      const wordlog = partByType(eventElement, "wordlog");
      const relativeTime = Number(xmlText(winlog, "startTime", lastRelativeTime));
      if (Number.isFinite(relativeTime)) lastRelativeTime = relativeTime;

      if (eventType === "keyboard" || eventType === "mouse") {
        const output = eventType === "mouse"
          ? `${(xmlText(winlog, "button", "Left") || "Left").toLowerCase().replace(/^./, (c) => c.toUpperCase())}click`
          : virtualKeyToOutput(xmlText(winlog, "key"), xmlText(winlog, "value"));
        const ts = uniqueTs(lastRelativeTime);
        records.key_records[ts] = outputToWebScriptLogKeyRecord(output, eventType);
        const position = Number(xmlText(wordlog, "position", ""));
        if (Number.isFinite(position)) records.cursor_records[ts] = `${position}:${position}`;

        if (eventType === "keyboard" && wordlog && winlog && !textOperationTimes.has(String(lastRelativeTime))) {
          const replayed = applyKeyboardReplayToText(currentText, wordlog, winlog);
          if (replayed && replayed.text !== currentText) {
            writeTextSnapshot(lastRelativeTime, replayed.text, replayed.cursor);
          }
        }
        return;
      }

      if (eventType === "insert") {
        const position = Number(xmlText(wordlog, "position", 0));
        const before = xmlText(wordlog, "before", "");
        const insertText = before === "NoValue" ? "" : before;
        const safePosition = Math.max(0, Math.min(position, currentText.length));
        const nextText = currentText.slice(0, safePosition) + insertText + currentText.slice(safePosition);
        writeTextSnapshot(lastRelativeTime, nextText, safePosition + insertText.length);
        return;
      }

      if (eventType === "replacement") {
        const start = Number(xmlText(wordlog, "start", 0));
        const end = Number(xmlText(wordlog, "end", start));
        const newtext = xmlText(wordlog, "newtext", "");
        const replacement = newtext === "NoValue" ? "" : newtext;
        const safeStart = Math.max(0, Math.min(start, currentText.length));
        const safeEnd = Math.max(safeStart, Math.min(end, currentText.length));
        if (replacement && currentText.slice(safeStart, safeEnd) === replacement) {
          records.cursor_records[uniqueTs(lastRelativeTime)] = `${safeStart}:${safeEnd}`;
          return;
        }
        const nextText = currentText.slice(0, safeStart) + replacement + currentText.slice(safeEnd);
        writeTextSnapshot(lastRelativeTime, nextText, safeStart + replacement.length);
        return;
      }

      if (eventType === "selection") {
        const start = Number(xmlText(wordlog, "start", ""));
        const end = Number(xmlText(wordlog, "end", start));
        if (Number.isFinite(start) && Number.isFinite(end)) {
          records.cursor_records[uniqueTs(lastRelativeTime)] = `${start}:${end}`;
        }
      }
    });

    if (Object.keys(records.text_records).length === 0) {
      writeTextSnapshot(0, "", 0);
    }

    return records;
  }

  function sanitizeIDFXXMLForDOMParser(idfxText) {
    return String(idfxText || "")
      // Some Inputlog IDFX files encode Backspace as &#x8;, which is not legal XML 1.0.
      .replace(/&#x0*8;/gi, "Backspace")
      .replace(/&#0*8;/g, "Backspace");
  }

  function extractIDFXFromText(text) {
    const raw = String(text || "");
    const tagged = raw.match(/<idfx>\s*([\s\S]*?)\s*<\/idfx>/i);
    if (tagged) return tagged[1].trim();
    const logStart = raw.search(/<log(?:\s|>)/i);
    if (logStart >= 0) {
      const logEndMatch = raw.slice(logStart).match(/<\/log\s*>/i);
      if (logEndMatch) {
        const logEnd = logStart + logEndMatch.index + logEndMatch[0].length;
        const xmlStart = raw.lastIndexOf("<?xml", logStart);
        const start = xmlStart >= 0 ? xmlStart : logStart;
        return raw.slice(start, logEnd).trim();
      }
      return raw.slice(logStart).trim();
    }
    const xmlStart = raw.indexOf("<?xml");
    if (xmlStart >= 0) return raw.slice(xmlStart).trim();
    return raw.trim();
  }

  function extractIDFXDocumentFromPane() {
    const target = getIDFXCSVTarget();
    return extractIDFXFromText(target?.selectionStart !== target?.selectionEnd
      ? target.value.slice(target.selectionStart, target.selectionEnd)
      : target?.value || "");
  }

  function runImportSideEffect(name, fn) {
    try {
      if (typeof fn === "function") fn();
    } catch (err) {
      console.warn(`Imported IDFX was loaded, but ${name} failed.`, err);
    }
  }

  function applyIDFXRecordsToWebScriptLog(records, options = {}) {
    const { key = "imported-idfx" } = options;
    window.header_record = records.header_records;
    window.text_record = records.text_records;
    window.cursor_record = records.cursor_records;
    window.key_record = records.key_records;
    window.scroll_record = records.scroll_records;
    window.image_record = records.image_records;
    window.window_record = records.window_records;
    window.text_record_keeper = {};
    window.cursor_record_keeper = {};
    window.scroll_record_keeper = {};
    window.current_text = "";

    runImportSideEffect("replayStop()", () => replayStop());
    runImportSideEffect("resetReplayView()", () => resetReplayView());
    runImportSideEffect("makeRevisionTable()", () => makeRevisionTable());
    runImportSideEffect("processGraphFormat()", () => processGraphFormat());
    runImportSideEffect("showWritingScore()", () => showWritingScore());
    runImportSideEffect("makeFTAnalysis()", () => makeFTAnalysis());
    runImportSideEffect("dashboard log:loaded event", () => {
      if (window.dashboardEvents?.emit) {
        window.dashboardEvents.emit("log:loaded", {
          key,
          text_records: Object.keys(records.text_records).length
        });
      }
    });
    return records;
  }

  function loadIDFXIntoWebScriptLog(idfxText) {
    const records = parseIDFXToWebScriptLogRecords(extractIDFXFromText(idfxText));
    return applyIDFXRecordsToWebScriptLog(records);
  }

  function makeImportedIDFXStorageKey(records) {
    const startTime = Number(records?.header_records?.starttime) || Date.now();
    const d = new Date(startTime);
    const pad = (value) => String(value).padStart(2, "0");
    return "wslog_imported-idfx_" +
      `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}_` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async function makeUniqueIDBKey(baseKey) {
    const store = window.idbStore || (typeof idbStore !== "undefined" ? idbStore : null);
    if (!store?.keys) return baseKey;
    const keys = await store.keys();
    if (!keys.includes(baseKey)) return baseKey;
    let index = 2;
    let key = `${baseKey}_${index}`;
    while (keys.includes(key)) {
      index += 1;
      key = `${baseKey}_${index}`;
    }
    return key;
  }

  async function saveImportedIDFXRecordsToIndexedDB(records) {
    const store = window.idbStore || (typeof idbStore !== "undefined" ? idbStore : null);
    const compressor = window.pako || (typeof pako !== "undefined" ? pako : null);
    if (!store?.setItem || !compressor?.deflate) return null;
    const key = await makeUniqueIDBKey(makeImportedIDFXStorageKey(records));
    const jsonStr = JSON.stringify({
      header_records: records.header_records || {},
      text_records: records.text_records || {},
      cursor_records: records.cursor_records || {},
      key_records: records.key_records || {},
      scroll_records: records.scroll_records || {},
      image_records: records.image_records || {},
      window_records: records.window_records || {}
    }, null, "\t");
    const compressed = compressor.deflate(jsonStr);
    await store.setItem(key, compressed);
    try {
      await refreshIndexedDBListbox(key);
    } catch (err) {
      console.warn("Imported IDFX was saved, but the IndexedDB listbox could not be refreshed.", err);
    }
    return key;
  }

  function getIndexedDBListbox() {
    return document.getElementById("lb_load") || window.lb_load || null;
  }

  function selectIndexedDBListboxKey(key) {
    const select = getIndexedDBListbox();
    if (!select || !key) return false;
    const option = Array.from(select.options).find((opt) =>
      opt.textContent === key || opt.label === key || opt.value === key
    );
    if (!option) return false;
    select.value = option.value;
    option.selected = true;
    return true;
  }

  async function rebuildIndexedDBListbox(selectedKey) {
    const store = window.idbStore || (typeof idbStore !== "undefined" ? idbStore : null);
    const select = getIndexedDBListbox();
    if (!store?.keys || !select) return false;
    const keys = await store.keys();
    keys.sort();
    select.innerHTML = "";
    keys.forEach((key, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = key;
      select.appendChild(option);
    });
    if (selectedKey) selectIndexedDBListboxKey(selectedKey);
    return true;
  }

  async function refreshIndexedDBListbox(selectedKey) {
    let refreshed = false;
    if (typeof window.updateListbox === "function") {
      try {
        await window.updateListbox();
        refreshed = true;
      } catch (err) {
        console.warn("Could not refresh IndexedDB listbox with updateListbox(); rebuilding directly.", err);
      }
    }
    if (!refreshed || !selectIndexedDBListboxKey(selectedKey)) {
      await rebuildIndexedDBListbox(selectedKey);
    }
  }

  function getIDFXCSVTarget() {
    return document.getElementById("idfxCsvOutput");
  }

  function appendToIDFXCSVOutput(text) {
    const target = getIDFXCSVTarget();
    if (!target) return false;
    target.value += text;
    target.scrollTop = target.scrollHeight;
    return true;
  }

  let pendingDiffKeysDirectIDFX = null;

  function setPendingDiffKeysDirectIDFX(idfx) {
    pendingDiffKeysDirectIDFX = idfx || null;
    const button = document.getElementById("b_printpendingdiffkeysdirectidfx");
    if (button) button.hidden = !pendingDiffKeysDirectIDFX;
  }

  function printPendingDiffKeysDirectIDFX() {
    if (!pendingDiffKeysDirectIDFX) {
      appendToIDFXCSVOutput("\nNo pending DiffKeys Direct IDFX output.\n");
      return null;
    }
    const idfx = pendingDiffKeysDirectIDFX;
    setPendingDiffKeysDirectIDFX(null);
    appendToIDFXCSVOutput(`\n<diffkeys-direct-idfx>\n${idfx}\n</diffkeys-direct-idfx>\n`);
    return { idfx };
  }

  async function importIDFXText(idfxText, options = {}) {
    const { reportToPane = true } = options;
    const records = parseIDFXToWebScriptLogRecords(extractIDFXFromText(idfxText));
    let savedKey = null;
    try {
      savedKey = await saveImportedIDFXRecordsToIndexedDB(records);
    } catch (err) {
      console.error("Could not save imported IDFX to IndexedDB", err);
    }
    applyIDFXRecordsToWebScriptLog(records, { key: savedKey || "imported-idfx" });
    if (reportToPane) {
      const target = getIDFXCSVTarget();
      if (target) {
        target.value += `\nImported IDFX: ${Object.keys(records.text_records).length} text records, ${Object.keys(records.key_records).length} key records`;
        target.value += savedKey ? `, saved as ${savedKey}.\n` : ". Could not save to IndexedDB.\n";
        target.scrollTop = target.scrollHeight;
      }
    }
    return records;
  }

  async function importIDFXFromIDFXCSVPane() {
    const target = getIDFXCSVTarget();
    if (!target) return null;
    const selected = target.selectionStart !== target.selectionEnd
      ? target.value.slice(target.selectionStart, target.selectionEnd)
      : target.value;
    return importIDFXText(selected, { reportToPane: true });
  }

  function importIDFXFromInfoWindow() {
    return importIDFXFromIDFXCSVPane();
  }

  function clearIDFXCSVOutput() {
    const target = getIDFXCSVTarget();
    if (target) target.value = "";
    setPendingDiffKeysDirectIDFX(null);
  }

  function makeIDFXDownloadName() {
    const d = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `webscriptlog_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.idfx`;
  }

  function isCompleteIDFXDocument(text) {
    return /^<\?xml[\s\S]*<\/log\s*>$/i.test(String(text || "").trim());
  }

  function downloadIDFXFromIDFXCSVPane() {
    let idfx = extractIDFXDocumentFromPane();
    if (!isCompleteIDFXDocument(idfx)) {
      const records = getCurrentWebScriptLogRecords();
      if (!records.header_records?.starttime || Object.keys(records.text_records || {}).length === 0) {
        appendToIDFXCSVOutput("\nNo complete IDFX document found and no loaded WebScriptLog data to export.\n");
        return null;
      }
      idfx = getDiffKeysDirectIDFX(records);
      if (!idfx) return null;
    }
    const blob = new Blob([idfx.trim() + "\n"], { type: "application/xml;charset=utf-8" });
    if (typeof saveAs === "function") saveAs(blob, makeIDFXDownloadName());
    else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = makeIDFXDownloadName();
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    return idfx;
  }

  function uploadIDFXToIDFXCSVPane(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const idfx = extractIDFXFromText(String(reader.result || ""));
      try {
        await importIDFXText(idfx, { reportToPane: false });
      } catch (err) {
        console.error("Could not import uploaded IDFX file", err);
        appendToIDFXCSVOutput(`\nCould not import IDFX file "${file.name}".\n`);
      } finally {
        if (input) input.value = "";
      }
    };
    reader.onerror = () => {
      appendToIDFXCSVOutput(`\nCould not read IDFX file "${file.name}".\n`);
      if (input) input.value = "";
    };
    reader.readAsText(file);
  }

  function getCurrentWebScriptLogRecords() {
    const selectedKey = getIndexedDBListbox()?.selectedOptions?.[0]?.text || "";
    if (selectedKey && window.header_record) window.header_record._indexeddb_key = selectedKey;
    return {
      header_records: window.header_record || {},
      key_records: window.key_record || {},
      text_records: window.text_record || {},
      cursor_records: window.cursor_record || {},
      scroll_records: window.scroll_record || {},
      image_records: window.image_record || {},
      window_records: window.window_record || {}
    };
  }

  function getDiffKeysDirectIDFX(records = getCurrentWebScriptLogRecords()) {
    const converter = window.DiffKeysDirectConverter;
    if (!converter?.recordsToIDFX) {
      appendToIDFXCSVOutput("\nDiffKeys Direct converter is not loaded.\n");
      return "";
    }
    const indexedDBKey = records?.header_records?._indexeddb_key || getIndexedDBListbox()?.selectedOptions?.[0]?.text || "";
    return converter.recordsToIDFX(records, { indexedDBKey });
  }

  // Deprecated: legacy FlexKeyLogger-style print route. Kept for console/debug use only.
  function printWebScriptLogCSVAndIDFX() {
    const records = getCurrentWebScriptLogRecords();
    const csv = webScriptLogRecordsToCSV(records);
    const idfx = webScriptLogRecordsToIDFX(records);
    appendToIDFXCSVOutput(`\n<csv>\n${csv}\n</csv>\n`);
    appendToIDFXCSVOutput(`<idfx>\n${idfx}\n</idfx>\n`);
    return { csv, idfx };
  }

  // Deprecated: legacy inputlog-libreoffice-style print route. Kept for console/debug use only.
  function printWebScriptLogInputlogIDFX() {
    const records = getCurrentWebScriptLogRecords();
    const idfx = webScriptLogRecordsToInputlogIDFX(records);
    appendToIDFXCSVOutput(`\n<inputlog-libreoffice-style-idfx>\n${idfx}\n</inputlog-libreoffice-style-idfx>\n`);
    return { idfx };
  }

  // Deprecated: legacy webinputlog-style print route. Kept for console/debug use only.
  function printWebScriptLogWebInputlogIDFX() {
    const records = getCurrentWebScriptLogRecords();
    const idfx = webScriptLogRecordsToWebInputlogIDFX(records);
    appendToIDFXCSVOutput(`\n<webinputlog-style-idfx>\n${idfx}\n</webinputlog-style-idfx>\n`);
    return { idfx };
  }

  function printWebScriptLogIDFX() {
    const records = getCurrentWebScriptLogRecords();
    const textRecordCount = Object.keys(records.text_records || {}).length;
    const idfx = getDiffKeysDirectIDFX(records);
    if (!idfx) return null;
    if (textRecordCount > 200) {
      setPendingDiffKeysDirectIDFX(idfx);
      appendToIDFXCSVOutput(
        `\nDiffKeys Direct IDFX generated but not printed because this log has ${textRecordCount} text records. ` +
        `Output size is ${(idfx.length / 1024 / 1024).toFixed(2)} MB. ` +
        `Use "Print pending full DiffKeys IDFX" if you need to print it here.\n`
      );
      return { idfx, deferred: true };
    }
    setPendingDiffKeysDirectIDFX(null);
    appendToIDFXCSVOutput(`\n<diffkeys-direct-idfx>\n${idfx}\n</diffkeys-direct-idfx>\n`);
    return { idfx };
  }

  // Deprecated alias for older callers.
  const printWebScriptLogDiffKeysDirectIDFX = printWebScriptLogIDFX;

  window.webScriptLogRecordsToFlexKeylog = webScriptLogRecordsToFlexKeylog;
  window.webScriptLogRecordsToCSV = webScriptLogRecordsToCSV;
  window.webScriptLogRecordsToIDFX = webScriptLogRecordsToIDFX;
  window.webScriptLogRecordsToInputlogIDFX = webScriptLogRecordsToInputlogIDFX;
  window.webScriptLogRecordsToWebInputlogIDFX = webScriptLogRecordsToWebInputlogIDFX;
  window.parseIDFXToWebScriptLogRecords = parseIDFXToWebScriptLogRecords;
  window.loadIDFXIntoWebScriptLog = loadIDFXIntoWebScriptLog;
  window.importIDFXFromIDFXCSVPane = importIDFXFromIDFXCSVPane;
  window.importIDFXFromInfoWindow = importIDFXFromInfoWindow;
  window.clearIDFXCSVOutput = clearIDFXCSVOutput;
  window.downloadIDFXFromIDFXCSVPane = downloadIDFXFromIDFXCSVPane;
  window.uploadIDFXToIDFXCSVPane = uploadIDFXToIDFXCSVPane;
  window.printWebScriptLogIDFX = printWebScriptLogIDFX;
  window.printWebScriptLogDiffKeysDirectIDFX = printWebScriptLogDiffKeysDirectIDFX;
  window.printPendingDiffKeysDirectIDFX = printPendingDiffKeysDirectIDFX;
})();
