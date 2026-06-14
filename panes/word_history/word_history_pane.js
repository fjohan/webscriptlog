(function (root) {
  "use strict";

  function escapeHtml(value) {
    if (typeof root.escapeDiffKeysHtml === "function") return root.escapeDiffKeysHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getCurrentRecords() {
    if (typeof root.getCurrentWebScriptLogRecords === "function") return root.getCurrentWebScriptLogRecords();
    return {
      header_records: root.header_record || {},
      text_records: root.text_record || {},
      key_records: root.key_record || {}
    };
  }

  function renderWordHistoryPane(records = null) {
    const target = document.getElementById("wordHistoryOutput");
    if (!target) return;

    const source = records || getCurrentRecords();
    const rows = root.WebScriptLogAnalysisCore.buildWordBoundaryTiming(source);
    if (!rows.length) {
      target.innerHTML = '<div class="word-history-empty">No final words available.</div>';
      return;
    }

    const body = rows.map((row) => `
      <tr>
        <td>${row.index}</td>
        <td class="word-history-word">${escapeHtml(row.word)}</td>
        <td>${row.wordPurity}</td>
        <td>${escapeHtml(row.wordInitialTimeSincePrev)}</td>
        <td>${escapeHtml(row.wordInitialTextDataIndexPair)}</td>
        <td>${escapeHtml(row.wordInitialBoundaryTiming)}</td>
        <td>${escapeHtml(row.wordInitialEdgeProvenance)}</td>
        <td>${escapeHtml(row.wordFinalTimeUntilNext)}</td>
        <td>${escapeHtml(row.wordFinalTextDataIndexPair)}</td>
        <td>${escapeHtml(row.wordFinalBoundaryTiming)}</td>
        <td>${escapeHtml(row.wordFinalEdgeProvenance)}</td>
      </tr>
    `).join("");

    target.innerHTML = `
      <table class="word-history-table">
        <thead>
          <tr>
            <th>#</th>
            <th>word</th>
            <th>purity</th>
            <th>initial timeSincePrev</th>
            <th>initial ids</th>
            <th>initial timing</th>
            <th>initial provenance</th>
            <th>final timeUntilNext</th>
            <th>final ids</th>
            <th>final timing</th>
            <th>final provenance</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  root.renderWordHistoryPane = renderWordHistoryPane;
})(typeof globalThis !== "undefined" ? globalThis : window);
