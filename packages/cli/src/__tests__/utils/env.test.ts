import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import {
  validateAnthropicApiKey,
  validateOpenAIApiKey,
  generateRandomToken,
  maskSecret,
} from '../../utils/env.js';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

describe('env utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateAnthropicApiKey', () => {
    it('should return true for valid Anthropic API keys', () => {
      expect(validateAnthropicApiKey('sk-ant-api03-abcdef123456')).toBe(true);
      expect(validateAnthropicApiKey('sk-ant-test-key')).toBe(true);
    });

    it('should return false for invalid keys', () => {
      expect(validateAnthropicApiKey('sk-proj-abc')).toBe(false);
      expect(validateAnthropicApiKey('invalid-key')).toBe(false);
      expect(validateAnthropicApiKey('')).toBe(false);
    });
  });

  describe('validateOpenAIApiKey', () => {
    it('should return true for valid OpenAI API keys', () => {
      expect(validateOpenAIApiKey('sk-proj-abcdef123456')).toBe(true);
      expect(validateOpenAIApiKey('sk-abc123')).toBe(true);
    });

    it('should return false for Anthropic keys', () => {
      expect(validateOpenAIApiKey('sk-ant-api03-abc')).toBe(false);
    });

    it('should return false for invalid keys', () => {
      expect(validateOpenAIApiKey('invalid-key')).toBe(false);
      expect(validateOpenAIApiKey('')).toBe(false);
    });
  });

  describe('generateRandomToken', () => {
    it('should generate a token of correct length', () => {
      const token = generateRandomToken(32);
      expect(token).toHaveLength(64); // 32 * 2 hex chars
    });

    it('should generate different tokens each time', () => {
      const token1 = generateRandomToken();
      const token2 = generateRandomToken();
      expect(token1).not.toBe(token2);
    });

    it('should only contain hex characters', () => {
      const token = generateRandomToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('maskSecret', () => {
    it('should mask secrets showing only first few characters', () => {
      expect(maskSecret('sk-ant-api03-verylongkey', 8)).toBe('sk-ant-a...');
    });

    it('should handle short secrets', () => {
      expect(maskSecret('short', 8)).toBe('*****');
    });

    it('should use default visible chars', () => {
      expect(maskSecret('sk-ant-api03-key')).toBe('sk-ant-a...');
    });
  });
});
