import { describe, expect, it } from 'vitest';
import { describeValue, detailEntries, humanizeKey, kycActionLabel, maskPhone, shortId, splitReason, waitingTime } from './format';

describe('staff formatting', () => {
  it('shortens identifiers', () => {
    expect(shortId('11111111-1111-4111-8111-111111111111')).toBe('11111111');
    expect(shortId(null)).toBe('—');
  });

  it('masks phone numbers down to the last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 ••••• 3210');
    expect(maskPhone('98765 43210')).toBe('••••• 3210');
    expect(maskPhone('123')).toBe('123');
  });

  it('escalates the waiting time after one and three days', () => {
    const now = Date.parse('2026-10-27T09:30:00.000Z');
    expect(waitingTime('2026-10-27T09:29:50.000Z', now)).toEqual({ label: 'Just now', tone: 'neutral' });
    expect(waitingTime('2026-10-27T05:30:00.000Z', now)).toEqual({ label: '4 hours', tone: 'neutral' });
    expect(waitingTime('2026-10-25T09:30:00.000Z', now)).toEqual({ label: '2 days', tone: 'warning' });
    expect(waitingTime('2026-10-20T09:30:00.000Z', now)).toEqual({ label: '7 days', tone: 'danger' });
  });

  it('turns audit details into readable text without interpreting it', () => {
    expect(humanizeKey('reviewedVersion')).toBe('Reviewed version');
    expect(humanizeKey('date_of_birth')).toBe('Date of birth');
    expect(describeValue({ from: 'Asha', to: 'Asha Rao' })).toBe('Asha → Asha Rao');
    expect(describeValue({ from: null, to: '12 MG Road' })).toBe('— → 12 MG Road');
    expect(describeValue(3)).toBe('3');
    expect(describeValue(['a', 1])).toBe('["a",1]');
    expect(describeValue('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
    expect(describeValue('x'.repeat(600))).toHaveLength(501);
    expect(detailEntries({ reviewedVersion: 2 })).toEqual([{ key: 'reviewedVersion', label: 'Reviewed version', value: '2' }]);
    expect(detailEntries(null)).toEqual([]);
  });

  it('labels KYC actions and fraud reasons', () => {
    expect(kycActionLabel('KYC_DECISION')).toBe('KYC decision');
    expect(kycActionLabel('SOMETHING_NEW')).toBe('Something new');
    expect(splitReason('[OUTBOUND] Amount too high')).toEqual({ direction: 'Outgoing', text: 'Amount too high' });
    expect(splitReason('[INBOUND] Velocity')).toEqual({ direction: 'Incoming', text: 'Velocity' });
    expect(splitReason('Plain reason')).toEqual({ direction: null, text: 'Plain reason' });
  });
});
