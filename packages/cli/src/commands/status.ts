import { Command } from 'commander';
import chalk from 'chalk';
import { loadEnv } from '../utils/env.js';
import { printHeader, printStatusTable, printConnectionTable } from '../utils/output.js';
import { getServicesStatus } from '../checks/services.js';
import { checkInfrastructure } from '../checks/infrastructure.js';
import { checkExternal } from '../checks/external.js';

export const statusCommand = new Command('status')
  .description('Show quick system status overview')
  .action(async () => {
    // Load environment variables
    loadEnv();

    printHeader('SecondMe Status');

    // Get service status
    const services = await getServicesStatus();
    console.log(chalk.bold('Services:'));
    printStatusTable(services);
    console.log();

    // Get connection status
    const infrastructure = await checkInfrastructure();
    const external = await checkExternal();

    const connections = [
      {
        name: 'Redis',
        connected: infrastructure.checks.find((c) => c.name === 'Redis')?.status === 'pass',
      },
      {
        name: 'FalkorDB',
        connected: infrastructure.checks.find((c) => c.name === 'FalkorDB')?.status === 'pass',
      },
      {
        name: 'WhatsApp',
        connected: external.checks.find((c) => c.name === 'WhatsApp Session')?.status === 'pass',
      },
    ];

    console.log(chalk.bold('Connections:'));
    printConnectionTable(connections);
    console.log();

    console.log(chalk.gray("Run 'secondme doctor' for detailed diagnostics."));
    console.log();

    // Exit with code based on service status
    const allRunning = services.every((s) => s.status === 'running');
    process.exit(allRunning ? 0 : 1);
  });
