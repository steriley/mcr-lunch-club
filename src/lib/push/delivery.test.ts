import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyResult,
  sendWithRetry,
  topicFor,
  type PushSender,
  type SendResult,
} from './delivery';

const target = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
const options = { urgency: 'normal' as const, ttl: 60 };

function fakeSender(results: (SendResult | Error)[]) {
  const calls: string[] = [];
  const send: PushSender = async (to, payload) => {
    calls.push(payload);
    const next = results[Math.min(calls.length - 1, results.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { send, calls };
}

describe('classifyResult', () => {
  it('reads the push service answer', () => {
    assert.equal(classifyResult({ statusCode: 201 }), 'delivered');
    assert.equal(classifyResult({ statusCode: 404 }), 'gone');
    assert.equal(classifyResult({ statusCode: 410 }), 'gone');
    assert.equal(classifyResult({ statusCode: 413 }), 'too_large');
    assert.equal(classifyResult({ statusCode: 429 }), 'retry');
    assert.equal(classifyResult({ statusCode: 503 }), 'retry');
    assert.equal(classifyResult({ statusCode: 400 }), 'failed');
    assert.equal(classifyResult({ statusCode: null }), 'failed');
  });
});

describe('sendWithRetry', () => {
  const noSleep = async () => undefined;

  it('does not retry a gone subscription', async () => {
    const { send, calls } = fakeSender([{ statusCode: 410 }]);
    const { outcome } = await sendWithRetry(send, target, 'x', options, noSleep);
    assert.equal(outcome, 'gone');
    assert.equal(calls.length, 1);
  });

  it('retries a 429 once, after the Retry-After (capped)', async () => {
    const waits: number[] = [];
    const { send, calls } = fakeSender([{ statusCode: 429, retryAfter: 60 }, { statusCode: 201 }]);
    const { outcome } = await sendWithRetry(send, target, 'x', options, async (ms) =>
      waits.push(ms)
    );
    assert.equal(outcome, 'delivered');
    assert.equal(calls.length, 2);
    assert.deepEqual(waits, [5000]);
  });

  it('gives up after one retry', async () => {
    const { send, calls } = fakeSender([{ statusCode: 500 }]);
    const { outcome } = await sendWithRetry(send, target, 'x', options, noSleep);
    assert.equal(outcome, 'failed');
    assert.equal(calls.length, 2);
  });

  it('turns a thrown error into a failure, without retrying', async () => {
    const { send, calls } = fakeSender([new Error('socket hang up')]);
    const { outcome, result } = await sendWithRetry(send, target, 'x', options, noSleep);
    assert.equal(outcome, 'failed');
    assert.equal(result.error, 'socket hang up');
    assert.equal(calls.length, 1);
  });
});

describe('topicFor', () => {
  it('is at most 32 URL-safe characters, the same for the same tag', async () => {
    const topic = await topicFor('visit:3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f:2026-11-03');
    assert.match(topic, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(topic, await topicFor('visit:3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f:2026-11-03'));
    assert.notEqual(topic, await topicFor('suggestions'));
  });
});
