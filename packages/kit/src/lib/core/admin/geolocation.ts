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

/** What the picker asks for: a precise fix, at most a minute old. */
export const PRECISE_FIX: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 60_000,
};

/** Enough for a 25 km search: a quick, coarse fix up to five minutes old. */
export const COARSE_FIX: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 300_000,
};

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * The device position, rounded to six decimals (about 10 cm). Rejects with a
 * {@link LocateError}: `unsupported` without geolocation, `denied` when the
 * person or the browser refused, `unavailable` on a timeout or no fix.
 */
export function locateDevice(options: PositionOptions = PRECISE_FIX): Promise<LatLon> {
  if (!canLocate()) return Promise.reject(new LocateError('unsupported'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ lat: round(position.coords.latitude), lon: round(position.coords.longitude) }),
      (err) =>
        reject(new LocateError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      options,
    );
  });
}
