import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const logoPath = new URL('../public/icons/mave.svg', import.meta.url);
const logo = await readFile(logoPath);

const variants = [
  { filename: 'apple-touch-icon-dark.png', background: '#111013', logo },
  { filename: 'apple-touch-icon-light.png', background: '#ffffff', logo },
];

for (const variant of variants) {
  const mark = await sharp(variant.logo).resize(180, 180).png().toBuffer();
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: variant.background,
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(fileURLToPath(new URL(`../public/icons/${variant.filename}`, import.meta.url)));
}
