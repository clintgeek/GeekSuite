import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import {
  PAPER_PAGE, PAPER_TEMPLATES, PAPER_TEMPLATE_META_KEY, PAPER_TEMPLATE_NONE, paperTemplateDataUri,
} from '@geeksuite/ui';
import { createNoteTheme } from '../../../theme/createAppTheme';
import {
  PAPER_COLORS, TEMPLATE_INK, metaWithTemplate, resolvePaper, templateColors, templateFromMeta,
  templateSheetBox, templateViewBox,
} from '../../../components/editors/paperModel';

/**
 * Page templates in a sketch (DOCS/TEMPLATES_SPEC.md P2, P3, P5, P6, P7):
 * the model, the background that draws the sheet, and the Paper menu's
 * Template choice. tldraw is a small fake here — an editor with a document
 * record and a camera — because the template is never a shape: everything
 * under test reads and writes document meta only.
 */

const tl = vi.hoisted(() => ({ editor: null }));

vi.mock('@tldraw/tldraw', () => ({
  useEditor: () => tl.editor,
  // Like tldraw's: recomputed on every render (tests re-render after a change).
  useValue: (_name, fn) => fn(),
}));

import { PaperBackground, PaperPicker } from '../../../components/editors/Paper';
import { setPaper, setPaperTemplate } from '../../../components/editors/usePaper';

const makeEditor = (meta = {}, camera = { x: 0, y: 0, z: 1 }) => {
  const editor = {
    document: { id: 'document:document', name: '', gridSize: 10, meta },
    camera,
    getDocumentSettings: vi.fn(() => editor.document),
    updateDocumentSettings: vi.fn((settings) => { editor.document = { ...editor.document, ...settings }; }),
    getCamera: vi.fn(() => editor.camera),
    getViewportScreenBounds: vi.fn(() => ({ x: 0, y: 0, w: 390, h: 600 })),
    zoomToBounds: vi.fn(),
    isDisposed: false,
  };
  return editor;
};

const wrap = (ui, mode = 'light') => render(<ThemeProvider theme={createNoteTheme(mode)}>{ui}</ThemeProvider>);
const background = (container) => container.querySelector('.tl-background');
const sheet = (container) => container.querySelector('img[data-paper-template-sheet]');

beforeEach(() => { localStorage.removeItem('notegeek:sketchPaper'); });
afterEach(() => { localStorage.removeItem('notegeek:sketchPaper'); tl.editor = null; });

// ── WCAG contrast, for P6 ────────────────────────────────────────────────
const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// tldraw 2.4's own grounds (editor.css `--color-background`), for "Match theme".
const TLDRAW_GROUND = { light: '#f9fafb', dark: '#101011' };

describe('the model', () => {
  it('reads a known template from the sketch\'s document meta, and nothing else', () => {
    expect(PAPER_TEMPLATE_META_KEY).toBe('paperTemplate');
    for (const t of PAPER_TEMPLATES) expect(templateFromMeta({ paperTemplate: t.id })).toBe(t.id);
    expect(templateFromMeta({})).toBeNull();
    expect(templateFromMeta(undefined)).toBeNull();
    expect(templateFromMeta({ paperTemplate: PAPER_TEMPLATE_NONE })).toBeNull();
    // P7: a newer or removed template is a plain page.
    expect(templateFromMeta({ paperTemplate: 'hexagons-from-2031' })).toBeNull();
    expect(templateFromMeta({ paperTemplate: 42 })).toBeNull();
  });

  it('choosing a template writes only its key; everything else in the meta is carried over', () => {
    const meta = { paperColor: 'warm', paperPattern: 'lined', geekdayDate: '2026-11-20' };
    expect(metaWithTemplate(meta, 'cornell')).toEqual({ ...meta, paperTemplate: 'cornell' });
    expect(metaWithTemplate({ ...meta, paperTemplate: 'cornell' }, 'grid')).toEqual({ ...meta, paperTemplate: 'grid' });
    expect(metaWithTemplate(undefined, 'dots')).toEqual({ paperTemplate: 'dots' });
    // The input is never mutated.
    expect(meta).toEqual({ paperColor: 'warm', paperPattern: 'lined', geekdayDate: '2026-11-20' });
  });

  it('None on a sketch with a template is written as "none", so GeekDay does not read it as "never chose"', () => {
    expect(metaWithTemplate({ paperTemplate: 'meeting' }, null)).toEqual({ paperTemplate: PAPER_TEMPLATE_NONE });
  });

  it('nothing is written when nothing changes: None on an untouched sketch, the same template twice', () => {
    expect(metaWithTemplate({}, null)).toBeNull();
    expect(metaWithTemplate({ paperColor: 'grey' }, null)).toBeNull();
    expect(metaWithTemplate({ paperTemplate: PAPER_TEMPLATE_NONE }, null)).toBeNull();
    expect(metaWithTemplate({ paperTemplate: 'top3' }, 'top3')).toBeNull();
    // An id that is not a template is not a choice.
    expect(metaWithTemplate({}, 'not-a-template')).toBeNull();
  });

  it('P7: None never erases an id this build does not know', () => {
    expect(metaWithTemplate({ paperTemplate: 'hexagons-from-2031' }, null)).toBeNull();
  });

  it('the sheet sits at page (0, 0), one sheet in size, and follows the camera like the ruling', () => {
    expect(templateSheetBox({ x: 0, y: 0, z: 1 })).toEqual({ left: 0, top: 0, width: PAPER_PAGE.width, height: PAPER_PAGE.height });
    // A page point p is drawn at (p + camera) * z.
    expect(templateSheetBox({ x: -120, y: 40, z: 0.5 })).toEqual({ left: -60, top: 20, width: 500, height: 700 });
    expect(templateSheetBox({ x: 10, y: 10, z: 2 })).toEqual({ left: 20, top: 20, width: 2000, height: 2800 });
    // Zoomed far out it would be a smudge: left out, like the ruling.
    expect(templateSheetBox({ x: 0, y: 0, z: 0.1 })).toBeNull();
    expect(templateSheetBox({ x: 0, y: 0, z: 0.13 })).not.toBeNull();
  });

  it('bringing the sheet into view asks for its full width, from the top', () => {
    expect(templateViewBox({ w: 390, h: 600 })).toEqual({ x: 0, y: 0, w: 1000, h: 1400 });
    expect(templateViewBox({ w: 1280, h: 800 })).toEqual({ x: 0, y: 0, w: 1000, h: 625 });
    expect(templateViewBox(undefined)).toEqual({ x: 0, y: 0, w: 1000, h: 1400 });
  });

  it('P6: the printed words clear 4.5:1 on every paper, by day and at night', () => {
    for (const mode of ['light', 'dark']) {
      for (const paper of PAPER_COLORS) {
        const look = resolvePaper({ color: paper.id, pattern: 'plain' }, mode);
        const { ink, line, accent } = templateColors(look);
        const ground = look.background || TLDRAW_GROUND[look.colorScheme];
        expect(contrast(ink, ground), `${paper.id} in ${mode}`).toBeGreaterThanOrEqual(4.5);
        expect(accent).toBe(ink);
        // The rules are the paper's own line colour, a step stronger than the ruling.
        const alpha = (rgba) => Number(rgba.match(/([\d.]+)\)$/)[1]);
        expect(line.replace(/[\d.]+\)$/, '')).toBe(paper.line.replace(/[\d.]+\)$/, ''));
        expect(alpha(line)).toBeGreaterThan(alpha(paper.line));
      }
    }
    expect(templateColors(resolvePaper({ color: 'auto', pattern: 'plain' }, 'dark')).ink).toBe(TEMPLATE_INK.dark);
    // Every coloured paper is light, even at night: the words stay dark.
    expect(templateColors(resolvePaper({ color: 'warm', pattern: 'plain' }, 'dark')).ink).toBe(TEMPLATE_INK.light);
  });
});

describe('the background', () => {
  it('P5: a sketch with no template is exactly the element it always was', () => {
    tl.editor = makeEditor({ paperColor: 'warm', paperPattern: 'lined' });
    const { container } = wrap(<PaperBackground />);
    const el = background(container);
    expect(el.outerHTML).toBe(
      '<div class="tl-background" data-paper-pattern="lined" style="background-color: rgb(244, 238, 223); '
      // (jsdom drops the gradient's default `to bottom`.)
      + 'background-image: linear-gradient(rgba(130, 95, 50, 0.22) 1px, transparent 1px); '
      + 'background-size: 100% 32px; background-position: 0px 0px;"></div>',
    );
  });

  it.each([
    ['never chose', {}],
    ['chose None', { paperTemplate: 'none' }],
    ['P7: an id this build does not know', { paperTemplate: 'hexagons-from-2031' }],
  ])('%s: no sheet is drawn and the ruling is as before', (_name, extra) => {
    tl.editor = makeEditor({ paperColor: 'white', paperPattern: 'graph', ...extra });
    const { container } = wrap(<PaperBackground />);
    expect(sheet(container)).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(background(container).hasAttribute('data-paper-template')).toBe(false);
    expect(background(container).style.backgroundImage).toContain('linear-gradient');
    expect(background(container).childElementCount).toBe(0);
  });

  it('a template is one picture of the sheet at page (0, 0), in the paper\'s colours', () => {
    tl.editor = makeEditor({ paperColor: 'green', paperPattern: 'plain', paperTemplate: 'meeting' });
    const { container } = wrap(<PaperBackground />);
    const img = sheet(container);
    expect(img).not.toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(background(container).getAttribute('data-paper-template')).toBe('meeting');
    expect(background(container).style.backgroundColor).toBe('rgb(225, 235, 214)');
    const look = resolvePaper({ color: 'green', pattern: 'plain' }, 'light');
    expect(img.getAttribute('src')).toBe(paperTemplateDataUri('meeting', templateColors(look)));
    expect(img.style.width).toBe('1000px');
    expect(img.style.height).toBe('1400px');
    expect(img.style.transform).toBe('translate(0px, 0px)');
  });

  it('P2, P6: it is decoration — hidden from assistive tech, deaf to the pointer, and inside the background', () => {
    tl.editor = makeEditor({ paperTemplate: 'schedule' });
    const { container } = wrap(<PaperBackground />);
    const img = sheet(container);
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.style.pointerEvents).toBe('none');
    expect(img.getAttribute('draggable')).toBe('false');
    expect(img.parentElement).toBe(background(container));
    // Its words are in the picture only: nothing on the page says them.
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('it moves and scales with the camera', () => {
    tl.editor = makeEditor({ paperTemplate: 'cornell' }, { x: -120, y: 40, z: 0.5 });
    const { container, rerender } = wrap(<PaperBackground />);
    expect(sheet(container).style.width).toBe('500px');
    expect(sheet(container).style.height).toBe('700px');
    expect(sheet(container).style.transform).toBe('translate(-60px, 20px)');
    tl.editor.camera = { x: 0, y: 0, z: 0.1 };
    rerender(<ThemeProvider theme={createNoteTheme('light')}><PaperBackground /></ThemeProvider>);
    // Too far out to read: the paper colour only.
    expect(sheet(container)).toBeNull();
    expect(background(container).getAttribute('data-paper-template')).toBe('cornell');
  });

  it('a template takes the place of the ruling; the sketch keeps its lines for later', () => {
    tl.editor = makeEditor({ paperColor: 'warm', paperPattern: 'lined', paperTemplate: 'top3' });
    const { container } = wrap(<PaperBackground />);
    expect(background(container).style.backgroundImage).toBe('');
    expect(background(container).getAttribute('data-paper-pattern')).toBe('lined');
    expect(tl.editor.updateDocumentSettings).not.toHaveBeenCalled();
  });

  it('P6: on "Match theme" at night the words are light; on a coloured paper they stay dark', () => {
    tl.editor = makeEditor({ paperColor: 'auto', paperTemplate: 'meeting' });
    const night = wrap(<PaperBackground />, 'dark');
    expect(decodeURIComponent(sheet(night.container).getAttribute('src'))).toContain(`fill="${TEMPLATE_INK.dark}"`);
    night.unmount();
    tl.editor = makeEditor({ paperColor: 'warm', paperTemplate: 'meeting' });
    const warm = wrap(<PaperBackground />, 'dark');
    expect(decodeURIComponent(sheet(warm.container).getAttribute('src'))).toContain(`fill="${TEMPLATE_INK.light}"`);
  });

  it('rendering never writes to the sketch', () => {
    for (const meta of [{}, { paperTemplate: 'grid' }, { paperTemplate: 'hexagons-from-2031' }]) {
      tl.editor = makeEditor(meta);
      const { unmount } = wrap(<PaperBackground />);
      expect(tl.editor.updateDocumentSettings).not.toHaveBeenCalled();
      expect(tl.editor.zoomToBounds).not.toHaveBeenCalled();
      unmount();
    }
  });
});

describe('the Paper menu\'s Template choice', () => {
  const open = async (user) => {
    await user.click(screen.getByRole('button', { name: 'Paper' }));
    return within(await screen.findByRole('dialog', { name: 'Paper' })).getByRole('group', { name: 'Paper template' });
  };
  const rerenderPicker = (view) => view.rerender(<ThemeProvider theme={createNoteTheme('light')}><PaperPicker /></ThemeProvider>);

  it('P1, P5: sits beside colour and lines, offering None and the six', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor();
    wrap(<PaperPicker />);
    const group = await open(user);
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Template: None', 'Template: Schedule', 'Template: Top three', 'Template: Meeting',
      'Template: Cornell', 'Template: Dot grid', 'Template: Grid',
    ]);
    // A new sketch has none, and says so.
    expect(within(group).getByRole('button', { name: 'Template: None' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getAllByRole('button', { pressed: true })).toHaveLength(1);
    const menu = screen.getByRole('dialog', { name: 'Paper' });
    expect(within(menu).getByRole('group', { name: 'Paper colour' })).toBeInTheDocument();
    expect(within(menu).getByRole('group', { name: 'Paper lines' })).toBeInTheDocument();
  });

  it('P3: picking one writes it to the sketch\'s document meta, beside the paper, and nowhere else', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor({ paperColor: 'grey', paperPattern: 'dots' });
    const view = wrap(<PaperPicker />);
    const group = await open(user);
    await user.click(within(group).getByRole('button', { name: 'Template: Cornell' }));
    expect(tl.editor.updateDocumentSettings).toHaveBeenCalledTimes(1);
    expect(tl.editor.updateDocumentSettings).toHaveBeenCalledWith({
      meta: { paperColor: 'grey', paperPattern: 'dots', paperTemplate: 'cornell' },
    });
    // P5: per sketch only — a template is never this device's default.
    expect(localStorage.getItem('notegeek:sketchPaper')).toBeNull();
    expect(Object.keys(localStorage).filter((k) => /template/i.test(k))).toEqual([]);
    rerenderPicker(view);
    expect(within(group).getByRole('button', { name: 'Template: Cornell' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Template: None' })).toHaveAttribute('aria-pressed', 'false');
    // The sheet is brought into view (camera only).
    expect(tl.editor.zoomToBounds).toHaveBeenCalledWith({ x: 0, y: 0, w: 1000, h: 1400 }, { targetZoom: 1, inset: 16 });
  });

  it('None takes it off again, and the paper is untouched', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor({ paperColor: 'grey', paperPattern: 'dots', paperTemplate: 'grid' });
    wrap(<PaperPicker />);
    const group = await open(user);
    expect(within(group).getByRole('button', { name: 'Template: Grid' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: 'Template: None' }));
    expect(tl.editor.document.meta).toEqual({ paperColor: 'grey', paperPattern: 'dots', paperTemplate: 'none' });
    expect(tl.editor.zoomToBounds).not.toHaveBeenCalled();
  });

  it('None on a sketch that has none writes nothing: opening the menu never dirties a sketch', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor({});
    wrap(<PaperPicker />);
    const group = await open(user);
    await user.click(within(group).getByRole('button', { name: 'Template: None' }));
    expect(tl.editor.updateDocumentSettings).not.toHaveBeenCalled();
  });

  it('P7: an unknown id shows as None and survives; choosing paper keeps it too', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor({ paperTemplate: 'hexagons-from-2031' });
    wrap(<PaperPicker />);
    const group = await open(user);
    expect(within(group).getByRole('button', { name: 'Template: None' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(group).getByRole('button', { name: 'Template: None' }));
    expect(tl.editor.updateDocumentSettings).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Paper: White' }));
    expect(tl.editor.document.meta.paperTemplate).toBe('hexagons-from-2031');
    expect(tl.editor.document.meta.paperColor).toBe('white');
  });

  it('choosing paper colour or lines never drops the template (and still sets the device paper)', () => {
    tl.editor = makeEditor({ paperTemplate: 'schedule' });
    act(() => setPaper(tl.editor, { color: 'green' }));
    act(() => setPaper(tl.editor, { pattern: 'graph' }));
    expect(tl.editor.document.meta).toEqual({ paperTemplate: 'schedule', paperColor: 'green', paperPattern: 'graph' });
    expect(JSON.parse(localStorage.getItem('notegeek:sketchPaper'))).toEqual({ color: 'green', pattern: 'graph' });
    act(() => setPaperTemplate(tl.editor, 'meeting'));
    expect(JSON.parse(localStorage.getItem('notegeek:sketchPaper'))).toEqual({ color: 'green', pattern: 'graph' });
  });

  it('every choice is a 44px button with a name, and says a template replaces the lines once one is set', async () => {
    const user = userEvent.setup();
    tl.editor = makeEditor({ paperTemplate: 'dots' });
    wrap(<PaperPicker />);
    const group = await open(user);
    for (const b of within(group).getAllByRole('button')) {
      expect(b.tagName).toBe('BUTTON');
      expect(getComputedStyle(b).minHeight).toBe('44px');
      expect(b.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    expect(screen.getByText('A template takes the place of the lines.')).toBeInTheDocument();
  });
});
