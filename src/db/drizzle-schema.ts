import * as appSchema from '@/db/schema';
import * as authSchema from '@/db/auth-schema';

export const schema = {
  ...appSchema,
  ...authSchema,
};
