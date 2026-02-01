import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkExternal } from '../../checks/external.js';

// Mock the env module
vi.mock('../../utils/env.js', () => ({
  getEnvValue: vi.fn(),
}));

import { getEnvValue } from '../../utils/env.js';

const mockGetEnvValue = vi.mocked(getEnvValue);

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('external checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvValue.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkExternal', () => {
    describe('AutoMem', () => {
      it('should skip when AUTOMEM_API_URL is not configured', async () => {
        mockGetEnvValue.mockReturnValue(undefined);

        const result = await checkExternal();

        const autoMemCheck = result.checks.find((c) => c.name === 'AutoMem');
        expect(autoMemCheck?.status).toBe('skip');
        expect(autoMemCheck?.detail).toContain('AUTOMEM_API_URL not set');
      });

      it('should warn when API token is missing', async () => {
        mockGetEnvValue.mockImplementation((key: string) => {
          if (key === 'AUTOMEM_API_URL') return 'http://localhost:8001';
          return undefined;
        });

        const result = await checkExternal();

        const autoMemCheck = result.checks.find((c) => c.name === 'AutoMem');
        expect(autoMemCheck?.status).toBe('warn');
        expect(autoMemCheck?.message).toBe('Missing token');
      });

      it('should pass when AutoMem is reachable', async () => {
        mockGetEnvValue.mockImplementation((key: string) => {
          if (key === 'AUTOMEM_API_URL') return 'http://localhost:8001';
          if (key === 'AUTOMEM_API_TOKEN') return 'valid-token';
          return undefined;
        });

        mockFetch.mockResolvedValue({ ok: true, status: 200 });

        const result = await checkExternal();

        const autoMemCheck = result.checks.find((c) => c.name === 'AutoMem');
        expect(autoMemCheck?.status).toBe('pass');
        expect(autoMemCheck?.message).toBe('Connected');
      });

      it('should warn on auth failure', async () => {
        mockGetEnvValue.mockImplementation((key: string) => {
          if (key === 'AUTOMEM_API_URL') return 'http://localhost:8001';
          if (key === 'AUTOMEM_API_TOKEN') return 'invalid-token';
          return undefined;
        });

        mockFetch.mockResolvedValue({ ok: false, status: 401 });

        const result = await checkExternal();

        const autoMemCheck = result.checks.find((c) => c.name === 'AutoMem');
        expect(autoMemCheck?.status).toBe('warn');
        expect(autoMemCheck?.message).toBe('Auth failed');
      });
    });

    describe('WhatsApp Session', () => {
      it('should skip when Gateway is offline', async () => {
        mockGetEnvValue.mockReturnValue(undefined);
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await checkExternal();

        const whatsAppCheck = result.checks.find((c) => c.name === 'WhatsApp Session');
        expect(whatsAppCheck?.status).toBe('skip');
        expect(whatsAppCheck?.message).toBe('Gateway offline');
      });

      it('should pass when WhatsApp is authenticated', async () => {
        mockGetEnvValue.mockReturnValue(undefined);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            whatsapp: { authenticated: true, ready: true },
          }),
        });

        const result = await checkExternal();

        const whatsAppCheck = result.checks.find((c) => c.name === 'WhatsApp Session');
        expect(whatsAppCheck?.status).toBe('pass');
        expect(whatsAppCheck?.message).toBe('Connected');
      });

      it('should warn when WhatsApp needs QR scan', async () => {
        mockGetEnvValue.mockReturnValue(undefined);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            whatsapp: { authenticated: false, ready: false },
          }),
        });

        const result = await checkExternal();

        const whatsAppCheck = result.checks.find((c) => c.name === 'WhatsApp Session');
        expect(whatsAppCheck?.status).toBe('warn');
        expect(whatsAppCheck?.message).toBe('Disconnected');
        expect(whatsAppCheck?.fix).toContain('QR code');
      });
    });

    describe('Telegram', () => {
      it('should skip when Telegram is disabled', async () => {
        mockGetEnvValue.mockReturnValue(undefined);

        const result = await checkExternal();

        const telegramCheck = result.checks.find((c) => c.name === 'Telegram');
        expect(telegramCheck?.status).toBe('skip');
        expect(telegramCheck?.message).toBe('Disabled');
      });

      it('should warn when bot token is missing', async () => {
        mockGetEnvValue.mockImplementation((key: string) => {
          if (key === 'TELEGRAM_ENABLED') return 'true';
          return undefined;
        });

        const result = await checkExternal();

        const telegramCheck = result.checks.find((c) => c.name === 'Telegram');
        expect(telegramCheck?.status).toBe('warn');
        expect(telegramCheck?.message).toBe('Missing token');
      });

      it('should pass when Telegram bot is valid', async () => {
        mockGetEnvValue.mockImplementation((key: string) => {
          if (key === 'TELEGRAM_ENABLED') return 'true';
          if (key === 'TELEGRAM_BOT_TOKEN') return '123456:ABC-DEF';
          return undefined;
        });

        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            result: { username: 'test_bot' },
          }),
        });

        const result = await checkExternal();

        const telegramCheck = result.checks.find((c) => c.name === 'Telegram');
        expect(telegramCheck?.status).toBe('pass');
        expect(telegramCheck?.message).toBe('Connected');
        expect(telegramCheck?.detail).toBe('@test_bot');
      });

      it('should fail on invalid bot token', async () => {
        mockGetEnvValue.mockImplementation((key: string) => {
          if (key === 'TELEGRAM_ENABLED') return 'true';
          if (key === 'TELEGRAM_BOT_TOKEN') return 'invalid';
          return undefined;
        });

        mockFetch.mockResolvedValue({ ok: false, status: 401 });

        const result = await checkExternal();

        const telegramCheck = result.checks.find((c) => c.name === 'Telegram');
        expect(telegramCheck?.status).toBe('fail');
        expect(telegramCheck?.message).toBe('Invalid token');
      });
    });
  });
});
