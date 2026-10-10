import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { KIT_VERSION } from './version.js';

describe('KIT_VERSION', () => {
  it('matches package.json', () => {
    expect(KIT_VERSION).toBe(pkg.version);
  });
});
