import { db } from '@/lib/db';
import { memberRoute } from '@/lib/member-api';
import { profileUpdateSchema } from '@/lib/members/display-name';
import { memberAccounts } from '@/lib/members/profiles';

export const prerender = false;

/** The member changes their display name, their privacy setting, or both (#136). */
export const PATCH = memberRoute(
  { action: 'Update member profile', body: profileUpdateSchema },
  async ({ body, session }) => memberAccounts.updateProfile(db, session.user.id, body)
);
