#!/usr/bin/env node
/**
 * A stand-in for the divelog server for the E2E smoke: serves the fixture
 * log under `/api/v1`, answers `/api/v1/auth/me` with 401 (nobody signed in),
 * an empty tile index and one small PNG for anything else under `/media`.
 * A request carrying the `OWNER_COOKIE` is the signed-in owner: it also gets the owner
 * endpoints the sharing features call (repo status, commons search and pull) and the site
 * map editor's (site, OpenStreetMap seed, map create and update, kept in memory).
 * Usage: node e2e/stub-backend.mjs [port]   (default 8399, or STUB_PORT)
 */
import { createServer } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';
import {
  adminSite,
  commonsSearch,
  fixtures,
  mapSeed,
  OWNER_COOKIE,
  ownerFixtures,
} from './fixtures.mjs';

const port = Number(process.argv[2] ?? process.env.STUB_PORT ?? 8399);
const API = '/api/v1';
const data = fixtures();
const owned = ownerFixtures();

/** A solid 8×8 PNG in the accent colour, standing in for every photo. */
function png(size = 8, rgb = [76, 201, 240]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.from([0, ...Array.from({ length: size }, () => rgb).flat()]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PNG = png();

/** Drawn maps saved during the run, by site id. */
const savedMaps = new Map();

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || 'null'));
      } catch {
        resolve(null);
      }
    });
  });
}

function storedMap(siteId, id, data, revision, note, sort) {
  return {
    ...data,
    id,
    site_id: siteId,
    sort,
    revision,
    changelog: [{ revision, date: '2026-10-10', author: 'sam@example.com', note }],
    updated_at: '2026-10-10T12:00:00Z',
  };
}

function mapRef(map) {
  return {
    ref: `drawn:${map.id}`,
    collection: 'drawn',
    title: map.title,
    url: null,
    public: true,
    credit: null,
    warning: null,
    drawn: map,
  };
}

/** The site map editor's endpoints; undefined when the request is not one of them. */
async function siteMaps(req, path) {
  let match = path.match(/^\/admin\/sites\/([^/]+)$/);
  if (match && req.method === 'GET') {
    const site = adminSite(match[1]);
    if (!site) return undefined;
    return [200, { ...site, maps: (savedMaps.get(site.id) ?? []).map(mapRef) }];
  }
  match = path.match(/^\/admin\/sites\/([^/]+)\/maps\/seed$/);
  if (match && req.method === 'POST') {
    const seed = mapSeed(match[1]);
    return seed ? [200, seed] : [404, { detail: 'Site has no coordinates' }];
  }
  match = path.match(/^\/admin\/sites\/([^/]+)\/maps$/);
  if (match && req.method === 'POST') {
    const site = adminSite(match[1]);
    const body = await readJson(req);
    if (!site || !body?.data) return [404, { detail: 'Not found' }];
    const maps = savedMaps.get(site.id) ?? [];
    const map = storedMap(
      site.id,
      `${site.id}-${String(maps.length + 1).padStart(6, '0')}`,
      body.data,
      1,
      body.note || 'Created',
      maps.length,
    );
    savedMaps.set(site.id, [...maps, map]);
    return [200, map];
  }
  match = path.match(/^\/admin\/maps\/([^/]+)$/);
  if (match && req.method === 'PUT') {
    const body = await readJson(req);
    for (const [siteId, maps] of savedMaps) {
      const at = maps.findIndex((m) => m.id === match[1]);
      if (at === -1) continue;
      const old = maps[at];
      const map = storedMap(
        siteId,
        old.id,
        body.data,
        old.revision + 1,
        body.note || 'Updated',
        old.sort,
      );
      savedMaps.set(siteId, maps.with(at, map));
      return [200, map];
    }
    return [404, { detail: 'Not found' }];
  }
  return undefined;
}

function send(res, status, body, type = 'application/json') {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(payload) });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url ?? '/', 'http://stub');
  const owner = (req.headers.cookie ?? '').includes(`${OWNER_COOKIE}=`);
  if (pathname === '/health') return send(res, 200, { status: 'ok' });
  if (pathname === `${API}/auth/me`)
    return owner ? send(res, 200, owned['/auth/me']) : send(res, 401, { detail: 'Not signed in' });
  if (pathname.startsWith(`${API}/admin/`)) {
    if (!owner) return send(res, 401, { detail: 'Not signed in' });
    const path = pathname.slice(API.length);
    if (path === '/admin/commons/sites')
      return send(res, 200, commonsSearch(searchParams.get('q')));
    const maps = await siteMaps(req, path);
    if (maps) return send(res, maps[0], maps[1]);
    const body = owned[req.method === 'GET' ? path : `${req.method} ${path}`];
    return body === undefined ? send(res, 404, { detail: 'Not found' }) : send(res, 200, body);
  }
  if (pathname.startsWith(`${API}/`)) {
    const body = data[pathname.slice(API.length)];
    return body === undefined ? send(res, 404, { detail: 'Not found' }) : send(res, 200, body);
  }
  if (pathname === '/media/tiles/index.json')
    return send(res, 200, { attribution: '', archives: [] });
  if (pathname.startsWith('/media/')) return send(res, 200, PNG, 'image/png');
  send(res, 404, { detail: 'Not found' });
});

server.listen(port, () => console.log(`stub divelog server on http://localhost:${port}`));
