import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const sizes = [192, 512];

for (const size of sizes) {
  const svgPath = join(rootDir, 'public', `pwa-${size}x${size}.svg`);
  const pngPath = join(rootDir, 'public', `pwa-${size}x${size}.png`);

  const svg = readFileSync(svgPath);

  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(pngPath);

  console.log(`Generated: pwa-${size}x${size}.png`);
}

console.log('Done!');