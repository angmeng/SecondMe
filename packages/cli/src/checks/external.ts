import type { CategoryResult, CheckResult } from '../utils/output.js';
import { getEnvValue } from '../utils/env.js';
import type { HealthCheckOptions } from './index.js';

async function checkAutoMem(): Promise<CheckResult> {
  const apiUrl = getEnvValue('AUTOMEM_API_URL');
  const apiToken = getEnvValue('AUTOMEM_API_TOKEN');

  if (!apiUrl) {
    return {
      name: 'AutoMem',
      status: 'skip',
      message: 'Not configured',
      detail: 'AUTOMEM_API_URL not set',
    };
  }

  if (!apiToken) {
    return {
      name: 'AutoMem',
      status: 'warn',
      message: 'Missing token',
      detail: 'AUTOMEM_API_TOKEN not set',
      fix: 'Set AUTOMEM_API_TOKEN in .env',
    };
  }

  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return {
        name: 'AutoMem',
        status: 'pass',
        message: 'Connected',
        detail: apiUrl,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        name: 'AutoMem',
        status: 'warn',
        message: 'Auth failed',
        detail: `HTTP ${response.status} - Invalid token`,
        fix: 'Check AUTOMEM_API_TOKEN in .env',
      };
    }

    return {
      name: 'AutoMem',
      status: 'warn',
      message: 'Unhealthy',
      detail: `HTTP ${response.status}`,
      fix: 'Check AutoMem service logs',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('ECONNREFUSED')) {
      return {
        name: 'AutoMem',
        status: 'warn',
        message: 'Unreachable',
        detail: `${apiUrl} - Connection refused`,
        fix: "Run 'docker compose up -d automem' or check AUTOMEM_API_URL",
      };
    }

    return {
      name: 'AutoMem',
      status: 'warn',
      message: 'Error',
      detail: message,
    };
  }
}

async function checkWhatsAppSession(): Promise<CheckResult> {
  const gatewayPort = parseInt(getEnvValue('GATEWAY_PORT') ?? '3001', 10);

  try {
    const response = await fetch(`http://localhost:${gatewayPort}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        name: 'WhatsApp Session',
        status: 'warn',
        message: 'Gateway unreachable',
        detail: 'Cannot check WhatsApp status',
        fix: 'Start the Gateway service first',
      };
    }

    const data = await response.json() as { whatsapp?: { authenticated?: boolean; ready?: boolean } };

    if (data.whatsapp?.authenticated && data.whatsapp?.ready) {
      return {
        name: 'WhatsApp Session',
        status: 'pass',
        message: 'Connected',
      };
    }

    if (data.whatsapp?.authenticated) {
      return {
        name: 'WhatsApp Session',
        status: 'warn',
        message: 'Authenticating',
        detail: 'Session authenticated but not ready',
      };
    }

    return {
      name: 'WhatsApp Session',
      status: 'warn',
      message: 'Disconnected',
      detail: 'QR code scan required',
      fix: 'Scan QR code in the dashboard at http://localhost:3000',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('ECONNREFUSED')) {
      return {
        name: 'WhatsApp Session',
        status: 'skip',
        message: 'Gateway offline',
        detail: 'Start Gateway to check WhatsApp status',
      };
    }

    return {
      name: 'WhatsApp Session',
      status: 'warn',
      message: 'Unknown',
      detail: message,
    };
  }
}

async function checkTelegram(): Promise<CheckResult> {
  const enabled = getEnvValue('TELEGRAM_ENABLED');
  const botToken = getEnvValue('TELEGRAM_BOT_TOKEN');

  if (enabled !== 'true') {
    return {
      name: 'Telegram',
      status: 'skip',
      message: 'Disabled',
      detail: 'Set TELEGRAM_ENABLED=true to enable',
    };
  }

  if (!botToken) {
    return {
      name: 'Telegram',
      status: 'warn',
      message: 'Missing token',
      detail: 'TELEGRAM_BOT_TOKEN not set',
      fix: 'Get a bot token from @BotFather on Telegram',
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      const data = await response.json() as { result?: { username?: string } };
      return {
        name: 'Telegram',
        status: 'pass',
        message: 'Connected',
        detail: data.result?.username ? `@${data.result.username}` : undefined,
      };
    }

    if (response.status === 401) {
      return {
        name: 'Telegram',
        status: 'fail',
        message: 'Invalid token',
        detail: 'Bot token is invalid',
        fix: 'Check TELEGRAM_BOT_TOKEN in .env',
      };
    }

    return {
      name: 'Telegram',
      status: 'warn',
      message: 'API error',
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'Telegram',
      status: 'warn',
      message: 'Error',
      detail: message,
    };
  }
}

export async function checkExternal(_options: HealthCheckOptions = {}): Promise<CategoryResult> {
  const checks = await Promise.all([
    checkAutoMem(),
    checkWhatsAppSession(),
    checkTelegram(),
  ]);

  return {
    name: 'External',
    checks,
  };
}

export async function getConnectionsStatus(): Promise<Array<{
  name: string;
  connected: boolean;
}>> {
  const [autoMem, whatsApp] = await Promise.all([
    checkAutoMem(),
    checkWhatsAppSession(),
  ]);

  return [
    { name: 'Redis', connected: true }, // Will be updated by infrastructure check
    { name: 'WhatsApp', connected: whatsApp.status === 'pass' },
    { name: 'AutoMem', connected: autoMem.status === 'pass' },
  ];
}
