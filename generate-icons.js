/**
 * Run once to generate PWA icons from the Shipcube logo.
 * Usage:
 *   npm install sharp
 *   node generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT_DIR = path.join(__dirname, 'public', 'icons');

// Navy background colour matching the app theme
const BG = '#1B2B5E';

function fetchSvg(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function buildIcon(logoSvg, size) {
  // Safe-zone: logo occupies 60% of the canvas, centred
  const logoSize = Math.round(size * 0.6);
  const offset   = Math.round((size - logoSize) / 2);

  // Re-encode logo as a sized SVG buffer (white version via brightness filter)
  const logoPng = await sharp(Buffer.from(logoSvg))
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Navy square background
  const bg = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 27, g: 43, b: 94, alpha: 1 }, // #1B2B5E
    },
  })
    .png()
    .toBuffer();

  // Composite logo (white-inverted) onto background
  const result = await sharp(bg)
    .composite([
      {
        input: await sharp(logoPng)
          .negate({ alpha: false })   // invert to white
          .toBuffer(),
        left: offset,
        top: offset,
      },
    ])
    .png()
    .toBuffer();

  return result;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching Shipcube logo SVG…');
  const logoSvg = await fetchSvg('https://www.shipcube.com/img/logo.svg');

  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

  for (const size of sizes) {
    const buf  = await buildIcon(logoSvg, size);
    const file = path.join(OUT_DIR, `icon-${size}.png`);
    fs.writeFileSync(file, buf);
    console.log(`  ✓ icon-${size}.png`);
  }

  // Apple touch icon (180×180)
  const appleBuf  = await buildIcon(logoSvg, 180);
  fs.writeFileSync(path.join(__dirname, 'public', 'apple-touch-icon.png'), appleBuf);
  console.log('  ✓ apple-touch-icon.png  (public/)');

  console.log('\nDone! Icons written to public/icons/');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
