import { createRequire } from 'module';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const process = require('process');

async function convertSvgToPng() {
    const inputFile = path.join(process.cwd(), 'src', 'assets', 'logo.svg');
    const outputFile = path.join(process.cwd(), 'src', 'assets', 'logo.png');

    try {
        const svgBuffer = await fs.readFile(inputFile);
        await sharp(svgBuffer)
            .resize(512, 512)
            .png()
            .toFile(outputFile);

        console.log('Successfully converted SVG to PNG');
    } catch (error) {
        console.error('Error converting SVG to PNG:', error);
        process.exit(1);
    }
}

convertSvgToPng();