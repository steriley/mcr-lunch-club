import '@/lib/zod-browser';
import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(128, 'Password must be 128 characters or fewer.');

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase(),
  password,
  // The Users page manages Chairs only (#136). Members sign up themselves and are moderated from
  // the Members list, so this form can never make a member account.
  role: z.literal('admin').default('admin'),
});

export const resetPasswordSchema = z.object({ password });

/** Confirming your own password, e.g. before adding a passkey (#153). Any length the account may have. */
export const confirmPasswordSchema = z.object({
  password: z.string().min(1, 'Enter your password.').max(128),
});
