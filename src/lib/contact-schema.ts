import '@/lib/zod-browser';
import { z } from 'zod';

/**
 * The public contact form (#132), shared by POST /api/contact and the ContactForm island. Keep
 * this module free of server-only imports: it ships to the browser. The server stays the
 * authority; the island only uses it to show the same messages before sending.
 */

export const CONTACT_TOPICS = ['general', 'venue', 'press', 'other'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  general: 'General enquiry',
  venue: 'About a venue',
  press: 'Press',
  other: 'Something else',
};

export const CONTACT_STATUSES = ['new', 'read', 'handled'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CONTACT_LIMITS = {
  name: { min: 2, max: 120 },
  email: { max: 254 },
  message: { min: 10, max: 3000 },
  /** More links than this is a spam signal, and refused. */
  urls: 2,
} as const;

/** How long a message is kept before the daily job deletes it. Stated on the page. */
export const CONTACT_RETENTION_DAYS = 90;

/**
 * Invisible characters that only hide or reorder text: zero-width spaces and joiners, the word
 * joiner, the byte-order mark, the soft hyphen and the bidirectional overrides and isolates (which
 * could make a message read differently in the inbox from what it contains).
 */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** C0 and C1 control characters, line breaks and tabs included. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
/** The same, except the tab and line feed a message may contain. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_IN_MESSAGE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** Unicode NFC with the invisible characters taken out, then trimmed. */
export function normaliseContactText(value: string): string {
  return value.normalize('NFC').replace(INVISIBLE, '').trim();
}

/** A message body: normalised, CRLF and CR made LF, other control characters dropped. */
export function normaliseContactMessage(value: string): string {
  return normaliseContactText(value.replace(/\r\n?/g, '\n').replace(CONTROL_IN_MESSAGE, ''));
}

export function hasControlCharacters(value: string): boolean {
  return CONTROL.test(value);
}

/** Links in a message: anything starting with a scheme-and-slashes or `www.`. */
export function countUrls(value: string): number {
  return value.match(/\b[a-z][a-z0-9+.-]*:\/\/|\bwww\./gi)?.length ?? 0;
}

const singleLine = (label: string) =>
  z
    .string({ error: `Enter ${label}.` })
    .refine((value) => !hasControlCharacters(value), {
      error: `Remove line breaks and control characters from ${label}.`,
      abort: true,
    })
    .overwrite(normaliseContactText);

export const contactInputSchema = z.object({
  name: singleLine('your name')
    .min(CONTACT_LIMITS.name.min, 'Enter your name.')
    .max(CONTACT_LIMITS.name.max, `Keep your name under ${CONTACT_LIMITS.name.max} characters.`),
  email: singleLine('your email address')
    .max(CONTACT_LIMITS.email.max, 'Enter a valid email address.')
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  topic: z.enum(CONTACT_TOPICS, { error: 'Choose a topic.' }),
  message: z
    .string({ error: 'Write a message.' })
    .overwrite(normaliseContactMessage)
    .min(
      CONTACT_LIMITS.message.min,
      `Write a little more (at least ${CONTACT_LIMITS.message.min} characters).`
    )
    .max(CONTACT_LIMITS.message.max, `Keep it under ${CONTACT_LIMITS.message.max} characters.`)
    .refine((value) => countUrls(value) <= CONTACT_LIMITS.urls, {
      error: `Include at most ${CONTACT_LIMITS.urls} links.`,
    }),
  /** The time-trap token from GET /api/contact. */
  formToken: z.string().max(200),
  /** Honeypot: hidden from people, so anything in it means a bot. */
  website: z.string().max(200).optional(),
});

export type ContactInput = z.output<typeof contactInputSchema>;

/** The Chairs' inbox: mark a message read, handled, or back to new. */
export const contactStatusSchema = z.object({ status: z.enum(CONTACT_STATUSES) });
