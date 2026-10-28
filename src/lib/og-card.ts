/**
 * Social preview cards (1200x630 PNG) for venues without a photo. Built at
 * build time by src/pages/og/venues/[slug].png.ts, so satori and resvg run
 * only in the build and never reach the browser bundle (`pnpm check:bundle`).
 *
 * satori reads TTF/OTF/WOFF but not WOFF2, so the site's self-hosted WOFF2
 * fonts (public/fonts) are decoded once per build rather than fetched.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import wawoff2 from 'wawoff2';
import { COST_LABELS } from '@/lib/cost-display';
import { walkText } from '@/lib/route-display';
import { tierInfo, type TierValue } from '@/lib/tiers';
import type { CostBand } from '@/lib/venue-schema';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** What the card shows: a change to any of these changes the picture. */
export interface OgCardVenue {
  name: string;
  tier: TierValue;
  cost: CostBand;
  walkingTimeMin: number | null;
}

const root = process.cwd();
const fromRoot = (...segments: string[]) => path.join(root, ...segments);

const FONT_FILES = [
  { name: 'Playfair Display', file: 'playfair-display-latin-700-normal', weight: 700 },
  { name: 'Plus Jakarta Sans', file: 'plus-jakarta-sans-latin-600-normal', weight: 600 },
  { name: 'Plus Jakarta Sans', file: 'plus-jakarta-sans-latin-700-normal', weight: 700 },
] as const;

let fonts: Promise<{ name: string; data: Buffer; weight: 600 | 700; style: 'normal' }[]> | undefined;

async function decodeFonts() {
  const decoded = [];
  // One at a time: wawoff2's decoder shares memory between calls.
  for (const { name, file, weight } of FONT_FILES) {
    const data = Buffer.from(await wawoff2.decompress(readFileSync(fromRoot('public', 'fonts', `${file}.woff2`))));
    decoded.push({ name, weight, style: 'normal' as const, data });
  }
  return decoded;
}

const loadFonts = () => (fonts ??= decodeFonts());

/** Colours come from the theme file, so the cards follow the site's tokens. */
let theme: string | undefined;
function themeColor(token: string): string {
  theme ??= readFileSync(fromRoot('src', 'styles', 'theme.css'), 'utf8');
  const match = theme.match(new RegExp(`--color-${token}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!match) throw new Error(`og-card: no --color-${token} in src/styles/theme.css`);
  return match[1];
}

let crest: string | undefined;
function crestDataUri(): string {
  crest ??= `data:image/png;base64,${readFileSync(fromRoot('public', 'brand', 'icon-512.png')).toString('base64')}`;
  return crest;
}

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown; [key: string]: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown, props: Record<string, unknown> = {}): Node => ({
  type,
  props: { ...props, style, children },
});

/** Shrinks long names so they fit in two lines. */
function nameSize(name: string): number {
  if (name.length <= 18) return 88;
  if (name.length <= 30) return 72;
  return 58;
}

function card({ name, tier, cost, walkingTimeMin }: OgCardVenue): Node {
  const info = tierInfo(tier);
  const slug = info.slug;
  const accent = themeColor(`tier-${slug}`);
  const facts = [`${cost} · ${COST_LABELS[cost]}`, walkingTimeMin === null ? null : `${walkText(walkingTimeMin)} from Spinningfields`].filter(Boolean);
  const parchment = themeColor('parchment-fixed');

  return h(
    'div',
    { width: OG_WIDTH, height: OG_HEIGHT, display: 'flex', background: themeColor('deep'), fontFamily: 'Plus Jakarta Sans', color: parchment },
    [
      h('div', { width: 28, height: OG_HEIGHT, background: accent }),
      h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '56px 64px' }, [
        h('div', { display: 'flex', alignItems: 'center' }, [
          h('img', { width: 96, height: 96, marginRight: 24 }, undefined, { src: crestDataUri(), width: 96, height: 96 }),
          h('div', { display: 'flex', flexDirection: 'column' }, [
            h('div', { fontSize: 26, fontWeight: 700, letterSpacing: 4, color: themeColor('gold') }, 'MCR LUNCH CLUB'),
            h('div', { fontSize: 22, color: parchment, opacity: 0.75 }, 'We return only where deserved'),
          ]),
        ]),
        h('div', { display: 'flex', flexDirection: 'column' }, [
          h(
            'div',
            { display: 'flex', alignSelf: 'flex-start', background: accent, color: parchment, fontSize: 32, fontWeight: 700, letterSpacing: 3, padding: '10px 28px', borderRadius: 8, textTransform: 'uppercase' },
            info.label,
          ),
          h('div', { display: 'flex', marginTop: 28, fontFamily: 'Playfair Display', fontWeight: 700, fontSize: nameSize(name), lineHeight: 1.1, lineClamp: 2 }, name),
        ]),
        h('div', { display: 'flex', fontSize: 34, fontWeight: 600, color: parchment }, facts.join('   ·   ')),
      ]),
    ],
  );
}

/** The card as PNG bytes. */
export async function renderOgCard(venue: OgCardVenue): Promise<Uint8Array> {
  const svg = await satori(card(venue) as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}
