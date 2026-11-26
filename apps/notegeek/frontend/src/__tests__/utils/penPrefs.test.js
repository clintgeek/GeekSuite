import { describe, it, expect, beforeEach } from 'vitest';
import { PEN_PREF_KEYS, writePenSeen, writeBarPosition, pushRecentPen, writeCamera } from '../../utils/penPrefs';

/** These keys are stored on devices: renaming one loses the setting. */
describe('NoteGeek pen prefs', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the NoteGeek keys', () => {
    expect(PEN_PREF_KEYS).toEqual({
      penSeen: 'notegeek:sketchPenSeen',
      fingerDraws: 'notegeek:sketchFingerDraws',
      barPosition: 'notegeek:sketchBarPosition',
      cameras: 'notegeek:sketchCameras',
      recentPens: 'notegeek:sketchRecentPens',
    });
  });

  it('writes under them, in the stored shapes', () => {
    writePenSeen();
    writeBarPosition('right');
    pushRecentPen({ color: 'blue', size: 'fine' });
    writeCamera('n1', { x: 1, y: 2, z: 1 });
    expect(localStorage.getItem('notegeek:sketchPenSeen')).toBe('1');
    expect(localStorage.getItem('notegeek:sketchBarPosition')).toBe('right');
    expect(JSON.parse(localStorage.getItem('notegeek:sketchRecentPens'))).toEqual([{ color: 'blue', size: 'fine' }]);
    expect(JSON.parse(localStorage.getItem('notegeek:sketchCameras')).n1).toMatchObject({ x: 1, y: 2, z: 1 });
  });
});
