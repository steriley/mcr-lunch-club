import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatDate, formatDateTime, ordinal } from './dates';

describe('ordinal', () => {
  it('uses st, nd, rd and th, with th for 11 to 13', () => {
    const expected: Record<number, string> = {
      1: '1st',
      2: '2nd',
      3: '3rd',
      4: '4th',
      10: '10th',
      11: '11th',
      12: '12th',
      13: '13th',
      21: '21st',
      22: '22nd',
      23: '23rd',
      24: '24th',
      30: '30th',
      31: '31st',
    };
    for (const [n, text] of Object.entries(expected)) assert.equal(ordinal(Number(n)), text);
  });
});

describe('formatDate', () => {
  it('formats every month, with Sept for September', () => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec',
    ];
    months.forEach((name, index) => {
      assert.equal(formatDate(`2026-${String(index + 1).padStart(2, '0')}-08`), `8th ${name} 26`);
    });
    // Asserted on its own so a change in runtime locale data ("Sep") fails loudly.
    assert.equal(formatDate('2026-09-08'), '8th Sept 26');
  });

  it('uses a two-digit year', () => {
    assert.equal(formatDate('2026-03-31'), '31st Mar 26');
    assert.equal(formatDate('2005-03-31'), '31st Mar 05');
  });

  it('never shifts a date-only value by a day', () => {
    assert.equal(formatDate('2026-03-31'), '31st Mar 26');
    assert.equal(formatDate('2026-01-01'), '1st Jan 26');
    assert.equal(formatDate('2026-12-31'), '31st Dec 26');
  });

  it('uses the London calendar day for timestamps', () => {
    assert.equal(formatDate('2026-06-30T23:30:00Z'), '1st Jul 26');
    assert.equal(formatDate(new Date('2026-06-30T23:30:00Z')), '1st Jul 26');
  });

  it('returns the fallback for missing or invalid input and never throws', () => {
    for (const value of [
      null,
      undefined,
      '',
      '   ',
      'nonsense',
      '2026-02-31',
      '2026-13-01',
      'Awaiting Assessment',
      new Date('nope'),
    ]) {
      assert.equal(formatDate(value), '—');
      assert.equal(formatDateTime(value), '—');
    }
    assert.equal(formatDate(null, { fallback: 'never' }), 'never');
    assert.equal(formatDateTime('nonsense', { fallback: 'unknown' }), 'unknown');
  });
});

describe('formatDateTime', () => {
  it('follows the GMT/BST switches in Europe/London', () => {
    assert.equal(formatDateTime('2026-03-29T00:30:00Z'), '29th Mar 26, 00:30');
    assert.equal(formatDateTime('2026-03-29T01:30:00Z'), '29th Mar 26, 02:30');
    assert.equal(formatDateTime('2026-10-25T00:30:00Z'), '25th Oct 26, 01:30');
    assert.equal(formatDateTime('2026-10-25T01:30:00Z'), '25th Oct 26, 01:30');
  });

  it('rolls over the day in London time', () => {
    assert.equal(formatDateTime('2026-06-30T23:30:00Z'), '1st Jul 26, 00:30');
    assert.equal(formatDateTime('2026-12-31T23:59:00Z'), '31st Dec 26, 23:59');
  });

  it('treats a Date like the equivalent ISO timestamp', () => {
    for (const iso of ['2026-03-29T01:30:00Z', '2026-06-30T23:30:00Z', '2026-12-31T23:59:00Z']) {
      assert.equal(formatDateTime(new Date(iso)), formatDateTime(iso));
    }
  });

  it('accepts offsets and fractional seconds', () => {
    assert.equal(formatDateTime('2026-03-31T14:05:00.123Z'), '31st Mar 26, 15:05');
    assert.equal(formatDateTime('2026-03-31T14:05:00+01:00'), '31st Mar 26, 14:05');
  });

  it('shows a date-only value as just the date, never 00:00', () => {
    assert.equal(formatDateTime('2026-03-31'), '31st Mar 26');
  });

  it('appends a separately recorded time without converting it', () => {
    assert.equal(formatDateTime('2026-03-31', { time: '14:30' }), '31st Mar 26, 14:30');
    assert.equal(formatDateTime('2026-03-31', { time: '14:30:00' }), '31st Mar 26, 14:30');
    assert.equal(formatDateTime('2026-07-08', { time: '23:00' }), '8th Jul 26, 23:00');
  });

  it('ignores an invalid time', () => {
    for (const time of ['25:00', '9am', '', null, '14:3']) {
      assert.equal(formatDateTime('2026-03-31', { time }), '31st Mar 26');
    }
  });
});

describe('dates.ts source', () => {
  it('never uses local-timezone getters or Intl month names', () => {
    const source = readFileSync(new URL('./dates.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.get(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\(/);
    assert.doesNotMatch(source, /\.toLocale\w*\(/);
    assert.doesNotMatch(source, /month:\s*'(short|long|narrow)'/);
  });
});
