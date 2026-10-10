/**
 * SVG layouts for the per-dive and per-site Open Graph images (1200 × 630).
 * Pure string builders so they can be unit-tested; `render.ts` rasterises.
 */
import type { Dive, DiveListItem, ProfileSample, Site } from '$lib/core/dive/types';
import { formatDate, formatDepth, formatTemp } from '$lib/core/dive/format';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// Mirrors the tokens in src/lib/styles/theme.css; SVG rendered off-page
// cannot read CSS custom properties.
const C = {
  mid: '#0b2a4a',
  deep: '#071426',
  abyss: '#030912',
  text: '#e8eef6',
  muted: '#94a3b8',
  faint: '#64748b',
  accent: '#4cc9f0',
  warm: '#f4a261',
  border: 'rgba(148, 163, 184, 0.16)',
};

export const FONT_DISPLAY = 'Space Grotesk';
export const FONT_MONO = 'JetBrains Mono';

const PAD = 72;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Break a title into at most `maxLines` lines of roughly `maxChars`
 * characters on word boundaries; the last line gets an ellipsis if cut.
 */
export function wrapTitle(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.map((l) => clip(l, maxChars));
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = clip(`${kept[maxLines - 1]} ${lines[maxLines]}`, maxChars, true);
  return kept;
}

function clip(line: string, maxChars: number, force = false): string {
  if (line.length <= maxChars && !force) return line;
  const cut = line.slice(0, Math.max(1, maxChars - 1)).trimEnd();
  return `${cut}…`;
}

export type Box = { x: number; y: number; width: number; height: number };

/**
 * Depth profile as SVG paths inside `box`: time runs left to right, depth
 * downward from the top edge (the surface). `area` is closed along the surface.
 */
export function profilePaths(
  samples: ProfileSample[],
  box: Box,
  maxPoints = 320,
): { line: string; area: string; deepest: { x: number; y: number; d: number } } | null {
  const points = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.d));
  if (points.length < 2) return null;
  const t0 = points[0].t;
  const span = points[points.length - 1].t - t0;
  const maxD = Math.max(...points.map((p) => p.d));
  if (span <= 0 || maxD <= 0) return null;
  const stride = Math.max(1, Math.ceil(points.length / maxPoints));
  const picked = points.filter((_, i) => i % stride === 0 || i === points.length - 1);
  const r = (n: number): number => Math.round(n * 10) / 10;
  const x = (t: number): number => r(box.x + ((t - t0) / span) * box.width);
  const y = (d: number): number => r(box.y + (Math.max(0, d) / maxD) * box.height);
  const line = picked.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t)} ${y(p.d)}`).join(' ');
  const first = picked[0];
  const last = picked[picked.length - 1];
  const area = `M${x(first.t)} ${box.y} L${line.slice(1)} L${x(last.t)} ${box.y} Z`;
  const deep = points.reduce((a, b) => (b.d > a.d ? b : a), points[0]);
  return { line, area, deepest: { x: x(deep.t), y: y(deep.d), d: deep.d } };
}

function frame(inner: string, kicker: string, host: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.mid}"/>
      <stop offset="0.55" stop-color="${C.deep}"/>
      <stop offset="1" stop-color="${C.abyss}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.accent}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${C.accent}" stop-opacity="0.04"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <text x="${PAD}" y="${PAD + 14}" font-family="${FONT_MONO}" font-size="24" letter-spacing="4" fill="${C.accent}">${escapeXml(kicker)}</text>
  <text x="${OG_WIDTH - PAD}" y="${PAD + 14}" text-anchor="end" font-family="${FONT_MONO}" font-size="22" fill="${C.faint}">${escapeXml(host)}</text>
${inner}
</svg>`;
}

function titleBlock(title: string, subtitle: string, top: number): { svg: string; bottom: number } {
  const lines = wrapTitle(title, 26);
  const size = lines.length > 1 ? 64 : 76;
  const lead = Math.round(size * 1.08);
  const first = top + size;
  const text = lines
    .map(
      (l, i) =>
        `<text x="${PAD}" y="${first + i * lead}" font-family="${FONT_DISPLAY}" font-weight="700" font-size="${size}" fill="${C.text}">${escapeXml(l)}</text>`,
    )
    .join('\n  ');
  const subY = first + (lines.length - 1) * lead + 52;
  const sub = subtitle
    ? `<text x="${PAD}" y="${subY}" font-family="${FONT_DISPLAY}" font-weight="500" font-size="32" fill="${C.muted}">${escapeXml(clip(subtitle, 56))}</text>`
    : '';
  return {
    svg: `  ${text}\n  ${sub}`,
    bottom: subtitle ? subY : first + (lines.length - 1) * lead,
  };
}

function statRow(stats: { label: string; value: string }[], y: number): string {
  const colW = 250;
  return stats
    .map(
      (
        s,
        i,
      ) => `  <text x="${PAD + i * colW}" y="${y}" font-family="${FONT_MONO}" font-size="20" letter-spacing="3" fill="${C.faint}">${escapeXml(s.label.toUpperCase())}</text>
  <text x="${PAD + i * colW}" y="${y + 50}" font-family="${FONT_MONO}" font-size="44" fill="${C.text}">${escapeXml(s.value)}</text>`,
    )
    .join('\n');
}

function durationText(minutes: number): string {
  return `${Math.round(minutes)} min`;
}

/** Drop a leading repeat of the title: `Slijk-Ewijk, Gelderland` → `Gelderland`. */
export function withoutPrefix(place: string | null | undefined, title: string): string | null {
  if (!place) return null;
  if (place === title) return null;
  return place.startsWith(`${title}, `) ? place.slice(title.length + 2) : place;
}

/** The card for one dive; `host` is the site name printed top right. */
export function diveCardSvg(dive: Dive, host: string): string {
  const site = dive.site;
  const title = site?.name ?? (dive.title || `Dive ${dive.number}`);
  const where = [withoutPrefix(site?.area ?? site?.region_name, title), site?.country_name]
    .filter(Boolean)
    .join(', ');
  const subtitle = [formatDate(dive.date), where].filter(Boolean).join(' · ');
  const head = titleBlock(title, subtitle, 112);
  const statsY = head.bottom + 64;
  const stats = statRow(
    [
      { label: 'Max depth', value: formatDepth(dive.max_depth_m) },
      { label: 'Time', value: durationText(dive.duration_min) },
      { label: 'Water', value: formatTemp(dive.water_temp_c) },
    ],
    statsY,
  );
  const box: Box = {
    x: PAD,
    y: statsY + 96,
    width: OG_WIDTH - PAD * 2,
    height: OG_HEIGHT - (statsY + 96) - 40,
  };
  const profile = dive.profile && box.height > 40 ? profilePaths(dive.profile, box) : null;
  const surface = `  <line x1="${box.x}" y1="${box.y}" x2="${box.x + box.width}" y2="${box.y}" stroke="${C.border}" stroke-width="2"/>`;
  const chart = profile
    ? `${surface}
  <path d="${profile.area}" fill="url(#water)"/>
  <path d="${profile.line}" fill="none" stroke="${C.accent}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${profile.deepest.x}" cy="${profile.deepest.y}" r="6" fill="${C.warm}"/>`
    : '';
  return frame(`${head.svg}\n${stats}\n${chart}`, `DIVE #${dive.number}`, host);
}

/** The card for one site and its dives; `host` is the site name printed top right. */
export function siteCardSvg(site: Site, dives: DiveListItem[], host: string): string {
  const where = [site.region_name ?? site.area, site.country_name].filter(Boolean).join(', ');
  const head = titleBlock(site.name, where, 112);
  const statsY = head.bottom + 64;
  const years = dives.map((d) => d.date.slice(0, 4)).sort();
  const span = years.length
    ? years[0] === years[years.length - 1]
      ? years[0]
      : `${years[0]}–${years[years.length - 1]}`
    : '—';
  const deepest = dives.length ? Math.max(...dives.map((d) => d.max_depth_m)) : site.max_depth_m;
  const stats = statRow(
    [
      { label: 'Dives', value: String(dives.length) },
      { label: 'Deepest', value: formatDepth(deepest) },
      { label: 'Logged', value: span },
    ],
    statsY,
  );
  const box: Box = {
    x: PAD,
    y: statsY + 96,
    width: OG_WIDTH - PAD * 2,
    height: OG_HEIGHT - (statsY + 96) - 40,
  };
  const bars = box.height > 40 ? depthBars(dives, box, deepest ?? 0) : '';
  const type = site.site_type ? ` · ${site.site_type.toUpperCase()}` : '';
  return frame(`${head.svg}\n${stats}\n${bars}`, `DIVE SITE${type}`, host);
}

/** One vertical stroke per dive, oldest first, as deep as that dive went. */
export function depthBars(dives: DiveListItem[], box: Box, maxDepth: number): string {
  if (!dives.length || maxDepth <= 0) return '';
  const ordered = [...dives].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const slot = box.width / Math.max(ordered.length, 12);
  const w = Math.max(3, Math.min(28, slot * 0.6));
  const rects = ordered
    .map((d, i) => {
      const h = Math.max(2, (d.max_depth_m / maxDepth) * box.height);
      const x = Math.round((box.x + i * slot + (slot - w) / 2) * 10) / 10;
      return `<rect x="${x}" y="${box.y}" width="${Math.round(w * 10) / 10}" height="${Math.round(h * 10) / 10}" rx="${Math.min(4, w / 2)}" fill="url(#water)" stroke="${C.accent}" stroke-opacity="0.7" stroke-width="1.5"/>`;
    })
    .join('\n  ');
  return `  <line x1="${box.x}" y1="${box.y}" x2="${box.x + box.width}" y2="${box.y}" stroke="${C.border}" stroke-width="2"/>
  ${rects}`;
}
