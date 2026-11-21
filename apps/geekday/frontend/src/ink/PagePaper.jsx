/**
 * PagePaper.jsx — what the day page is printed on: the paper colour, the
 * ruled lines, and the page template (DOCS/TEMPLATES_SPEC.md P2, P6).
 *
 * tldraw's `Background` component, so it is drawn behind the ink and is never
 * a shape: it cannot be selected, erased or lassoed and is in no export. It
 * is in PAGE space: the ruling and the template move and scale with the
 * camera. Decorative throughout (`aria-hidden`, empty alt).
 *
 *   Ruled               ruled lines all the way down
 *   a template          the template on the first sheet, ruled lines below it
 *   Dot grid, Grid      the pattern all the way down
 */
import React, { useContext, useMemo } from 'react';
import { useEditor, useValue } from '@tldraw/tldraw';
import { paperTemplateDataUri } from '@geeksuite/ui';
import { PAGE_WIDTH, SHEET_HEIGHT } from './pageCamera';
import { InkPageContext, rulingStyle, usePaperColors } from './paperLook';
import { RULED, choiceFor } from './pageTemplate';

const fill = { position: 'absolute', inset: 0 };

export function PagePaper() {
  const editor = useEditor();
  const camera = useValue('camera', () => editor.getCamera(), [editor]);
  const { template, pageHeight } = useContext(InkPageContext);
  const colors = usePaperColors();
  const printed = template !== RULED;
  const tiles = choiceFor(template).tiles;
  const height = tiles ? pageHeight : SHEET_HEIGHT;
  const src = useMemo(
    () => (printed ? paperTemplateDataUri(template, { ink: colors.ink, line: colors.line, accent: colors.accent, height }) : null),
    [printed, template, colors, height],
  );

  const z = camera.z;
  // The ruling starts where the template's sheet ends; a pattern that tiles has none.
  const ruled = !printed || !tiles;
  const rulesTop = printed ? Math.max(0, (SHEET_HEIGHT + camera.y) * z) : 0;

  return (
    <div
      aria-hidden="true"
      data-testid="ink-paper"
      data-template={template}
      style={{ ...fill, overflow: 'hidden', backgroundColor: colors.paper }}
    >
      {ruled ? (
        <div
          data-testid="ink-rules"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: rulesTop, ...rulingStyle(camera, colors.line, rulesTop) }}
        />
      ) : null}
      {src ? (
        <img
          alt=""
          aria-hidden="true"
          draggable={false}
          data-testid="ink-template"
          data-template={template}
          src={src}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: PAGE_WIDTH * z,
            height: height * z,
            maxWidth: 'none',
            transform: `translate(${camera.x * z}px, ${camera.y * z}px)`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      ) : null}
    </div>
  );
}

/** A small corner of a page, for the Page menu. Decorative. */
export function PageChip({ id, width = 44, height = 56 }) {
  const colors = usePaperColors();
  const scale = 0.13; // the top-left 340 x 430 page units
  const src = useMemo(
    // Lines in the words' colour: the page's own ruling is too faint to read this small.
    () => (id === RULED ? null : paperTemplateDataUri(id, { ink: colors.ink, line: colors.ink, accent: colors.accent })),
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
        ...(src ? null : rulingStyle({ x: 0, y: 0, z: scale }, colors.line)),
      }}
    >
      {src ? (
        <img
          alt=""
          draggable={false}
          src={src}
          style={{ position: 'absolute', left: 0, top: 0, width: PAGE_WIDTH * scale, height: SHEET_HEIGHT * scale, maxWidth: 'none', opacity: 0.7 }}
        />
      ) : null}
    </span>
  );
}
