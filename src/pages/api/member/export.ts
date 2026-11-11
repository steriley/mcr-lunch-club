import { errorResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberRoute } from '@/lib/member-api';
import { memberAccounts } from '@/lib/members/profiles';

export const prerender = false;

/** "Download my data" (#136): everything the club holds about the member, as a JSON file. */
export const GET = memberRoute({ action: 'Export member data' }, async ({ session }) => {
  const data = await memberAccounts.exportData(db, session.user.id);
  if (!data) return errorResponse('member_not_found');
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mcr-lunch-club-my-data.json"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
});
