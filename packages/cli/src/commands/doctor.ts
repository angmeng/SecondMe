import { Command } from 'commander';
import { runAllChecks } from '../checks/index.js';
import { loadEnv } from '../utils/env.js';
import {
  printHeader,
  printCategoryResults,
  printSummary,
} from '../utils/output.js';

export const doctorCommand = new Command('doctor')
  .description('Run comprehensive health checks on SecondMe')
  .option('-v, --verbose', 'Show additional details')
  .action(async (options: { verbose?: boolean }) => {
    // Load environment variables
    loadEnv();

    printHeader('SecondMe Doctor');

    const summary = await runAllChecks({ verbose: options.verbose });

    for (const category of summary.categories) {
      printCategoryResults(category);
    }

    printSummary(summary.categories);

    // Exit with appropriate code
    process.exit(summary.hasIssues ? 1 : 0);
  });
