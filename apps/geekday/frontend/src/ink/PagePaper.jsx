/**
 * PagePaper.jsx — what the day page is printed on: the paper colour and its
 * ruling, dots or grid, all the way down the page.
 *
 * tldraw's `Background` component, so it is drawn behind everything and is
 * never a shape: it cannot be selected, erased or lassoed and is in no export.
 * It is in PAGE space: it moves and scales with the camera. Decorative
 * throughout (`aria-hidden`, empty alt).
 *
 * A TEMPLATE is not drawn here: it is a locked image shape in the drawing
 * (@geeksuite/ui `placePaperSheet`), which tldraw renders above this paper, so
 * the paper carries on around and below the white sheet. The one exception is
 * the PREVIEW: on a blank day that has never been saved, this device's
 * template for new days is shown here, exactly where and how the real sheet
 * will be, and becomes the real shape when the first ink lands.
 */
import React, { useContext, useMemo } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { PAPER_SHEET_COLORS, paperTemplateDataUri, paperTemplateHeight } from '@geeksuite/ui';
import { PAGE_WIDTH, SHEET_HEIGHT } from './pageCamera';
import { InkPageContext, rulingStyle, usePaperColors } from './paperLook';
import { NO_SHEET, RULED } from './pageTemplate';

const fill = { position: 'absolute', inset: 0 };

const sheetStyle = (camera, height) => ({
  position: 'absolute',
  left: 0,
  top: 0,
  width: PAGE_WIDTH * camera.z,
  height: height * camera.z,
  maxWidth: 'none',
  transform: `translate(${camera.x * camera.z}px, ${camera.y * camera.z}px)`,
  pointerEvents: 'none',
  userSelect: 'none',
});

export function PagePaper() {
  const editor = useEditor();
  const camera = useValue('camera', () => editor.getCamera(), [editor]);
  const { paper, preview, light, pageHeight } = useContext(InkPageContext);
  const colors = usePaperColors(light);
  const ruled = paper === RULED;
  const pattern = useMemo(
    () => (ruled ? null : paperTemplateDataUri(paper, { line: colors.line, height: pageHeight })),
    [ruled, paper, colors, pageHeight],
  );
  const sheet = useMemo(() => (preview ? paperTemplateDataUri(preview, PAPER_SHEET_COLORS) : null), [preview]);

  return (
    <div
      aria-hidden="true"
      data-testid="ink-paper"
      data-paper={paper}
      style={{ ...fill, overflow: 'hidden', backgroundColor: colors.paper }}
    >
      {ruled ? <div data-testid="ink-rules" style={{ ...fill, ...rulingStyle(camera, colors.line) }} /> : null}
      {pattern ? (
        <img alt="" aria-hidden="true" draggable={false} data-testid="ink-pattern" data-paper={paper} src={pattern} style={sheetStyle(camera, pageHeight)} />
      ) : null}
      {sheet ? (
        <img alt="" aria-hidden="true" draggable={false} data-testid="ink-sheet-preview" data-template={preview} src={sheet} style={sheetStyle(camera, paperTemplateHeight(preview))} />
      ) : null}
    </div>
  );
}

const CHIP_SCALE = 0.13; // the top-left 340 x 430 page units

/** A small corner of a paper, for the Page menu. Decorative. */
export function PaperChip({ id, width = 44, height = 56 }) {
  const colors = usePaperColors();
  const src = useMemo(
    // In the words' colour: the page's own ruling is too faint to read this small.
    () => (id === RULED ? null : paperTemplateDataUri(id, { line: colors.ink })),
    [id, colors],
  );
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'block',
        flex: 'none',
        width,
        height,
        overflow: 'hidden',
        borderRadius: 4,
        backgroundColor: colors.paper,
        boxShadow: `0 0 0 1px ${colors.edge}`,
        ...(src ? null : rulingStyle({ x: 0, y: 0, z: CHIP_SCALE }, colors.line)),
      }}
    >
      {src ? (
        <img alt="" draggable={false} src={src} style={{ position: 'absolute', left: 0, top: 0, width: PAGE_WIDTH * CHIP_SCALE, height: SHEET_HEIGHT * CHIP_SCALE, maxWidth: 'none', opacity: 0.7 }} />
      ) : null}
    </span>
  );
}

/** A small corner of a template's white sheet, for the Page menu; "No template" is the bare paper. Decorative. */
export function SheetChip({ id, width = 44, height = 56 }) {
  const colors = usePaperColors();
  const none = id === NO_SHEET;
  const src = useMemo(
    () => (none ? null : paperTemplateDataUri(id, { ...PAPER_SHEET_COLORS, line: PAPER_SHEET_COLORS.ink })),
    [id, none],
  );
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'block',
        flex: 'none',
        width,
        height,
        overflow: 'hidden',
        borderRadius: 4,
        backgroundColor: none ? colors.paper : PAPER_SHEET_COLORS.ground,
        boxShadow: `0 0 0 1px ${colors.edge}`,
      }}
    >
      {src ? (
        <img alt="" draggable={false} src={src} style={{ position: 'absolute', left: 0, top: 0, width: PAGE_WIDTH * CHIP_SCALE, height: paperTemplateHeight(id) * CHIP_SCALE, maxWidth: 'none' }} />
      ) : null}
    </span>
  );
}
