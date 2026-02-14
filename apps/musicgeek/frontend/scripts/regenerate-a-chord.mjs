import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// A Major chord definition with fingers 2, 3, 4
const generateChordSVG = (chordData) => {
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

// A Major chord with fingers 2, 3, 4 (matching the video tutorial)
const aMajorChord = {
  name: 'A Major',
  strings: ['x', 'o', 'o', 'o', 'o', 'o'],  // Only low E is muted, rest are open
  fingers: [
    [2, 2, 2],  // String 2 (D), Fret 2, Finger 2 (middle)
    [3, 2, 3],  // String 3 (G), Fret 2, Finger 3 (ring)
    [4, 2, 4],  // String 4 (B), Fret 2, Finger 4 (pinky)
  ],
};

// Generate the SVG
const svg = generateChordSVG(aMajorChord);

// Save to the correct location
const outputPath = path.join(__dirname, '..', 'public', 'assets', 'lessons', 'guitar', 'a-major', 'chord-diagram.svg');

// Ensure directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, svg);
console.log(`✅ Generated A Major chord diagram with fingers 2, 3, 4`);
console.log(`   Saved to: ${outputPath}`);
