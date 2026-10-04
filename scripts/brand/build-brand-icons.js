#!/usr/bin/env node
/**
 * Worklyn brand assets: writes the master SVGs to assets/brand/ and renders every
 * app icon (web, Flutter Android/iOS, Worklyn Link desktop .ico) from the same mark.
 *
 *   node scripts/brand/build-brand-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');

const BRAND = {
  from: '#0F766E',
  to: '#22C55E',
  accent: '#FACC15',
  radius: 18,
  ink: '#0B1020',
  slate: '#7C88A8',
  tagline: 'HR &amp; DAVOMAT PLATFORMA',
};
const FONT = "Sora, Montserrat, 'Segoe UI', Inter, system-ui, sans-serif";

/** Keep in sync with BrandMark.tsx, worklyn_mark.dart and the Link UI icons.tsx. */
const SEASONS = {
  spring: { from: '#15803D', to: '#4ADE80', accent: '#F472B6' },
  summer: { from: BRAND.from, to: BRAND.to, accent: BRAND.accent },
  autumn: { from: '#9A3412', to: '#F59E0B', accent: '#FDE047' },
  winter: { from: '#1E3A8A', to: '#38BDF8', accent: '#E0F2FE' },
};

function glyph(stroke, dot) {
  return (
    `<path d="M13 20.5 L24.5 45 L32 31 L39.5 45 L51 20.5" fill="none" stroke="${stroke}" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="51" cy="20.5" r="5.2" fill="${dot}"/>`
  );
}

/** Tile + W in a 64x64 box. `radius: 0` gives a full-bleed square (iOS, maskable). */
function markBody({ radius = BRAND.radius, glyphScale = 1, palette = SEASONS.summer } = {}) {
  const r = radius;
  const highlight =
    r > 0
      ? `M0 ${r} A ${r} ${r} 0 0 1 ${r} 0 L64 0 L64 14 C34 14 14 34 14 64 L0 64 Z`
      : 'M0 0 L64 0 L64 14 C34 14 14 34 14 64 L0 64 Z';
  const g = glyph('#FFFFFF', palette.accent);
  const scaled =
    glyphScale === 1
      ? g
      : `<g transform="translate(${32 * (1 - glyphScale)} ${32 * (1 - glyphScale)}) scale(${glyphScale})">${g}</g>`;
  return (
    `<rect x="0" y="0" width="64" height="64" rx="${r}" fill="url(#wlg)"/>` +
    `<path d="${highlight}" fill="#FFFFFF" opacity="0.10"/>` +
    scaled
  );
}

const defs = (palette = SEASONS.summer) =>
  `<defs><linearGradient id="wlg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">` +
  `<stop stop-color="${palette.from}"/><stop offset="1" stop-color="${palette.to}"/></linearGradient></defs>`;
const DEFS = defs();

const open = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" role="img" aria-label="Worklyn">`;

function word(x, y, size, fill) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" letter-spacing="${(-size * 0.022).toFixed(2)}" fill="${fill}">Worklyn</text>`;
}

const svg = {
  mark: (opts = {}) => `${open(64, 64)}${defs(opts.palette)}${markBody(opts)}</svg>`,
  /** Legacy Android launcher: tile with transparent margin. */
  padded: (pad) => {
    const s = 64 + pad * 2;
    return `${open(s, s)}${DEFS}<g transform="translate(${pad} ${pad})">${markBody()}</g></svg>`;
  },
  white: () => `${open(64, 64)}${glyph('#FFFFFF', '#FFFFFF')}</svg>`,
  horizontal: (dark) =>
    `${open(248, 64)}${DEFS}${markBody()}${word(82, 43, 34, dark ? '#FFFFFF' : BRAND.ink)}</svg>`,
  horizontalTag: (dark) =>
    `${open(268, 64)}${DEFS}${markBody()}${word(82, 34, 30, dark ? '#FFFFFF' : BRAND.ink)}` +
    `<text x="83" y="51" font-family="${FONT}" font-size="9.5" font-weight="600" letter-spacing="2.2" fill="${dark ? '#AEB9D6' : BRAND.slate}">${BRAND.tagline}</text></svg>`,
};

function out(rel) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

function writeText(rel, content) {
  fs.writeFileSync(out(rel), `${content}\n`);
  console.log('svg ', rel);
}

async function png(rel, source, size, { flatten } = {}) {
  let img = sharp(Buffer.from(source), { density: Math.max(72, (72 * size) / 64) * 2 }).resize(size, size);
  if (flatten) img = img.flatten({ background: typeof flatten === 'string' ? flatten : BRAND.from });
  await img.png({ compressionLevel: 9 }).toFile(out(rel));
  console.log('png ', rel, `${size}px`);
}

/** ICO with PNG-encoded entries (supported since Windows Vista). */
async function ico(rel, source, sizes) {
  const images = await Promise.all(
    sizes.map((s) =>
      sharp(Buffer.from(source), { density: Math.max(72, (72 * s) / 64) * 2 }).resize(s, s).png().toBuffer(),
    ),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((buf, i) => {
    const s = sizes[i];
    const e = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, e);
    dir.writeUInt8(s >= 256 ? 0 : s, e + 1);
    dir.writeUInt8(0, e + 2);
    dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4);
    dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(buf.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  fs.writeFileSync(out(rel), Buffer.concat([header, dir, ...images]));
  console.log('ico ', rel, sizes.join('/'));
}

const ANDROID_DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

async function flutterIcons(app) {
  const launcher = svg.padded(4);
  for (const [density, size] of Object.entries(ANDROID_DENSITIES)) {
    await png(`apps/${app}/android/app/src/main/res/mipmap-${density}/ic_launcher.png`, launcher, size);
  }
  const setDir = `apps/${app}/ios/Runner/Assets.xcassets/AppIcon.appiconset`;
  const contents = JSON.parse(fs.readFileSync(path.join(ROOT, setDir, 'Contents.json'), 'utf8'));
  const square = svg.mark({ radius: 0 });
  const done = new Set();
  for (const im of contents.images) {
    if (!im.filename || done.has(im.filename)) continue;
    done.add(im.filename);
    const size = Math.round(parseFloat(im.size) * parseInt(im.scale, 10));
    await png(`${setDir}/${im.filename}`, square, size, { flatten: true });
  }
}

async function main() {
  writeText('assets/brand/worklyn-mark.svg', svg.mark());
  writeText('assets/brand/worklyn-mark-square.svg', svg.mark({ radius: 0 }));
  writeText('assets/brand/worklyn-mark-white.svg', svg.white());
  writeText('assets/brand/worklyn-horizontal.svg', svg.horizontal(false));
  writeText('assets/brand/worklyn-horizontal-dark.svg', svg.horizontal(true));
  writeText('assets/brand/worklyn-horizontal-tagline.svg', svg.horizontalTag(false));
  writeText('assets/brand/worklyn-horizontal-tagline-dark.svg', svg.horizontalTag(true));
  await png('assets/brand/worklyn-mark-1024.png', svg.mark(), 1024);

  writeText('apps/web/public/favicon.svg', svg.mark());

  // Home-screen launcher icons stay on the base mark; only in-app/web/desktop window icons follow the season.
  await flutterIcons('mobile');
  await flutterIcons('office-link-mobile');

  const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  await ico('tools/office-link/hrhub-link.ico', svg.mark(), ICO_SIZES);
  await png('tools/office-link/hrhub-link-256.png', svg.mark(), 256);

  for (const [season, palette] of Object.entries(SEASONS)) {
    const mark = svg.mark({ palette });
    const square = svg.mark({ palette, radius: 0 });
    writeText(`assets/brand/seasons/worklyn-mark-${season}.svg`, mark);

    // Served through /brand/<file> (app/brand/[file]/route.ts), which picks the current season.
    const web = `apps/web/public/icons/${season}`;
    writeText(`${web}/favicon.svg`, mark);
    await png(`${web}/apple-icon.png`, square, 180, { flatten: palette.from });
    await png(`${web}/icon-192.png`, mark, 192);
    await png(`${web}/icon-512.png`, mark, 512);
    await png(`${web}/icon-maskable-512.png`, svg.mark({ palette, radius: 0, glyphScale: 0.8 }), 512, {
      flatten: palette.from,
    });

    await ico(`tools/office-link/hrhub-link-${season}.ico`, mark, ICO_SIZES);
    await png(`tools/office-link/hrhub-link-${season}-256.png`, mark, 256);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
