import { proposalDecisionHandler } from '@/lib/proposal-route';

export const prerender = false;

export const POST = proposalDecisionHandler('approve');
