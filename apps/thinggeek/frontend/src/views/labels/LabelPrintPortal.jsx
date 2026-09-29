/**
 * Prints the selected labels, reusing InsuranceView's approach (see
 * src/views/InsuranceView.jsx and src/styles.css): a print-only document is
 * rendered into its own portal on `<body>`, swapped in for `#root` under
 * `@media print` by a body class. That keeps the app shell's fixed-height,
 * scrolling layout from ever clipping the printout.
 *
 * This page can't add to the shared src/styles.css (owned by the redesign
 * work happening in parallel), so the print rule lives in its own `<style>`
 * tag with its own ids/class — `tg-labels-print-root` / `tg-labels-printing`
 * — deliberately distinct from insurance's `tg-print-root` / `tg-printing`
 * so the two never collide if both ever end up mounted at once.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box } from '@mui/material';
import LabelSticker from './LabelSticker';

const ROOT_ID = 'tg-labels-print-root';
const BODY_CLASS = 'tg-labels-printing';

function usePrintRoot() {
  const [node, setNode] = useState(null);
  useEffect(() => {
    const el = document.createElement('div');
    el.id = ROOT_ID;
    document.body.appendChild(el);
    document.body.classList.add(BODY_CLASS);
    setNode(el);
    return () => {
      document.body.classList.remove(BODY_CLASS);
      el.remove();
    };
  }, []);
  return node;
}

function LabelPrintStyles() {
  return (
    <style>{`
      #${ROOT_ID} { display: none; }
      @media print {
        @page { margin: 8mm; }
        html, body { height: auto !important; background: #fff !important; }
        body.${BODY_CLASS} > #root { display: none !important; }
        body.${BODY_CLASS} > #${ROOT_ID} { display: block !important; }
      }
    `}</style>
  );
}

export default function LabelPrintPortal({ things, size }) {
  const root = usePrintRoot();
  return (
    <>
      <LabelPrintStyles />
      {root
        ? createPortal(
            <Box data-testid="label-print-sheet" sx={{ display: 'flex', flexWrap: 'wrap', gap: '3mm' }}>
              {things.map((thing) => (
                <LabelSticker key={thing.id} thing={thing} size={size} testIdPrefix="print-label" />
              ))}
            </Box>,
            root
          )
        : null}
    </>
  );
}
