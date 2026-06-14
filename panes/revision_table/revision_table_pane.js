(function(root) {
  "use strict";

  function getCurrentRecords() {
    if (typeof root.getCurrentWebScriptLogRecords === "function") return root.getCurrentWebScriptLogRecords();
    return {
      header_records: root.header_record || {},
      text_records: root.text_record || {}
    };
  }

  function getDiffEngine() {
    if (root.myDmp) return root.myDmp;
    if (typeof root.diff_match_patch === "function") return new root.diff_match_patch();
    return null;
  }

  function diffPrettyHtmlShort(diffs, context) {
    const html = [];
    const patternAmp = /&/g;
    const patternLt = /</g;
    const patternGt = />/g;
    const patternPara = /\n/g;
    const diffInsert = Number.isFinite(Number(root.DIFF_INSERT)) ? Number(root.DIFF_INSERT) : 1;
    const diffDelete = Number.isFinite(Number(root.DIFF_DELETE)) ? Number(root.DIFF_DELETE) : -1;
    const diffEqual = Number.isFinite(Number(root.DIFF_EQUAL)) ? Number(root.DIFF_EQUAL) : 0;

    for (let x = 0; x < diffs.length; x++) {
      const op = diffs[x][0];
      const data = diffs[x][1];
      const text = String(data || "")
        .replace(patternAmp, "&amp;")
        .replace(patternLt, "&lt;")
        .replace(patternGt, "&gt;")
        .replace(patternPara, "&para;<br>");
      switch (op) {
        case diffInsert:
          html[x] = '<ins style="background:#e6ffe6;">' + text + "</ins>";
          break;
        case diffDelete:
          html[x] = '<del style="background:#ffe6e6;">' + text + "</del>";
          break;
        case diffEqual:
          if (x === 0) {
            html[x] = "<span>" + text.substring(text.length - context) + "</span>";
          } else {
            html[x] = "<span>" + text.substring(0, context) + "</span>";
          }
          break;
      }
    }
    return html.join("");
  }

  function classifyDiff(diff) {
    let hasInsertion = false;
    let hasDeletion = false;

    for (const d of diff) {
      if (d[0] === 1) {
        hasInsertion = true;
      } else if (d[0] === -1) {
        hasDeletion = true;
      }
    }

    if (hasInsertion && hasDeletion) return "REPLACE";
    if (hasInsertion) return "INSERT";
    if (hasDeletion) return "DELETE";
    return "NOCHANGE";
  }

  function calculateLocation(diff, classification) {
    let start = -1;
    let end = -1;

    if (classification === "INSERT" || classification === "DELETE") {
      if (diff.length === 1) {
        start = 0;
        end = diff[0][1].length;
      } else {
        start = diff[0][1].length;
        end = start + diff[1][1].length;
      }
    } else if (classification === "REPLACE") {
      if (diff.length === 2) {
        start = 0;
        end = diff[0][1].length;
      } else {
        start = diff[0][1].length;
        end = start + diff[2][1].length;
      }
    }

    return { start, end };
  }

  function checkNewGroup(classification, location, state) {
    const isNewClassification = classification !== state.prevClassification;

    let isNewLocation = false;
    if (classification === "INSERT") {
      isNewLocation = location.start !== state.prevEndLocation;
    }
    if (classification === "REPLACE") {
      isNewLocation = location.start !== state.prevEndLocation;
    }
    if (classification === "DELETE") {
      isNewLocation = location.end !== state.prevStartLocation;
    }

    const isNewGroup = isNewClassification || isNewLocation;

    state.prevClassification = classification;
    state.prevStartLocation = location.start;
    state.prevEndLocation = location.end;

    return isNewGroup;
  }

  function computeSecondDiff(dmp, currentText, groupStartText) {
    const secondDiff = dmp.diff_main(groupStartText, currentText);
    dmp.diff_cleanupSemantic(secondDiff);
    return diffPrettyHtmlShort(secondDiff, 20);
  }

  function makeRevisionTable(records = null) {
    const table = document.getElementById("sentenceDiffTable");
    const sentenceDiffTable = table?.getElementsByTagName("tbody")?.[0];
    if (!sentenceDiffTable) return;

    const source = records || getCurrentRecords();
    const headerRecords = source.header_records || {};
    const textRecords = { "0": "", ...(source.text_records || {}) };
    const dmp = getDiffEngine();
    if (!dmp) return;

    sentenceDiffTable.innerHTML = "";
    const recordKeys = Object.keys(textRecords).sort((a, b) => Number(a) - Number(b));
    const state = {
      prevClassification: "",
      prevStartLocation: -1,
      prevEndLocation: -1
    };
    let groupStartText = "";
    let groupStartTime = Number(recordKeys[1]) || 0;
    let previousRow = null;

    for (let i = 1; i < recordKeys.length; i++) {
      const previousText = textRecords[recordKeys[i - 1]];
      const currentText = textRecords[recordKeys[i]];

      const diff = dmp.diff_main(previousText, currentText);
      dmp.diff_cleanupSemantic(diff);

      const prettyHtml = diffPrettyHtmlShort(diff, 20);
      const classification = classifyDiff(diff);
      const location = calculateLocation(diff, classification);
      const isNewGroup = checkNewGroup(classification, location, state);

      if (isNewGroup) {
        groupStartText = textRecords[recordKeys[i - 1]];
      }
      const secondDiff = computeSecondDiff(dmp, currentText, groupStartText);

      if (isNewGroup) {
        groupStartTime = Number(recordKeys[i]) || 0;
        if (previousRow) previousRow.className = "last-in-group";
      }

      const row = sentenceDiffTable.insertRow();
      const cell1 = row.insertCell(0);
      const cell2 = row.insertCell(1);
      const cell3 = row.insertCell(2);
      const cell4 = row.insertCell(3);
      const cell5 = row.insertCell(4);
      const cell6 = row.insertCell(5);
      const cell7 = row.insertCell(6);

      cell1.textContent = i;
      cell2.innerHTML = prettyHtml;
      cell3.textContent = classification;
      cell3.className = classification.toLowerCase();
      cell4.textContent = location.start + "-" + location.end;
      cell5.textContent = isNewGroup ? "Yes" : "No";
      cell5.className = isNewGroup ? "new-group" : "";
      cell6.innerHTML = secondDiff;
      cell7.textContent = (groupStartTime - Number(headerRecords.starttime || 0)) / 1000.0;
      cell7.id = groupStartTime;

      previousRow = row;
    }
    if (previousRow) previousRow.className = "last-in-group";

    const rows = sentenceDiffTable.getElementsByTagName("tr");
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].classList.contains("last-in-group")) {
        rows[i].style.display = "none";
      }
    }

    const playFromRows = sentenceDiffTable.getElementsByClassName("last-in-group");
    for (let i = 0; i < playFromRows.length; i++) {
      if (typeof root.playFromRow === "function") {
        playFromRows[i].addEventListener("click", root.playFromRow, false);
      }
    }
  }

  root.makeRevisionTable = makeRevisionTable;
  root.diff_prettyHtml_short = root.diff_prettyHtml_short || diffPrettyHtmlShort;
  root.classifyDiff = root.classifyDiff || classifyDiff;
  root.calculateLocation = root.calculateLocation || calculateLocation;
})(typeof globalThis !== "undefined" ? globalThis : window);
