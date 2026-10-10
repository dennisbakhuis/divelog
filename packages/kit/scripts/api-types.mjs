#!/usr/bin/env node
// Generates src/lib/core/dive/api.d.ts from the divelog server's OpenAPI document.
//
//   node scripts/api-types.mjs                 read http://localhost:8300/api/openapi.json and write the file
//   node scripts/api-types.mjs --url URL       read the schema from another running server
//   node scripts/api-types.mjs --file PATH     read an OpenAPI dump from disk
//   node scripts/api-types.mjs --check [...]   regenerate in memory and fail if the committed file differs
//
// TODO: once packages/server ships its offline dump (`divelog schema openapi <file>`), make that
// the default source so CI can run `pnpm types:check` without a running server.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import * as prettier from 'prettier';

const DEFAULT_URL = 'http://localhost:8300/api/openapi.json';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'src/lib/core/dive/api.d.ts');
const args = process.argv.slice(2);
const check = args.includes('--check');
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const file = option('--file');
const url = option('--url') ?? DEFAULT_URL;

const HEADER = `/**
 * Generated from the backend's OpenAPI document by scripts/api-types.mjs. Do not edit.
 * Regenerate with \`pnpm types\` (or \`make types\`); CI runs \`pnpm types:check\`.
 * Hand-written names that components import live in ./types.ts.
 */

`;

function fail(message) {
  console.error(`api-types: ${message}`);
  process.exit(1);
}

async function fromUrl(source) {
  let response;
  try {
    response = await fetch(source);
  } catch (error) {
    fail(
      `server not reachable at ${source} (${error.cause?.code ?? error.message}); start a divelog server or pass --file`,
    );
  }
  if (!response.ok) fail(`${source} answered ${response.status} ${response.statusText}`);
  return response.json();
}

const schema = file ? JSON.parse(readFileSync(resolve(file), 'utf8')) : await fromUrl(url);
const body = astToString(await openapiTS(schema, { defaultNonNullable: false }));
const options = (await prettier.resolveConfig(target)) ?? {};
const output = await prettier.format(HEADER + body, { ...options, filepath: target });

if (check) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    fail(`${target} is missing; run \`pnpm types\``);
  }
  if (current !== output)
    fail('api.d.ts is out of date with the server schemas; run `pnpm types` and commit the result');
  console.log('api-types: api.d.ts is up to date');
} else {
  writeFileSync(target, output);
  console.log(`api-types: wrote ${target}`);
}
