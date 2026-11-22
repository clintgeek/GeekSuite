import React from 'react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { normalizeTags } from '@geeksuite/tags';
import {
  NOTE_TEMPLATES,
  getNoteTemplate,
  buildNoteFromTemplate,
  noteTemplatePath,
  templateDay,
  templateWeekStart,
} from '../../utils/noteTemplates';
import { MARKDOWN_COMPONENTS, MARKDOWN_REMARK_PLUGINS } from '../../components/notes/markdownComponents';
import { applyInlineTags } from '../../utils/inlineTags';
import { TEMPLATE_ICONS } from '../../components/new/templateIcons';

/**
 * DOCS/TEMPLATES_SPEC.md N1, N2, N4 — the template definitions themselves.
 * The flow (N3, N5) is in pages/noteEditorTemplate.test.jsx and
 * components/new/templatePicker.test.jsx.
 */

// 03:30 UTC on the 21st is 9:30 pm on FRIDAY the 20th in Chicago (UTC-6).
const LATE_EVENING_UTC = '2026-11-21T03:30:00.000Z';

const realTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Chicago'; });
afterAll(() => {
  if (realTz === undefined) delete process.env.TZ;
  else process.env.TZ = realTz;
});

const renderBody = (body) => render(
  <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{body}</ReactMarkdown>,
);

describe('N1 — the eight templates', () => {
  it('are exactly these, in this order', () => {
    expect(NOTE_TEMPLATES.map((t) => t.label)).toEqual([
      'Meeting notes', '1:1', 'Weekly review', 'Project brief',
      'Decision record', 'Troubleshooting log', 'Packing list', 'Recipe',
    ]);
    expect(new Set(NOTE_TEMPLATES.map((t) => t.id)).size).toBe(8);
  });

  it.each(NOTE_TEMPLATES.map((t) => [t.id, t]))('%s has an id, a label, a one-line description, tags, a title and a body', (_id, t) => {
    expect(t.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(t.label.trim()).toBe(t.label);
    expect(t.label.length).toBeGreaterThan(0);
    expect(t.description).not.toMatch(/\n/);
    expect(t.description.length).toBeGreaterThan(10);
    expect(t.description.length).toBeLessThanOrEqual(64);
    expect(t.tags.length).toBeGreaterThan(0);
    const now = new Date(LATE_EVENING_UTC);
    expect(typeof t.title(now)).toBe('string');
    expect(t.title(now).trim().length).toBeGreaterThan(0);
    expect(t.body(now).trim().length).toBeGreaterThan(40);
    expect(TEMPLATE_ICONS[t.id]).toBeTruthy();
  });

  it('carry the tags the spec names, already in the suite standard', () => {
    expect(Object.fromEntries(NOTE_TEMPLATES.map((t) => [t.id, t.tags]))).toEqual({
      meeting: ['meeting'],
      'one-to-one': ['one-to-one'],
      'weekly-review': ['review'],
      'project-brief': ['project'],
      'decision-record': ['decision'],
      troubleshooting: ['troubleshooting'],
      'packing-list': ['packing'],
      recipe: ['recipe'],
    });
    for (const t of NOTE_TEMPLATES) expect(normalizeTags(t.tags)).toEqual(t.tags);
  });
});

describe('N2 — what the editor is seeded with', () => {
  it('is a Markdown note with the template\'s title, tags and body', () => {
    const now = new Date(LATE_EVENING_UTC);
    const seed = buildNoteFromTemplate('meeting', now);
    expect(seed.type).toBe('markdown');
    expect(seed.title).toBe('Meeting — Nov 20, 2026');
    expect(seed.tags).toEqual(['meeting']);
    for (const heading of ['## Attendees', '## Agenda', '## Notes', '## Decisions', '## Action items']) {
      expect(seed.content).toContain(heading);
    }
    expect(seed.content).toMatch(/- \[ \] .*owner.*due/);
  });

  it('hands out its own tags array each time', () => {
    const a = buildNoteFromTemplate('recipe');
    a.tags.push('changed');
    expect(buildNoteFromTemplate('recipe').tags).toEqual(['recipe']);
  });

  it('an unknown, empty or missing id is no template at all', () => {
    for (const id of ['nope', '', null, undefined, 42, 'Meeting', 'constructor', '__proto__']) {
      expect(getNoteTemplate(id)).toBeNull();
      expect(buildNoteFromTemplate(id)).toBeNull();
    }
  });

  it('links to the ordinary new-note route', () => {
    expect(noteTemplatePath('weekly-review')).toBe('/notes/new?template=weekly-review');
  });
});

describe('the bodies use only what the Markdown editor renders', () => {
  it.each(NOTE_TEMPLATES.map((t) => [t.id, t]))('%s renders as headings and lists, with nothing left as raw syntax', (_id, t) => {
    const body = t.body(new Date(LATE_EVENING_UTC));
    const { container } = renderBody(body);
    expect(container.querySelectorAll('h2').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('h1, h3, h4, h5, h6').length).toBe(0);
    // Every `- [ ]` became a task item (shown as a named glyph, see TaskBox); none printed its brackets.
    const boxes = (body.match(/^- \[ \] /gm) || []).length;
    expect(container.querySelectorAll('li.task-list-item').length).toBe(boxes);
    const text = container.textContent;
    expect(text).not.toMatch(/\[ \]|\[x\]/i);
    expect(text).not.toMatch(/\*\*|^#+ |\n#+ |\|/m);
    // No raw HTML, no fenced code, no images or links to fetch.
    expect(body).not.toMatch(/<[a-z!/]/i);
    expect(body).not.toMatch(/```|!\[|\]\(/);
    expect(body.endsWith('\n')).toBe(true);
  });

  it('a body never tags the note by accident (the save reads #words as tags)', () => {
    for (const t of NOTE_TEMPLATES) {
      const seed = buildNoteFromTemplate(t.id, new Date(LATE_EVENING_UTC));
      const read = applyInlineTags({ tags: seed.tags, content: seed.content, type: 'markdown' });
      expect(read.changed).toBe(false);
      expect(read.tags).toEqual(t.tags);
    }
  });

  it('the checklists are checklists: meeting actions, troubleshooting checks, packing groups', () => {
    const boxes = (id) => renderBody(buildNoteFromTemplate(id).content).container.querySelectorAll('li.task-list-item').length;
    expect(boxes('meeting')).toBeGreaterThanOrEqual(2);
    expect(boxes('troubleshooting')).toBeGreaterThanOrEqual(3);
    expect(boxes('packing-list')).toBeGreaterThanOrEqual(15);
  });

  it('the packing list is grouped as the spec asks', () => {
    const { container } = renderBody(buildNoteFromTemplate('packing-list').content);
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Documents', 'Clothes', 'Electronics', 'Toiletries', 'Before leaving the house',
    ]);
  });

  it('the decision record compares its options in a real table', () => {
    const { container } = renderBody(buildNoteFromTemplate('decision-record').content);
    expect(container.querySelectorAll('table').length).toBe(1);
    expect([...container.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Option', 'For', 'Against']);
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('the recipe numbers its method and lists its ingredients', () => {
    const { container } = renderBody(buildNoteFromTemplate('recipe').content);
    expect(container.querySelectorAll('ol').length).toBe(1);
    expect(container.querySelectorAll('ul').length).toBeGreaterThanOrEqual(2);
  });
});

describe('N4 — dates are the local day the template was opened', () => {
  it('runs in America/Chicago, where the instant under test is still the 20th', () => {
    // If the zone did not take, the assertions below would prove nothing.
    const now = new Date(LATE_EVENING_UTC);
    expect(now.getDate()).toBe(20);
    expect(now.getUTCDate()).toBe(21);
  });

  it('9:30 pm on the 20th in Chicago is the 20th, though UTC says the 21st', () => {
    const now = new Date(LATE_EVENING_UTC);
    expect(templateDay(now)).toBe('Nov 20, 2026');
    expect(buildNoteFromTemplate('meeting', now).title).toBe('Meeting — Nov 20, 2026');
    expect(buildNoteFromTemplate('one-to-one', now).title).toBe('One-to-one — Nov 20, 2026');
    expect(buildNoteFromTemplate('troubleshooting', now).title).toContain('Nov 20, 2026');
    for (const id of ['meeting', 'one-to-one', 'decision-record', 'troubleshooting']) {
      const { content } = buildNoteFromTemplate(id, now);
      expect(content).toContain('Nov 20, 2026');
      expect(content).not.toContain('Nov 21');
    }
  });

  it('just after local midnight it is the new day', () => {
    // 06:05 UTC = 00:05 on the 21st in Chicago.
    expect(templateDay(new Date('2026-11-21T06:05:00.000Z'))).toBe('Nov 21, 2026');
    // 05:55 UTC = 23:55 on the 20th.
    expect(templateDay(new Date('2026-11-21T05:55:00.000Z'))).toBe('Nov 20, 2026');
  });

  it('the weekly review is titled with the Monday of the local week', () => {
    // Friday the 20th → Monday the 16th.
    expect(templateWeekStart(new Date(LATE_EVENING_UTC))).toBe('Nov 16, 2026');
    expect(buildNoteFromTemplate('weekly-review', new Date(LATE_EVENING_UTC)).title).toBe('Weekly review — week of Nov 16, 2026');
    // Sunday evening in Chicago is Monday in UTC: still LAST Monday's week.
    expect(templateWeekStart(new Date('2026-11-23T03:30:00.000Z'))).toBe('Nov 16, 2026');
    // A Monday is its own week's start; a week that began last month or last year rolls back.
    expect(templateWeekStart(new Date(2026, 10, 23, 9))).toBe('Nov 23, 2026');
    expect(templateWeekStart(new Date(2026, 11, 2, 9))).toBe('Nov 30, 2026');
    expect(templateWeekStart(new Date(2027, 0, 1, 9))).toBe('Dec 28, 2026');
  });

  it('across the spring DST change the week start does not slip a day', () => {
    // US DST began Sunday 8 March 2026; Wednesday the 11th → Monday the 9th.
    expect(templateWeekStart(new Date(2026, 2, 11, 0, 30))).toBe('Mar 9, 2026');
    // The Sunday itself belongs to the week of Monday the 2nd.
    expect(templateWeekStart(new Date(2026, 2, 8, 23, 30))).toBe('Mar 2, 2026');
  });
});
