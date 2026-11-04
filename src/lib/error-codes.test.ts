import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_HTTP, type ErrorCode } from './admin-api';
import type { BriberyError } from './bribery';
import type { SaveGoldenCutResult } from './golden-cut';
import type { VisitError } from './inspections';
import { PROPOSAL_ERRORS, type ProposalError } from './tier-proposals';
import type { CreateError, PhotoError, RerouteError } from './venue-lifecycle';
import type { VenueImageError } from './venue-images';

/**
 * Domain modules return error codes as plain strings; adminRoute answers a
 * code it cannot find with a 500. This keeps the two in step: a code added to
 * a module without an ERROR_HTTP entry fails the typecheck here.
 */
type GoldenCutError = Extract<SaveGoldenCutResult, { ok: false }>['error'];
type Returned =
  | ProposalError
  | VisitError
  | BriberyError
  | GoldenCutError
  | CreateError
  | RerouteError
  | PhotoError
  | VenueImageError
  | 'slug_taken'
  | 'already_closed'
  | 'not_closed'
  | 'venue_not_found'
  | 'uploads_not_configured';

type Unmapped = Exclude<Returned, ErrorCode>;
const everyCodeIsMapped: [Unmapped] extends [never] ? true : Unmapped = true;

describe('ERROR_HTTP', () => {
  it('has an entry for every error code the domain modules return', () => {
    assert.equal(everyCodeIsMapped, true);
    for (const code of PROPOSAL_ERRORS) assert.ok(code in ERROR_HTTP, code);
  });

  it('gives every entry a client or server error status and a message', () => {
    for (const [code, { status, message }] of Object.entries(ERROR_HTTP)) {
      assert.ok(status >= 400 && status < 600, code);
      assert.ok(message.length > 0, code);
    }
  });
});
