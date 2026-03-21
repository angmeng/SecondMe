import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkApiKeys, getMissingRequiredKeys, getOptionalKeysStatus } from '../../checks/api-keys.js';

// Mock the env module
vi.mock('../../utils/env.js', () => ({
  getEnvValue: vi.fn(),
  maskSecret: vi.fn((value: string) => value.slice(0, 8) + '...'),
  validateAnthropicApiKey: vi.fn((key: string) => key.startsWith('sk-ant-')),
  validateOpenAIApiKey: vi.fn((key: string) => key.startsWith('sk-') && !key.startsWith('sk-ant-')),
}));

import { getEnvValue } from '../../utils/env.js';

const mockGetEnvValue = vi.mocked(getEnvValue);

describe('api-keys checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkApiKeys', () => {
    it('should fail when required Anthropic key is missing', async () => {
      mockGetEnvValue.mockReturnValue(undefined);

      const result = await checkApiKeys();

      const anthropicCheck = result.checks.find((c) => c.name === 'Anthropic API Key');
      expect(anthropicCheck?.status).toBe('fail');
      expect(anthropicCheck?.message).toBe('Not set');
    });

    it('should pass when Anthropic key is valid', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-api03-validkey';
        return undefined;
      });

      const result = await checkApiKeys();

      const anthropicCheck = result.checks.find((c) => c.name === 'Anthropic API Key');
      expect(anthropicCheck?.status).toBe('pass');
    });

    it('should fail when Anthropic key has invalid format', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'invalid-key';
        return undefined;
      });

      const result = await checkApiKeys();

      const anthropicCheck = result.checks.find((c) => c.name === 'Anthropic API Key');
      expect(anthropicCheck?.status).toBe('fail');
      expect(anthropicCheck?.message).toBe('Invalid format');
    });

    it('should skip optional keys when not configured', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-api03-validkey';
        return undefined;
      });

      const result = await checkApiKeys();

      const openaiCheck = result.checks.find((c) => c.name === 'OpenAI API Key');
      expect(openaiCheck?.status).toBe('skip');
    });

    it('should pass optional keys when valid', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-api03-validkey';
        if (key === 'OPENAI_API_KEY') return 'sk-proj-validkey';
        return undefined;
      });

      const result = await checkApiKeys();

      const openaiCheck = result.checks.find((c) => c.name === 'OpenAI API Key');
      expect(openaiCheck?.status).toBe('pass');
    });

    it('should detect placeholder values as not set', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-api03-...';
        return undefined;
      });

      const result = await checkApiKeys();

      const anthropicCheck = result.checks.find((c) => c.name === 'Anthropic API Key');
      expect(anthropicCheck?.status).toBe('fail');
    });

    it('should detect "your_" placeholder as not set', async () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'your_anthropic_key_here';
        return undefined;
      });

      const result = await checkApiKeys();

      const anthropicCheck = result.checks.find((c) => c.name === 'Anthropic API Key');
      expect(anthropicCheck?.status).toBe('fail');
    });
  });

  describe('getMissingRequiredKeys', () => {
    it('should return missing required keys', () => {
      mockGetEnvValue.mockReturnValue(undefined);

      const missing = getMissingRequiredKeys();

      expect(missing).toContain('ANTHROPIC_API_KEY');
    });

    it('should not return keys that are set', () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'ANTHROPIC_API_KEY') return 'sk-ant-api03-validkey';
        return undefined;
      });

      const missing = getMissingRequiredKeys();

      expect(missing).not.toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('getOptionalKeysStatus', () => {
    it('should return status of all optional keys', () => {
      mockGetEnvValue.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'sk-proj-key';
        return undefined;
      });

      const statuses = getOptionalKeysStatus();

      const openaiStatus = statuses.find((s) => s.envKey === 'OPENAI_API_KEY');
      expect(openaiStatus?.isSet).toBe(true);

      const voyageStatus = statuses.find((s) => s.envKey === 'VOYAGE_API_KEY');
      expect(voyageStatus?.isSet).toBe(false);
    });
  });
});
