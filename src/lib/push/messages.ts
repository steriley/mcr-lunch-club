/**
 * What each Chairs' push notification says, and who gets it (#115). Pure: no database, no
 * web-push, so the rules are unit tested. src/lib/push/notify.ts loads the rows and sends.
 *
 * Payloads carry the minimum, because they show on lock screens: the event, the venue name, who
 * acted, where a tap goes and a tag. Never a decline reason, an internal note, a suggestion's or
 * contact message's text, or anything about who sent it.
 */
import type { InspectionRow, TierProposalRow } from '@/db/schema';
import { isActiveChair } from '@/lib/roles';
import { tierLabel, type TierValue } from '@/lib/tiers';
import type { PushMessage } from '@/lib/pwa/push';

type PushEventKind = 'proposals' | 'decisions' | 'visits' | 'suggestions' | 'contact';

/**
 * The preference each event is filed under, and its defaults (#115: all on but suggestions;
 * #132: contact messages are opt-in too).
 */
export interface NotificationPreferences {
  proposals: boolean;
  decisions: boolean;
  visits: boolean;
  suggestions: boolean;
  contact: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  proposals: true,
  decisions: true,
  visits: true,
  suggestions: false,
  contact: false,
};

export type PushEvent =
  /** A pending verdict proposal, new or replacing the proposer's own (same tag, so it replaces). */
  | {
      type: 'proposal';
      venueId: string;
      proposerId: string | null;
      proposerName: string | null;
      fromTier: TierValue | null;
      toTier: TierValue;
    }
  /** Approved or declined: for the proposer only. The decline reason is never part of it. */
  | {
      type: 'decision';
      proposalId: string;
      venueId: string;
      proposerId: string | null;
      deciderName: string | null;
      approved: boolean;
    }
  /** The first "Visited today" press: everyone else may countersign until London midnight. */
  | {
      type: 'visit_waiting';
      venueId: string;
      date: string;
      firstChairId: string | null;
      firstChairName: string | null;
    }
  /** The countersign: for the Chair who pressed first. */
  | {
      type: 'visit_confirmed';
      venueId: string;
      date: string;
      firstChairId: string | null;
      secondChairId: string | null;
      secondChairName: string | null;
    }
  | { type: 'suggestion' }
  /** A message from the public contact form (#132). Says nothing about who sent it or what. */
  | { type: 'contact' }
  /** A passkey was added to this Chair's account (#153): for them only, and always sent. */
  | { type: 'passkey_added'; userId: string };

/** The event for a pending proposal just made (or made to replace the proposer's own). */
export function proposalEvent(proposal: TierProposalRow): PushEvent {
  return {
    type: 'proposal',
    venueId: proposal.venueId,
    proposerId: proposal.proposedBy,
    proposerName: proposal.proposedByName,
    fromTier: proposal.fromTier,
    toTier: proposal.proposedTier,
  };
}

/** The event for a proposal just approved or declined. Carries no decline reason. */
export function decisionEvent(proposal: TierProposalRow): PushEvent {
  return {
    type: 'decision',
    proposalId: proposal.id,
    venueId: proposal.venueId,
    proposerId: proposal.proposedBy,
    deciderName: proposal.decidedByName,
    approved: proposal.status === 'approved',
  };
}

/** The event for a first "Visited today" press, or for the countersign that confirmed it. */
export function visitEvent(inspection: InspectionRow): PushEvent {
  return inspection.status === 'confirmed'
    ? {
        type: 'visit_confirmed',
        venueId: inspection.venueId,
        date: inspection.inspectionDate,
        firstChairId: inspection.firstAdminId,
        secondChairId: inspection.secondAdminId,
        secondChairName: inspection.secondAdminName,
      }
    : {
        type: 'visit_waiting',
        venueId: inspection.venueId,
        date: inspection.inspectionDate,
        firstChairId: inspection.firstAdminId,
        firstChairName: inspection.firstAdminName,
      };
}

/** The preference each event is filed under; null for security notices, which cannot be turned off. */
const EVENT_KIND: Record<PushEvent['type'], PushEventKind | null> = {
  proposal: 'proposals',
  decision: 'decisions',
  visit_waiting: 'visits',
  visit_confirmed: 'visits',
  suggestion: 'suggestions',
  contact: 'contact',
  passkey_added: null,
};

export interface ChairCandidate {
  id: string;
  role: string | null;
  banned: boolean | null;
  banExpires: Date | null;
  preferences: NotificationPreferences;
}

/**
 * Who an event goes to: active Chairs only, never the one who caused it, and only those with the
 * event switched on. Decisions and countersigns go to one Chair; the rest to everyone else.
 */
export function selectRecipients(
  event: PushEvent,
  chairs: ChairCandidate[],
  now: Date = new Date()
): string[] {
  const kind = EVENT_KIND[event.type];
  const wants = (chair: ChairCandidate) =>
    isActiveChair(chair, now) && (kind === null || chair.preferences[kind]);

  let eligible: ChairCandidate[];
  switch (event.type) {
    case 'proposal':
      eligible = chairs.filter((chair) => chair.id !== event.proposerId);
      break;
    case 'decision':
      eligible = event.proposerId ? chairs.filter((chair) => chair.id === event.proposerId) : [];
      break;
    case 'visit_waiting':
      eligible = chairs.filter((chair) => chair.id !== event.firstChairId);
      break;
    case 'visit_confirmed':
      eligible =
        event.firstChairId && event.firstChairId !== event.secondChairId
          ? chairs.filter((chair) => chair.id === event.firstChairId)
          : [];
      break;
    case 'suggestion':
    case 'contact':
      eligible = chairs;
      break;
    case 'passkey_added':
      eligible = chairs.filter((chair) => chair.id === event.userId);
      break;
  }
  return eligible.filter(wants).map((chair) => chair.id);
}

/** What waits on the Chairs' Area right now, for the app badge. */
export interface PendingWork {
  /** The proposer of each pending proposal (null when their account is gone). */
  proposalProposers: (string | null)[];
  /** The first presser of each of today's pending inspections. */
  visitPressers: (string | null)[];
  newSuggestions: number;
  newContactMessages: number;
}

/**
 * The items this Chair can act on: other Chairs' proposals and visit presses (never their own),
 * plus new suggestions and contact messages when they follow those.
 */
export function badgeCount(
  userId: string,
  work: PendingWork,
  preferences: NotificationPreferences
): number {
  const others = (ids: (string | null)[]) => ids.filter((id) => id !== userId).length;
  return (
    others(work.proposalProposers) +
    others(work.visitPressers) +
    (preferences.suggestions ? work.newSuggestions : 0) +
    (preferences.contact ? work.newContactMessages : 0)
  );
}

/** A name or venue long enough for a lock screen; keeps every payload far below 4 KB. */
const NAME_MAX = 60;
function short(value: string | null | undefined, fallback: string): string {
  const text = value?.replace(/\s+/g, ' ').trim() || fallback;
  return text.length > NAME_MAX ? `${text.slice(0, NAME_MAX - 1)}…` : text;
}

const tierText = (tier: TierValue | null) => (tier ? tierLabel(tier) : 'No verdict');

/** Push service delivery options: how urgent, and how long an undelivered push stays worth having. */
export interface DeliveryOptions {
  urgency: 'high' | 'normal' | 'low';
  /** Seconds. */
  ttl: number;
}

const DAY = 24 * 3600;

/** The notification for an event, for one recipient (the badge is theirs). */
export function buildMessage(
  event: PushEvent,
  context: {
    venueName?: string | null;
    badge: number;
    suggestionCount?: number;
    contactCount?: number;
  }
): PushMessage {
  const venue = short(context.venueName, 'A venue');
  const { badge } = context;
  switch (event.type) {
    case 'proposal': {
      const proposer = short(event.proposerName, 'A Chair');
      const url = `/admin/venues/${event.venueId}#tier-decree`;
      const tag = `proposal:${event.venueId}`;
      return event.fromTier === null
        ? {
            title: 'New venue awaiting countersign',
            body: `${proposer} has entered ${venue} as ${tierText(event.toTier)}`,
            tag,
            url,
            badge,
          }
        : {
            title: 'Verdict awaiting countersign',
            body: `${proposer} proposes ${venue}: ${tierText(event.fromTier)} → ${tierText(event.toTier)}`,
            tag,
            url,
            badge,
          };
    }
    case 'decision':
      return {
        title: event.approved ? 'Your verdict was approved' : 'Your verdict was declined',
        body: `${venue} · ${short(event.deciderName, 'a Chair')}`,
        tag: `decision:${event.proposalId}`,
        url: `/admin/venues/${event.venueId}/history`,
        badge,
      };
    case 'visit_waiting':
      return {
        title: 'Inspection needs a second Chair',
        body: `${short(event.firstChairName, 'A Chair')} visited ${venue} today. Countersign before midnight.`,
        tag: `visit:${event.venueId}:${event.date}`,
        url: `/admin/venues/${event.venueId}#concord`,
        badge,
        renotify: true,
      };
    case 'visit_confirmed':
      return {
        title: 'Inspection verified',
        body: `${venue} · countersigned by ${short(event.secondChairName, 'a Chair')}`,
        tag: `visit:${event.venueId}:${event.date}`,
        url: `/admin/venues/${event.venueId}`,
        badge,
        renotify: true,
      };
    case 'suggestion': {
      const count = Math.max(1, context.suggestionCount ?? 1);
      return {
        title: count === 1 ? 'New venue suggestion' : `${count} new venue suggestions`,
        body: 'Waiting in the Chairs’ inbox.',
        tag: 'suggestions',
        url: '/admin/suggestions',
        badge,
      };
    }
    case 'contact': {
      // Never the sender, the topic or the text: this shows on a lock screen.
      const count = Math.max(1, context.contactCount ?? 1);
      return {
        title:
          count === 1 ? 'New message from the website' : `${count} new messages from the website`,
        body: 'Waiting in the Chairs’ contact inbox.',
        tag: 'contact',
        url: '/admin/contact',
        badge,
      };
    }
    case 'passkey_added':
      return {
        title: 'A passkey was added to your account',
        body: 'If this wasn’t you, remove it in Account and change your password.',
        tag: 'passkey-added',
        url: '/admin/account#passkeys',
        badge,
        renotify: true,
      };
  }
}

/** The test push from the account page. */
export function testMessage(badge: number): PushMessage {
  return {
    title: 'Test notification',
    body: 'Notifications from the Chairs’ Area reach this device.',
    tag: 'test',
    url: '/admin/account#notifications',
    badge,
  };
}

/**
 * Urgency and lifetime. "Visited today" is time-critical and worthless after London midnight, so
 * an undelivered one expires then rather than arriving tomorrow.
 */
export function deliveryOptions(
  event: PushEvent | { type: 'test' },
  secondsToMidnight: number
): DeliveryOptions {
  switch (event.type) {
    case 'visit_waiting':
    case 'visit_confirmed':
      return { urgency: 'high', ttl: secondsToMidnight };
    case 'suggestion':
    case 'contact':
      return { urgency: 'low', ttl: DAY };
    case 'test':
      return { urgency: 'normal', ttl: 3600 };
    default:
      return { urgency: 'normal', ttl: 7 * DAY };
  }
}

/** Push services refuse payloads over 4 KB once encrypted; this leaves ample room for that. */
export const MAX_PAYLOAD_BYTES = 3000;

export function encodeMessage(message: PushMessage): string {
  const json = JSON.stringify({ v: 1, ...message });
  if (new TextEncoder().encode(json).length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Push payload too large (${json.length} characters).`);
  }
  return json;
}
