/**
 * Generate SVG chord diagrams programmatically
 * Based on standard guitar chord fingerings
 */

export const generateChordSVG = (chordData) => {
  const { name, fingers, strings, frets = 4, startFret = 0 } = chordData;

  const width = 200;
  const height = 240;
  const stringSpacing = 30;
  const fretHeight = 40;
  const topMargin = 50;
  const leftMargin = 35;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Title -->
  <text x="${width / 2}" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${name}</text>

  <!-- Fretboard -->
  <g transform="translate(${leftMargin}, ${topMargin})">`;

  // Draw strings (vertical lines)
  for (let i = 0; i < 6; i++) {
    const x = i * stringSpacing;
    svg += `
    <line x1="${x}" y1="0" x2="${x}" y2="${frets * fretHeight}" stroke="#333" stroke-width="1.5"/>`;
  }

  // Draw frets (horizontal lines)
  for (let i = 0; i <= frets; i++) {
    const y = i * fretHeight;
    const strokeWidth = i === 0 ? '3' : '1.5'; // Nut is thicker
    svg += `
    <line x1="0" y1="${y}" x2="${5 * stringSpacing}" y2="${y}" stroke="#333" stroke-width="${strokeWidth}"/>`;
  }

  // Draw string markers (X or O above nut)
  // Only show markers for strings that don't have finger positions
  const stringHasFinger = new Array(6).fill(false);
  fingers.forEach(([string]) => {
    stringHasFinger[string] = true;
  });

  strings.forEach((status, i) => {
    const x = i * stringSpacing;
    // Only show X or O if this string doesn't have a finger position
    if (!stringHasFinger[i]) {
      if (status === 'x' || status === 0) {
        // X = don't play this string
        svg += `
    <text x="${x}" y="-10" text-anchor="middle" font-size="16" font-weight="bold" fill="#c00">X</text>`;
      } else if (status === 'o') {
        // O = play open string
        svg += `
    <circle cx="${x}" cy="-10" r="6" fill="none" stroke="#333" stroke-width="2"/>`;
      }
    }
  });

  // Draw finger positions
  fingers.forEach(([string, fret, finger]) => {
    const x = string * stringSpacing;
    const y = (fret - 0.5) * fretHeight;

    svg += `
    <circle cx="${x}" cy="${y}" r="8" fill="#2563eb"/>
    <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="white">${finger || ''}</text>`;
  });

  // Start fret indicator (if not starting at nut)
  if (startFret > 0) {
    svg += `
    <text x="${-15}" y="${fretHeight / 2}" text-anchor="end" font-size="12" fill="#666">${startFret}fr</text>`;
  }

  svg += `
  </g>
</svg>`;

  return svg;
};

// Standard chord definitions
export const chordLibrary = {
  E: {
    name: 'E Major',
    strings: ['o', 'x', 'x', 1, 2, 'o'],
    fingers: [
      [3, 1, 1],
      [4, 2, 3],
      [5, 2, 2],
    ],
  },
  Em: {
    name: 'E Minor',
    strings: ['o', 'x', 'x', 'o', 'o', 'o'],
    fingers: [
      [4, 2, 2],
      [5, 2, 3],
    ],
  },
  A: {
    name: 'A Major',
    strings: ['x', 'o', 'o', 'o', 'o', 'o'],
    fingers: [
      [2, 2, 2],
      [3, 2, 3],
      [4, 2, 4],
    ],
  },
  Am: {
    name: 'A Minor',
    strings: ['x', 'o', 'x', 'x', 1, 'o'],
    fingers: [
      [2, 1, 2],
      [3, 2, 3],
      [4, 2, 1],
    ],
  },
  D: {
    name: 'D Major',
    strings: ['x', 'x', 'o', 'x', 'x', 'x'],
    fingers: [
      [1, 2, 1],
      [2, 3, 3],
      [3, 2, 2],
    ],
  },
  Dm: {
    name: 'D Minor',
    strings: ['x', 'x', 'o', 'x', 'x', 1],
    fingers: [
      [1, 1, 1],
      [2, 3, 3],
      [3, 2, 2],
    ],
  },
  G: {
    name: 'G Major',
    strings: ['x', 'x', 'o', 'o', 'o', 'x'],
    fingers: [
      [0, 2, 2],
      [4, 3, 3],
      [5, 3, 4],
    ],
  },
  C: {
    name: 'C Major',
    strings: ['x', 'x', 'x', 'o', 1, 'o'],
    fingers: [
      [1, 1, 1],
      [2, 2, 2],
      [4, 3, 3],
    ],
  },
};

// Generate and save chord diagrams
export const generateAllChords = () => {
  const chords = {};
  Object.keys(chordLibrary).forEach((key) => {
    chords[key] = generateChordSVG(chordLibrary[key]);
  });
  return chords;
};
