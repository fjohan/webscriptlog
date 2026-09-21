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

  function getMedian(values) {
    const sorted = values
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function formatMilliseconds(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(0) : "";
  }

  function renderDiffKeysPane(records = null) {
    const target = document.getElementById("diffKeysOutput");
    if (!target) return;

    const source = records || getCurrentRecords();
    const rows = root.WebScriptLogAnalysisCore.buildDiffKeysRows(source);
    if (!rows.length) {
      target.innerHTML = '<div class="diff-keys-empty">No text records available.</div>';
      return;
    }

    const body = rows.map((row) => `
      <tr>
        <td>${row.id}</td>
        <td>${row.prefixLength}</td>
        <td>${row.totalLength}</td>
        <td>${escapeHtml(row.keydownTime)}</td>
        <td>${escapeHtml(row.keyupTime)}</td>
        <td>${escapeHtml(row.keydownValue)}</td>
        <td>${escapeHtml(row.keyupValue)}</td>
        <td>${escapeHtml(row.keyMatch)}</td>
        <td>${escapeHtml(formatMilliseconds(row.lowercaseWordTransitionMs))}</td>
        <td class="diff-keys-text">${escapeHtml(row.changedText)}</td>
      </tr>
    `).join("");

    const lowercaseWordTransitions = rows
      .filter((row) => row.lowercaseWordTransition)
      .map((row) => row.lowercaseWordTransitionMs)
      .filter(Number.isFinite);
    const medianLowercaseWordTransition = getMedian(lowercaseWordTransitions);
    const transitionStats = `
      <div class="diff-keys-stats">
        <strong>Lowercase in-word transitions:</strong>
        n=${lowercaseWordTransitions.length};
        median=${medianLowercaseWordTransition == null ? "n/a" : `${formatMilliseconds(medianLowercaseWordTransition)} ms`}
      </div>
    `;

    target.innerHTML = `
      <table class="diff-keys-table">
        <thead>
          <tr>
            <th>id</th>
            <th>prefix length</th>
            <th>text length</th>
            <th>keydown time</th>
            <th>keyup time</th>
            <th>keydown value</th>
            <th>keyup value</th>
            <th>key match</th>
            <th>lc word transition ms</th>
            <th>text changed</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      ${transitionStats}
    `;
  }

  root.renderDiffKeysPane = renderDiffKeysPane;
})(typeof globalThis !== "undefined" ? globalThis : window);
