/**
 * Rasterise the OG card SVGs with resvg. The native resvg 2.x binding reads
 * fonts from disk only (TTF/OTF, no WOFF2, no buffers), so the three bundled
 * TTFs come from a generated base64 module (`scripts/og-fonts.mjs`) and are
 * written to a temp directory once per process. A data module keeps the
 * server build and a packaged library self-contained: the SSR build does not
 * rewrite `new URL('./fonts/…', import.meta.url)`, and Vite's inline-asset
 * query is not portable.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OG_FONTS } from './font-data.js';
import { FONT_DISPLAY, FONT_MONO } from './card.js';

let fontFiles: Promise<string[]> | null = null;

async function writeFonts(): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'og-fonts-'));
  return Promise.all(
    Object.entries(OG_FONTS).map(async ([name, base64]) => {
      const path = join(dir, name);
      await writeFile(path, Buffer.from(base64, 'base64'));
      return path;
    }),
  );
}

function fonts(): Promise<string[]> {
  fontFiles ??= writeFonts().catch((err: unknown) => {
    fontFiles = null;
    throw err;
  });
  return fontFiles;
}

export async function renderPng(svg: string): Promise<Uint8Array> {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: await fonts(),
      loadSystemFonts: false,
      defaultFontFamily: FONT_DISPLAY,
      sansSerifFamily: FONT_DISPLAY,
      monospaceFamily: FONT_MONO,
    },
  });
  return new Uint8Array(resvg.render().asPng());
}

export const OG_CACHE = 'public, max-age=86400';
