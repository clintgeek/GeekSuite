import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AgricultureIcon from '@mui/icons-material/Agriculture';

const OUT_DIR = path.resolve(process.cwd(), 'public');
const OUT_FILE = path.join(OUT_DIR, 'favicon.svg');

const blue = '#6098CC';

// Render the MUI icon to SVG markup
const iconSvg = renderToStaticMarkup(
  React.createElement(AgricultureIcon, { htmlColor: '#FFFFFF', fontSize: 'inherit' })
);

// Compose final SVG: 256x256 blue square + centered icon scaled up
// Extract inner <svg ...>...</svg> content of icon
const iconInner = iconSvg
  .replace(/^[\s\S]*?<svg[^>]*>/i, '')
  .replace(/<\/svg>\s*$/i, '');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="${blue}"/>
  <g transform="translate(64,64) scale(8)">
    ${iconInner}
  </g>
</svg>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, svg, 'utf8');
console.log(`Wrote ${OUT_FILE}`);
