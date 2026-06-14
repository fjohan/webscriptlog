(function (root) {
  "use strict";

  function toFiniteNumber(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function toTimestamp(value, fallback = null) {
    return toFiniteNumber(value, fallback);
  }

  function toRecordId(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function sortedEntries(recordObject) {
    return Object.keys(recordObject || {})
      .map((key) => ({ ts: Number(key), key, value: recordObject[key] }))
      .filter((entry) => Number.isFinite(entry.ts))
      .sort((a, b) => a.ts - b.ts)
      .map((entry) => ({
        ts: entry.ts,
        key: String(entry.key),
        value: recordObject[String(entry.ts)] ?? recordObject[entry.key] ?? entry.value
      }));
  }

  function normalizeRecords(data) {
    return {
      header_records: data?.header_records || {},
      text_records: data?.text_records || {},
      cursor_records: data?.cursor_records || {},
      key_records: data?.key_records || {},
      scroll_records: data?.scroll_records || {},
      image_records: data?.image_records || {},
      window_records: data?.window_records || data?.pdf_records || {}
    };
  }

  function getFinalTextEntry(recordsOrTextRecords) {
    const textRecords = recordsOrTextRecords?.text_records || recordsOrTextRecords || {};
    const entries = sortedEntries(textRecords);
    return entries.length ? entries[entries.length - 1] : null;
  }

  function getFinalText(recordsOrTextRecords, fallback = "") {
    const entry = getFinalTextEntry(recordsOrTextRecords);
    return entry ? String(entry.value ?? "") : fallback;
  }

  function getStartTime(records, fallback = null) {
    return toFiniteNumber(records?.header_records?.starttime, fallback);
  }

  function getEndTime(records, fallback = null) {
    return toFiniteNumber(records?.header_records?.endtime, fallback);
  }

  const api = {
    normalizeRecords,
    sortedEntries,
    getFinalTextEntry,
    getFinalText,
    toFiniteNumber,
    toTimestamp,
    toRecordId,
    getStartTime,
    getEndTime
  };

  root.WebScriptLogRecordUtils = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
