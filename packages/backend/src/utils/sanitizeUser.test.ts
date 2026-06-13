import { describe, it, expect } from 'vitest';
import { sanitizeMemberStatus } from './sanitizeUser';

const base = {
  id: 'u1',
  username: 'alice',
  status: 'online' as const,
  lastSeenAt: new Date('2026-06-13T00:00:00Z'),
};

describe('sanitizeMemberStatus (приватность «последний раз»)', () => {
  it('видимость everyone → статус/время отдаём как есть', () => {
    const out = sanitizeMemberStatus({ ...base, lastSeenVisibility: 'everyone' }, 'requester');
    expect(out.status).toBe('online');
    expect(out.lastSeenAt).toEqual(base.lastSeenAt);
  });

  it('видимость nobody + чужой запрос → статус offline, lastSeenAt null', () => {
    const out = sanitizeMemberStatus({ ...base, lastSeenVisibility: 'nobody' }, 'someone-else');
    expect(out.status).toBe('offline');
    expect(out.lastSeenAt).toBeNull();
  });

  it('видимость nobody, но это сам владелец → видит себя как есть', () => {
    const out = sanitizeMemberStatus({ ...base, lastSeenVisibility: 'nobody' }, 'u1');
    expect(out.status).toBe('online');
    expect(out.lastSeenAt).toEqual(base.lastSeenAt);
  });

  it('lastSeenVisibility всегда вырезается из ответа (не утекает наружу)', () => {
    const out = sanitizeMemberStatus({ ...base, lastSeenVisibility: 'everyone' }, 'requester');
    expect('lastSeenVisibility' in out).toBe(false);
  });
});
