import type { CategoryResult, CheckResult } from '../utils/output.js';
import { getEnvValue, maskSecret, validateAnthropicApiKey, validateOpenAIApiKey } from '../utils/env.js';
import type { HealthCheckOptions } from './index.js';

interface ApiKeyConfig {
  name: string;
  envKey: string;
  required: boolean;
  validate?: (key: string) => boolean;
  prefix?: string;
  helpUrl?: string;
}

const API_KEYS: ApiKeyConfig[] = [
  {
    name: 'Anthropic API Key',
    envKey: 'ANTHROPIC_API_KEY',
    required: true,
    validate: validateAnthropicApiKey,
    prefix: 'sk-ant-',
    helpUrl: 'https://console.anthropic.com/',
  },
  {
    name: 'OpenAI API Key',
    envKey: 'OPENAI_API_KEY',
    required: false,
    validate: validateOpenAIApiKey,
    prefix: 'sk-',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'Voyage API Key',
    envKey: 'VOYAGE_API_KEY',
    required: false,
    helpUrl: 'https://www.voyageai.com/',
  },
  {
    name: 'ElevenLabs API Key',
    envKey: 'ELEVENLABS_API_KEY',
    required: false,
    helpUrl: 'https://elevenlabs.io/',
  },
  {
    name: 'AutoMem API Token',
    envKey: 'AUTOMEM_API_TOKEN',
    required: false,
  },
  {
    name: 'AutoMem Admin Token',
    envKey: 'AUTOMEM_ADMIN_TOKEN',
    required: false,
  },
];

function checkApiKey(config: ApiKeyConfig): CheckResult {
  const value = getEnvValue(config.envKey);

  // Check if key exists
  if (!value || value.trim() === '' || value.includes('...') || value.includes('your_')) {
    if (config.required) {
      return {
        name: config.name,
        status: 'fail',
        message: 'Not set',
        fix: config.helpUrl
          ? `Get your key from ${config.helpUrl}`
          : `Set ${config.envKey} in .env`,
      };
    }

    return {
      name: config.name,
      status: 'skip',
      message: 'Not configured',
      detail: 'Optional - set if needed',
    };
  }

  // Validate format if validator provided
  if (config.validate && !config.validate(value)) {
    return {
      name: config.name,
      status: config.required ? 'fail' : 'warn',
      message: 'Invalid format',
      detail: config.prefix ? `Expected to start with "${config.prefix}"` : 'Invalid key format',
      fix: config.helpUrl
        ? `Get a valid key from ${config.helpUrl}`
        : `Check ${config.envKey} in .env`,
    };
  }

  // Key is set and valid
  return {
    name: config.name,
    status: 'pass',
    message: `Set (${maskSecret(value)})`,
  };
}

export async function checkApiKeys(_options: HealthCheckOptions = {}): Promise<CategoryResult> {
  const checks = API_KEYS.map(checkApiKey);

  return {
    name: 'API Keys',
    checks,
  };
}

export function getMissingRequiredKeys(): string[] {
  return API_KEYS
    .filter((config) => {
      if (!config.required) return false;
      const value = getEnvValue(config.envKey);
      return !value || value.trim() === '' || value.includes('...');
    })
    .map((config) => config.envKey);
}

export function getOptionalKeysStatus(): Array<{
  name: string;
  envKey: string;
  isSet: boolean;
}> {
  return API_KEYS
    .filter((config) => !config.required)
    .map((config) => {
      const value = getEnvValue(config.envKey);
      return {
        name: config.name,
        envKey: config.envKey,
        isSet: Boolean(value && value.trim() !== '' && !value.includes('...')),
      };
    });
}
