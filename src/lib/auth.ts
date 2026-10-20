import { db } from '@/lib/db';
import { createAuth } from '@/lib/auth-config';

export const auth = createAuth(db);

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession['user'];

export default auth;
