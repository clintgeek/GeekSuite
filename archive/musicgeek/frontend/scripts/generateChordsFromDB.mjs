import guitar from '@tombatossals/chords-db/lib/guitar.json' assert { type: 'json' };

// Function to generate SVG from verified chord data
export const generateChordSVG = (chordKey, chordSuffix) => {
  // Find the chord in the database
  const chordData = guitar.chords[chordKey]?.find(c => c.suffix === chordSuffix);

  if (!chordData || !chordData.positions || chordData.positions.length === 0) {
    console.error(`Chord not found: ${chordKey} ${chordSuffix}`);
    return null;
  }

  // Use the first position (most common fingering)
  const position = chordData.positions[0];
  const { frets, fingers, barres, capo } = position;

  const width = 240;
  const height = 240;
  const stringSpacing = 30;
  const fretHeight = 40;
  const topMargin = 50;
  const leftMargin = 35;
  const numFrets = 4;

  // Determine fret range
  const baseFret = position.baseFret || 1;
  const displayBaseFret = baseFret > 1 ? baseFret : 0;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Title -->
  <text x="${width/2}" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${chordKey}${chordSuffix === 'major' ? '' : chordSuffix}</text>

  <!-- Fretboard -->
  <g transform="translate(${leftMargin}, ${topMargin})">`;

  // Draw strings (vertical lines)
  for (let i = 0; i < 6; i++) {
    const x = i * stringSpacing;
    svg += `
    <line x1="${x}" y1="0" x2="${x}" y2="${numFrets * fretHeight}" stroke="#333" stroke-width="1.5"/>`;
  }

  // Draw frets (horizontal lines)
  for (let i = 0; i <= numFrets; i++) {
    const y = i * fretHeight;
    const strokeWidth = (i === 0 && baseFret === 1) ? '3' : '1.5'; // Nut is thicker
    svg += `
    <line x1="0" y1="${y}" x2="${5 * stringSpacing}" y2="${y}" stroke="#333" stroke-width="${strokeWidth}"/>`;
  }

  // Draw string markers (X or O above nut)
  frets.forEach((fret, stringIndex) => {
    const x = stringIndex * stringSpacing;
    if (fret === -1) {
      // X = don't play this string
      svg += `
    <text x="${x}" y="-10" text-anchor="middle" font-size="16" font-weight="bold" fill="#c00">X</text>`;
    } else if (fret === 0) {
      // O = play open string
      svg += `
    <circle cx="${x}" cy="-10" r="6" fill="none" stroke="#333" stroke-width="2"/>`;
    }
  });

  // Draw finger positions
  frets.forEach((fret, stringIndex) => {
    if (fret > 0) {
      const x = stringIndex * stringSpacing;
      const adjustedFret = fret - (baseFret - 1);
      const y = (adjustedFret - 0.5) * fretHeight;
      const fingerNumber = fingers[stringIndex] || '';

      svg += `
    <circle cx="${x}" cy="${y}" r="10" fill="#2563eb"/>`;

      if (fingerNumber) {
        svg += `
    <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="white">${fingerNumber}</text>`;
      }
    }
  });

  // Draw barres if present
  if (barres && barres.length > 0) {
    barres.forEach(barre => {
      const y = (barre - (baseFret - 1) - 0.5) * fretHeight;
      const x1 = 0;
      const x2 = 5 * stringSpacing;
      svg += `
    <rect x="${x1}" y="${y - 8}" width="${x2}" height="16" rx="8" fill="#2563eb" opacity="0.7"/>`;
    });
  }

  // Base fret indicator (if not starting at nut)
  if (displayBaseFret > 0) {
    svg += `
    <text x="${-15}" y="${fretHeight/2 + 5}" text-anchor="end" font-size="12" fill="#666">${baseFret}fr</text>`;
  }

  svg += `
  </g>

  <!-- String labels (below fretboard) -->
  <text x="50" y="220" text-anchor="middle" font-size="10" fill="#666">E</text>
  <text x="80" y="220" text-anchor="middle" font-size="10" fill="#666">A</text>
  <text x="110" y="220" text-anchor="middle" font-size="10" fill="#666">D</text>
  <text x="140" y="220" text-anchor="middle" font-size="10" fill="#666">G</text>
  <text x="170" y="220" text-anchor="middle" font-size="10" fill="#666">B</text>
  <text x="200" y="220" text-anchor="middle" font-size="10" fill="#666">E</text>
</svg>`;

  return svg;
};

// Generate common beginner chords
export const generateBeginnerChords = () => {
  const chords = {
    'em': generateChordSVG('E', 'minor'),
    'e': generateChordSVG('E', 'major'),
    'am': generateChordSVG('A', 'minor'),
    'a': generateChordSVG('A', 'major'),
    'd': generateChordSVG('D', 'major'),
    'dm': generateChordSVG('D', 'minor'),
    'g': generateChordSVG('G', 'major'),
    'c': generateChordSVG('C', 'major'),
    'f': generateChordSVG('F', 'major'),
  };

  return chords;
};

// Log the E minor chord data for verification
const emChord = guitar.chords['E']?.find(c => c.suffix === 'minor');
console.log('E minor chord data from verified database:');
console.log(JSON.stringify(emChord?.positions[0], null, 2));
