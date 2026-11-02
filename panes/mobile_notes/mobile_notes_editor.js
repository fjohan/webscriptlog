/* Native textarea presentation adapted from scr-copy-edit's standalone Margin editor.
 * Recording stays with Mobile Notes; this adapter emits no application events. */
(function (root) {
  'use strict';
  const instances = new WeakMap();

  function attach(textarea) {
    if (instances.has(textarea)) return instances.get(textarea);
    textarea.setAttribute('spellcheck', 'false');
    textarea.setAttribute('autocorrect', 'on');
    textarea.setAttribute('autocapitalize', 'sentences');
    textarea.setAttribute('autocomplete', 'off');

    function refresh() {
      if (!textarea.clientWidth) return;
      textarea.style.height = 'auto';
      const borderHeight = Math.max(0, (textarea.offsetHeight || 0) - (textarea.clientHeight || 0));
      textarea.style.height = Math.max(240, textarea.scrollHeight + borderHeight) + 'px';
    }

    // Height changes also notify ResizeObserver. Only width changes need a reflow.
    let width = textarea.clientWidth;
    let observer = null;
    if (root.ResizeObserver) {
      observer = new root.ResizeObserver(() => {
        if (textarea.clientWidth !== width) {
          width = textarea.clientWidth;
          refresh();
        }
      });
      observer.observe(textarea);
    } else {
      root.addEventListener('resize', refresh);
    }
    textarea.addEventListener('input', refresh);
    const instance = {
      refresh,
      setValue(value) {
        textarea.value = String(value);
        refresh();
      },
      destroy() {
        textarea.removeEventListener('input', refresh);
        observer?.disconnect();
        if (!observer) root.removeEventListener('resize', refresh);
        instances.delete(textarea);
      }
    };
    instances.set(textarea, instance);
    refresh();
    return instance;
  }

  root.MobileNotesEditor = { attach };
}(globalThis));
