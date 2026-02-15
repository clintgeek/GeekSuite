import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const process = require('process');

const sizes = [192, 512];
const inputIcon = path.join(process.cwd(), 'src', 'assets', 'logo.png');
const outputDir = path.join(process.cwd(), 'public');

async function generatePWAIcons() {
    try {
        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        // Generate PWA icons
        for (const size of sizes) {
            await sharp(inputIcon)
                .resize(size, size)
                .toFile(path.join(outputDir, `pwa-${size}x${size}.png`));
            console.log(`Generated ${size}x${size} icon`);
        }

        // Generate favicon.ico (16x16)
        await sharp(inputIcon)
            .resize(16, 16)
            .toFile(path.join(outputDir, 'favicon.ico'));
        console.log('Generated favicon.ico');

        // Generate apple-touch-icon (180x180)
        await sharp(inputIcon)
            .resize(180, 180)
            .toFile(path.join(outputDir, 'apple-touch-icon.png'));
        console.log('Generated apple-touch-icon.png');

        console.log('PWA assets generation complete!');
    } catch (error) {
        console.error('Error generating PWA assets:', error);
        process.exit(1);
    }
}

generatePWAIcons();