import { generateChordSVG, chordLibrary } from './chordGenerator.js';
import fs from 'fs';
import path from 'path';

const outputDir = path.join(process.cwd(), 'public', 'assets', 'lessons', 'chords');

// Create directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate all chord SVGs
Object.entries(chordLibrary).forEach(([key, chordData]) => {
  const svg = generateChordSVG(chordData);
  const filename = `${key.toLowerCase().replace('#', 'sharp')}.svg`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, svg);
  console.log(`✓ Generated ${filename}`);
});

console.log(`\n✅ Generated ${Object.keys(chordLibrary).length} chord diagrams in ${outputDir}`);
