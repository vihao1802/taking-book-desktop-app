(() => {
  const sel = 'button,a[href],summary,textarea,select,input,[role=button],[role=menuitem],[role=option],[role=tab],[role=combobox],[role=slider]';
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    let target = el, tr = r;
    if (el.tagName === 'INPUT' && /checkbox|radio/.test(el.type)) { const l = el.closest('label'); if (l) { target = l; tr = l.getBoundingClientRect(); } }
    if (el.getAttribute('role') === 'slider') { const root = el.closest('[data-slot=slider]'); if (root) tr = root.getBoundingClientRect(); }
    if (tr.width < 47.5 || tr.height < 47.5) out.push((el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20) || el.tagName) + ' ' + Math.round(tr.width) + 'x' + Math.round(tr.height));
  }
  return JSON.stringify(out);
})()
