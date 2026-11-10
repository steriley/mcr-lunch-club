import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMemberRoute, memberAuthPathAccess } from './auth-paths';

describe('memberAuthPathAccess', () => {
  it('never opens Better Auth’s own request endpoints: requests go through /api/member/sign-in', () => {
    for (const enabled of [true, false]) {
      assert.equal(memberAuthPathAccess('/sign-in/magic-link', enabled), 'not_found');
      assert.equal(memberAuthPathAccess('/email-otp/send-verification-otp', enabled), 'not_found');
    }
  });

  it('never opens the unused email-code endpoints, such as password reset by email', () => {
    for (const path of [
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
      '/forget-password/email-otp',
      '/email-otp/check-verification-otp',
      '/email-otp/verify-email',
      '/email-otp/request-email-change',
      '/email-otp/change-email',
      '/email-otp/send-verification-otp/',
    ]) {
      assert.equal(memberAuthPathAccess(path, true), 'not_found', path);
    }
  });

  it('opens verifying a link or code only while the members flag is on', () => {
    for (const path of ['/magic-link/verify', '/sign-in/email-otp', '/sign-in/email-otp/']) {
      assert.equal(memberAuthPathAccess(path, true), 'pass', path);
      assert.equal(memberAuthPathAccess(path, false), 'not_found', path);
    }
  });

  it('leaves everything else to Better Auth, including the Chairs’ sign-in', () => {
    for (const path of [
      '/sign-in/email',
      '/get-session',
      '/sign-out',
      '/passkey/verify-authentication',
    ]) {
      assert.equal(memberAuthPathAccess(path, false), 'pass', path);
    }
  });
});

describe('isMemberRoute', () => {
  it('covers the member pages and API, nothing else', () => {
    for (const path of ['/members', '/members/me', '/api/member', '/api/member/sign-in']) {
      assert.equal(isMemberRoute(path), true, path);
    }
    for (const path of ['/membership', '/api/members-list', '/admin/members', '/']) {
      assert.equal(isMemberRoute(path), false, path);
    }
  });
});
