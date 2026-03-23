const fs = require('fs');
const path = require('path');

// Generate a labeled chord diagram for teaching purposes
function generateLabeledChordDiagram() {
  const width = 300;
  const height = 320;
  const stringSpacing = 40;
  const fretHeight = 50;
  const topMargin = 80;
  const leftMargin = 50;
  const numFrets = 4;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Title -->
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="18" font-weight="bold" fill="#333">How to Read a Chord Diagram</text>

  <!-- Fretboard with labels -->
  <g transform="translate(${leftMargin}, ${topMargin})">`;

  // Draw strings (vertical lines) with labels
  const stringNames = ['E', 'A', 'D', 'G', 'B', 'E'];
  for (let i = 0; i < 6; i++) {
    const x = i * stringSpacing;
    // String line
    svg += `\n    <line x1="${x}" y1="0" x2="${x}" y2="${numFrets * fretHeight}" stroke="#333" stroke-width="1.5"/>`;
    // String name below
    svg += `\n    <text x="${x}" y="${numFrets * fretHeight + 25}" text-anchor="middle" font-size="12" fill="#666">${stringNames[i]}</text>`;
    // String number above
    svg += `\n    <text x="${x}" y="-45" text-anchor="middle" font-size="11" fill="#999">${6 - i}</text>`;
  }

  // Draw frets (horizontal lines) with labels
  for (let i = 0; i <= numFrets; i++) {
    const y = i * fretHeight;
    const strokeWidth = i === 0 ? 3 : 1.5;
    svg += `\n    <line x1="0" y1="${y}" x2="${5 * stringSpacing}" y2="${y}" stroke="#333" stroke-width="${strokeWidth}"/>`;

    // Fret numbers on the left
    if (i > 0) {
      svg += `\n    <text x="${-20}" y="${y - fretHeight / 2 + 5}" text-anchor="middle" font-size="12" fill="#666">${i}</text>`;
    }
  }

  // Add example indicators
  // X marker (don't play)
  svg +=
    '\n    <text x="0" y="-15" text-anchor="middle" font-size="18" font-weight="bold" fill="#c00">X</text>';
  svg +=
    '\n    <text x="0" y="-60" text-anchor="middle" font-size="9" fill="#c00">Don\'t Play</text>';

  // O marker (play open)
  svg += `\n    <circle cx="${stringSpacing}" cy="-15" r="8" fill="none" stroke="#333" stroke-width="2"/>`;
  svg += `\n    <text x="${stringSpacing}" y="-60" text-anchor="middle" font-size="9" fill="#333">Play Open</text>`;

  // Example finger position
  const exampleFret = 2;
  const exampleString = 3; // D string
  const exampleX = exampleString * stringSpacing;
  const exampleY = (exampleFret - 0.5) * fretHeight;

  svg += `\n    <circle cx="${exampleX}" cy="${exampleY}" r="12" fill="#2563eb"/>`;
  svg += `\n    <text x="${exampleX}" y="${exampleY + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="white">2</text>`;

  // Label for finger position
  svg += `\n    <line x1="${exampleX + 15}" y1="${exampleY}" x2="${exampleX + 60}" y2="${exampleY - 30}" stroke="#2563eb" stroke-width="1.5" marker-end="url(#arrowhead)"/>`;
  svg += `\n    <text x="${exampleX + 65}" y="${exampleY - 25}" font-size="10" fill="#2563eb">Finger position</text>`;
  svg += `\n    <text x="${exampleX + 65}" y="${exampleY - 13}" font-size="10" fill="#2563eb">(number = finger)</text>`;

  svg += '\n  </g>';

  // Arrow marker definition
  svg += `\n  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
    </marker>
  </defs>`;

  // Legend at bottom
  svg += `\n
  <text x="20" y="${height - 30}" font-size="11" fill="#666">Strings numbered 6 (thickest) to 1 (thinnest)</text>
  <text x="20" y="${height - 15}" font-size="11" fill="#666">Fret numbers shown on left side</text>`;

  svg += '\n</svg>';

  return svg;
}

// Save the diagram
const outputPath = path.join(
  __dirname,
  '..',
  '..',
  'frontend',
  'public',
  'assets',
  'lessons',
  'basics',
  'chord-diagram-guide.svg'
);
const outputDir = path.dirname(outputPath);

// Create directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const svg = generateLabeledChordDiagram();
fs.writeFileSync(outputPath, svg);

console.log('✅ Generated labeled chord diagram guide:', outputPath);
