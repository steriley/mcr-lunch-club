import { closureHandler } from '@/lib/venue-closure-route';

export const prerender = false;

export const POST = closureHandler('close');
