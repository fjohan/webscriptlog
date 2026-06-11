(function () {
  "use strict";

  const VERSION = "webscriptlog-0.0.1";
  const MAIN_DOCUMENT = "webscriptlog.docx";

  function xmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function xmlElement(name, value, indent) {
    const pad = " ".repeat(indent);
    if (value === null || value === undefined || value === "") return `${pad}<${name} />`;
    return `${pad}<${name}>${xmlEscape(value)}</${name}>`;
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
    return text;
  }

  function csvRow(values) {
    return values.map(csvEscape).join(",");
  }

  function guid() {
    const cryptoApi = window.crypto || window.msCrypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function formatCreationDate(date) {
    const two = (n) => String(n).padStart(2, "0");
    const three = (n) => String(n).padStart(3, "0");
    return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${String(date.getFullYear()).slice(-2)} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${three(date.getMilliseconds())}`;
  }

  function keyNameFromRecord(value, insertedText = "") {
    const text = String(value ?? "");
    const fallback = String(insertedText ?? "");
    const lookup = text || (fallback.length === 1 ? fallback : "");
    const direct = {
      Backspace: "VK_BACK", Delete: "VK_DELETE", Enter: "VK_RETURN", Tab: "VK_TAB",
      Space: "VK_SPACE", " ": "VK_SPACE", Spacebar: "VK_SPACE",
      ArrowLeft: "VK_LEFT", ArrowRight: "VK_RIGHT", ArrowUp: "VK_UP", ArrowDown: "VK_DOWN",
      Home: "VK_HOME", End: "VK_END", PageUp: "VK_PRIOR", PageDown: "VK_NEXT",
      Escape: "VK_ESCAPE", Esc: "VK_ESCAPE", Insert: "VK_INSERT", Shift: "VK_LSHIFT",
      Control: "VK_LCONTROL", Ctrl: "VK_LCONTROL", Alt: "VK_LMENU", Meta: "VK_LWIN",
      CapsLock: "VK_CAPITAL", Unidentified: "VK_UNDEFINED", Undefined: "VK_UNDEFINED"
    };
    if (direct[lookup]) return direct[lookup];
    if (/^F\d{1,2}$/.test(lookup)) return `VK_${lookup}`;
    if (/^Numpad\d$/.test(lookup)) return `VK_NUMPAD${lookup.slice(-1)}`;
    if (lookup && lookup.length === 1 && /[a-z]/i.test(lookup)) return `VK_${lookup.toUpperCase()}`;
    if (lookup && lookup.length === 1 && /\d/.test(lookup)) return `VK_${lookup}`;

    const byCode = {
      Digit0: "VK_0", Digit1: "VK_1", Digit2: "VK_2", Digit3: "VK_3", Digit4: "VK_4",
      Digit5: "VK_5", Digit6: "VK_6", Digit7: "VK_7", Digit8: "VK_8", Digit9: "VK_9",
      Minus: "VK_OEM_MINUS", Equal: "VK_OEM_PLUS", Backquote: "VK_OEM_3",
      BracketLeft: "VK_OEM_4", BracketRight: "VK_OEM_6", Backslash: "VK_OEM_5",
      Semicolon: "VK_OEM_1", Quote: "VK_OEM_7", Comma: "VK_OEM_COMMA",
      Period: "VK_OEM_PERIOD", Slash: "VK_OEM_2", NumpadAdd: "VK_ADD",
      NumpadSubtract: "VK_SUBTRACT", NumpadMultiply: "VK_MULTIPLY", NumpadDivide: "VK_DIVIDE",
      NumpadDecimal: "VK_DECIMAL", NumLock: "VK_NUMLOCK"
    };
    if (byCode[lookup]) return byCode[lookup];

    const byCharacter = {
      "\n": "VK_RETURN", "\t": "VK_TAB", ".": "VK_OEM_PERIOD", ">": "VK_OEM_PERIOD",
      ",": "VK_OEM_COMMA", "<": "VK_OEM_COMMA", "-": "VK_OEM_MINUS", "_": "VK_OEM_MINUS",
      "=": "VK_OEM_PLUS", "+": "VK_OEM_PLUS", "`": "VK_OEM_3", "~": "VK_OEM_3",
      "[": "VK_OEM_4", "{": "VK_OEM_4", "\\": "VK_OEM_5", "|": "VK_OEM_5",
      "]": "VK_OEM_6", "}": "VK_OEM_6", ";": "VK_OEM_1", ":": "VK_OEM_1",
      "'": "VK_OEM_7", "\"": "VK_OEM_7", "/": "VK_OEM_2", "?": "VK_OEM_2",
      "å": "VK_OEM_4", "Å": "VK_OEM_4", "ä": "VK_OEM_7", "Ä": "VK_OEM_7",
      "ö": "VK_OEM_1", "Ö": "VK_OEM_1"
    };
    if (byCharacter[lookup]) return byCharacter[lookup];

    const shiftedDigits = { "!": "VK_1", "@": "VK_2", "#": "VK_3", "$": "VK_4", "%": "VK_5", "^": "VK_6", "&": "VK_7", "*": "VK_8", "(": "VK_9", ")": "VK_0" };
    if (shiftedDigits[lookup]) return shiftedDigits[lookup];
    return lookup || fallback ? "VK_PACKET" : "VK_UNDEFINED";
  }

  function keyValueFromRecord(value) {
    if (value === "Backspace") return "\\b";
    if (value === "Enter") return "\n";
    if (value === "Tab") return "\t";
    if (value === "Space") return " ";
    return value && value.length === 1 ? value : "";
  }

  function sortedEntries(recordObject) {
    return Object.keys(recordObject || {})
      .map((key) => ({ ts: Number(key), value: recordObject[key] }))
      .filter((entry) => Number.isFinite(entry.ts))
      .sort((a, b) => a.ts - b.ts);
  }

  function diffSpan(previousText, currentText) {
    let prefixLength = 0;
    const maxPrefix = Math.min(previousText.length, currentText.length);
    while (prefixLength < maxPrefix && previousText[prefixLength] === currentText[prefixLength]) prefixLength += 1;
    let suffixLength = 0;
    while (
      suffixLength < previousText.length - prefixLength &&
      suffixLength < currentText.length - prefixLength &&
      previousText[previousText.length - 1 - suffixLength] === currentText[currentText.length - 1 - suffixLength]
    ) suffixLength += 1;
    return {
      prefixLength,
      totalLength: currentText.length,
      removed: previousText.slice(prefixLength, previousText.length - suffixLength),
      inserted: currentText.slice(prefixLength, currentText.length - suffixLength)
    };
  }

  function buildRows(records) {
    const textEntries = sortedEntries(records.text_records || {});
    const keyEntries = sortedEntries(records.key_records || {});
    const startTime = Number(records.header_records?.starttime);
    const keydowns = keyEntries.filter((entry) => String(entry.value || "").startsWith("keydown: "));
    const keyups = keyEntries.filter((entry) => String(entry.value || "").startsWith("keyup: "));
    const rows = [];
    let previousText = "";
    let keydownIndex = 0;
    let keyupIndex = 0;
    for (let i = 0; i < textEntries.length; i++) {
      const entry = textEntries[i];
      const currentText = String(entry.value ?? "");
      const priorText = previousText;
      const span = diffSpan(previousText, currentText);
      while (keydownIndex < keydowns.length && keydowns[keydownIndex].ts <= entry.ts) keydownIndex += 1;
      const precedingKeydown = keydownIndex > 0 ? keydowns[keydownIndex - 1] : null;
      while (keyupIndex < keyups.length && keyups[keyupIndex].ts < entry.ts) keyupIndex += 1;
      const followingKeyup = keyupIndex < keyups.length ? keyups[keyupIndex] : null;
      const seconds = (ts) => Number.isFinite(ts) && Number.isFinite(startTime) ? ((ts - startTime) / 1000).toFixed(3) : "";
      rows.push({
        id: i + 1,
        prefixLength: span.prefixLength,
        totalLength: currentText.length,
        keydownTime: seconds(precedingKeydown?.ts),
        keyupTime: seconds(followingKeyup?.ts),
        keydownValue: precedingKeydown ? String(precedingKeydown.value || "").slice("keydown: ".length) : "",
        keyupValue: followingKeyup ? String(followingKeyup.value || "").slice("keyup: ".length) : "",
        timestamp: entry.ts || Number(records.header_records?.starttime) || 0,
        previousText: priorText,
        currentText,
        removed: span.removed,
        inserted: span.inserted
      });
      previousText = currentText;
    }
    return rows;
  }

  function rowToEvent(row) {
    const keydown = Number.parseFloat(row.keydownTime);
    const keyup = Number.parseFloat(row.keyupTime);
    const keydownMs = Number.isFinite(keydown) ? Math.round(keydown * 1000) : 0;
    const keyupMs = Number.isFinite(keyup) ? Math.round(keyup * 1000) : keydownMs;
    const keyValue = row.keydownValue || row.keyupValue || "";
    const removed = row.removed || "";
    const inserted = row.inserted || "";
    const hadSelectionLikeChange = removed.length > 0 && inserted.length > 0;
    const key = keyNameFromRecord(keyValue, inserted);
    const value = inserted || keyValueFromRecord(keyValue);
    const isBackspace = key === "VK_BACK";
    return {
      id: row.id,
      type: "keyboard",
      position: isBackspace && removed ? row.prefixLength + removed.length : row.prefixLength,
      documentLength: isBackspace && removed ? row.totalLength + removed.length : row.totalLength,
      replay: inserted !== "" && !removed && !hadSelectionLikeChange,
      startTime: keydownMs,
      endTime: keyupMs,
      key,
      value,
      keydownValue: row.keydownValue,
      keyupValue: row.keyupValue,
      removed,
      inserted,
      totalLength: row.totalLength
    };
  }

  function rowsToEvents(rows) {
    const events = [];
    rows.forEach((row) => {
      const keyEvent = rowToEvent(row);
      events.push(keyEvent);
      if (row.removed) {
        events.push({ type: "replacement", start: row.prefixLength, end: row.prefixLength + row.removed.length, newText: row.inserted || "" });
        events.push({ type: "selection", start: row.prefixLength + (row.inserted || "").length, end: row.prefixLength + (row.inserted || "").length });
      }
    });
    return events;
  }

  function focusEventsFromRecords(records) {
    const startTime = Number(records.header_records?.starttime) || 0;
    return sortedEntries(records.key_records || {})
      .filter((entry) => String(entry.value || "").startsWith("focus: "))
      .map((entry) => ({ type: "focus", title: String(entry.value || "").slice("focus: ".length), startTime: Math.max(0, entry.ts - startTime), endTime: Math.max(0, entry.ts - startTime) }));
  }

  function textStats(value) {
    return {
      charexclspaces: value.replace(/\s/g, "").length,
      charinclspaces: value.length,
      fareastcharcount: 0,
      linecount: value.length === 0 ? 0 : value.split(/\n/).length,
      pagecount: value.length > 0 ? 1 : 0,
      paragraphcount: value.length === 0 ? 0 : value.split(/\n+/).filter(Boolean).length || 1,
      wordcount: (value.trim().match(/\S+/g) || []).length
    };
  }

  function serializeStatistics(stats, id, startStats = {}) {
    return [
      `  <event type="statistics" id="${id}">`,
      "    <part type=\"wordlog\">",
      `      <charexclspaces>${stats.charexclspaces || 0}</charexclspaces>`,
      `      <charinclspaces>${stats.charinclspaces || 0}</charinclspaces>`,
      `      <fareastcharcount>${stats.fareastcharcount || 0}</fareastcharcount>`,
      `      <linecount>${stats.linecount || 0}</linecount>`,
      `      <pagecount>${stats.pagecount || 0}</pagecount>`,
      `      <paragraphcount>${stats.paragraphcount || 0}</paragraphcount>`,
      `      <wordcount>${stats.wordcount || 0}</wordcount>`,
      `      <stcharexclspaces>${startStats.stcharexclspaces || 0}</stcharexclspaces>`,
      `      <stcharinclspaces>${startStats.stcharinclspaces || 0}</stcharinclspaces>`,
      `      <fareastcharcount>${startStats.stfareastcharcount || 0}</fareastcharcount>`,
      `      <stlinecount>${startStats.stlinecount || 0}</stlinecount>`,
      `      <stpagecount>${startStats.stpagecount || 0}</stpagecount>`,
      `      <stparagraphcount>${startStats.stparagraphcount || 0}</stparagraphcount>`,
      `      <stwordcount>${startStats.stwordcount || 0}</stwordcount>`,
      "    </part>",
      "  </event>"
    ].join("\n");
  }

  function serializeEvent(event, id) {
    if (event.type === "keyboard") {
      return [
        `  <event type="keyboard" id="${id}">`,
        "    <part type=\"wordlog\">",
        `      <position>${event.position}</position>`,
        `      <documentLength>${event.documentLength}</documentLength>`,
        `      <replay>${event.replay ? "True" : "False"}</replay>`,
        "    </part>",
        "    <part type=\"winlog\">",
        `      <startTime>${event.startTime}</startTime>`,
        `      <endTime>${event.endTime}</endTime>`,
        `      <key>${event.key}</key>`,
        xmlElement("value", event.value, 6),
        "      <keyboardstate />",
        "    </part>",
        "  </event>"
      ].join("\n");
    }
    if (event.type === "replacement") {
      return [`  <event type="replacement" id="${id}">`, "    <part type=\"wordlog\">", `      <start>${event.start}</start>`, `      <end>${event.end}</end>`, xmlElement("newtext", event.newText, 6), "    </part>", "  </event>"].join("\n");
    }
    if (event.type === "selection") {
      return [`  <event type="selection" id="${id}">`, "    <part type=\"wordlog\">", `      <start>${event.start}</start>`, `      <end>${event.end}</end>`, "    </part>", "  </event>"].join("\n");
    }
    if (event.type === "insert") {
      return [`  <event type="insert" id="${id}">`, "    <part type=\"wordlog\">", `      <position>${event.position}</position>`, xmlElement("before", event.before, 6), xmlElement("after", event.after, 6), "    </part>", "  </event>"].join("\n");
    }
    if (event.type === "focus") {
      return [`  <event type="focus" id="${id}">`, "    <part type=\"winlog\">", xmlElement("title", event.title, 6), `      <startTime>${event.startTime}</startTime>`, `      <endTime>${event.endTime}</endTime>`, "    </part>", "  </event>"].join("\n");
    }
    if (event.type === "statistics") return serializeStatistics(event.stats || {}, id, event.startStats || {});
    return "";
  }

  function finalTextFromRecords(records) {
    const textEntries = sortedEntries(records.text_records || {});
    return String(textEntries[textEntries.length - 1]?.value ?? "");
  }

  function extractSixCharacterCodeFromIdentifier(identifier) {
    const text = String(identifier || "");
    const hyphenIndex = text.indexOf("-");
    if (hyphenIndex < 0 || text.length < hyphenIndex + 7) return "";
    return text.slice(hyphenIndex + 1, hyphenIndex + 7);
  }

  function participantFromRecords(records = {}, options = {}) {
    const header = records.header_records || {};
    const sourceIdentifier = options.indexedDBKey ||
      options.storageKey ||
      header._indexeddb_key ||
      header.indexeddb_key ||
      header.storage_key ||
      header.filename ||
      "";
    return options.participantCode ||
      extractSixCharacterCodeFromIdentifier(sourceIdentifier) ||
      header.usercode ||
      header.filename ||
      "";
  }

  function buildIdfx(events, finalText, records = {}, options = {}) {
    const startEpoch = Number(records.header_records?.starttime) || Date.now();
    const created = new Date(startEpoch);
    const metadata = {
      Participant: participantFromRecords(records, options),
      "Text Language": "Unknown",
      Age: "Unknown",
      Gender: "Unknown",
      Session: "1",
      Group: "Unknown",
      Experience: "Unknown",
      ...(options.metadata || {})
    };
    const sessionEntries = Object.entries(metadata).map(([key, value]) => ["    <entry>", `      <key>${xmlEscape(key)}</key>`, xmlElement("value", String(value ?? "").trim(), 6), "    </entry>"].join("\n"));
    const lines = [
      "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
      "<log>",
      "  <meta>",
      "    <entry>", "      <key>__LogProgramVersion</key>", `      <value>${VERSION}</value>`, "    </entry>",
      "    <entry>", "      <key>__MainDocument</key>", `      <value>${xmlEscape(options.mainDocument || MAIN_DOCUMENT)}</value>`, "    </entry>",
      "    <entry>", "      <key>__LogCreationDate</key>", `      <value>${formatCreationDate(created)}</value>`, "    </entry>",
      "    <entry>", "      <key>__LogCreationTimeStamp</key>", `      <value>${startEpoch}</value>`, "    </entry>",
      "    <entry>", "      <key>__GUID</key>", `      <value>${records.header_records?.guid || guid()}</value>`, "    </entry>",
      "    <entry>", "      <key>__LogRelativeCreationDate</key>", "      <value>0</value>", "    </entry>",
      "  </meta>",
      "  <session>",
      ...sessionEntries,
      "    <entry>", "      <key>Restricted Logging</key>", "      <value />", "    </entry>",
      "  </session>"
    ];
    lines.push(serializeEvent({ type: "focus", title: "WordLog MainDoc", startTime: 0, endTime: 0 }, 0));
    events.forEach((event, index) => lines.push(serializeEvent(event, index + 1)));
    if (options.includeFooter !== false) lines.push(serializeStatistics(textStats(finalText), events.length + 1));
    lines.push("</log>");
    return lines.join("\n");
  }

  function recordsToEvents(records) {
    const rows = buildRows(records || {});
    return rowsToEvents(rows).concat(focusEventsFromRecords(records || {}));
  }

  function recordsToIDFX(records, options = {}) {
    const source = records || {};
    const rows = buildRows(source);
    const events = rowsToEvents(rows).concat(focusEventsFromRecords(source));
    const finalText = rows.length ? String(rows[rows.length - 1].currentText ?? "") : finalTextFromRecords(source);
    return buildIdfx(events, finalText, source, options);
  }

  function eventToCsvRow(event, id) {
    const row = { id, type: event.type, startTime: "", endTime: "", position: "", documentLength: "", replay: "", key: "", value: "", keyboardState: "", selectionStart: "", selectionEnd: "", replacementStart: "", replacementEnd: "", newText: "", insertPosition: "", before: "", after: "", mouseType: "", x: "", y: "", button: "", title: "", charexclspaces: "", charinclspaces: "", fareastcharcount: "", linecount: "", pagecount: "", paragraphcount: "", wordcount: "", stcharexclspaces: "", stcharinclspaces: "", stfareastcharcount: "", stlinecount: "", stpagecount: "", stparagraphcount: "", stwordcount: "", inputType: "" };
    if (event.type === "keyboard") Object.assign(row, { startTime: event.startTime, endTime: event.endTime, position: event.position, documentLength: event.documentLength, replay: event.replay ? "True" : "False", key: event.key, value: event.value });
    else if (event.type === "replacement") Object.assign(row, { replacementStart: event.start, replacementEnd: event.end, newText: event.newText });
    else if (event.type === "selection") Object.assign(row, { selectionStart: event.start, selectionEnd: event.end });
    else if (event.type === "insert") Object.assign(row, { insertPosition: event.position, before: event.before, after: event.after });
    else if (event.type === "focus") Object.assign(row, { startTime: event.startTime, endTime: event.endTime, title: event.title });
    else if (event.type === "statistics") Object.assign(row, event.stats || {}, event.startStats || {});
    return row;
  }

  function csvHeaders() {
    return ["id", "type", "startTime", "endTime", "position", "documentLength", "replay", "key", "value", "keyboardState", "selectionStart", "selectionEnd", "replacementStart", "replacementEnd", "newText", "insertPosition", "before", "after", "mouseType", "x", "y", "button", "title", "charexclspaces", "charinclspaces", "fareastcharcount", "linecount", "pagecount", "paragraphcount", "wordcount", "stcharexclspaces", "stcharinclspaces", "stfareastcharcount", "stlinecount", "stpagecount", "stparagraphcount", "stwordcount", "inputType"];
  }

  function compactCsvRow(event, id) {
    if (event.type === "keyboard") return [id, "keyboard", event.position, event.documentLength, event.replay ? "True" : "False", event.startTime, event.endTime, event.key, event.value, ""];
    if (event.type === "replacement") return [id, "replacement", event.start, event.end, event.newText];
    if (event.type === "selection") return [id, "selection", event.start, event.end];
    if (event.type === "insert") return [id, "insert", event.position, event.before, event.after];
    if (event.type === "focus") return [id, "focus", event.title, event.startTime, event.endTime];
    if (event.type === "statistics") return [id, "statistics", event.stats?.charexclspaces ?? 0, event.stats?.charinclspaces ?? 0, event.stats?.fareastcharcount ?? 0, event.stats?.linecount ?? 0, event.stats?.pagecount ?? 0, event.stats?.paragraphcount ?? 0, event.stats?.wordcount ?? 0, event.startStats?.stcharexclspaces ?? 0, event.startStats?.stcharinclspaces ?? 0, event.startStats?.stfareastcharcount ?? 0, event.startStats?.stlinecount ?? 0, event.startStats?.stpagecount ?? 0, event.startStats?.stparagraphcount ?? 0, event.startStats?.stwordcount ?? 0];
    return [id, event.type];
  }

  function eventsToCSV(events, options = {}) {
    if (options.compact) return events.map((event, index) => csvRow(compactCsvRow(event, index))).join("\n");
    const headers = csvHeaders();
    return [csvRow(headers), ...events.map((event, index) => {
      const row = eventToCsvRow(event, index);
      return csvRow(headers.map((header) => row[header]));
    })].join("\n");
  }

  function parseNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function parseBoolean(value) {
    return String(value).toLowerCase() === "true";
  }

  function childText(parent, name) {
    return parent?.querySelector(name)?.textContent || "";
  }

  function childTextAt(parent, name, index) {
    return parent?.querySelectorAll(name)?.[index]?.textContent || "";
  }

  function sanitizeXmlForParsing(xmlText) {
    return String(xmlText || "")
      .replace(/\u00a0/g, " ")
      .replace(/&#(x[0-9a-fA-F]+|\d+);/g, (match, value) => {
        const codePoint = value[0].toLowerCase() === "x" ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10);
        const valid = codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd || (codePoint >= 0x20 && codePoint <= 0xd7ff) || (codePoint >= 0xe000 && codePoint <= 0xfffd) || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
        if (Number.isNaN(codePoint) || valid) return match;
        return codePoint === 0x8 ? "\\b" : "";
      });
  }

  function parseIdfxEvents(xmlText) {
    const doc = new DOMParser().parseFromString(sanitizeXmlForParsing(xmlText), "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("Could not parse IDFX XML.");
    return Array.from(doc.querySelectorAll("event")).map((eventNode) => {
      const type = eventNode.getAttribute("type");
      if (type === "keyboard") {
        const wordlog = eventNode.querySelector('part[type="wordlog"]');
        const winlog = eventNode.querySelector('part[type="winlog"]');
        return { type, position: parseNumber(childText(wordlog, "position")), documentLength: parseNumber(childText(wordlog, "documentLength")), replay: parseBoolean(childText(wordlog, "replay")), startTime: parseNumber(childText(winlog, "startTime")), endTime: parseNumber(childText(winlog, "endTime")), key: childText(winlog, "key"), value: childText(winlog, "value") };
      }
      if (type === "replacement") {
        const wordlog = eventNode.querySelector('part[type="wordlog"]');
        return { type, start: parseNumber(childText(wordlog, "start")), end: parseNumber(childText(wordlog, "end")), newText: childText(wordlog, "newtext") };
      }
      if (type === "selection") {
        const wordlog = eventNode.querySelector('part[type="wordlog"]');
        return { type, start: parseNumber(childText(wordlog, "start")), end: parseNumber(childText(wordlog, "end")) };
      }
      if (type === "insert") {
        const wordlog = eventNode.querySelector('part[type="wordlog"]');
        return { type, position: parseNumber(childText(wordlog, "position")), before: childText(wordlog, "before"), after: childText(wordlog, "after") };
      }
      if (type === "focus") {
        const winlog = eventNode.querySelector('part[type="winlog"]');
        return { type, title: childText(winlog, "title"), startTime: parseNumber(childText(winlog, "startTime")), endTime: parseNumber(childText(winlog, "endTime")) };
      }
      return null;
    }).filter(Boolean);
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (char === '"' && next === '"') { field += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") { row.push(field); field = ""; }
      else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (char !== "\r") field += char;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows.filter((candidate) => candidate.some((value) => value !== ""));
  }

  function parseCompactCsvRows(rows) {
    return rows.map((row) => {
      const type = row[1];
      if (type === "keyboard") return { type, position: parseNumber(row[2]), documentLength: parseNumber(row[3]), replay: parseBoolean(row[4]), startTime: parseNumber(row[5]), endTime: parseNumber(row[6]), key: row[7] || "", value: row[8] || "" };
      if (type === "replacement") return { type, start: parseNumber(row[2]), end: parseNumber(row[3]), newText: row[4] || "" };
      if (type === "selection") return { type, start: parseNumber(row[2]), end: parseNumber(row[3]) };
      if (type === "insert") return { type, position: parseNumber(row[2]), before: row[3] || "", after: row[4] || "" };
      if (type === "focus") return { type, title: row[2] || "", startTime: parseNumber(row[3]), endTime: parseNumber(row[4]) };
      return null;
    }).filter(Boolean);
  }

  function parseEventCsv(text) {
    const rows = parseCsvRows(String(text || ""));
    if (!rows.length) return [];
    const headers = rows[0];
    if (headers[0] !== "id" || headers[1] !== "type") return parseCompactCsvRows(rows);
    return rows.slice(1).map((row) => {
      const values = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
      const type = values.type;
      if (type === "keyboard") return { type, startTime: parseNumber(values.startTime), endTime: parseNumber(values.endTime), position: parseNumber(values.position), documentLength: parseNumber(values.documentLength), replay: parseBoolean(values.replay), key: values.key, value: values.value };
      if (type === "replacement") return { type, start: parseNumber(values.replacementStart), end: parseNumber(values.replacementEnd), newText: values.newText };
      if (type === "selection") return { type, start: parseNumber(values.selectionStart), end: parseNumber(values.selectionEnd) };
      if (type === "insert") return { type, position: parseNumber(values.insertPosition), before: values.before, after: values.after };
      if (type === "focus") return { type, title: values.title, startTime: parseNumber(values.startTime), endTime: parseNumber(values.endTime) };
      return null;
    }).filter(Boolean);
  }

  function idfxToCsv(idfxText, options = {}) {
    return eventsToCSV(parseIdfxEvents(idfxText), options);
  }

  function csvToIdfx(csvText, options = {}) {
    const events = parseEventCsv(csvText);
    return buildIdfx(events, options.finalText || "", options.records || {}, { ...options, includeFooter: options.includeFooter === true });
  }

  window.DiffKeysDirectConverter = {
    VERSION,
    buildRows,
    recordsToEvents,
    recordsToIDFX,
    eventsToCSV,
    idfxToCsv,
    csvToIdfx,
    parseIdfxEvents,
    parseEventCsv
  };
})();
