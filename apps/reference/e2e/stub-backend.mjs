#!/usr/bin/env node
/**
 * A stand-in for the divelog server for the E2E smoke: serves the fixture
 * log under `/api/v1`, answers `/api/v1/auth/me` with 401 (nobody signed in),
 * an empty tile index and one small PNG for anything else under `/media`.
 * A request carrying the `OWNER_COOKIE` is the signed-in owner: it also gets the owner
 * endpoints the sharing features call (repo status, commons search and pull).
 * Usage: node e2e/stub-backend.mjs [port]   (default 8399, or STUB_PORT)
 */
import { createServer } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';
import { commonsSearch, fixtures, OWNER_COOKIE, ownerFixtures } from './fixtures.mjs';
import { COUNTRIES, createdSite, LICENCES, nearbySites, SITE_FIELDS } from './site-fixtures.mjs';

const port = Number(process.argv[2] ?? process.env.STUB_PORT ?? 8399);
const API = '/api/v1';
const data = fixtures();
const owned = ownerFixtures();
/** Sites created during the run, by id, so a new site opens in its workspace. */
const created = new Map();
const logSites = () => [...data['/dive/sites'], ...created.values()];

/** The JSON body of a request. */
function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

/** The site workspace and new-site endpoints; undefined when the path is not one of them. */
async function siteEndpoint(req, path, searchParams) {
  if (path === '/admin/sites/nearby' && req.method === 'GET')
    return [200, nearbySites(logSites(), searchParams)];
  if (path === '/admin/meta/site-fields') return [200, SITE_FIELDS];
  if (path === '/admin/sites' && req.method === 'POST') {
    const body = await readJson(req);
    if (logSites().some((s) => s.id === body.site_id))
      return [409, { detail: 'Site id already in use' }];
    const site = createdSite(body);
    created.set(site.id, site);
    return [201, site];
  }
  const one = /^\/admin\/sites\/([^/]+)$/.exec(path);
  if (one && req.method === 'GET') {
    const site = logSites().find((s) => s.id === decodeURIComponent(one[1]));
    return site ? [200, site] : [404, { detail: 'Site not found' }];
  }
  return undefined;
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
    const site = await siteEndpoint(req, path, searchParams);
    if (site) return send(res, site[0], site[1]);
    const body = owned[req.method === 'GET' ? path : `${req.method} ${path}`];
    return body === undefined ? send(res, 404, { detail: 'Not found' }) : send(res, 200, body);
  }
  if (pathname === `${API}/meta/countries`) return send(res, 200, COUNTRIES);
  if (pathname === `${API}/meta/licences`) return send(res, 200, LICENCES);
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
