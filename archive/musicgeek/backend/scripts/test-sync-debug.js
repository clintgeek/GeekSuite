#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const lessonsDir = path.join(__dirname, '../content/lessons');
const file = 'guitar-welcome.json';
const fullPath = path.join(lessonsDir, file);
const raw = fs.readFileSync(fullPath, 'utf8');
const parsed = JSON.parse(raw);

console.log('Parsed JSON:');
console.log('meta.imageUrl:', parsed.meta.imageUrl);
console.log('meta.videoUrl:', parsed.meta.videoUrl);
console.log('meta.audioUrl:', parsed.meta.audioUrl);
