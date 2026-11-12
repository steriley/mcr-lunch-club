import type { MemberCost, MemberVerdictVote } from '@/lib/member-inspection-display';
import { tierInfo, type TierValue } from '@/lib/tiers';

/**
 * The People's Verdict, or Swing-o-meter (#138): where the People's lunch logs sit against the Chairs' verdict.
 * Pure and browser-safe (no Zod, no database), so the venue page's island, The Count and the tests
 * share it.
 *
 * The Chairs give a verdict, not a score: Approved, If We Must or Rejected. So the scale has three
 * bands on a 0 to 100 position line and there is no numeric swing. Under Consideration and To Be
 * Assessed are holding states, so those venues get a Straw Poll (no Chairs' band, no headline of
 * agreement). Gone But Not Forgotten and closed venues get no meter.
 *
 * The section is titled "The People's Verdict" and is always explained as a guide the Chairs do not
 * have to follow; the headlines and descriptions keep the word "verdict" for the Chairs.
 */

export type SwingBand = 'rejected' | 'if_we_must' | 'approved';

/** Rejected to Approved, left to right. The cut-offs are fixed constants, not tuned from data. */
export const SWING_BANDS: readonly { band: SwingBand; min: number; max: number }[] = [
  { band: 'rejected', min: 0, max: 30 },
  { band: 'if_we_must', min: 30, max: 65 },
  { band: 'approved', min: 65, max: 100 },
];

/** At least this many distinct eligible members before there is a bar. */
export const SWING_QUORUM = 5;

/**
 * How hard the Chairs' side pulls, in member weights (src/lib/member-inspection-rules.ts
 * `memberWeight`, 0.25 to 1.0). Five brand-new members (1.25 in total) cannot take an Approved venue out
 * of its band on their own; five established members (5.0) can.
 */
export const SWING_PRIOR_WEIGHT = 5;

/** The anchor for a Straw Poll, which has no Chairs' band to pull towards. */
export const STRAW_POLL_ANCHOR = 50;

/** A vote's place on the line: `(logScore - 1) / 4 * 100` for the 5, 3 and 1 of `logScore`. */
export const VOTE_POSITIONS: Record<MemberVerdictVote, number> = {
  approve: 100,
  if_we_must: 50,
  reject: 0,
};

/** The days of history the sparkline keeps. */
export const SWING_HISTORY_DAYS = 90;

const BAND_TIERS = {
  rejected: 'rejected',
  if_we_must: 'if_we_must',
  approved: 'approved',
} as const satisfies Record<SwingBand, TierValue>;

const bandRange = (band: SwingBand) => SWING_BANDS.find((entry) => entry.band === band)!;

export function bandLabel(band: SwingBand): string {
  return tierInfo(BAND_TIERS[band]).label;
}

/** The band a position falls in. Edges belong to the higher band; 100 is Approved. */
export function bandOf(position: number): SwingBand {
  const clamped = Math.min(100, Math.max(0, position));
  for (let index = SWING_BANDS.length - 1; index >= 0; index -= 1) {
    if (clamped >= SWING_BANDS[index].min) return SWING_BANDS[index].band;
  }
  return 'rejected';
}

export function bandCentre(band: SwingBand): number {
  const { min, max } = bandRange(band);
  return (min + max) / 2;
}

/** How a venue's tier reads on the meter. */
export type MeterMode =
  /** The Chairs have decided: a Chairs' band. */
  | { kind: 'decided'; chairsBand: SwingBand }
  /** A holding venue: the People's Straw Poll. */
  | { kind: 'straw_poll' }
  /** No meter: Gone But Not Forgotten, closed, or no tier. */
  | { kind: 'none' };

export function meterMode(venue: { tier: TierValue | null; closed: boolean }): MeterMode {
  if (venue.closed || venue.tier === null) return { kind: 'none' };
  switch (venue.tier) {
    case 'approved':
    case 'if_we_must':
    case 'rejected':
      return { kind: 'decided', chairsBand: venue.tier };
    case 'under_consideration':
    case 'to_be_assessed':
      return { kind: 'straw_poll' };
    default:
      return { kind: 'none' };
  }
}

// ---------------------------------------------------------------------------------------------
// The People's score
// ---------------------------------------------------------------------------------------------

/** One eligible, visible log of a not-banned member, with that member's weight. */
export interface ScoredLog {
  memberId: string;
  verdictVote: MemberVerdictVote;
  cost: MemberCost;
  weight: number;
}

/** What is stored per venue: everything the score needs except the venue's tier. */
export interface ScoreAggregate {
  eligibleMembers: number;
  eligibleLogs: number;
  weightTotal: number;
  weightedSum: number;
  /** Weighted variance of the logs' positions, for Most Contested. */
  variance: number;
  verdictCounts: Record<MemberVerdictVote, number>;
  typicalCost: MemberCost | null;
}

const COST_ORDER: readonly MemberCost[] = ['£', '££', '£££'];

export function summariseLogs(logs: readonly ScoredLog[]): ScoreAggregate {
  const verdictCounts: Record<MemberVerdictVote, number> = {
    approve: 0,
    if_we_must: 0,
    reject: 0,
  };
  let weightTotal = 0;
  let weightedSum = 0;
  for (const log of logs) {
    verdictCounts[log.verdictVote] += 1;
    weightTotal += log.weight;
    weightedSum += VOTE_POSITIONS[log.verdictVote] * log.weight;
  }
  const mean = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const variance =
    weightTotal > 0
      ? logs.reduce(
          (sum, log) => sum + log.weight * (VOTE_POSITIONS[log.verdictVote] - mean) ** 2,
          0
        ) / weightTotal
      : 0;
  const costs = logs.map((log) => COST_ORDER.indexOf(log.cost)).sort((a, b) => a - b);
  return {
    eligibleMembers: new Set(logs.map((log) => log.memberId)).size,
    eligibleLogs: logs.length,
    weightTotal,
    weightedSum,
    variance,
    verdictCounts,
    typicalCost: costs.length ? COST_ORDER[costs[Math.floor(costs.length / 2)]] : null,
  };
}

export function hasQuorum(eligibleMembers: number): boolean {
  return eligibleMembers >= SWING_QUORUM;
}

/**
 * The Bayesian average: the logs' weighted positions pulled towards the Chairs' band centre (or
 * neutral for a Straw Poll) by `SWING_PRIOR_WEIGHT`. Small samples barely move it.
 */
export function peoplePosition(
  aggregate: Pick<ScoreAggregate, 'weightTotal' | 'weightedSum'>,
  mode: MeterMode
): number | null {
  if (mode.kind === 'none') return null;
  const anchor = mode.kind === 'decided' ? bandCentre(mode.chairsBand) : STRAW_POLL_ANCHOR;
  return (
    (anchor * SWING_PRIOR_WEIGHT + aggregate.weightedSum) /
    (SWING_PRIOR_WEIGHT + aggregate.weightTotal)
  );
}

/**
 * How far a position is outside a band, in points (0 inside it). Positive above, negative below.
 * "Inside" is `bandOf`'s answer, so an edge position counts as in the higher band here as it does
 * in the headline; just above the top of a lower band the distance is a hair over zero, not zero.
 */
export function distanceFromBand(position: number, band: SwingBand): number {
  if (bandOf(position) === band) return 0;
  const { min, max } = bandRange(band);
  return position < min ? position - min : Math.max(position - max, Number.EPSILON);
}

// ---------------------------------------------------------------------------------------------
// Headlines
// ---------------------------------------------------------------------------------------------

export type Headline =
  | { kind: 'concur'; text: string }
  | { kind: 'dissent'; text: string; band: SwingBand }
  | { kind: 'straw_poll'; text: string };

/**
 * The headline for a quorate venue: inside the Chairs' band the People concur; in another band
 * "The People would have it <Tier>" (also the petition trigger); a Straw Poll has no verdict to
 * agree or dissent with.
 */
export function headlineFor(mode: MeterMode, position: number): Headline | null {
  if (mode.kind === 'none') return null;
  if (mode.kind === 'straw_poll') {
    return { kind: 'straw_poll', text: 'The People’s Straw Poll' };
  }
  const band = bandOf(position);
  if (band === mode.chairsBand) return { kind: 'concur', text: 'The People Concur' };
  return { kind: 'dissent', band, text: `The People would have it ${bandLabel(band)}` };
}

/** The text equivalent of the meter, for the accessible name. */
function meterDescription(mode: MeterMode, position: number): string {
  const band = bandLabel(bandOf(position));
  const where = `People’s score ${Math.round(position)} of 100, in the ${band} band.`;
  if (mode.kind === 'decided')
    return `${where} The Chairs’ verdict is ${bandLabel(mode.chairsBand)}.`;
  return `${where} The Chairs have not yet decided this venue.`;
}

// ---------------------------------------------------------------------------------------------
// The public shape
// ---------------------------------------------------------------------------------------------

export interface SwingHistoryPoint {
  /** YYYY-MM-DD. */
  day: string;
  position: number;
}

/** What `GET /api/public/venues/:slug/swing` returns: counts, bands and scores, nothing about any member. */
export interface VenueSwing {
  /** `null` for a Straw Poll. */
  chairsBand: SwingBand | null;
  quorum: number;
  eligibleMembers: number;
  eligibleLogs: number;
  /** `false` below quorum: no bar, no headline. */
  quorate: boolean;
  /** 0 to 100, whole number. Null below quorum. */
  position: number | null;
  peopleBand: SwingBand | null;
  headline: Headline | null;
  description: string | null;
  verdictCounts: Record<MemberVerdictVote, number>;
  typicalCost: MemberCost | null;
  history: SwingHistoryPoint[];
}

export function buildVenueSwing(
  mode: MeterMode,
  aggregate: ScoreAggregate,
  history: SwingHistoryPoint[]
): VenueSwing | null {
  if (mode.kind === 'none') return null;
  const quorate = hasQuorum(aggregate.eligibleMembers);
  const raw = quorate ? peoplePosition(aggregate, mode) : null;
  const position = raw === null ? null : Math.round(raw);
  return {
    chairsBand: mode.kind === 'decided' ? mode.chairsBand : null,
    quorum: SWING_QUORUM,
    eligibleMembers: aggregate.eligibleMembers,
    eligibleLogs: aggregate.eligibleLogs,
    quorate,
    position,
    peopleBand: position === null ? null : bandOf(position),
    headline: position === null ? null : headlineFor(mode, position),
    description: position === null ? null : meterDescription(mode, position),
    verdictCounts: aggregate.verdictCounts,
    typicalCost: aggregate.typicalCost,
    history: quorate ? history : [],
  };
}
