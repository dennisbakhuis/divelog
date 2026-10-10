/**
 * One `Divelog` binds the config, its URL builder and the backend client;
 * every server helper of the kit takes it.
 */
import { createUrls, type DivelogConfig, type DivelogUrls } from '$lib/core/dive/config.js';
import { KIT_VERSION, SUPPORTED_API } from '../version.js';
import { createApi, type Api, type BackendUrl, type Fetch } from './api.js';

export { KIT_VERSION, SUPPORTED_API };

/** What `GET /api/v1/version` reports; `format` and `api` are absent on older servers. */
export type ServerVersion = { version?: string; format?: number | string; api?: number | string };

export type Divelog = Api & {
  config: DivelogConfig;
  urls: DivelogUrls;
  /**
   * The server's version, fetched once on first use and cached; null while the
   * server is unreachable (retried on the next call).
   */
  serverVersion: (fetchFn?: Fetch) => Promise<ServerVersion | null>;
};

/** The major of a version field, or null when the server does not send one. */
export function majorOf(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null;
  const major = Number.parseInt(String(value).split('.')[0], 10);
  return Number.isNaN(major) ? null : major;
}

/** Warn when the server speaks another API major than this kit. */
export function checkServerVersion(
  version: ServerVersion,
  warn: (message: string) => void = console.warn,
): boolean {
  const major = majorOf(version.api);
  if (major === null || major === SUPPORTED_API) return true;
  warn(
    `@divelog/kit ${KIT_VERSION} speaks API ${SUPPORTED_API}, but the divelog server` +
      ` ${version.version ?? '(unknown version)'} reports API ${version.api}; expect breakage.`,
  );
  return false;
}

/** Bind a dive log config to a backend. */
export function createDivelog({
  backendUrl,
  config,
}: {
  backendUrl: BackendUrl;
  config: DivelogConfig;
}): Divelog {
  const client = createApi({ backendUrl });
  const urls = createUrls(config);
  let cached: Promise<ServerVersion | null> | null = null;

  function serverVersion(fetchFn: Fetch = fetch): Promise<ServerVersion | null> {
    cached ??= client
      .api<ServerVersion>(fetchFn, urls.api('/version'))
      .then((version) => {
        checkServerVersion(version);
        return version;
      })
      .catch(() => {
        cached = null;
        return null;
      });
    return cached;
  }

  return {
    ...client,
    api: (fetchFn, path, init) => {
      void serverVersion(fetchFn);
      return client.api(fetchFn, path, init);
    },
    apiOrError: (event, path) => {
      void serverVersion(event.fetch);
      return client.apiOrError(event, path);
    },
    config,
    urls,
    serverVersion,
  };
}
