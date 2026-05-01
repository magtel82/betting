import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

function makeSvg(size) {
  const r = Math.round(size * 0.2);       // corner radius ~20%
  const cx = size / 2;
  const cy = size / 2;

  // Font sizes proportional to canvas
  const vmSize   = Math.round(size * 0.32);
  const betSize  = Math.round(size * 0.155);
  const vmY      = Math.round(cy - size * 0.045);
  const betY     = Math.round(cy + size * 0.225);

  // Subtle inner highlight — thin arc at top
  const hlR      = Math.round(size * 0.36);
  const hlStroke = Math.round(size * 0.018);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#1e62e8"/>
      <stop offset="100%" stop-color="#1344b8"/>
    </linearGradient>
    <linearGradient id="hl" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <clipPath id="clip">
      <rect width="${size}" height="${size}" rx="${r}" ry="${r}"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#bg)"/>

  <!-- Subtle top-left shine -->
  <ellipse cx="${Math.round(size * 0.3)}" cy="${Math.round(size * 0.22)}"
           rx="${Math.round(size * 0.55)}" ry="${Math.round(size * 0.38)}"
           fill="rgba(255,255,255,0.07)" clip-path="url(#clip)"/>

  <!-- "VM" -->
  <text
    x="${cx}" y="${vmY}"
    font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    font-size="${vmSize}"
    font-weight="900"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
    letter-spacing="-1"
  >VM</text>

  <!-- Thin separator line -->
  <rect
    x="${Math.round(cx - size * 0.18)}" y="${Math.round(cy + size * 0.09)}"
    width="${Math.round(size * 0.36)}" height="${Math.round(size * 0.012)}"
    rx="${Math.round(size * 0.006)}"
    fill="rgba(255,255,255,0.45)"
  />

  <!-- "BET" -->
  <text
    x="${cx}" y="${betY}"
    font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
    font-size="${betSize}"
    font-weight="700"
    fill="rgba(255,255,255,0.82)"
    text-anchor="middle"
    dominant-baseline="middle"
    letter-spacing="${Math.round(size * 0.022)}"
  >BET</text>
</svg>`;
}

for (const size of [192, 512]) {
  const svg    = makeSvg(size);
  const svgBuf = Buffer.from(svg);
  const outPath = join(outDir, `icon-${size}.png`);

  await sharp(svgBuf)
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`✓ ${outPath} (${size}×${size})`);
}

console.log("Done.");
