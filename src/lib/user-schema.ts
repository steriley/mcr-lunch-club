import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

export const USER_ROLES = [
  { value: 'admin', label: 'Chair (full access)' },
  { value: 'user', label: 'No admin access' },
] as const;

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(128, 'Password must be 128 characters or fewer.');

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase(),
  password,
  role: z.enum(['admin', 'user']).default('admin'),
});

export const resetPasswordSchema = z.object({ password });
