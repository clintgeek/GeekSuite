import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ONE_ON_ONE_TAG, MEETING_PATH, buildMeeting, buildOneOnOne, isPersonTag, oneOnOnePath, oneOnOneRoot, oneOnOneTitle, peopleFrom,
  personName, personOfNote, personOfTag, personSlug, sinceLabel,
} from '../../utils/oneOnOne';
import { taskInputFor } from '../../utils/journalLines';

const ROOT = 'fd/1on1';

describe('1:1s (DOCS/ONE_ON_ONE_SPEC.md)', () => {
  it('req 6: the tag is fd/1on1 unless the preference is a usable tag', () => {
    expect(DEFAULT_ONE_ON_ONE_TAG).toBe('fd/1on1');
    expect(oneOnOneRoot(undefined)).toBe('fd/1on1');
    expect(oneOnOneRoot({ oneOnOneTag: '' })).toBe('fd/1on1');
    expect(oneOnOneRoot({ oneOnOneTag: ' Work / People ' })).toBe('work/people');
  });

  it('a person is the first segment under the tag; the tag itself and its neighbours are nobody', () => {
    expect(personOfTag('fd/1on1/alex', ROOT)).toBe('alex');
    expect(personOfTag('fd/1on1/alex/2026', ROOT)).toBe('alex');
    expect(personOfTag('fd/1on1', ROOT)).toBeNull();
    expect(personOfTag('fd/1on1x/alex', ROOT)).toBeNull();
    expect(isPersonTag('fd/1on1/alex', ROOT)).toBe(true);
    expect(isPersonTag('fd/1on1/alex/2026', ROOT)).toBe(false);
    expect(personOfNote(['work', 'fd/1on1/sam-lee'], ROOT)).toBe('sam-lee');
    expect(personOfNote(['work'], ROOT)).toBeNull();
  });

  it('a typed name becomes one tag segment, and reads back as a name', () => {
    expect(personSlug('Alex Smith')).toBe('alex-smith');
    expect(personSlug('  a/b ')).toBe('a-b');
    expect(personSlug('   ')).toBe('');
    expect(personName('alex-smith')).toBe('Alex Smith');
  });

  it('req 1: a new 1:1 is titled date-first and tagged for the person, on the 1:1 sheet', () => {
    const now = new Date(2026, 10, 22, 9);
    expect(oneOnOneTitle('alex', now)).toBe('2026-11-22 Alex 1:1');
    expect(buildOneOnOne('Alex', ROOT, now)).toEqual({ slug: 'alex', title: '2026-11-22 Alex 1:1', tags: ['fd/1on1/alex'], sheet: 'oneonone' });
    expect(buildOneOnOne('', ROOT, now)).toBeNull();
    expect(buildOneOnOne(null, ROOT, now)).toBeNull();
    expect(oneOnOnePath('sam-lee')).toBe('/notes/new?type=handwritten&oneOnOne=sam-lee');
  });

  it('req 5: people are read off the notes, longest-unmet first, with a count and the last meeting', () => {
    const at = (d) => new Date(2026, 10, d).toISOString();
    const people = peopleFrom([
      { tags: ['fd/1on1/alex'], createdAt: at(1) },
      { tags: ['fd/1on1/alex', 'x'], createdAt: at(15) },
      { tags: ['fd/1on1/sam'], createdAt: at(3) },
      { tags: ['fd/1on1'], createdAt: at(20) },
      { tags: ['other'], createdAt: at(21) },
    ], ROOT);
    expect(people.map((p) => [p.slug, p.count, p.tag])).toEqual([['sam', 1, 'fd/1on1/sam'], ['alex', 2, 'fd/1on1/alex']]);
    expect(new Date(people[1].lastMet).getDate()).toBe(15);
    expect(peopleFrom(null, ROOT)).toEqual([]);
  });

  it('says how long ago in calendar days', () => {
    const now = new Date(2026, 10, 22, 8);
    expect(sinceLabel(new Date(2026, 10, 22, 1).getTime(), now)).toBe('today');
    expect(sinceLabel(new Date(2026, 10, 21, 23).getTime(), now)).toBe('yesterday');
    expect(sinceLabel(new Date(2026, 10, 10).getTime(), now)).toBe('12 days ago');
    expect(sinceLabel(new Date(2026, 9, 18).getTime(), now)).toBe('5 weeks ago');
    expect(sinceLabel(null, now)).toBe('');
  });

  it('req 3: a task sent from a 1:1 carries the person tag beside its own; other pages add none', () => {
    const now = new Date(2026, 10, 22, 9);
    const tagged = taskInputFor({ kind: 'task', text: 'send the doc #infra' }, { now, tags: ['fd/1on1/alex'] });
    expect(tagged.tags).toEqual(['infra', 'fd/1on1/alex']);
    const plain = taskInputFor({ kind: 'task', text: 'send the doc #infra' }, { now });
    expect(plain.tags).toEqual(['infra']);
  });

  it('a new meeting is a dated page, tagged meeting, on the Meeting sheet', () => {
    expect(MEETING_PATH).toBe('/notes/new?type=handwritten&meeting=1');
    expect(buildMeeting(null)).toBeNull();
    expect(buildMeeting('1', new Date(2026, 10, 23, 23, 30))).toEqual({ title: '2026-11-23 Meeting', tags: ['meeting'], sheet: 'meeting' });
  });
});
