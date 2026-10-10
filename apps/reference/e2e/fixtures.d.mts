export function fixtures(): Record<string, unknown>;
export const SITE_SLUG: string;
export const SITE_NAME: string;
export const DIVE_NUMBERS: number[];
export const COMMONS_SLUG: string;
export const COMMONS_NAME: string;
export const OWNER_COOKIE: string;
export function ownerFixtures(): Record<string, unknown>;
export function commonsSearch(q: string | null): Record<string, unknown>[];
export function ownerEditor(): {
  handle(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
  ): { status: number; body: unknown } | undefined;
};
export function adminSite(id: string): Record<string, unknown> | null;
export function mapSeed(id: string): Record<string, unknown> | null;
