import { describe, expect, it } from 'vitest';
import { planClose, type TabInfo } from '../src/ui/tabsearch.js';

const tabs = (busyEditor = false): TabInfo[] => [
  { id: 'worlds', label: 'Worlds', open: true, active: false },
  { id: 'editor', label: 'Editor', open: true, active: true, busy: busyEditor },
  { id: 'history', label: 'History', open: true, active: false },
  { id: 'settings', label: 'Settings', open: false, active: false },
  { id: 'about', label: 'About', open: true, active: false },
];

describe('close tabs by text', () => {
  it('uses one predicate for containing and not containing, and skips tabs already closed', () => {
    const hits = [false, false, true, true, false]; // "is" matches History and the closed Settings
    expect(planClose(tabs(), hits, 'containing')).toEqual({ close: ['history'], kept: [] });
    expect(planClose(tabs(), hits, 'not-containing')).toEqual({ close: ['worlds', 'editor', 'about'], kept: [] });
  });
  it('keeps the editor open while an edit runs', () => {
    expect(planClose(tabs(true), [false, true, false, false, false], 'containing')).toEqual({ close: [], kept: [{ id: 'editor', why: 'busy' }] });
  });
  it('always leaves one tab, preferring the one on screen', () => {
    expect(planClose(tabs(), [true, true, true, true, true], 'containing')).toEqual({ close: ['worlds', 'history', 'about'], kept: [{ id: 'editor', why: 'last' }] });
    expect(planClose(tabs(), [false, false, false, false, false], 'containing')).toEqual({ close: [], kept: [] });
  });
});
