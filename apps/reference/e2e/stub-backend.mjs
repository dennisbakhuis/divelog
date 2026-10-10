#!/usr/bin/env node
/**
 * A stand-in for the divelog server for the E2E smoke: serves the fixture
 * log under `/api/v1`, answers `/api/v1/auth/me` with 401 (nobody signed in),
 * an empty tile index and one small PNG for anything else under `/media`.
 * Usage: node e2e/stub-backend.mjs [port]   (default 8399, or STUB_PORT)
 */
import { createServer } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';
import { fixtures } from './fixtures.mjs';

const port = Number(process.argv[2] ?? process.env.STUB_PORT ?? 8399);
const API = '/api/v1';
const data = fixtures();

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

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://stub');
  if (pathname === '/health') return send(res, 200, { status: 'ok' });
  if (pathname === `${API}/auth/me`) return send(res, 401, { detail: 'Not signed in' });
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
