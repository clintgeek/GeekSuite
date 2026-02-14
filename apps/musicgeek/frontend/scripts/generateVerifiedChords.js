import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const guitar = require('@tombatossals/chords-db/lib/guitar.json');

// Function to generate SVG from verified chord data
const generateChordSVG = (chordKey, chordSuffix) => {
  const chordData = guitar.chords[chordKey]?.find((c) => c.suffix === chordSuffix);

  if (!chordData || !chordData.positions || chordData.positions.length === 0) {
    console.error(`Chord not found: ${chordKey} ${chordSuffix}`);
    return null;
  }

  const position = chordData.positions[0];
  const { frets, fingers } = position;
  const baseFret = position.baseFret || 1;

  const width = 240;
  const height = 240;
  const stringSpacing = 30;
  const fretHeight = 40;
  const topMargin = 50;
  const leftMargin = 35;
  const numFrets = 4;

  // Format chord name nicely
  const displayName = chordSuffix === 'major' ? chordKey : `${chordKey} ${chordSuffix}`;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Title -->
  <text x="${width / 2}" y="20" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${displayName}</text>

  <!-- Fretboard -->
  <g transform="translate(${leftMargin}, ${topMargin})">`;

  // Strings
  for (let i = 0; i < 6; i++) {
    svg += `
    <line x1="${i * stringSpacing}" y1="0" x2="${i * stringSpacing}" y2="${numFrets * fretHeight}" stroke="#333" stroke-width="1.5"/>`;
  }

  // Frets
  for (let i = 0; i <= numFrets; i++) {
    const strokeWidth = i === 0 && baseFret === 1 ? '3' : '1.5';
    svg += `
    <line x1="0" y1="${i * fretHeight}" x2="${5 * stringSpacing}" y2="${i * fretHeight}" stroke="#333" stroke-width="${strokeWidth}"/>`;
  }

  // String markers
  frets.forEach((fret, idx) => {
    const x = idx * stringSpacing;
    if (fret === -1) {
      svg += `
    <text x="${x}" y="-10" text-anchor="middle" font-size="16" font-weight="bold" fill="#c00">X</text>`;
    } else if (fret === 0) {
      svg += `
    <circle cx="${x}" cy="-10" r="6" fill="none" stroke="#333" stroke-width="2"/>`;
    }
  });

  // Finger positions
  frets.forEach((fret, idx) => {
    if (fret > 0) {
      const x = idx * stringSpacing;
      const adjustedFret = fret - (baseFret - 1);
      const y = (adjustedFret - 0.5) * fretHeight;
      const finger = fingers[idx] || '';

      svg += `
    <circle cx="${x}" cy="${y}" r="10" fill="#2563eb"/>`;
      if (finger) {
        svg += `
    <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="white">${finger}</text>`;
      }
    }
  });

  // Base fret indicator
  if (baseFret > 1) {
    svg += `
    <text x="-15" y="${fretHeight / 2 + 5}" text-anchor="end" font-size="12" fill="#666">${baseFret}fr</text>`;
  }

  svg += `
  </g>

  <!-- String labels -->
  <text x="${leftMargin + 0 * stringSpacing}" y="220" text-anchor="middle" font-size="10" fill="#666">E</text>
  <text x="${leftMargin + 1 * stringSpacing}" y="220" text-anchor="middle" font-size="10" fill="#666">A</text>
  <text x="${leftMargin + 2 * stringSpacing}" y="220" text-anchor="middle" font-size="10" fill="#666">D</text>
  <text x="${leftMargin + 3 * stringSpacing}" y="220" text-anchor="middle" font-size="10" fill="#666">G</text>
  <text x="${leftMargin + 4 * stringSpacing}" y="220" text-anchor="middle" font-size="10" fill="#666">B</text>
  <text x="${leftMargin + 5 * stringSpacing}" y="220" text-anchor="middle" font-size="10" fill="#666">E</text>
</svg>`;

  return svg;
};

// Chords to generate in pedagogical order
// Order inspired by guitarnutrition.com's beginner progression
const chordsToGenerate = [
  { key: 'A', suffix: 'major', filename: 'a.svg' }, // 1. A major - easiest, great starting point
  { key: 'D', suffix: 'major', filename: 'd.svg' }, // 2. D major - simple triangle shape
  { key: 'E', suffix: 'major', filename: 'e.svg' }, // 3. E major - completes basic major chords
  { key: 'A', suffix: 'minor', filename: 'am.svg' }, // 4. A minor - one finger different from A
  { key: 'E', suffix: 'minor', filename: 'em.svg' }, // 5. E minor - easiest chord overall
  { key: 'D', suffix: 'minor', filename: 'dm.svg' }, // 6. D minor - similar to D major
  { key: 'C', suffix: 'major', filename: 'c.svg' }, // 7. C major - essential open chord
  { key: 'G', suffix: 'major', filename: 'g.svg' }, // 8. G major - full six-string chord
  { key: 'F', suffix: 'major', filename: 'f.svg' }, // 9. F major - barre chord
  { key: 'D', suffix: '7', filename: 'd7.svg' }, // 10. D7 - first 7th chord
  { key: 'A', suffix: '7', filename: 'a7.svg' }, // 11. A7 - dominant 7th
];

const outputDir = path.join(__dirname, '..', 'public', 'assets', 'lessons', 'chords');

// Log E minor data first
const emChord = guitar.chords['E']?.find((c) => c.suffix === 'minor');
console.log('\n✅ Verified E minor chord data:');
console.log('Frets:', emChord?.positions[0].frets);
console.log('Fingers:', emChord?.positions[0].fingers);
console.log("(0 = open, -1 = don't play)\n");

// Generate all chords
chordsToGenerate.forEach(({ key, suffix, filename }) => {
  const svg = generateChordSVG(key, suffix);
  if (svg) {
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, svg);
    console.log(`✓ Generated ${filename} - ${key} ${suffix}`);
  }
});

console.log(`\n✅ Generated ${chordsToGenerate.length} verified chord diagrams in ${outputDir}\n`);
