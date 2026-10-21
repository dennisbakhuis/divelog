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
export interface StubMail {
  to: string;
  subject: string;
  text: string;
}
export function signBook(options: {
  adminDive(n: number): Record<string, unknown> | null;
  publicDive(n: number): Record<string, unknown> | null;
  siteUrl: string;
  ownerName?: string;
}): {
  mails: StubMail[];
  publicNotes(n: number): Record<string, unknown>[];
  adminView(n: number, body: unknown): Record<string, unknown>;
  publicView(n: number, body: unknown): Record<string, unknown>;
  applyForm(n: number, input: unknown): void;
  admin(method: string, path: string, body: unknown): [number, unknown] | undefined;
  sign(method: string, path: string, body: unknown): [number, unknown] | undefined;
};
