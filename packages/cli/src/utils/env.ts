import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as dotenvConfig } from 'dotenv';

export interface EnvConfig {
  [key: string]: string | undefined;
}

const PROJECT_ROOT = process.cwd();
const ENV_PATH = resolve(PROJECT_ROOT, '.env');
const ENV_EXAMPLE_PATH = resolve(PROJECT_ROOT, '.env.example');

export function loadEnv(): EnvConfig {
  dotenvConfig({ path: ENV_PATH });
  return process.env as EnvConfig;
}

export function envFileExists(): boolean {
  return existsSync(ENV_PATH);
}

export function envExampleExists(): boolean {
  return existsSync(ENV_EXAMPLE_PATH);
}

export function copyEnvExample(): boolean {
  if (!envExampleExists()) {
    return false;
  }

  copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  return true;
}

export function readEnvFile(): Map<string, string> {
  const entries = new Map<string, string>();

  if (!envFileExists()) {
    return entries;
  }

  const content = readFileSync(ENV_PATH, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    entries.set(key, value);
  }

  return entries;
}

export function writeEnvFile(entries: Map<string, string>): void {
  // Read existing file to preserve comments and structure
  let content = '';

  if (envFileExists()) {
    const existingContent = readFileSync(ENV_PATH, 'utf-8');
    const lines = existingContent.split('\n');
    const processedKeys = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();

      // Preserve empty lines and comments
      if (trimmed === '' || trimmed.startsWith('#')) {
        content += line + '\n';
        continue;
      }

      // Check if this is a key=value line
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        content += line + '\n';
        continue;
      }

      const key = trimmed.slice(0, eqIndex);
      processedKeys.add(key);

      // Use new value if provided, otherwise keep existing
      if (entries.has(key)) {
        content += `${key}=${entries.get(key)}\n`;
      } else {
        content += line + '\n';
      }
    }

    // Add any new keys that weren't in the original file
    for (const [key, value] of entries) {
      if (!processedKeys.has(key)) {
        content += `${key}=${value}\n`;
      }
    }
  } else {
    // No existing file, create from scratch
    for (const [key, value] of entries) {
      content += `${key}=${value}\n`;
    }
  }

  writeFileSync(ENV_PATH, content);
}

export function updateEnvValue(key: string, value: string): void {
  const entries = readEnvFile();
  entries.set(key, value);
  writeEnvFile(entries);
}

export function getEnvValue(key: string): string | undefined {
  const entries = readEnvFile();
  return entries.get(key) ?? process.env[key];
}

export function validateAnthropicApiKey(key: string): boolean {
  // Anthropic API keys start with 'sk-ant-api03-' or similar patterns
  return key.startsWith('sk-ant-');
}

export function validateOpenAIApiKey(key: string): boolean {
  // OpenAI API keys start with 'sk-'
  return key.startsWith('sk-') && !key.startsWith('sk-ant-');
}

export function generateRandomToken(length: number = 32): string {
  const chars = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < length * 2; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function maskSecret(value: string, visibleChars: number = 8): string {
  if (value.length <= visibleChars) {
    return '*'.repeat(value.length);
  }
  return value.slice(0, visibleChars) + '...';
}
