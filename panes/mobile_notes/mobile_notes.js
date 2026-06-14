(function(root) {
  'use strict';

  const mobileNotesState = {
    initialized: false,
    sessionId: '',
    starttime: 0,
    lastTs: 0,
    nextNoteNumber: 1,
    activeNoteId: null,
    notes: [],
    switch_records: {}
  };

  function mobileNotesEscape(value) {
    if (typeof root.escapeDiffKeysHtml === 'function') return root.escapeDiffKeysHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mobileNotesMainCodeValue() {
    if (root.i_code?.value) return root.i_code.value;
    const code = document.getElementById('userCode');
    return code?.value || '';
  }

  function mobileNotesNow() {
    const now = Date.now();
    mobileNotesState.lastTs = Math.max(now, mobileNotesState.lastTs + 1);
    return mobileNotesState.lastTs;
  }

  function mobileNotesEnsureSession() {
    if (mobileNotesState.sessionId) return;
    const ts = mobileNotesNow();
    mobileNotesState.starttime = ts;
    mobileNotesState.sessionId = `mobile-${ts}`;
  }

  function mobileNotesGetCode() {
    const own = String(document.getElementById('mobileNotesCode')?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const main = String(mobileNotesMainCodeValue()).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (own || main || 'MOBILE').slice(0, 6).padEnd(6, '0');
  }

  function mobileNotesCreateRecords(note, ts) {
    return {
      header_records: {
        starttime: ts,
        endtime: ts,
        mobile_note_id: note.id,
        mobile_note_title: note.title,
        mobile_session_id: mobileNotesState.sessionId
      },
      text_records: {},
      cursor_records: {},
      key_records: {},
      scroll_records: {},
      image_records: {},
      window_records: {}
    };
  }

  function mobileNotesCreateNote() {
    mobileNotesEnsureSession();
    const ts = mobileNotesNow();
    const noteNumber = mobileNotesState.nextNoteNumber;
    mobileNotesState.nextNoteNumber += 1;
    const note = {
      id: `note-${noteNumber}`,
      title: `Note ${noteNumber}`,
      createdTs: ts,
      updatedTs: ts,
      currentText: '',
      keySet: new Set(),
      records: null
    };
    note.records = mobileNotesCreateRecords(note, ts);
    mobileNotesState.notes.unshift(note);
    mobileNotesRender();
    mobileNotesOpenNote(note.id);
  }

  function mobileNotesFindNote(noteId) {
    return mobileNotesState.notes.find((note) => note.id === noteId) || null;
  }

  function mobileNotesRecordSwitch(fromNoteId, toNoteId, reason = 'open') {
    mobileNotesEnsureSession();
    const ts = mobileNotesNow();
    mobileNotesState.switch_records[ts] = {
      from_note_id: fromNoteId || null,
      to_note_id: toNoteId || null,
      reason
    };
  }

  function mobileNotesOpenNote(noteId) {
    const note = mobileNotesFindNote(noteId);
    if (!note) return;
    const previous = mobileNotesState.activeNoteId;
    mobileNotesState.activeNoteId = note.id;
    mobileNotesRecordSwitch(previous, note.id, 'open');

    const overview = document.getElementById('mobileNotesOverview');
    const editorShell = document.getElementById('mobileNotesEditorShell');
    const editor = document.getElementById('mobileNotesEditor');
    const title = document.getElementById('mobileNotesTitle');
    if (overview) overview.hidden = true;
    if (editorShell) editorShell.hidden = false;
    if (title) title.value = note.title;
    if (editor) {
      editor.value = note.currentText;
      requestAnimationFrame(() => {
        editor.focus();
        const pos = editor.value.length;
        try {
          editor.setSelectionRange(pos, pos);
        } catch (err) {
          // Some mobile browsers reject selection changes until focus settles.
        }
        mobileNotesEnsureEditorCaretVisible(editor);
      });
    }
    mobileNotesRender();
  }

  function mobileNotesBackToOverview() {
    const previous = mobileNotesState.activeNoteId;
    mobileNotesState.activeNoteId = null;
    mobileNotesRecordSwitch(previous, null, 'overview');
    const overview = document.getElementById('mobileNotesOverview');
    const editorShell = document.getElementById('mobileNotesEditorShell');
    if (overview) overview.hidden = false;
    if (editorShell) editorShell.hidden = true;
    mobileNotesRender();
  }

  function mobileNotesDeleteNote(noteId = mobileNotesState.activeNoteId) {
    const note = mobileNotesFindNote(noteId);
    if (!note) return;
    const wasActive = mobileNotesState.activeNoteId === note.id;
    mobileNotesRecordSwitch(wasActive ? note.id : null, null, 'delete');
    mobileNotesState.notes = mobileNotesState.notes.filter((item) => item.id !== note.id);
    if (wasActive) {
      mobileNotesState.activeNoteId = null;
      const overview = document.getElementById('mobileNotesOverview');
      const editorShell = document.getElementById('mobileNotesEditorShell');
      if (overview) overview.hidden = false;
      if (editorShell) editorShell.hidden = true;
    }
    mobileNotesRender();
  }

  function mobileNotesHandleKeyDown(event) {
    const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
    if (!note) return;
    const ts = mobileNotesNow();
    const key = String(event.key || '');
    if (!note.keySet.has(key)) {
      note.keySet.add(key);
      note.records.key_records[ts] = `keydown: ${key}`;
    } else {
      note.records.key_records[ts] = `repeat: ${key}`;
      note.records.cursor_records[ts] = `${this.selectionStart}:${this.selectionEnd}`;
    }
  }

  function mobileNotesHandleKeyUp(event) {
    const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
    if (!note) return;
    const key = String(event.key || '');
    if (!note.keySet.delete(key)) return;
    const ts = mobileNotesNow();
    note.records.key_records[ts] = `keyup: ${key}`;
    note.records.cursor_records[ts] = `${this.selectionStart}:${this.selectionEnd}`;
  }

  function mobileNotesHandlePointerRecord(kind, target) {
    const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
    if (!note) return;
    const ts = mobileNotesNow();
    note.records.key_records[ts] = `${kind}: yes`;
    note.records.cursor_records[ts] = `${target.selectionStart}:${target.selectionEnd}`;
  }

  function mobileNotesHandleInput(event) {
    const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
    if (!note) return;
    const target = event.target;
    const ts = mobileNotesNow();
    note.currentText = String(target.value || '');
    note.updatedTs = ts;
    note.records.text_records[ts] = note.currentText;
    note.records.cursor_records[ts] = `${target.selectionStart}:${target.selectionEnd}`;
    note.records.header_records.endtime = ts;
    mobileNotesRenderStatus();
    mobileNotesEnsureEditorCaretVisible(target);
  }

  function mobileNotesGetTextareaCaretCoordinates(target, position) {
    if (!target || !document.body || typeof document.createElement !== 'function') return null;

    const style = window.getComputedStyle ? window.getComputedStyle(target) : {};
    const mirror = document.createElement('div');
    const marker = document.createElement('span');
    const fontSize = Number.parseFloat(style.fontSize) || 40;
    const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.35 || 40;
    const copiedProps = [
      'boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
      'textTransform', 'textAlign', 'textIndent', 'tabSize', 'wordBreak'
    ];

    mirror.style.position = 'absolute';
    mirror.style.left = '-99999px';
    mirror.style.top = '0';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.width = `${Math.max(1, Number(target.clientWidth || target.offsetWidth) || 1)}px`;
    copiedProps.forEach((prop) => {
      mirror.style[prop] = style[prop];
    });

    marker.textContent = '\u200b';
    marker.style.display = 'inline-block';
    marker.style.width = '1px';
    marker.style.height = `${lineHeight}px`;
    marker.style.verticalAlign = 'top';
    const text = String(target.value || '');
    const pos = Math.max(0, Math.min(Number(position) || 0, text.length));
    mirror.appendChild(document.createTextNode(text.slice(0, pos)));
    mirror.appendChild(marker);
    mirror.appendChild(document.createTextNode(text.slice(pos, pos + 1) || '.'));
    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const coords = {
      top: markerRect.top - mirrorRect.top,
      left: markerRect.left - mirrorRect.left,
      lineHeight
    };

    document.body.removeChild(mirror);
    return coords;
  }

  function mobileNotesUpdateCaretOverlay(target = document.getElementById('mobileNotesEditor')) {
    const caret = document.getElementById('mobileNotesCaret');
    if (!caret) return;
    if (!target) {
      caret.style.display = 'none';
      return;
    }
    if (document.activeElement !== target) {
      caret.style.display = 'none';
      return;
    }

    const pos = Math.max(0, Math.min(Number(target.selectionEnd) || 0, String(target.value || '').length));
    const coords = mobileNotesGetTextareaCaretCoordinates(target, pos);
    if (!coords) {
      caret.style.display = 'none';
      return;
    }

    caret.style.left = `${coords.left - target.scrollLeft}px`;
    caret.style.top = `${coords.top - target.scrollTop}px`;
    caret.style.height = `${coords.lineHeight}px`;
    caret.style.display = 'block';
  }

  function mobileNotesEnsureEditorCaretVisible(target = document.getElementById('mobileNotesEditor')) {
    if (!target) return;
    requestAnimationFrame(() => {
      const pos = Math.max(0, Math.min(Number(target.selectionEnd) || 0, String(target.value || '').length));
      try {
        target.setSelectionRange(target.selectionStart, target.selectionEnd);
      } catch (err) {
        // Ignore browsers that temporarily reject selection updates.
      }

      const coords = mobileNotesGetTextareaCaretCoordinates(target, pos);
      if (!coords) return;

      const caretTop = coords.top;
      const margin = coords.lineHeight * 1.5;
      if (caretTop < target.scrollTop + margin) {
        target.scrollTop = Math.max(0, caretTop - margin);
      } else if (caretTop + coords.lineHeight > target.scrollTop + target.clientHeight - margin) {
        target.scrollTop = caretTop + coords.lineHeight - target.clientHeight + margin;
      }
      mobileNotesUpdateCaretOverlay(target);

      const rect = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : null;
      const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
      if (rect && viewportHeight && rect.bottom > viewportHeight - 16) {
        try {
          target.scrollIntoView({ block: 'center', inline: 'nearest' });
        } catch (err) {
          target.scrollIntoView();
        }
        mobileNotesUpdateCaretOverlay(target);
      }
    });
  }

  function mobileNotesHandleScroll(event) {
    const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
    if (!note) return;
    const ts = mobileNotesNow();
    note.records.scroll_records[ts] = String(event.target.scrollTop || 0);
    mobileNotesUpdateCaretOverlay(event.target);
  }

  function mobileNotesHandleTitleInput(event) {
    const note = mobileNotesFindNote(mobileNotesState.activeNoteId);
    if (!note) return;
    note.title = String(event.target.value || '').trim() || 'Untitled note';
    note.updatedTs = mobileNotesNow();
    note.records.header_records.mobile_note_title = note.title;
    mobileNotesRenderStatus();
  }

  function mobileNotesBuildSnapshot(note) {
    const records = root.normalizeWebScriptLogRecords(note.records);
    const ts = mobileNotesNow();
    records.header_records = {
      ...records.header_records,
      endtime: ts,
      mobile_note_id: note.id,
      mobile_note_title: note.title,
      mobile_session_id: mobileNotesState.sessionId,
      mobile_snapshot_time: ts
    };
    records.mobile_note_records = {
      [note.id]: {
        id: note.id,
        title: note.title,
        created_ts: note.createdTs,
        updated_ts: note.updatedTs,
        final_length: note.currentText.length
      }
    };
    records.mobile_switch_records = { ...mobileNotesState.switch_records };

    const textKeys = Object.keys(records.text_records).sort((a, b) => Number(a) - Number(b));
    const lastTextKey = textKeys.length ? textKeys[textKeys.length - 1] : null;
    const lastTextValue = lastTextKey == null ? null : records.text_records[lastTextKey];
    if (!textKeys.length || lastTextValue !== note.currentText) {
      records.text_records[ts] = note.currentText;
      records.cursor_records[ts] = `${note.currentText.length}:${note.currentText.length}`;
    }

    return records;
  }

  async function mobileNotesCommitNote(noteId = mobileNotesState.activeNoteId) {
    const note = mobileNotesFindNote(noteId);
    if (!note) return;
    const records = mobileNotesBuildSnapshot(note);
    const code = mobileNotesGetCode();
    const baseKey = root.makeWebScriptLogStorageKey(`wslog_${code}_mobile`, records, note.title || note.id);
    const key = await root.saveWebScriptLogRecordsToIndexedDB(records, baseKey);
    root.applyWebScriptLogRecords(records, key || baseKey);
    if (typeof root.processGraphFormat === 'function') root.processGraphFormat();
    if (typeof root.showWritingScore === 'function') root.showWritingScore();
    if (typeof root.renderDiffKeysPane === 'function') root.renderDiffKeysPane(records);
    if (typeof root.makeFTAnalysis === 'function') root.makeFTAnalysis();
    root.activateWebScriptLogTab?.('REPLAY');
    mobileNotesRenderStatus(`Committed "${note.title}" as ${key || baseKey}.`);
  }

  function mobileNotesFormatTime(ts) {
    if (!Number.isFinite(Number(ts))) return '';
    return new Date(Number(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function mobileNotesRenderStatus(extra = '') {
    const status = document.getElementById('mobileNotesStatus');
    if (!status) return;
    const count = mobileNotesState.notes.length;
    const active = mobileNotesFindNote(mobileNotesState.activeNoteId);
    const base = active
      ? `Editing ${active.title} (${active.currentText.length} chars)`
      : `${count} ${count === 1 ? 'note' : 'notes'} in this mobile session`;
    status.textContent = extra || base;
  }

  function mobileNotesRender() {
    const grid = document.getElementById('mobileNotesGrid');
    const commitActive = document.getElementById('mobileNotesCommitActive');
    if (commitActive) commitActive.disabled = !mobileNotesState.activeNoteId;
    if (!grid) {
      mobileNotesRenderStatus();
      return;
    }

    if (!mobileNotesState.notes.length) {
      grid.innerHTML = '<div class="mobile-notes-status">No notes yet.</div>';
      mobileNotesRenderStatus();
      return;
    }

    grid.innerHTML = mobileNotesState.notes.map((note) => {
      const title = mobileNotesEscape(note.title || 'Untitled note');
      const preview = mobileNotesEscape(note.currentText || 'Empty note');
      const updated = mobileNotesFormatTime(note.updatedTs);
      return `
        <div class="mobile-note-card" data-note-id="${mobileNotesEscape(note.id)}">
          <button class="mobile-note-card-delete" type="button" data-mobile-note-delete="${mobileNotesEscape(note.id)}" aria-label="Delete ${title}">×</button>
          <button class="mobile-note-card-main" type="button" data-mobile-note-open="${mobileNotesEscape(note.id)}">
            <div class="mobile-note-card-title">${title}</div>
            <div class="mobile-note-card-preview">${preview}</div>
          </button>
          <div>
            <div class="mobile-note-card-meta">${note.currentText.length} chars${updated ? ` · ${updated}` : ''}</div>
            <div class="mobile-note-card-actions">
              <button class="sl_button" type="button" data-mobile-note-commit="${mobileNotesEscape(note.id)}">Commit</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    mobileNotesRenderStatus();
  }

  function initMobileNotesPrototype() {
    const app = document.getElementById('mobileNotesApp');
    if (!app || app.dataset.bound === 'true') return;
    app.dataset.bound = 'true';

    const editor = document.getElementById('mobileNotesEditor');
    const title = document.getElementById('mobileNotesTitle');
    const code = document.getElementById('mobileNotesCode');
    const mainCode = mobileNotesMainCodeValue();
    if (code && mainCode) code.value = String(mainCode || '').toUpperCase();

    document.getElementById('mobileNotesNew')?.addEventListener('click', mobileNotesCreateNote);
    document.getElementById('mobileNotesHome')?.addEventListener('click', mobileNotesBackToOverview);
    document.getElementById('mobileNotesCommitOpen')?.addEventListener('click', () => mobileNotesCommitNote());
    document.getElementById('mobileNotesCommitActive')?.addEventListener('click', () => mobileNotesCommitNote());

    app.addEventListener('click', (event) => {
      const openId = event.target?.closest?.('[data-mobile-note-open]')?.getAttribute('data-mobile-note-open');
      if (openId) {
        mobileNotesOpenNote(openId);
        return;
      }
      const commitId = event.target?.closest?.('[data-mobile-note-commit]')?.getAttribute('data-mobile-note-commit');
      if (commitId) {
        mobileNotesCommitNote(commitId);
        return;
      }
      const deleteId = event.target?.closest?.('[data-mobile-note-delete]')?.getAttribute('data-mobile-note-delete');
      if (deleteId) mobileNotesDeleteNote(deleteId);
    });

    title?.addEventListener('input', mobileNotesHandleTitleInput);
    if (editor) {
      editor.addEventListener('keydown', mobileNotesHandleKeyDown);
      editor.addEventListener('keyup', mobileNotesHandleKeyUp);
      editor.addEventListener('mousedown', (event) => mobileNotesHandlePointerRecord('mousedown', event.currentTarget));
      editor.addEventListener('mouseup', (event) => mobileNotesHandlePointerRecord('mouseup', event.currentTarget));
      editor.addEventListener('input', mobileNotesHandleInput);
      editor.addEventListener('click', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
      editor.addEventListener('keyup', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
      editor.addEventListener('select', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
      editor.addEventListener('focus', (event) => mobileNotesEnsureEditorCaretVisible(event.currentTarget));
      editor.addEventListener('blur', () => mobileNotesUpdateCaretOverlay(null));
      editor.addEventListener('scroll', mobileNotesHandleScroll);
    }

    mobileNotesRender();
  }

  root.mobileNotesState = mobileNotesState;
  root.initMobileNotesPrototype = initMobileNotesPrototype;
  root.mobileNotesCreateNote = mobileNotesCreateNote;
  root.mobileNotesOpenNote = mobileNotesOpenNote;
  root.mobileNotesBackToOverview = mobileNotesBackToOverview;
  root.mobileNotesDeleteNote = mobileNotesDeleteNote;
  root.mobileNotesCommitNote = mobileNotesCommitNote;
})(typeof globalThis !== 'undefined' ? globalThis : window);
