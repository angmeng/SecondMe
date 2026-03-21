/**
 * Skill Security Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RestrictedRedis, createRestrictedRedis } from '../security.js';
import type { SkillManifest } from '@secondme/shared-types';
import type { Redis } from 'ioredis';
import type { SkillLogger } from '../types.js';

describe('RestrictedRedis', () => {
  let mockRedis: Partial<Redis>;
  let mockLogger: SkillLogger;
  let restrictedRedis: RestrictedRedis;

  const manifest: SkillManifest = {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    description: 'Test',
    author: 'Test',
    permissions: ['redis:read', 'redis:write'],
    configFields: [],
  };

  beforeEach(() => {
    mockRedis = {
      get: vi.fn().mockResolvedValue('value'),
      set: vi.fn().mockResolvedValue('OK'),
      setex: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      exists: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(100),
      expire: vi.fn().mockResolvedValue(1),
      hget: vi.fn().mockResolvedValue('hash-value'),
      hset: vi.fn().mockResolvedValue(1),
      hgetall: vi.fn().mockResolvedValue({ field: 'value' }),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    restrictedRedis = createRestrictedRedis(
      mockRedis as Redis,
      manifest,
      mockLogger
    );
  });

  describe('getNamespace', () => {
    it('should return the skill namespace', () => {
      expect(restrictedRedis.getNamespace()).toBe('EXT_SKILL:test-skill:');
    });
  });

  describe('read operations', () => {
    it('should allow reading from whitelisted CACHE: keys', async () => {
      const value = await restrictedRedis.get('CACHE:some-key');
      expect(mockRedis.get).toHaveBeenCalledWith('CACHE:some-key');
      expect(value).toBe('value');
    });

    it('should allow reading from whitelisted EXT_SKILL: keys', async () => {
      const value = await restrictedRedis.get('EXT_SKILL:other-skill:data');
      expect(mockRedis.get).toHaveBeenCalledWith('EXT_SKILL:other-skill:data');
      expect(value).toBe('value');
    });

    it('should allow reading from whitelisted EMB: keys', async () => {
      const value = await restrictedRedis.get('EMB:voyage:hash123');
      expect(mockRedis.get).toHaveBeenCalledWith('EMB:voyage:hash123');
      expect(value).toBe('value');
    });

    it('should block reading from protected PAUSE: keys', async () => {
      await expect(restrictedRedis.get('PAUSE:123')).rejects.toThrow('Access denied');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should block reading from protected RATE: keys', async () => {
      await expect(restrictedRedis.get('RATE:123')).rejects.toThrow('Access denied');
    });

    it('should block reading from protected QUEUE: keys', async () => {
      await expect(restrictedRedis.get('QUEUE:messages')).rejects.toThrow('Access denied');
    });

    it('should block reading from protected SKILLS: keys', async () => {
      await expect(restrictedRedis.get('SKILLS:enabled')).rejects.toThrow('Access denied');
    });

    it('should block reading from protected HISTORY: keys', async () => {
      await expect(restrictedRedis.get('HISTORY:contact123')).rejects.toThrow('Access denied');
    });

    it('should block reading from protected PERSONA: keys', async () => {
      await expect(restrictedRedis.get('PERSONA:default')).rejects.toThrow('Access denied');
    });

    it('should block reading from non-whitelisted arbitrary keys', async () => {
      await expect(restrictedRedis.get('RANDOM:unknown-key')).rejects.toThrow('Access denied');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('blocked from reading non-whitelisted key')
      );
    });
  });

  describe('write operations', () => {
    it('should allow writing to namespaced keys', async () => {
      const result = await restrictedRedis.set('EXT_SKILL:test-skill:my-data', 'value');
      expect(mockRedis.set).toHaveBeenCalledWith('EXT_SKILL:test-skill:my-data', 'value');
      expect(result).toBe('OK');
    });

    it('should block writing to non-namespaced keys', async () => {
      await expect(restrictedRedis.set('CACHE:some-key', 'value')).rejects.toThrow(
        'Access denied'
      );
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should block writing to protected keys', async () => {
      await expect(restrictedRedis.set('PAUSE:ALL', 'true')).rejects.toThrow('Access denied');
    });
  });

  describe('permission checks', () => {
    it('should reject read operations without redis:read permission', async () => {
      const noReadManifest: SkillManifest = {
        ...manifest,
        permissions: [], // No permissions
      };
      const restrictedNoRead = createRestrictedRedis(
        mockRedis as Redis,
        noReadManifest,
        mockLogger
      );

      await expect(restrictedNoRead.get('key')).rejects.toThrow('does not have redis:read');
    });

    it('should reject write operations without redis:write permission', async () => {
      const readOnlyManifest: SkillManifest = {
        ...manifest,
        permissions: ['redis:read'], // Only read
      };
      const restrictedReadOnly = createRestrictedRedis(
        mockRedis as Redis,
        readOnlyManifest,
        mockLogger
      );

      await expect(
        restrictedReadOnly.set('EXT_SKILL:test-skill:key', 'value')
      ).rejects.toThrow('does not have redis:write');
    });

    it('should allow reads with redis:write permission', async () => {
      const writeOnlyManifest: SkillManifest = {
        ...manifest,
        permissions: ['redis:write'], // Write implies read
      };
      const restrictedWriteOnly = createRestrictedRedis(
        mockRedis as Redis,
        writeOnlyManifest,
        mockLogger
      );

      // redis:write should allow reads
      const value = await restrictedWriteOnly.get('CACHE:key');
      expect(value).toBe('value');
    });
  });

  describe('setex', () => {
    it('should work with namespaced keys', async () => {
      await restrictedRedis.setex('EXT_SKILL:test-skill:temp', 60, 'value');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'EXT_SKILL:test-skill:temp',
        60,
        'value'
      );
    });
  });

  describe('del', () => {
    it('should work with namespaced keys', async () => {
      await restrictedRedis.del('EXT_SKILL:test-skill:key1', 'EXT_SKILL:test-skill:key2');
      expect(mockRedis.del).toHaveBeenCalledWith(
        'EXT_SKILL:test-skill:key1',
        'EXT_SKILL:test-skill:key2'
      );
    });

    it('should block deleting non-namespaced keys', async () => {
      await expect(
        restrictedRedis.del('EXT_SKILL:test-skill:ok', 'CACHE:not-ok')
      ).rejects.toThrow('Access denied');
    });
  });

  describe('hash operations', () => {
    it('should allow hget on unprotected keys', async () => {
      const value = await restrictedRedis.hget('CACHE:hash', 'field');
      expect(mockRedis.hget).toHaveBeenCalledWith('CACHE:hash', 'field');
      expect(value).toBe('hash-value');
    });

    it('should allow hset on namespaced keys', async () => {
      await restrictedRedis.hset('EXT_SKILL:test-skill:hash', 'field', 'value');
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'EXT_SKILL:test-skill:hash',
        'field',
        'value'
      );
    });

    it('should block hset on non-namespaced keys', async () => {
      await expect(restrictedRedis.hset('CACHE:hash', 'field', 'value')).rejects.toThrow(
        'Access denied'
      );
    });

    it('should allow hgetall on unprotected keys', async () => {
      const result = await restrictedRedis.hgetall('CACHE:hash');
      expect(result).toEqual({ field: 'value' });
    });
  });
});
