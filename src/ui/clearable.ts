// Every editable text field gets its own Clear button. Material text fields get one in their
// trailing-icon slot automatically (also fields added later); plain inputs and textareas opt in with
// clearButton(). Clearing goes through the normal edit path: the value is emptied and the same
// input and change events fire as if the user had deleted the text, then focus returns to the field.

type Field = HTMLElement & { value: string; label?: string; disabled?: boolean; readOnly?: boolean; type?: string };
const X = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const SKIP = new Set(['date', 'file', 'color', 'range', 'checkbox', 'radio']);

function clear(field: Field) {
  field.value = '';
  field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  field.focus();
}

function enhance(field: Field, name: (label: string) => string) {
  if (field.dataset.clear || field.querySelector(':scope > [slot=trailing-icon]')) return;
  if (SKIP.has(field.type ?? '')) return;
  field.dataset.clear = '1';
  field.setAttribute('has-trailing-icon', '');
  const btn = document.createElement('md-icon-button') as HTMLElement;
  btn.setAttribute('slot', 'trailing-icon');
  btn.className = 'clear-btn';
  btn.setAttribute('aria-label', name(field.label ?? field.getAttribute('label') ?? ''));
  btn.innerHTML = X;
  const sync = () => { btn.hidden = !field.value || !!field.disabled || !!field.readOnly; };
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); clear(field); sync(); });
  field.addEventListener('input', sync);
  field.append(btn);
  requestAnimationFrame(sync);
}

/** Watches the page and adds a Clear button to every Material text field. */
export function enableClearControls(name: (label: string) => string, root: HTMLElement = document.body) {
  const scan = (n: ParentNode) => n.querySelectorAll<Field>('md-outlined-text-field, md-filled-text-field').forEach((f) => enhance(f, name));
  scan(root);
  new MutationObserver((records) => { for (const r of records) r.addedNodes.forEach((n) => { if (n instanceof HTMLElement) { if (n.matches('md-outlined-text-field, md-filled-text-field')) enhance(n as Field, name); scan(n); } }); })
    .observe(root, { childList: true, subtree: true });
}

/** A Clear button for a plain input or textarea, placed right after it. */
export function clearButton(field: HTMLInputElement | HTMLTextAreaElement, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'clear-plain';
  btn.setAttribute('aria-label', label);
  btn.innerHTML = X;
  const sync = () => { btn.hidden = !field.value || field.disabled || field.readOnly; };
  btn.addEventListener('click', () => { clear(field as unknown as Field); sync(); });
  field.addEventListener('input', sync);
  field.after(btn);
  sync();
  return btn;
}
