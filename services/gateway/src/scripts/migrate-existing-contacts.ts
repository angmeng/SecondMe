/**
 * Migration Script: Approve Existing Contacts
 *
 * Migrates contacts with existing conversation history to approved status.
 * CRITICAL: Uses SCAN iterator (not KEYS) to prevent Redis blocking.
 *
 * Usage:
 *   npm run migrate:pairing              # Dry run (default)
 *   npm run migrate:pairing -- --execute # Execute migration
 *   npm run migrate:pairing -- --execute --verbose
 */

import 'dotenv/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Redis from 'ioredis';
import { type ApprovedContact } from '@secondme/shared-types';

// Redis client type - using generic interface for migration script
interface RedisInstance {
  ping(): Promise<string>;
  exists(key: string): Promise<number>;
  scanStream(options: { match: string; count: number }): AsyncIterable<string[]>;
  pipeline(): {
    set(key: string, value: string): unknown;
    exec(): Promise<unknown>;
  };
  quit(): Promise<string>;
}

interface MigrationOptions {
  dryRun: boolean;
  verbose: boolean;
  batchSize: number;
}

interface MigrationStats {
  processed: number;
  approved: number;
  skipped: number;
  errors: number;
  startTime: number;
}

/**
 * Redis configuration from environment
 */
function createRedisClient(): RedisInstance {
  const host = process.env['REDIS_HOST'] || 'localhost';
  const port = parseInt(process.env['REDIS_PORT'] || '6380', 10);
  const password = process.env['REDIS_PASSWORD'];

  // Cast to RedisInstance since ioredis types are complex
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (Redis as any)({
    host,
    port,
    password: password || undefined,
    retryStrategy: (times: number) => {
      if (times > 3) {
        console.error('[Migration] Failed to connect to Redis after 3 attempts');
        process.exit(1);
      }
      return Math.min(times * 100, 3000);
    },
  }) as RedisInstance;
}

/**
 * Check if contact is already approved
 */
async function isAlreadyApproved(redis: RedisInstance, contactId: string): Promise<boolean> {
  const key = `PAIRING:approved:${contactId}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

/**
 * Extract phone number from contactId
 */
function extractPhoneNumber(contactId: string): string {
  return contactId.replace('@c.us', '').replace('@s.whatsapp.net', '');
}

/**
 * Process a batch of contacts for approval
 */
async function processBatch(
  redis: RedisInstance,
  contactIds: string[],
  options: MigrationOptions
): Promise<number> {
  if (options.dryRun) {
    if (options.verbose) {
      console.log(`[Migration] Would approve ${contactIds.length} contacts`);
      for (const id of contactIds) {
        console.log(`  - ${id}`);
      }
    }
    return contactIds.length;
  }

  // Use pipeline for efficient batch Redis writes
  const pipeline = redis.pipeline();
  const now = Date.now();

  for (const contactId of contactIds) {
    const approved: ApprovedContact = {
      contactId,
      phoneNumber: extractPhoneNumber(contactId),
      approvedAt: now,
      approvedBy: 'migration',
      tier: 'standard',
    };
    pipeline.set(`PAIRING:approved:${contactId}`, JSON.stringify(approved));
  }

  await pipeline.exec();

  if (options.verbose) {
    console.log(`[Migration] Approved ${contactIds.length} contacts`);
  }

  return contactIds.length;
}

/**
 * Main migration function
 * Uses SCAN iterator for non-blocking Redis iteration
 */
async function migrateExistingContacts(options: MigrationOptions): Promise<MigrationStats> {
  const redis = createRedisClient();
  const stats: MigrationStats = {
    processed: 0,
    approved: 0,
    skipped: 0,
    errors: 0,
    startTime: Date.now(),
  };

  console.log('[Migration] Starting migration...');
  console.log(`[Migration] Mode: ${options.dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`[Migration] Batch size: ${options.batchSize}`);
  console.log('');

  try {
    // Test Redis connection
    await redis.ping();
    console.log('[Migration] Redis connection established');
    console.log('');

    // Use scanStream for non-blocking iteration
    const stream = redis.scanStream({
      match: 'HISTORY:*',
      count: options.batchSize,
    });

    const batch: string[] = [];

    for await (const keys of stream) {
      for (const key of keys as string[]) {
        // Extract contactId from HISTORY:{contactId}
        const contactId = key.replace('HISTORY:', '');

        // Skip non-individual contacts (groups)
        if (contactId.endsWith('@g.us')) {
          if (options.verbose) {
            console.log(`[Migration] Skipping group: ${contactId}`);
          }
          stats.skipped++;
          stats.processed++;
          continue;
        }

        // Skip if already approved
        const alreadyApproved = await isAlreadyApproved(redis, contactId);
        if (alreadyApproved) {
          if (options.verbose) {
            console.log(`[Migration] Skipping (already approved): ${contactId}`);
          }
          stats.skipped++;
          stats.processed++;
          continue;
        }

        batch.push(contactId);

        // Process batch when full
        if (batch.length >= options.batchSize) {
          const approved = await processBatch(redis, batch, options);
          stats.approved += approved;
          batch.length = 0;
        }

        stats.processed++;

        // Progress logging every 100 contacts
        if (stats.processed % 100 === 0) {
          const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
          console.log(
            `[Migration] Progress: ${stats.processed} processed, ${stats.approved} approved, ${stats.skipped} skipped (${elapsed}s)`
          );
        }
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      const approved = await processBatch(redis, batch, options);
      stats.approved += approved;
    }
  } catch (error) {
    console.error('[Migration] Error during migration:', error);
    stats.errors++;
  } finally {
    await redis.quit();
  }

  return stats;
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);

  return {
    dryRun: !args.includes('--execute'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    batchSize: 100,
  };
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Pairing Migration Script
========================

Migrates existing contacts (those with conversation history) to approved status.
This is useful when enabling pairing mode on an existing deployment.

Usage:
  npm run migrate:pairing [options]

Options:
  --execute    Actually perform the migration (default is dry run)
  --verbose    Show detailed progress for each contact

Examples:
  npm run migrate:pairing              # Preview what would be migrated
  npm run migrate:pairing -- --execute # Run the migration
  npm run migrate:pairing -- --execute --verbose
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const options = parseArgs();

  console.log('');
  console.log('===============================================================');
  console.log('  SecondMe Pairing Migration');
  console.log('===============================================================');
  console.log('');

  if (options.dryRun) {
    console.log('  DRY RUN MODE - No changes will be made');
    console.log('    Use --execute flag to perform actual migration');
    console.log('');
  }

  const stats = await migrateExistingContacts(options);

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  console.log('');
  console.log('===============================================================');
  console.log('  Migration Summary');
  console.log('===============================================================');
  console.log(`  Total processed:  ${stats.processed}`);
  console.log(`  Approved:         ${stats.approved}`);
  console.log(`  Skipped:          ${stats.skipped}`);
  console.log(`  Errors:           ${stats.errors}`);
  console.log(`  Duration:         ${elapsed}s`);
  console.log('===============================================================');
  console.log('');

  if (options.dryRun && stats.approved > 0) {
    console.log('  To apply these changes, run:');
    console.log('    npm run migrate:pairing -- --execute');
    console.log('');
  }

  process.exit(stats.errors > 0 ? 1 : 0);
}

main();
