/**
 * The device position, as a promise: the "Use my location" of the location
 * picker and the "Near me" of the commons search.
 */
import type { LatLon } from '$lib/core/map/coords.js';

/** Why the device gave no position. */
export type LocateFailure = 'unsupported' | 'denied' | 'unavailable';

const FAILURE_TEXT: Record<LocateFailure, string> = {
  unsupported: 'This browser cannot share the device location.',
  denied: 'Location access was refused.',
  unavailable: 'Could not get the device location.',
};

/** A failed lookup; `message` is a sentence to show inline. */
export class LocateError extends Error {
  readonly reason: LocateFailure;

  constructor(reason: LocateFailure) {
    super(FAILURE_TEXT[reason]);
    this.name = 'LocateError';
    this.reason = reason;
  }
}

/** True when the browser offers geolocation at all (it may still be refused). */
export function canLocate(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

/** What the picker asks for: a fresh, precise fix (a cached one is wrong on a moving boat). */
export const PRECISE_FIX: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 0,
};

/** Beyond this many metres a fix is too rough to place a site by; the picker says so. */
export const ROUGH_FIX_M = 100;

/** A device position; `accuracy` is the radius in metres the device vouches for, when it says. */
export interface DeviceFix extends LatLon {
  accuracy?: number;
}

/** Enough for a 25 km search: a quick, coarse fix up to five minutes old. */
export const COARSE_FIX: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 300_000,
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * The device position, rounded to six decimals (about 10 cm), with its accuracy. Rejects with a
 * {@link LocateError}: `unsupported` without geolocation, `denied` when the
 * person or the browser refused, `unavailable` on a timeout or no fix.
 */
export function locateDevice(options: PositionOptions = PRECISE_FIX): Promise<DeviceFix> {
  if (!canLocate()) return Promise.reject(new LocateError('unsupported'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          lat: round(coords.latitude),
          lon: round(coords.longitude),
          ...(Number.isFinite(coords.accuracy) ? { accuracy: Math.round(coords.accuracy) } : {}),
        }),
      (err) =>
        reject(new LocateError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      options,
    );
  });
}
