import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canLocate,
  COARSE_FIX,
  LocateError,
  locateDevice,
  PRECISE_FIX,
  ROUGH_FIX_M,
} from './geolocation.js';

afterEach(() => vi.unstubAllGlobals());

function stubGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']) {
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
}

const failWith = (code: number) =>
  vi.fn((_ok: PositionCallback, fail?: PositionErrorCallback | null) =>
    fail?.({ code, PERMISSION_DENIED: 1 } as GeolocationPositionError),
  );

describe('the device location', () => {
  it('is not offered without geolocation', async () => {
    vi.stubGlobal('navigator', {});
    expect(canLocate()).toBe(false);
    const err = await locateDevice().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LocateError);
    expect(err).toMatchObject({ reason: 'unsupported' });
  });

  it('resolves to the position, rounded to six decimals', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((ok) =>
      ok({ coords: { latitude: 20.2123456, longitude: -87.4654321 } } as GeolocationPosition),
    );
    stubGeolocation(getCurrentPosition);
    expect(canLocate()).toBe(true);
    await expect(locateDevice()).resolves.toEqual({ lat: 20.212346, lon: -87.465432 });
    expect(getCurrentPosition.mock.calls[0][2]).toBe(PRECISE_FIX);
    expect(PRECISE_FIX).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    await locateDevice(COARSE_FIX);
    expect(getCurrentPosition.mock.calls[1][2]).toEqual(
      expect.objectContaining({ enableHighAccuracy: false }),
    );
  });

  it('passes on how accurate the fix is', async () => {
    stubGeolocation((ok) =>
      ok({
        coords: { latitude: 53.69, longitude: 9.15, accuracy: 342.7 },
      } as GeolocationPosition),
    );
    await expect(locateDevice()).resolves.toEqual({ lat: 53.69, lon: 9.15, accuracy: 343 });
    expect(ROUGH_FIX_M).toBe(100);
  });

  it('rejects with the reason and a sentence to show', async () => {
    stubGeolocation(failWith(1));
    await expect(locateDevice()).rejects.toMatchObject({
      reason: 'denied',
      message: 'Location access was refused.',
    });
    stubGeolocation(failWith(3));
    await expect(locateDevice()).rejects.toMatchObject({
      reason: 'unavailable',
      message: 'Could not get the device location.',
    });
  });
});
