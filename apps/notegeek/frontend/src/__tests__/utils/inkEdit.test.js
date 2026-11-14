import { describe, it, expect } from 'vitest';
import { isInkEdit } from '../../utils/inkEdit';

const entry = (source, changes) => ({ source, changes: { added: {}, updated: {}, removed: {}, ...changes } });

describe('isInkEdit — what may start automatic transcription', () => {
  it('a stroke drawn, moved or erased by the user counts', () => {
    expect(isInkEdit(entry('user', { added: { 'shape:a': {} } }))).toBe(true);
    expect(isInkEdit(entry('user', { updated: { 'shape:a': [{}, {}] } }))).toBe(true);
    expect(isInkEdit(entry('user', { removed: { 'shape:a': {} } }))).toBe(true);
    expect(isInkEdit(entry('user', { added: { 'asset:img': {} } }))).toBe(true);
  });

  it('the camera, selection, paper (document meta) and snapshot loads do not', () => {
    expect(isInkEdit(entry('user', { updated: { 'camera:page:page': [{}, {}] } }))).toBe(false);
    expect(isInkEdit(entry('user', { updated: { 'instance_page_state:page:page': [{}, {}] } }))).toBe(false);
    expect(isInkEdit(entry('user', { updated: { 'document:document': [{}, {}] } }))).toBe(false);
    expect(isInkEdit(entry('remote', { added: { 'shape:a': {} } }))).toBe(false);
    expect(isInkEdit(null)).toBe(false);
  });
});
