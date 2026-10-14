import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const venues = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/venues' }),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    status: z.enum([
      'Approved',
      'Under Consideration',
      'To Be Assessed',
      'Rejected',
      'If We Must',
      'Gone But Not Forgotten'
    ]),
    rank: z.number().nullable().optional(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    distanceMiles: z.number(),
    walkingTimeMin: z.number(),
    cost: z.enum(['£', '££', '£££']),
    cuisine: z.string(),
    eatLikeUs: z.string(),
    lastInspectionDate: z.string(),
    rejectionReason: z.string().nullable().optional(),
    address: z.string().default(''),
    evidenceUrl: z.string().optional().default(''),
    mapSearchLink: z.string().default(''),
    notes: z.string().optional().default('')
  })
});

const inspections = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/inspections' }),
  schema: z.object({
    id: z.string(),
    venueSlug: z.string(),
    venueName: z.string(),
    date: z.string(),
    attendees: z.array(z.string()),
    verdict: z.enum(['satisfactory', 'sub-par']),
    whatWasOrdered: z.string(),
    notes: z.string().optional().default('')
  })
});

const incidents = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/incidents' }),
  schema: z.object({
    id: z.string(),
    date: z.string(),
    title: z.string(),
    peopleInvolved: z.array(z.string()),
    witnesses: z.array(z.string()),
    benefitOffered: z.string(),
    value: z.string(),
    context: z.string(),
    outcome: z.string(),
    location: z.string().optional(),
    time: z.string().optional(),
    formattedDate: z.string().optional()
  })
});

export const collections = {
  venues,
  inspections,
  incidents
};
