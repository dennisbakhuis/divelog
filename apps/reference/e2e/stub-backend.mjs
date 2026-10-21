#!/usr/bin/env node
/**
 * A stand-in for the divelog server for the E2E smoke: serves the fixture
 * log under `/api/v1`, answers `/api/v1/auth/me` with 401 (nobody signed in),
 * an empty tile index and one small PNG for anything else under `/media`.
 * A request carrying the `OWNER_COOKIE` is the signed-in owner: it also gets the owner
 * endpoints the sharing features call (repo status, commons search and pull) and the dive
 * editor's (form data, template, list pages, create and update, kept in memory) and the site
 * map editor's (site, OpenStreetMap seed, map create and update, also kept in memory) and the
 * site workspace's (countries, licences, field classes, nearby sites, created sites).
 * `POST /api/v1/admin/import/shearwater-cloud` answers from its query alone (`dry_run`, `only`,
 * `clock_offset_min`) with a canned export of five dives; the upload itself is not read.
 * Buddies signing a dive work in memory too: the owner's sign requests, withdrawals and note
 * deletions, the public sign page and its post; every mail "sent" is listed at
 * `GET /_e2e/mails` (`?to=` filters by address) as `[{to, subject, text}]`, and the mailed
 * links point at E2E_SITE_URL (default http://localhost:E2E_APP_PORT, port 4399).
 * `POST /api/v1/auth/magic-link` answers 202 with `{status, valid_minutes: 2}`.
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
  ownerEditor,
  ownerFixtures,
  signBook,
} from './fixtures.mjs';
import { COUNTRIES, createdSite, LICENCES, nearbySites, SITE_FIELDS } from './site-fixtures.mjs';

const port = Number(process.argv[2] ?? process.env.STUB_PORT ?? 8399);
const API = '/api/v1';
const data = fixtures();
const owned = ownerFixtures();
/** Sites created during the run, by id, so a new site opens in its workspace. */
const created = new Map();
const logSites = () => [...data['/dive/sites'], ...created.values()];

/** The site workspace and new-site endpoints; undefined when the path is not one of them. */
function siteEndpoint(method, path, searchParams, body) {
  if (path === '/admin/sites/nearby' && method === 'GET')
    return [200, nearbySites(logSites(), searchParams)];
  if (path === '/admin/meta/site-fields') return [200, SITE_FIELDS];
  if (path === '/admin/sites' && method === 'POST') {
    if (!body?.site_id)
      return [422, { detail: [{ loc: ['body', 'site_id'], msg: 'Field required' }] }];
    if (logSites().some((s) => s.id === body.site_id))
      return [409, { detail: 'Site id already in use' }];
    const site = createdSite(body);
    created.set(site.id, site);
    return [201, site];
  }
  return undefined;
}

/** A fixture site or one created during the run. */
const findSite = (id) => adminSite(id) ?? created.get(decodeURIComponent(id)) ?? null;

/** The starter map for a site: the fixture's, or the same shape placed on a created site. */
function seedFor(id) {
  const seed = mapSeed(id);
  if (seed) return seed;
  const site = created.get(decodeURIComponent(id));
  const template = mapSeed(data['/dive/sites'][0].id);
  if (!site || site.lat === null || site.lon === null || !template) return null;
  return {
    ...template,
    map: { ...template.map, title: site.name, origin: { lat: site.lat, lon: site.lon } },
  };
}

const editor = ownerEditor();

/** The editor's record of dive `n`: saved during the run, else the fixture's; or null. */
function adminDive(n) {
  const path = `/admin/dives/${n}`;
  return editor.handle('GET', path, new URLSearchParams(), undefined)?.body ?? owned[path] ?? null;
}

const siteUrl = process.env.E2E_SITE_URL ?? `http://localhost:${process.env.E2E_APP_PORT ?? 4399}`;
const book = signBook({ adminDive, publicDive: (n) => data[`/dive/dives/${n}`] ?? null, siteUrl });
const DIVE_PATH = /^\/admin\/dives\/(\d+)$/;

/** An editor answer with the dive's notes and sign requests, after a save applied the form's. */
function withSigning(method, path, body, answer) {
  const match = DIVE_PATH.exec(path);
  const created = method === 'POST' && path === '/admin/dives' && answer.status < 300;
  if (!match && !created) return answer;
  const n = match ? Number(match[1]) : body.number;
  if (method !== 'GET' && answer.status < 300) book.applyForm(n, body);
  return answer.status < 300 ? { ...answer, body: book.adminView(n, answer.body) } : answer;
}

/** The request's JSON body, or undefined for none or anything else. */
async function readJson(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!(req.headers['content-type'] ?? '').includes('application/json')) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

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

/** The site map editor's endpoints as `[status, body]`; undefined for any other request. */
function siteMaps(method, path, body) {
  let match = path.match(/^\/admin\/sites\/([^/]+)$/);
  if (match && method === 'GET') {
    const site = findSite(match[1]);
    if (!site) return undefined;
    return [200, { ...site, maps: (savedMaps.get(site.id) ?? []).map(mapRef) }];
  }
  match = path.match(/^\/admin\/sites\/([^/]+)\/maps\/seed$/);
  if (match && method === 'POST') {
    const seed = seedFor(match[1]);
    return seed ? [200, seed] : [404, { detail: 'Site has no coordinates' }];
  }
  match = path.match(/^\/admin\/sites\/([^/]+)\/maps$/);
  if (match && method === 'POST') {
    const site = findSite(match[1]);
    if (!site || !body?.data) return [404, { detail: 'Not found' }];
    const maps = savedMaps.get(site.id) ?? [];
    const id = `${site.id}-${String(maps.length + 1).padStart(6, '0')}`;
    const map = storedMap(site.id, id, body.data, 1, body.note || 'Created', maps.length);
    savedMaps.set(site.id, [...maps, map]);
    return [200, map];
  }
  match = path.match(/^\/admin\/maps\/([^/]+)$/);
  if (match && method === 'PUT' && body?.data) {
    for (const [siteId, maps] of savedMaps) {
      const at = maps.findIndex((m) => m.id === match[1]);
      if (at === -1) continue;
      const old = maps[at];
      const note = body.note || 'Updated';
      const map = storedMap(siteId, old.id, body.data, old.revision + 1, note, old.sort);
      savedMaps.set(siteId, maps.with(at, map));
      return [200, map];
    }
    return [404, { detail: 'Not found' }];
  }
  return undefined;
}

function send(res, status, body, type = 'application/json', headers = {}) {
  if (status === 204) {
    res.writeHead(204, headers);
    return res.end();
  }
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
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
    const json = await readJson(req);
    const site = siteEndpoint(req.method ?? 'GET', path, searchParams, json);
    if (site) return send(res, site[0], site[1]);
    const maps = siteMaps(req.method ?? 'GET', path, json);
    if (maps) return send(res, maps[0], maps[1]);
    const signing = book.admin(req.method ?? 'GET', path, json);
    if (signing) return send(res, signing[0], signing[1]);
    const answer = editor.handle(req.method ?? 'GET', path, searchParams, json);
    if (answer) {
      const signed = withSigning(req.method ?? 'GET', path, json, answer);
      return send(res, signed.status, signed.body);
    }
    const body = owned[req.method === 'GET' ? path : `${req.method} ${path}`];
    if (body === undefined) return send(res, 404, { detail: 'Not found' });
    const one = req.method === 'GET' && DIVE_PATH.exec(path);
    return send(res, 200, one ? book.adminView(Number(one[1]), body) : body);
  }
  if (pathname === `${API}/auth/magic-link` && req.method === 'POST')
    return send(res, 202, { status: 'sent', valid_minutes: 2 });
  if (pathname.startsWith(`${API}/dive/sign/`)) {
    const answer = book.sign(req.method ?? 'GET', pathname.slice(API.length), await readJson(req));
    if (answer)
      return send(res, answer[0], answer[1], 'application/json', { 'cache-control': 'no-store' });
  }
  if (pathname === '/_e2e/mails') {
    const to = searchParams.get('to');
    return send(res, 200, to ? book.mails.filter((m) => m.to === to) : book.mails);
  }
  if (pathname === `${API}/meta/countries`) return send(res, 200, COUNTRIES);
  if (pathname === `${API}/meta/licences`) return send(res, 200, LICENCES);
  if (pathname.startsWith(`${API}/`)) {
    const path = pathname.slice(API.length);
    const body = data[path];
    if (body === undefined) return send(res, 404, { detail: 'Not found' });
    const dive = /^\/dive\/dives\/(\d+)$/.exec(path);
    return send(res, 200, dive ? book.publicView(Number(dive[1]), body) : body);
  }
  if (pathname === '/media/tiles/index.json')
    return send(res, 200, { attribution: '', archives: [] });
  if (pathname.startsWith('/media/')) return send(res, 200, PNG, 'image/png');
  send(res, 404, { detail: 'Not found' });
});

server.listen(port, () => console.log(`stub divelog server on http://localhost:${port}`));
