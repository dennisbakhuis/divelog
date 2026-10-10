/** The app's dive log, configured from the environment; server only. */
import { env } from '$env/dynamic/private';
import { DEFAULT_CONFIG, type DivelogConfig } from '@divelog/kit/core';
import { createDivelog } from '@divelog/kit/server';

function setting(name: string, fallback: string): string {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

const siteName = setting('DIVELOG_SITE_NAME', DEFAULT_CONFIG.siteName);
const ownerName = setting('DIVELOG_OWNER_NAME', DEFAULT_CONFIG.ownerName);

export const divelogConfig: DivelogConfig = {
  ...DEFAULT_CONFIG,
  siteName,
  ownerName,
  siteUrl: setting('DIVELOG_SITE_URL', DEFAULT_CONFIG.siteUrl).replace(/\/+$/, ''),
  titleSuffix: setting('DIVELOG_TITLE_SUFFIX', ownerName),
};

export const divelog = createDivelog({
  backendUrl: () => setting('DIVELOG_BACKEND_URL', 'http://localhost:8300'),
  config: divelogConfig,
});
