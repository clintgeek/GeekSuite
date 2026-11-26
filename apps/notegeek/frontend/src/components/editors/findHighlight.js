import { createContext } from 'react';

/**
 * The search hit's highlight on a handwritten page, `{ rects }` in page
 * units or null (SketchFind.jsx, DOCS/HANDWRITING.md §5). Provided around
 * <Tldraw> by HandwrittenEditor; read by tldraw's `OnTheCanvas` component.
 */
export const FindHighlightContext = createContext(null);
