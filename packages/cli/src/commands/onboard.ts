import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import qrcode from 'qrcode-terminal';
import {
  loadEnv,
  envFileExists,
  copyEnvExample,
  readEnvFile,
  writeEnvFile,
  validateAnthropicApiKey,
  generateRandomToken,
} from '../utils/env.js';
import { getDockerStatus, startDockerCompose } from '../utils/docker.js';
import { checkPrerequisites } from '../checks/prerequisites.js';
import {
  printHeader,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printStep,
  createSpinner,
} from '../utils/output.js';

const TOTAL_STEPS = 9;

interface OnboardAnswers {
  anthropicKey: string;
  generateAutoMemTokens: boolean;
  autoMemApiToken?: string | undefined;
  autoMemAdminToken?: string | undefined;
  enableTelegram: boolean;
  telegramBotToken?: string | undefined;
  enableVoice: boolean;
  openaiKey?: string | undefined;
  elevenlabsKey?: string | undefined;
  enableVoyage: boolean;
  voyageKey?: string | undefined;
}

async function checkPrerequisitesStep(): Promise<boolean> {
  printStep(1, TOTAL_STEPS, 'Checking prerequisites...');

  const prereqs = await checkPrerequisites();
  const nodeCheck = prereqs.checks.find((c) => c.name === 'Node.js');
  const dockerCheck = prereqs.checks.find((c) => c.name === 'Docker');

  if (nodeCheck?.status !== 'pass') {
    printError(`Node.js ${nodeCheck?.message ?? 'not found'}`);
    printInfo(nodeCheck?.fix ?? 'Install Node.js 24+');
    return false;
  }

  if (dockerCheck?.status !== 'pass') {
    printError(`Docker ${dockerCheck?.message ?? 'not available'}`);
    printInfo(dockerCheck?.fix ?? 'Install and start Docker');
    return false;
  }

  printSuccess('Node.js and Docker are ready');
  return true;
}

async function setupEnvFileStep(): Promise<boolean> {
  printStep(2, TOTAL_STEPS, 'Setting up environment file...');

  if (envFileExists()) {
    printSuccess('.env file already exists');
    return true;
  }

  if (copyEnvExample()) {
    printSuccess('Created .env from .env.example');
    return true;
  }

  printError('Could not create .env file');
  printInfo('Please copy .env.example to .env manually');
  return false;
}

async function promptForConfiguration(): Promise<OnboardAnswers | null> {
  printStep(3, TOTAL_STEPS, 'Configuring API keys...');
  console.log();

  try {
    // Required: Anthropic API Key
    const anthropicAnswer = await inquirer.prompt<{ anthropicKey: string }>([
      {
        type: 'password',
        name: 'anthropicKey',
        message: 'Enter your Anthropic API Key (required):',
        mask: '*',
        validate: (input: string) => {
          if (!input || input.trim() === '') {
            return 'Anthropic API key is required';
          }
          if (!validateAnthropicApiKey(input)) {
            return 'Invalid format - key should start with "sk-ant-"';
          }
          return true;
        },
      },
    ]);

    // AutoMem tokens
    const autoMemAnswer = await inquirer.prompt<{ generateAutoMemTokens: boolean }>([
      {
        type: 'confirm',
        name: 'generateAutoMemTokens',
        message: 'Generate random AutoMem tokens? (recommended)',
        default: true,
      },
    ]);

    let autoMemApiToken: string | undefined;
    let autoMemAdminToken: string | undefined;

    if (!autoMemAnswer.generateAutoMemTokens) {
      const tokens = await inquirer.prompt<{ apiToken: string; adminToken: string }>([
        {
          type: 'password',
          name: 'apiToken',
          message: 'Enter AutoMem API Token:',
          mask: '*',
        },
        {
          type: 'password',
          name: 'adminToken',
          message: 'Enter AutoMem Admin Token:',
          mask: '*',
        },
      ]);
      autoMemApiToken = tokens.apiToken;
      autoMemAdminToken = tokens.adminToken;
    } else {
      autoMemApiToken = generateRandomToken();
      autoMemAdminToken = generateRandomToken();
    }

    // Optional: Telegram
    const telegramAnswer = await inquirer.prompt<{ enableTelegram: boolean }>([
      {
        type: 'confirm',
        name: 'enableTelegram',
        message: 'Enable Telegram channel?',
        default: false,
      },
    ]);

    let telegramBotToken: string | undefined;
    if (telegramAnswer.enableTelegram) {
      const token = await inquirer.prompt<{ token: string }>([
        {
          type: 'password',
          name: 'token',
          message: 'Enter Telegram Bot Token (from @BotFather):',
          mask: '*',
        },
      ]);
      telegramBotToken = token.token;
    }

    // Optional: Voice features
    const voiceAnswer = await inquirer.prompt<{ enableVoice: boolean }>([
      {
        type: 'confirm',
        name: 'enableVoice',
        message: 'Enable voice features (Whisper transcription, ElevenLabs TTS)?',
        default: false,
      },
    ]);

    let openaiKey: string | undefined;
    let elevenlabsKey: string | undefined;
    if (voiceAnswer.enableVoice) {
      const keys = await inquirer.prompt<{ openaiKey: string; elevenlabsKey: string }>([
        {
          type: 'password',
          name: 'openaiKey',
          message: 'Enter OpenAI API Key (for Whisper):',
          mask: '*',
        },
        {
          type: 'password',
          name: 'elevenlabsKey',
          message: 'Enter ElevenLabs API Key (for TTS, optional):',
          mask: '*',
        },
      ]);
      openaiKey = keys.openaiKey;
      elevenlabsKey = keys.elevenlabsKey;
    }

    // Optional: Voyage embeddings
    const voyageAnswer = await inquirer.prompt<{ enableVoyage: boolean }>([
      {
        type: 'confirm',
        name: 'enableVoyage',
        message: 'Enable Voyage AI embeddings (enhanced RAG)?',
        default: false,
      },
    ]);

    let voyageKey: string | undefined;
    if (voyageAnswer.enableVoyage) {
      const key = await inquirer.prompt<{ key: string }>([
        {
          type: 'password',
          name: 'key',
          message: 'Enter Voyage API Key:',
          mask: '*',
        },
      ]);
      voyageKey = key.key;
    }

    return {
      anthropicKey: anthropicAnswer.anthropicKey,
      generateAutoMemTokens: autoMemAnswer.generateAutoMemTokens,
      autoMemApiToken,
      autoMemAdminToken,
      enableTelegram: telegramAnswer.enableTelegram,
      telegramBotToken,
      enableVoice: voiceAnswer.enableVoice,
      openaiKey,
      elevenlabsKey,
      enableVoyage: voyageAnswer.enableVoyage,
      voyageKey,
    };
  } catch (error) {
    // User cancelled (Ctrl+C)
    if ((error as Error).message?.includes('User force closed')) {
      return null;
    }
    throw error;
  }
}

function writeConfiguration(answers: OnboardAnswers): void {
  printStep(4, TOTAL_STEPS, 'Saving configuration...');

  const entries = readEnvFile();

  // Required
  entries.set('ANTHROPIC_API_KEY', answers.anthropicKey);

  // AutoMem tokens
  if (answers.autoMemApiToken) {
    entries.set('AUTOMEM_API_TOKEN', answers.autoMemApiToken);
  }
  if (answers.autoMemAdminToken) {
    entries.set('AUTOMEM_ADMIN_TOKEN', answers.autoMemAdminToken);
  }

  // Telegram
  entries.set('TELEGRAM_ENABLED', answers.enableTelegram ? 'true' : 'false');
  if (answers.telegramBotToken) {
    entries.set('TELEGRAM_BOT_TOKEN', answers.telegramBotToken);
  }

  // Voice
  if (answers.openaiKey) {
    entries.set('OPENAI_API_KEY', answers.openaiKey);
    entries.set('VOICE_TRANSCRIPTION_ENABLED', 'true');
  }
  if (answers.elevenlabsKey) {
    entries.set('ELEVENLABS_API_KEY', answers.elevenlabsKey);
    entries.set('VOICE_OUTPUT_ENABLED', 'true');
  }

  // Voyage
  if (answers.voyageKey) {
    entries.set('VOYAGE_API_KEY', answers.voyageKey);
    entries.set('EMBEDDING_PROVIDER', 'voyage');
  }

  writeEnvFile(entries);
  printSuccess('Configuration saved to .env');
}

async function startServicesStep(): Promise<boolean> {
  printStep(5, TOTAL_STEPS, 'Starting Docker services...');

  const dockerStatus = getDockerStatus();
  if (!dockerStatus.isRunning) {
    printError('Docker is not running');
    printInfo('Please start Docker and try again');
    return false;
  }

  const result = startDockerCompose(undefined, true);
  if (!result.success) {
    printError(`Failed to start services: ${result.error ?? 'Unknown error'}`);
    return false;
  }

  printSuccess('Docker services started');
  return true;
}

async function waitForServicesStep(): Promise<boolean> {
  printStep(6, TOTAL_STEPS, 'Waiting for services to be ready...');

  const spinner = createSpinner('Checking service health...');
  spinner.start();

  const maxWaitTime = 60000; // 60 seconds
  const checkInterval = 2000; // 2 seconds
  const startTime = Date.now();

  const services = [
    { name: 'Gateway', port: 3001, path: '/health' },
    { name: 'Orchestrator', port: 3002, path: '/health' },
    { name: 'Graph Worker', port: 3003, path: '/health' },
  ];

  while (Date.now() - startTime < maxWaitTime) {
    const results = await Promise.all(
      services.map(async (service) => {
        try {
          const response = await fetch(`http://localhost:${service.port}${service.path}`, {
            signal: AbortSignal.timeout(3000),
          });
          return response.ok;
        } catch {
          return false;
        }
      })
    );

    const allHealthy = results.every((r) => r);
    if (allHealthy) {
      spinner.succeed('All services are healthy');
      return true;
    }

    const healthyCount = results.filter((r) => r).length;
    spinner.text = `Waiting for services (${healthyCount}/${services.length} ready)...`;

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  spinner.fail('Services did not become healthy in time');
  printWarning('Some services may still be starting. Check with "secondme status"');
  return true; // Continue anyway
}

async function checkWhatsAppStep(): Promise<void> {
  printStep(7, TOTAL_STEPS, 'Checking WhatsApp connection...');

  try {
    const response = await fetch('http://localhost:3001/status', {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      printWarning('Could not check WhatsApp status');
      return;
    }

    const data = await response.json() as {
      whatsapp?: { authenticated?: boolean; qr?: string };
    };

    if (data.whatsapp?.authenticated) {
      printSuccess('WhatsApp is already connected');
      return;
    }

    if (data.whatsapp?.qr) {
      printInfo('Scan this QR code with WhatsApp:');
      console.log();
      qrcode.generate(data.whatsapp.qr, { small: true });
      console.log();
    } else {
      printInfo('QR code not yet available. Check the dashboard at http://localhost:3000');
    }
  } catch {
    printWarning('Gateway not ready yet. Check WhatsApp status later.');
  }
}

function printNextSteps(): void {
  printStep(8, TOTAL_STEPS, 'Setup complete!');
  console.log();

  console.log(chalk.bold('Next steps:'));
  console.log();
  console.log('  1. Open the dashboard:');
  console.log(chalk.cyan('     http://localhost:3000'));
  console.log();
  console.log('  2. Scan the WhatsApp QR code (if not done already)');
  console.log();
  console.log('  3. Send a test message to your WhatsApp number');
  console.log();
  console.log(chalk.bold('Useful commands:'));
  console.log();
  console.log(chalk.gray('  npm run cli status   ') + '- Quick status overview');
  console.log(chalk.gray('  npm run cli doctor   ') + '- Detailed health check');
  console.log(chalk.gray('  docker compose logs  ') + '- View service logs');
  console.log();
}

export const onboardCommand = new Command('onboard')
  .description('Interactive setup wizard for SecondMe')
  .option('--skip-services', 'Skip starting Docker services')
  .action(async (options: { skipServices?: boolean }) => {
    printHeader('SecondMe Onboarding');

    // Step 1: Check prerequisites
    const prereqsOk = await checkPrerequisitesStep();
    if (!prereqsOk) {
      process.exit(1);
    }

    // Step 2: Setup .env file
    const envOk = await setupEnvFileStep();
    if (!envOk) {
      process.exit(1);
    }

    // Load env for subsequent steps
    loadEnv();

    // Step 3: Prompt for configuration
    const answers = await promptForConfiguration();
    if (!answers) {
      console.log();
      printWarning('Setup cancelled');
      process.exit(1);
    }

    // Step 4: Write configuration
    writeConfiguration(answers);

    // Reload env with new values
    loadEnv();

    if (!options.skipServices) {
      // Step 5: Start services
      const servicesStarted = await startServicesStep();
      if (!servicesStarted) {
        printWarning('Services failed to start. You can start them manually with "docker compose up -d"');
      }

      // Step 6: Wait for services
      if (servicesStarted) {
        await waitForServicesStep();
      }

      // Step 7: Check WhatsApp
      await checkWhatsAppStep();
    } else {
      printStep(5, TOTAL_STEPS, 'Skipping service startup (--skip-services)');
      printStep(6, TOTAL_STEPS, 'Skipping health check');
      printStep(7, TOTAL_STEPS, 'Skipping WhatsApp check');
    }

    // Step 8-9: Print next steps
    printNextSteps();
    printStep(9, TOTAL_STEPS, 'Done!');
    console.log();

    process.exit(0);
  });
