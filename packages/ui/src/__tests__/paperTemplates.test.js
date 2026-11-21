// @vitest-environment jsdom
/**
 * The shared page templates (DOCS/TEMPLATES_SPEC.md P1, P2, P6, P7): the
 * contract GeekDay and NoteGeek both build on.
 */
import { describe, expect, it } from 'vitest';

import {
  PAPER_PAGE,
  PAPER_RULE,
  PAPER_TEMPLATE_META_KEY,
  PAPER_TEMPLATE_NONE,
  PAPER_TEMPLATES,
  isPaperTemplate,
  paperTemplateDataUri,
  paperTemplateSvg,
} from '../paper/index.js';
import * as ui from '../index.js';

const IDS = ['schedule', 'top3', 'meeting', 'cornell', 'dots', 'grid'];
const parse = (svg) => new DOMParser().parseFromString(svg, 'image/svg+xml');
const texts = (doc) => [...doc.querySelectorAll('text')].map((t) => t.textContent);
/** Every y a horizontal line is drawn at ("M x y H x2"). */
const lineYs = (svg) => [...svg.matchAll(/M[\d.]+ ([\d.]+)H/g)].map((m) => Number(m[1]));

describe('page templates', () => {
  it('the sheet, the meta key and the six templates, in order', () => {
    expect(PAPER_PAGE).toEqual({ width: 1000, height: 1400 });
    expect(PAPER_TEMPLATE_META_KEY).toBe('paperTemplate');
    expect(PAPER_TEMPLATES.map((t) => t.id)).toEqual(IDS);
    for (const t of PAPER_TEMPLATES) {
      expect(t.label).toEqual(expect.any(String));
      expect(t.label.length).toBeGreaterThan(2);
      expect(t.description.length).toBeGreaterThan(10);
    }
    expect(PAPER_TEMPLATES.filter((t) => t.tiles).map((t) => t.id)).toEqual(['dots', 'grid']);
  });

  it('is exported from the package root', () => {
    expect(ui.paperTemplateSvg).toBe(paperTemplateSvg);
    expect(ui.PAPER_TEMPLATES).toBe(PAPER_TEMPLATES);
    expect(ui.PAPER_TEMPLATE_META_KEY).toBe('paperTemplate');
    expect(ui.isPaperTemplate).toBe(isPaperTemplate);
    expect(ui.paperTemplateDataUri).toBe(paperTemplateDataUri);
    expect(ui.PAPER_PAGE).toBe(PAPER_PAGE);
  });

  it('isPaperTemplate knows the six and nothing else', () => {
    for (const id of IDS) expect(isPaperTemplate(id)).toBe(true);
    for (const id of ['ruled', PAPER_TEMPLATE_NONE, '', 'Schedule', null, undefined, 3, {}, 'constructor', 'toString']) {
      expect(isPaperTemplate(id)).toBe(false);
    }
  });

  it.each(IDS)('%s is one well-formed SVG sheet with a transparent ground and something printed on it', (id) => {
    const svg = paperTemplateSvg(id);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    const doc = parse(svg);
    expect(doc.querySelector('parsererror')).toBe(null);
    const root = doc.documentElement;
    expect(root.nodeName).toBe('svg');
    expect(root.getAttribute('viewBox')).toBe(`0 0 ${PAPER_PAGE.width} ${PAPER_PAGE.height}`);
    expect(root.querySelectorAll('path').length).toBeGreaterThan(0);
    // Transparent: nothing paints the whole sheet.
    expect(root.querySelector('rect')).toBe(null);
    expect(root.getAttribute('style')).toBe(null);
    for (const path of root.querySelectorAll('path')) expect(path.getAttribute('fill')).toBe('none');
  });

  it.each(IDS)('%s carries no script, no outside reference and no embedded font', (id) => {
    const svg = paperTemplateSvg(id, { ink: '#111', line: '#222', accent: '#333' });
    expect(svg).not.toMatch(/<script|<foreignObject|<image|<use|<style|@font-face|@import|javascript:/i);
    expect(svg).not.toMatch(/\bhref\s*=/i);
    expect(svg).not.toMatch(/url\(/i);
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
    // The only URL is the SVG namespace.
    expect(svg.match(/https?:\/\/[^"' ]+/g)).toEqual(['http://www.w3.org/2000/svg']);
    expect(parse(svg).documentElement.getAttribute('font-family')).toMatch(/sans-serif$/);
  });

  it('applies the three colours, and only them', () => {
    const colors = { ink: '#010203', line: '#040506', accent: '#070809' };
    for (const id of IDS) {
      const doc = parse(paperTemplateSvg(id, colors));
      const used = new Set();
      for (const el of doc.querySelectorAll('path, text')) {
        for (const attr of ['stroke', 'fill']) {
          const v = el.getAttribute(attr);
          if (v && v !== 'none') used.add(v);
        }
      }
      expect(used.has(colors.line)).toBe(true);
      for (const c of used) expect(Object.values(colors)).toContain(c);
    }
    const words = parse(paperTemplateSvg('meeting', colors));
    const fills = Object.fromEntries([...words.querySelectorAll('text')].map((t) => [t.textContent, t.getAttribute('fill')]));
    expect(fills.NOTES).toBe(colors.ink);
    expect(fills.ACTIONS).toBe(colors.accent);
  });

  it('has grey defaults, takes the accent from the ink when only ink is given, and refuses markup as a colour', () => {
    const plain = paperTemplateSvg('top3');
    expect(plain).toMatch(/stroke="rgba\(128, 128, 128, 0\.45\)"/);
    const inkOnly = parse(paperTemplateSvg('top3', { ink: '#123456' }));
    expect([...inkOnly.querySelectorAll('text')].every((t) => t.getAttribute('fill') === '#123456')).toBe(true);
    const hostile = paperTemplateSvg('top3', { ink: '"/><script>alert(1)</script>', line: 'red" onload="x', accent: 5 });
    expect(hostile).toBe(plain);
    const amp = paperTemplateSvg('top3', { line: 'rgb(1 2 3 / 50%)' });
    expect(parse(amp).querySelector('parsererror')).toBe(null);
  });

  it('printed words are at least 24 page units tall', () => {
    for (const id of IDS) {
      for (const t of parse(paperTemplateSvg(id)).querySelectorAll('text')) {
        expect(Number(t.getAttribute('font-size'))).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('schedule: every hour from 6 AM to 9 PM, two lines to the hour, noon in the accent', () => {
    const svg = paperTemplateSvg('schedule', { ink: '#111111', line: '#222222', accent: '#aa0000' });
    const doc = parse(svg);
    const hours = texts(doc).filter((t) => /^\d+ [AP]M$/.test(t));
    expect(hours).toEqual(['6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM']);
    expect(texts(doc)).toContain('NOTES');
    const noon = [...doc.querySelectorAll('text')].find((t) => t.textContent === '12 PM');
    expect(noon.getAttribute('fill')).toBe('#aa0000');
    const ys = [...new Set(lineYs(svg))].sort((a, b) => a - b);
    const gaps = new Set(ys.slice(1).map((y, i) => y - ys[i]));
    expect([...gaps]).toEqual([44]); // one ruling for the whole sheet: an hour is two of them
    expect(ys[0]).toBeGreaterThan(0);
    expect(ys[ys.length - 1]).toBeLessThan(PAPER_PAGE.height);
  });

  it('top3: three numbered lines, a tick box each, then notes on the 48 ruling', () => {
    const svg = paperTemplateSvg('top3');
    const doc = parse(svg);
    expect(texts(doc)).toEqual(expect.arrayContaining(['TOP THREE', '1', '2', '3', 'NOTES']));
    expect((svg.match(/h36v36h-36z/g) || []).length).toBe(3);
    const ys = lineYs(svg);
    expect(ys.every((y) => y % PAPER_RULE === 0)).toBe(true);
    expect(ys.filter((y) => y >= 480).length).toBeGreaterThanOrEqual(18);
  });

  it('meeting: attendees, agenda, notes, and an actions column with a tick box per line', () => {
    const svg = paperTemplateSvg('meeting');
    expect(texts(parse(svg))).toEqual(['ATTENDEES', 'AGENDA', 'NOTES', 'ACTIONS']);
    const ys = lineYs(svg);
    expect(ys.every((y) => y % PAPER_RULE === 0)).toBe(true);
    const boxes = (svg.match(/h26v26h-26z/g) || []).length;
    const actionLines = new Set(ys.filter((y) => y > 5 * PAPER_RULE)).size;
    expect(boxes).toBeGreaterThanOrEqual(20);
    expect(boxes).toBe(actionLines);
  });

  it('cornell: cues, notes and a summary, all on the 48 ruling', () => {
    const svg = paperTemplateSvg('cornell');
    expect(texts(parse(svg))).toEqual(['CUES', 'NOTES', 'SUMMARY']);
    expect(lineYs(svg).every((y) => y % PAPER_RULE === 0)).toBe(true);
    expect(svg).toMatch(/M300 96V1104/); // the cue column's edge
  });

  it('dots and grid sit on the 48 ruling and can be drawn taller than one sheet', () => {
    for (const id of ['dots', 'grid']) {
      const one = paperTemplateSvg(id);
      expect(lineYs(one).every((y) => y % PAPER_RULE === 0)).toBe(true);
      expect(Math.max(...lineYs(one))).toBe(1392);
      const tall = paperTemplateSvg(id, { height: 4200 });
      expect(parse(tall).documentElement.getAttribute('viewBox')).toBe('0 0 1000 4200');
      expect(Math.max(...lineYs(tall))).toBe(4176);
      expect(lineYs(tall).every((y) => y % PAPER_RULE === 0)).toBe(true);
    }
    expect(paperTemplateSvg('dots')).toMatch(/stroke-dasharray="0 48"/);
    // Every fifth grid line is drawn in the heavier path.
    const heavy = parse(paperTemplateSvg('grid')).querySelectorAll('path')[1];
    expect(heavy.getAttribute('stroke-width')).toBe('1.75');
    expect(lineYs(heavy.getAttribute('d'))).toEqual([240, 480, 720, 960, 1200]);
    // A template with a top and a bottom stays one sheet whatever is asked.
    expect(paperTemplateSvg('meeting', { height: 4200 })).toBe(paperTemplateSvg('meeting'));
  });

  it('an unknown id is null, as SVG and as a data URI', () => {
    for (const id of ['nope', PAPER_TEMPLATE_NONE, '', null, undefined, 'hasOwnProperty']) {
      expect(paperTemplateSvg(id)).toBe(null);
      expect(paperTemplateDataUri(id, { ink: '#000' })).toBe(null);
    }
  });

  it.each(IDS)('%s round-trips through its data URI', (id) => {
    const colors = { ink: '#4A5563', line: 'rgba(34, 50, 74, 0.13)', accent: '#B4472F' };
    const uri = paperTemplateDataUri(id, colors);
    const prefix = 'data:image/svg+xml;charset=utf-8,';
    expect(uri.startsWith(prefix)).toBe(true);
    const body = uri.slice(prefix.length);
    // Nothing that would end a CSS url() or an attribute, or start a fragment.
    expect(body).not.toMatch(/[\s"'<>#()]/);
    expect(decodeURIComponent(body)).toBe(paperTemplateSvg(id, colors));
  });
});
