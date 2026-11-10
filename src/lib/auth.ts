import { db } from '@/lib/db';
import { createAuth } from '@/lib/auth-config';
import { notifyChairs } from '@/lib/push/dispatch';

export const auth = createAuth(db, {
  onPasskeyAdded: (userId) => notifyChairs({ type: 'passkey_added', userId }),
});

export type AuthSession = typeof auth.$Infer.Session;
