import { publishHandler } from '@/lib/venue-publish';

export const prerender = false;

export const POST = publishHandler(false);
