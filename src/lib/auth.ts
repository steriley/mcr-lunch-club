import { db } from '@/lib/db';
import { createAuth } from '@/lib/auth-config';

export const auth = createAuth(db);

export default auth;
