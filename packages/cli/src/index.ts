import { Command } from 'commander';
import { doctorCommand } from './commands/doctor.js';
import { statusCommand } from './commands/status.js';
import { onboardCommand } from './commands/onboard.js';

export const program = new Command();

program
  .name('secondme')
  .description('SecondMe Developer CLI - Setup, diagnostics, and management tools')
  .version('1.0.0');

program.addCommand(doctorCommand);
program.addCommand(statusCommand);
program.addCommand(onboardCommand);

export { doctorCommand, statusCommand, onboardCommand };
