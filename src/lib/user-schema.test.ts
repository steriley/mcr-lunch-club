import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUserSchema, resetPasswordSchema } from './user-schema';
import { MIN_PASSWORD_LENGTH } from './password-policy';

const password = 'p'.repeat(MIN_PASSWORD_LENGTH);

describe('createUserSchema', () => {
  it('normalises email and defaults the role to admin', () => {
    const result = createUserSchema.parse({ name: ' Ann ', email: 'Ann@Example.COM', password });
    assert.equal(result.name, 'Ann');
    assert.equal(result.email, 'ann@example.com');
    assert.equal(result.role, 'admin');
  });

  it('rejects bad emails, empty names, unknown roles and short passwords', () => {
    assert.equal(createUserSchema.safeParse({ name: 'A', email: 'nope', password }).success, false);
    assert.equal(createUserSchema.safeParse({ name: '  ', email: 'a@b.co', password }).success, false);
    assert.equal(createUserSchema.safeParse({ name: 'A', email: 'a@b.co', password, role: 'root' }).success, false);
    assert.equal(createUserSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success, false);
  });
});

describe('resetPasswordSchema', () => {
  it('enforces minimum and maximum length', () => {
    assert.equal(resetPasswordSchema.safeParse({ password }).success, true);
    assert.equal(resetPasswordSchema.safeParse({ password: 'p'.repeat(MIN_PASSWORD_LENGTH - 1) }).success, false);
    assert.equal(resetPasswordSchema.safeParse({ password: 'p'.repeat(129) }).success, false);
  });
});
