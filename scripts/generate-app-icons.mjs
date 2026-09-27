import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import sharp from 'sharp';

const logoPath = new URL('../public/icons/mave.svg', import.meta.url);
const logo = await readFile(logoPath);
const lightLogo = Buffer.from(
  logo.toString('utf8').replace(/#(?:ab87f8|422379|3b1a68)/g, '#f4f0fa'),
);

const variants = [
  { filename: 'apple-touch-icon-dark.png', background: '#111013', logo: lightLogo },
  { filename: 'apple-touch-icon-light.png', background: '#ffffff', logo },
];

for (const variant of variants) {
  const mark = await sharp(variant.logo).resize(148, 148).png().toBuffer();
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
