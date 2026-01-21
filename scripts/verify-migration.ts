#!/usr/bin/env npx tsx
/**
 * Verification Script: Verify FalkorDB to AutoMem Migration
 * Compares entity counts between old FalkorDB and AutoMem
 *
 * Usage:
 *   npx tsx scripts/verify-migration.ts
 *
 * Environment variables required:
 *   FALKORDB_HOST, FALKORDB_PORT, FALKORDB_PASSWORD (old FalkorDB)
 *   AUTOMEM_API_URL, AUTOMEM_API_TOKEN (AutoMem)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { Redis } from 'ioredis';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

// Configuration
const FALKORDB_HOST = process.env['FALKORDB_HOST'] || 'localhost';
const FALKORDB_PORT = parseInt(process.env['FALKORDB_PORT'] || '6379', 10);
const FALKORDB_PASSWORD = process.env['FALKORDB_PASSWORD'];
const GRAPH_NAME = 'knowledge_graph';

const AUTOMEM_API_URL = process.env['AUTOMEM_API_URL'] || 'http://localhost:8001';
const AUTOMEM_API_TOKEN = process.env['AUTOMEM_API_TOKEN'];

// FalkorDB Client
let falkorClient: Redis;

async function initFalkorDB(): Promise<void> {
  falkorClient = new Redis({
    host: FALKORDB_HOST,
    port: FALKORDB_PORT,
    ...(FALKORDB_PASSWORD && { password: FALKORDB_PASSWORD }),
    maxRetriesPerRequest: 3,
  });

  await falkorClient.ping();
  console.log(`[Verify] Connected to FalkorDB at ${FALKORDB_HOST}:${FALKORDB_PORT}`);
}

async function closeFalkorDB(): Promise<void> {
  await falkorClient.quit();
}

async function queryFalkorDB(cypherQuery: string): Promise<unknown[]> {
  const result = await falkorClient.call('GRAPH.QUERY', GRAPH_NAME, cypherQuery);
  return parseGraphResult(result);
}

function parseGraphResult(result: unknown): unknown[] {
  if (!result || !Array.isArray(result) || result.length === 0) {
    return [];
  }

  const [header, data] = result;
  if (!data || !Array.isArray(data) || data.length === 0) {
    return [];
  }

  return data.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    (header as string[]).forEach((colName: string, index: number) => {
      obj[colName] = row[index];
    });
    return obj;
  });
}

// AutoMem API helpers
async function recallFromAutoMem(tags: string[], limit: number = 100): Promise<{ count: number; results: unknown[] }> {
  const params = new URLSearchParams();
  for (const tag of tags) {
    params.append('tags', tag);
  }
  params.append('tag_match', 'prefix');
  params.append('limit', limit.toString());

  const response = await fetch(`${AUTOMEM_API_URL}/recall?${params.toString()}`, {
    headers: AUTOMEM_API_TOKEN ? { Authorization: `Bearer ${AUTOMEM_API_TOKEN}` } : {},
  });

  if (!response.ok) {
    throw new Error(`AutoMem recall failed: ${response.status}`);
  }

  const data = await response.json() as { count: number; results: unknown[] };
  return data;
}

interface VerificationResult {
  entity: string;
  falkorCount: number;
  automemCount: number;
  match: boolean;
}

async function verifyContacts(): Promise<VerificationResult> {
  // Count in FalkorDB
  const falkorResult = await queryFalkorDB('MATCH (c:Contact) RETURN count(c) AS count') as { count: number }[];
  const falkorCount = falkorResult[0]?.count ?? 0;

  // Count in AutoMem
  const automemResult = await recallFromAutoMem(['entity:contact']);
  const automemCount = automemResult.count;

  return {
    entity: 'Contacts',
    falkorCount,
    automemCount,
    match: falkorCount === automemCount,
  };
}

async function verifyPersons(): Promise<VerificationResult> {
  // Count unique person relationships in FalkorDB
  const falkorResult = await queryFalkorDB(
    'MATCH (c:Contact)-[:KNOWS]->(p:Person) RETURN count(DISTINCT p.name + c.id) AS count'
  ) as { count: number }[];
  const falkorCount = falkorResult[0]?.count ?? 0;

  // Count in AutoMem
  const automemResult = await recallFromAutoMem(['entity:person']);
  const automemCount = automemResult.count;

  return {
    entity: 'Persons',
    falkorCount,
    automemCount,
    match: falkorCount === automemCount,
  };
}

async function verifyTopics(): Promise<VerificationResult> {
  // Count unique topic relationships in FalkorDB
  const falkorResult = await queryFalkorDB(
    'MATCH (c:Contact)-[:MENTIONED]->(t:Topic) RETURN count(DISTINCT t.name + c.id) AS count'
  ) as { count: number }[];
  const falkorCount = falkorResult[0]?.count ?? 0;

  // Count in AutoMem
  const automemResult = await recallFromAutoMem(['entity:topic']);
  const automemCount = automemResult.count;

  return {
    entity: 'Topics',
    falkorCount,
    automemCount,
    match: falkorCount === automemCount,
  };
}

async function verifyEvents(): Promise<VerificationResult> {
  // Count unique event relationships in FalkorDB
  const falkorResult = await queryFalkorDB(
    'MATCH (c:Contact)-[:ATTENDING|:MENTIONED]->(e:Event) RETURN count(DISTINCT e.name + c.id) AS count'
  ) as { count: number }[];
  const falkorCount = falkorResult[0]?.count ?? 0;

  // Count in AutoMem
  const automemResult = await recallFromAutoMem(['entity:event']);
  const automemCount = automemResult.count;

  return {
    entity: 'Events',
    falkorCount,
    automemCount,
    match: falkorCount === automemCount,
  };
}

async function verifyPersonas(): Promise<VerificationResult> {
  // Count in FalkorDB
  const falkorResult = await queryFalkorDB('MATCH (p:Persona) RETURN count(p) AS count') as { count: number }[];
  const falkorCount = falkorResult[0]?.count ?? 0;

  // Count in AutoMem
  const automemResult = await recallFromAutoMem(['persona:']);
  const automemCount = automemResult.count;

  return {
    entity: 'Personas',
    falkorCount,
    automemCount,
    match: falkorCount === automemCount,
  };
}

async function verifyStyleProfiles(): Promise<VerificationResult> {
  // Count contacts with style data in FalkorDB
  const falkorResult = await queryFalkorDB(
    'MATCH (c:Contact) WHERE c.styleSampleCount IS NOT NULL AND c.styleSampleCount >= 10 RETURN count(c) AS count'
  ) as { count: number }[];
  const falkorCount = falkorResult[0]?.count ?? 0;

  // Count in AutoMem
  const automemResult = await recallFromAutoMem(['style:communication']);
  const automemCount = automemResult.count;

  return {
    entity: 'Style Profiles',
    falkorCount,
    automemCount,
    match: falkorCount === automemCount,
  };
}

async function testRecall(): Promise<void> {
  console.log('\n[Verify] Testing AutoMem recall functionality...');

  // Test persona recall
  const personaResult = await recallFromAutoMem(['persona:'], 5);
  if (personaResult.count > 0) {
    console.log(`  ✓ Persona recall works (found ${personaResult.count} personas)`);
  } else {
    console.log('  ⚠ No personas found in AutoMem');
  }

  // Test contact recall
  const contactResult = await recallFromAutoMem(['entity:contact'], 5);
  if (contactResult.count > 0) {
    console.log(`  ✓ Contact recall works (found ${contactResult.count} contacts)`);
  } else {
    console.log('  ⚠ No contacts found in AutoMem');
  }
}

async function checkAutoMemHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${AUTOMEM_API_URL}/health`, {
      headers: AUTOMEM_API_TOKEN ? { Authorization: `Bearer ${AUTOMEM_API_TOKEN}` } : {},
    });

    if (!response.ok) {
      console.error(`[Verify] AutoMem health check failed: ${response.status}`);
      return false;
    }

    const data = await response.json() as { status: string };
    console.log(`[Verify] AutoMem status: ${data.status}`);
    return data.status === 'healthy';
  } catch (error) {
    console.error(`[Verify] AutoMem not reachable: ${error}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('SecondMe: Migration Verification');
  console.log('='.repeat(60));

  // Check AutoMem health
  console.log('\n[Verify] Checking AutoMem health...');
  const healthy = await checkAutoMemHealth();
  if (!healthy) {
    console.error('[Verify] AutoMem is not healthy. Aborting.');
    process.exit(1);
  }

  // Connect to FalkorDB
  console.log('\n[Verify] Connecting to FalkorDB...');
  try {
    await initFalkorDB();
  } catch (error) {
    console.log(`[Verify] Could not connect to FalkorDB: ${error}`);
    console.log('[Verify] Skipping FalkorDB comparison, testing AutoMem only...\n');

    await testRecall();

    console.log('\n[Verify] Verification complete (AutoMem only).');
    return;
  }

  try {
    // Run verifications
    console.log('\n[Verify] Comparing entity counts...\n');

    const results: VerificationResult[] = await Promise.all([
      verifyContacts(),
      verifyPersons(),
      verifyTopics(),
      verifyEvents(),
      verifyPersonas(),
      verifyStyleProfiles(),
    ]);

    // Print results table
    console.log('Entity           | FalkorDB | AutoMem  | Status');
    console.log('-'.repeat(55));

    let allMatch = true;
    for (const result of results) {
      const status = result.match ? '✓ Match' : '✗ Mismatch';
      if (!result.match) allMatch = false;

      console.log(
        `${result.entity.padEnd(16)} | ${String(result.falkorCount).padStart(8)} | ${String(result.automemCount).padStart(8)} | ${status}`
      );
    }

    // Test recall
    await testRecall();

    // Summary
    console.log('\n' + '='.repeat(60));
    if (allMatch) {
      console.log('✓ All entity counts match! Migration verified successfully.');
    } else {
      console.log('⚠ Some entity counts do not match. Please review.');
      console.log('  Note: Small differences may occur due to deduplication or filtering.');
    }
  } finally {
    await closeFalkorDB();
  }
}

main().catch((error) => {
  console.error('[Verify] Fatal error:', error);
  process.exit(1);
});
