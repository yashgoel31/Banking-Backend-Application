import request from 'supertest';
import { generateJwtKeyPair, InMemoryTokenStateStore, signAccessToken, UserRole } from '@banksphere/common';

const keys = generateJwtKeyPair();
process.env.JWT_SIGNING_KEY = keys.privateKeyB64;
process.env.JWT_SIGNING_KEY_ID = 'test-kid';
process.env.JWT_VERIFY_KEYS = `test-kid:${keys.publicKeyB64}`;
process.env.CUSTOMER_INTERNAL_TOKEN = 'c'.repeat(40);

import { createApp } from '../src/app';

const ALICE = '0b8f2a52-0d55-4bb4-9a43-6f0d8f1f0a01';

const tokenFor = (role: UserRole, sub = `${role.toLowerCase()}-user`) =>
  signAccessToken({ sub, email: `${role.toLowerCase()}@bank.com`, role, tokenVersion: 0, mfa: role !== 'CUSTOMER', sessionId: `s-${sub}` });

/** YYYY-MM-DD for the date `years` years (and `days` days) before today (UTC) */
function yearsAgo(years: number, days = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('Customer HTTP routes', () => {
  let prisma: any;
  let app: any;
  const asAlice = `Bearer ${tokenFor('CUSTOMER', ALICE)}`;

  beforeEach(() => {
    prisma = {
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }: any) => ({ id: 'cp-1', kycStatus: 'PENDING', version: 1, createdAt: new Date(), updatedAt: new Date(), ...data })),
        update: jest.fn(({ data }: any) => ({ id: 'cp-1', userId: ALICE, kycStatus: 'PENDING', version: 2, ...data })),
      },
      kycEvent: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      staffAccessLog: { create: jest.fn(), createMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    prisma.$transaction = jest.fn((cb: any) => cb(prisma));
    const redis: any = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    app = createApp(prisma, redis, new InMemoryTokenStateStore()).app;
  });

  const createMe = (body: Record<string, unknown>) =>
    request(app).post('/api/v1/customers/me').set('Authorization', asAlice).send({ fullName: 'Alice Smith', phoneNumber: '+919876543210', ...body });
  const created = () => prisma.customerProfile.create.mock.calls[0][0].data;

  describe('profile validation', () => {
    it('DATE OF BIRTH: accepts YYYY-MM-DD and full ISO date-times, stored as before', async () => {
      expect((await createMe({ dateOfBirth: '1990-05-17' })).status).toBe(201);
      expect(created().dateOfBirth).toEqual(new Date('1990-05-17T00:00:00.000Z'));
      prisma.customerProfile.create.mockClear();
      expect((await createMe({ dateOfBirth: '1990-05-17T00:00:00.000Z' })).status).toBe(201);
      expect(created().dateOfBirth).toEqual(new Date('1990-05-17T00:00:00.000Z'));
    });

    it('DATE OF BIRTH: refuses future, year-0000, impossible and implausible dates (age must be 18-120)', async () => {
      for (const dateOfBirth of ['2099-01-01', '0000-01-01', '0000-01-01T00:00:00.000Z', '2001-02-30', 'yesterday', yearsAgo(18, 1), yearsAgo(121, -1)]) {
        const res = await createMe({ dateOfBirth });
        expect({ dateOfBirth, status: res.status }).toEqual({ dateOfBirth, status: 400 });
      }
      expect(prisma.customerProfile.create).not.toHaveBeenCalled();
      for (const dateOfBirth of [yearsAgo(18, -1), yearsAgo(121, 1)]) {
        expect({ dateOfBirth, status: (await createMe({ dateOfBirth })).status }).toEqual({ dateOfBirth, status: 201 });
      }
    });

    it('NAMES: NFKC-normalised, spaces collapsed; letters, marks, spaces and . \' - only', async () => {
      const accepted: Array<[string, string]> = [
        ['Ａｌｉｃｅ Smith', 'Alice Smith'], // full-width letters
        ['  Alice    van   der Berg ', 'Alice van der Berg'],
        ["Anne-Marie O'Neil Jr.", "Anne-Marie O'Neil Jr."],
        ['O’Brien Kelly', "O'Brien Kelly"], // typographic apostrophe
        ['José Ñuñez', 'José Ñuñez'], // decomposed accents are composed
        ['अनीता शर्मा', 'अनीता शर्मा'], // Devanagari (combining marks)
        ['Alice Smith', 'Alice Smith'], // no-break space
      ];
      for (const [input, stored] of accepted) {
        prisma.customerProfile.create.mockClear();
        expect({ input, status: (await createMe({ fullName: input })).status }).toEqual({ input, status: 201 });
        expect(created().fullName).toBe(stored);
      }
    });

    it('NAMES: refuses zero-width, bidi, control characters, digits and symbols', async () => {
      const rejected = [
        'Ali​ce Smith', // zero-width space
        'Alice‍ Smith', // zero-width joiner
        'Alice ‮Smith', // right-to-left override
        'Alice ⁦Smith⁩', // isolates
        'Alice\u0007 Smith', // control
        'Alice\nSmith',
        'Alice\tSmith',
        'E2E Alice',
        '<script>',
        'Alice_Smith',
        '--',
        'A',
        'A'.repeat(101),
      ];
      for (const fullName of rejected) {
        expect({ fullName, status: (await createMe({ fullName })).status }).toEqual({ fullName, status: 400 });
      }
      expect(prisma.customerProfile.create).not.toHaveBeenCalled();
    });

    it('ADDRESS: trimmed, blank means absent, at most 255 characters', async () => {
      expect((await createMe({ address: '  12 Main Street, Pune  ' })).status).toBe(201);
      expect(created().address).toBe('12 Main Street, Pune');
      prisma.customerProfile.create.mockClear();
      expect((await createMe({ address: '   ' })).status).toBe(201);
      expect(created().address).toBeUndefined();
      expect((await createMe({ address: 'x'.repeat(256) })).status).toBe(400);
    });

    it('PATCH /me applies the same rules; a blank address leaves the stored one unchanged', async () => {
      prisma.customerProfile.findUnique.mockResolvedValue({ userId: ALICE, fullName: 'Alice Smith', address: '12 Main Street', dateOfBirth: null, kycStatus: 'VERIFIED' });
      const res = await request(app).patch('/api/v1/customers/me').set('Authorization', asAlice).send({ address: ' ', phoneNumber: '+919876500000' });
      expect(res.status).toBe(200);
      expect(prisma.customerProfile.update.mock.calls[0][0].data).not.toHaveProperty('address');
      expect(prisma.kycEvent.create).not.toHaveBeenCalled();

      for (const body of [{ fullName: 'Mallory‮' }, { dateOfBirth: '2099-01-01' }, { address: 'y'.repeat(300) }]) {
        expect((await request(app).patch('/api/v1/customers/me').set('Authorization', asAlice).send(body)).status).toBe(400);
      }
    });
  });
});
