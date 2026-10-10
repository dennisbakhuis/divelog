/**
 * What the profile chart draws beyond the depth line: the deco ceiling, the
 * stretches spent in deco, gas switches, surface breaks and the hover readout.
 */
import type { ProfileMeta, ProfileSample } from './types';

export type Span = { from: number; to: number };

/** The ceiling as a step: each run of samples with a stop depth becomes one segment. */
export type CeilingStep = Span & { depth: number };

/** Consecutive samples that share a stop depth, as the ceiling the computer showed. */
export function ceilingSteps(samples: ProfileSample[]): CeilingStep[] {
  const steps: CeilingStep[] = [];
  let open: CeilingStep | null = null;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const stop = s.stop ?? 0;
    const next = samples[i + 1]?.t ?? s.t;
    if (stop > 0) {
      if (open && open.depth === stop) open.to = next;
      else {
        open = { from: s.t, to: next, depth: stop };
        steps.push(open);
      }
    } else open = null;
  }
  return steps;
}

/** Time spans the diver was in deco, for colouring those parts of the depth line. */
export function decoSpans(samples: ProfileSample[]): Span[] {
  const spans: Span[] = [];
  let open: Span | null = null;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if ((s.stop ?? 0) > 0) {
      if (open) open.to = s.t;
      else {
        open = { from: samples[i - 1]?.t ?? s.t, to: s.t };
        spans.push(open);
      }
    } else open = null;
  }
  return spans;
}

export type GasSwitch = { t: number; label: string };

/** "32" → "EAN32", "99"/"100" → "O₂", "21" → "Air", "21/35" → "21/35". */
export function gasSwitchLabel(gas: unknown): string {
  const text = String(gas ?? '').trim();
  if (!text) return '';
  if (text.includes('/')) return text;
  const o2 = Number(text);
  if (!Number.isFinite(o2)) return text;
  if (o2 >= 99) return 'O₂';
  if (o2 === 21) return 'Air';
  return `EAN${o2}`;
}

/** The switches worth a marker: everything after the gas the dive started on. */
export function gasSwitches(meta: ProfileMeta | null | undefined): GasSwitch[] {
  if (!meta) return [];
  return meta.gas_switches
    .map(([t, gas]) => ({ t: Number(t), label: gasSwitchLabel(gas) }))
    .filter((s) => Number.isFinite(s.t) && s.t > 0 && s.label);
}

/** The sample nearest to a moment, by binary search over the time-sorted list. */
export function sampleAt(samples: ProfileSample[], t: number): ProfileSample | null {
  if (!samples.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const after = samples[lo];
  const before = samples[lo - 1];
  if (before && Math.abs(before.t - t) <= Math.abs(after.t - t)) return before;
  return after;
}

/** `m:ss` for a moment in the dive, or `h:mm:ss` past an hour. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(rest).padStart(2, '0')}`;
}

export type ProfileFact = { label: string; value: string; note?: string };

/** The figures under the chart; only the ones the profile can back up. */
export function profileFacts(
  meta: ProfileMeta | null | undefined,
  avgDepth: number | null | undefined,
): ProfileFact[] {
  if (!meta) return [];
  const facts: ProfileFact[] = [];
  if (avgDepth != null) facts.push({ label: 'Avg depth', value: `${avgDepth} m` });
  if (meta.time_at_max_s != null)
    facts.push({ label: 'Deepest at', value: clock(meta.time_at_max_s) });
  if (meta.max_descent_m_min != null)
    facts.push({ label: 'Descent', value: `${meta.max_descent_m_min} m/min`, note: 'fastest' });
  if (meta.max_ascent_m_min != null)
    facts.push({ label: 'Ascent', value: `${meta.max_ascent_m_min} m/min`, note: 'fastest' });
  if (meta.deco_min != null)
    facts.push({
      label: 'In deco',
      value: `${meta.deco_min} min`,
      note: meta.deepest_stop_m != null ? `deepest stop ${meta.deepest_stop_m} m` : undefined,
    });
  if (meta.first_stop_s != null)
    facts.push({ label: 'First stop at', value: clock(meta.first_stop_s) });
  if (meta.samples != null)
    facts.push({
      label: 'Samples',
      value: String(meta.samples),
      note: meta.sample_interval_s != null ? `every ${meta.sample_interval_s} s` : undefined,
    });
  return facts;
}
