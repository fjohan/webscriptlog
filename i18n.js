/* -----------------------
   i18n core
   ----------------------- */
const I18N = {
  sv: {
    "ui.language": "Språk:",
    "ui.layout": "Layout:",
    "ui.layoutModern": "Modern",
    "ui.layoutClassic": "Klassisk (lab)",
    "ui.layoutGrid": "Grid",
    "tab.RECORD": "INSPELNING",
    "tab.MOBILE_NOTES": "MOBILANTECKNINGAR",
    "tab.REPLAY": "UPPSPELNING",
    "tab.ANALYZE": "ANALYS",
    "tab.SETTINGS": "INSTÄLLNINGAR",

    "btn.START": "START",
    "btn.STOP": "STOPP",
    "btn.IMAGE": "IMAGE",
    "btn.EMULATE": "EMULERA",
    "btn.LINEAR_TO_LOG": "LINJAR TILL LOGG",
    "btn.REPLAY": "SPELA UPP",
    "btn.FAST_FORWARD": "SNABBSPOLA",
    "btn.PAUSE": "PAUS",
    "btn.RESUME": "FORTSÄTT",
    "btn.EDIT_BACK": "EDIT BAKÅT",
    "btn.EDIT_FORWARD": "EDIT FRAMÅT",
    "btn.GO_TO_END": "TILL SLUT",
    "btn.FETCH": "HÄMTA",
    "btn.FETCH_PLUS": "HÄMTA+",
    "btn.FETCH_TO_ZIP": "HÄMTA TILL ZIP",
    "btn.FETCH_FT_TO_ZIP": "HÄMTA SLUTTEXTER TILL ZIP",
    "btn.FETCH_STATS_TO_ZIP": "HÄMTA STATISTIK TILL ZIP",
    "btn.FETCH_STATS_TO_XLSX": "HÄMTA STATISTIK TILL XLSX",
    "btn.FETCH_IDFX_TO_ZIP": "HÄMTA IDFX TILL ZIP",
    "btn.FETCH_WRITING_SCORE_TO_ZIP": "HÄMTA SKRIVSCORE TILL ZIP",
    "btn.LOAD_MAKE_RT": "LADDA + SKAPA RT",
    "btn.LOAD_GRID": "LADDA PANELER",
    "btn.CLEAR": "RENSA",
    "btn.CLEAR_ALL": "RENSA ALLT",
    "btn.DOWNLOAD": "LADDA NER",
    "btn.DOWNLOAD_FINAL_TEXT": "LADDA NER SLUTTEXT",
    "btn.INSPECT": "INSPEKTERA",
    "btn.WRITING_SCORE": "SKRIVSCORE",
    "btn.FT_ANALYSIS": "FT ANALYS",

    "label.code": "Kod:",
    "label.codeHelp": "(6 bokstäver eller siffror):",
    "label.emulateEdits": "Emulerade redigeringar (0-5):",
    "label.linearRep": "Linjär representation:",
    "label.inspectIntervals": "Intervall:",
    "label.inspectBasis": "Tidsbas:",
    "label.indexeddb": "IndexedDB",
    "label.pauseCriteria": "Pausgräns (s):",
    "label.start": "S",
    "label.end": "R",
    "label.selectFile": "Välj en webscriptlog-fil",
    "opt.inspectBasisRecording": "Inspelningstid",
    "opt.inspectBasisTyping": "Skrivtid",

    "msg.sid.noid": "-ID- Inget id! Data sparas lokalt.",
    "msg.sid.withid": "-ID- Ditt id är: {sid}",
    "msg.saveMessage": "Sparat lokalt som {lsString} .\n",
    "msg.fromPhp": "Sparat på server.",

    "ph.recorder": "OBS! SKRIV DIN KOD ÖVERST! TACK!\n\nSkriv sedan din text här.",
    "ph.linearRep": "Skriv en enkel linjär representation här, t.ex. 123445<DEL2>5. bcde<LEFT4>A",

    "heading.ftAnalysis": "Final text-analys",
    "heading.infoWindow": "Infofönster",
    "heading.linData": "LIN-data",
    "heading.progressGraph": "Processgraf",
    "heading.revisionTable": "Revideringstabell",
    "heading.settings": "Inställningar",

    "th.rowNumber": "Radnummer",
    "th.localDiff": "Lokal diff",
    "th.classification": "Klassificering",
    "th.location": "Plats",
    "th.newGroup": "Ny grupp",
    "th.groupDiff": "Gruppdiff",
    "th.timeSeconds": "Tid (s)",

    "hint.dblclick": "Dubbelklick"
  },

  en: {
    "ui.language": "Language:",
    "ui.layout": "Layout:",
    "ui.layoutModern": "Modern",
    "ui.layoutClassic": "Classic (lab)",
    "ui.layoutGrid": "Grid",
    "tab.RECORD": "RECORDING",
    "tab.MOBILE_NOTES": "MOBILE NOTES",
    "tab.REPLAY": "PLAYBACK",
    "tab.ANALYZE": "ANALYSIS",
    "tab.SETTINGS": "SETTINGS",

    "btn.START": "START",
    "btn.STOP": "STOP",
    "btn.IMAGE": "IMAGE",
    "btn.EMULATE": "EMULATE",
    "btn.LINEAR_TO_LOG": "LINEAR TO LOG",
    "btn.REPLAY": "REPLAY",
    "btn.FAST_FORWARD": "FAST FORWARD",
    "btn.PAUSE": "PAUSE",
    "btn.RESUME": "RESUME",
    "btn.EDIT_BACK": "EDIT BACK",
    "btn.EDIT_FORWARD": "EDIT FORWARD",
    "btn.GO_TO_END": "GO TO END",
    "btn.FETCH": "FETCH",
    "btn.FETCH_PLUS": "FETCH+",
    "btn.FETCH_TO_ZIP": "FETCH TO ZIP",
    "btn.FETCH_FT_TO_ZIP": "FETCH FINAL TEXTS TO ZIP",
    "btn.FETCH_STATS_TO_ZIP": "FETCH STATS TO ZIP",
    "btn.FETCH_STATS_TO_XLSX": "FETCH STATS TO XLSX",
    "btn.FETCH_IDFX_TO_ZIP": "FETCH IDFX TO ZIP",
    "btn.FETCH_WRITING_SCORE_TO_ZIP": "FETCH WRITING SCORE TO ZIP",
    "btn.LOAD_MAKE_RT": "LOAD + MAKE RT",
    "btn.LOAD_GRID": "LOAD PANES",
    "btn.CLEAR": "CLEAR",
    "btn.CLEAR_ALL": "CLEAR ALL",
    "btn.DOWNLOAD": "DOWNLOAD",
    "btn.DOWNLOAD_FINAL_TEXT": "DOWNLOAD FINAL TEXT",
    "btn.INSPECT": "INSPECT",
    "btn.WRITING_SCORE": "WRITING SCORE",
    "btn.FT_ANALYSIS": "FT ANALYSIS",

    "label.code": "Code:",
    "label.codeHelp": "(6 letters or digits):",
    "label.emulateEdits": "Emulated edits (0-5):",
    "label.linearRep": "Linear representation:",
    "label.inspectIntervals": "Intervals:",
    "label.inspectBasis": "Time basis:",
    "label.indexeddb": "IndexedDB",
    "label.pauseCriteria": "Pause threshold (s):",
    "label.start": "S",
    "label.end": "R",
    "label.selectFile": "Select a webscriptlog-file",
    "opt.inspectBasisRecording": "Recording time",
    "opt.inspectBasisTyping": "Typing time",

    "msg.sid.noid": "-ID- No id! Data will be saved locally.",
    "msg.sid.withid": "-ID- Your id is: {sid}",
    "msg.saveMessage": "Saved locally as {lsString} .\n",
    "msg.fromPhp": "Saved on server.",

    "ph.recorder": "NOTE! WRITE YOUR CODE AT THE TOP! THANKS!\n\nThen write your text here.",
    "ph.linearRep": "Enter a simple linear representation here, e.g. 123445<DEL2>5. bcde<LEFT4>A",

    "heading.ftAnalysis": "Final text-analysis",
    "heading.infoWindow": "Info window",
    "heading.linData": "LIN data",
    "heading.progressGraph": "Process graph",
    "heading.revisionTable": "Revision table",
    "heading.settings": "Settings",

    "th.rowNumber": "Row Number",
    "th.localDiff": "Local Diff",
    "th.classification": "Classification",
    "th.location": "Location",
    "th.newGroup": "New Group",
    "th.groupDiff": "Group Diff",
    "th.timeSeconds": "Time (s)",

    "hint.dblclick": "Double-click"
  }
};

let LANG = localStorage.getItem("lang") || "sv";

function t(key, params) {
  const dict = I18N[LANG] || I18N.sv;
  let s = dict[key] ?? I18N.sv[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });

  root.querySelectorAll("[data-i18n-attr]").forEach(el => {
    // "placeholder:key1;title:key2"
    const spec = el.getAttribute("data-i18n-attr").split(";");
    spec.forEach(pair => {
      const [attr, key] = pair.split(":").map(s => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}
