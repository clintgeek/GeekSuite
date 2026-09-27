import { describe, it, expect } from 'vitest';
import { opensScene, applyCommand, NEW_SITTING_GAP_MS } from '../../game/transcript';

const at = (ms) => new Date(Date.UTC(2026, 8, 1) + ms);

describe('opensScene', () => {
  it('opens the tale on its first narration, not on an earlier player line', () => {
    const msgs = [
      { type: 'user', timestamp: at(0) },
      { type: 'ai', timestamp: at(1000) },
      { type: 'ai', timestamp: at(2000) },
    ];
    expect(opensScene(msgs, 0)).toBe(false);
    expect(opensScene(msgs, 1)).toBe(true);
    expect(opensScene(msgs, 2)).toBe(false);
  });

  it('honours an explicit scene flag (a /reset-scene answer)', () => {
    const msgs = [
      { type: 'ai', timestamp: at(0) },
      { type: 'system', timestamp: at(1000) },
      { type: 'ai', timestamp: at(2000), opensScene: true },
    ];
    expect(opensScene(msgs, 2)).toBe(true);
  });

  it('treats a long gap at the table as a new sitting', () => {
    const msgs = [
      { type: 'ai', timestamp: at(0) },
      { type: 'user', timestamp: at(1000) },
      { type: 'ai', timestamp: at(1000 + NEW_SITTING_GAP_MS + 1) },
      { type: 'user', timestamp: at(1000 + NEW_SITTING_GAP_MS + 2) },
      { type: 'ai', timestamp: at(1000 + NEW_SITTING_GAP_MS + 3) },
    ];
    expect(opensScene(msgs, 2)).toBe(true);
    expect(opensScene(msgs, 4)).toBe(false);
  });

  it('never marks a player line, system note or canon card', () => {
    const msgs = [{ type: 'user' }, { type: 'system' }, { type: 'canon' }];
    msgs.forEach((_, i) => expect(opensScene(msgs, i)).toBe(false));
  });
});

describe('applyCommand', () => {
  it('fills an empty composer with the command and a space', () => {
    expect(applyCommand('', '/recall')).toBe('/recall ');
  });

  it('keeps what the player typed as the argument', () => {
    expect(applyCommand('Mira', '/recall')).toBe('/recall Mira');
  });

  it('replaces a command already at the front instead of stacking them', () => {
    expect(applyCommand('/char Mira', '/recall')).toBe('/recall Mira');
    expect(applyCommand('/info', '/char')).toBe('/char ');
  });
});
