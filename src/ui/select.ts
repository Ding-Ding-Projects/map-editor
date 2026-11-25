// Multi-selection shared by list screens: click toggles, Shift+click takes the range from the last click.

/** Toggle one item, or with Shift set the whole range from the anchor to it. Returns the new anchor. */
export function pickItem(sel: Set<number>, i: number, anchor: number | undefined, shift: boolean): number {
  if (shift && anchor !== undefined && anchor !== i) {
    const on = sel.has(anchor);
    for (let k = Math.min(anchor, i); k <= Math.max(anchor, i); k++) { if (on) sel.add(k); else sel.delete(k); }
    return anchor;
  }
  if (sel.has(i)) sel.delete(i); else sel.add(i);
  return i;
}
/** Select every item, or with all selected already, nothing. */
export function selectAll(sel: Set<number>, n: number): void { const all = sel.size === n; sel.clear(); if (!all) for (let k = 0; k < n; k++) sel.add(k); }
/** Swap selected and not selected. */
export function invert(sel: Set<number>, n: number): void { for (let k = 0; k < n; k++) { if (sel.has(k)) sel.delete(k); else sel.add(k); } }
