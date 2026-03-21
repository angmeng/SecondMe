import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import Table from 'cli-table3';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message?: string | undefined;
  detail?: string | undefined;
  fix?: string | undefined;
}

export interface CategoryResult {
  name: string;
  checks: CheckResult[];
}

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: chalk.green('✓'),
  fail: chalk.red('✗'),
  warn: chalk.yellow('⚠'),
  skip: chalk.gray('○'),
};

const STATUS_COLORS: Record<CheckStatus, (text: string) => string> = {
  pass: chalk.green,
  fail: chalk.red,
  warn: chalk.yellow,
  skip: chalk.gray,
};

export function printHeader(title: string): void {
  console.log();
  console.log(chalk.bold.cyan(title));
  console.log(chalk.cyan('═'.repeat(title.length)));
  console.log();
}

export function printCategoryHeader(name: string): void {
  console.log(chalk.bold(name));
}

export function printCheckResult(result: CheckResult): void {
  const icon = STATUS_ICONS[result.status];
  const nameColor = STATUS_COLORS[result.status];
  const nameText = nameColor(result.name.padEnd(20));
  const message = result.message ?? '';

  console.log(`  ${icon} ${nameText} ${message}`);

  if (result.detail) {
    console.log(`      ${chalk.gray(result.detail)}`);
  }

  if (result.fix && result.status !== 'pass') {
    console.log(`      ${chalk.gray('→')} ${result.fix}`);
  }
}

export function printCategoryResults(category: CategoryResult): void {
  printCategoryHeader(category.name);
  for (const check of category.checks) {
    printCheckResult(check);
  }
  console.log();
}

export function printSummary(categories: CategoryResult[]): void {
  let issues = 0;
  let warnings = 0;

  for (const category of categories) {
    for (const check of category.checks) {
      if (check.status === 'fail') issues++;
      if (check.status === 'warn') warnings++;
    }
  }

  console.log(chalk.gray('─'.repeat(40)));

  if (issues === 0 && warnings === 0) {
    console.log(chalk.green('All checks passed!'));
  } else {
    const parts: string[] = [];
    if (issues > 0) parts.push(chalk.red(`${issues} issue${issues === 1 ? '' : 's'} found`));
    if (warnings > 0) parts.push(chalk.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`));
    console.log(parts.join(', '));
  }
  console.log();
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
  });
}

export function printStatusTable(services: Array<{ name: string; status: 'running' | 'stopped'; url: string }>): void {
  const table = new Table({
    head: [chalk.bold('Service'), chalk.bold('Status'), chalk.bold('URL')],
    colWidths: [15, 12, 25],
    style: { head: [], border: [] },
  });

  for (const service of services) {
    const statusIcon = service.status === 'running' ? chalk.green('●') : chalk.gray('○');
    const statusText = service.status === 'running'
      ? chalk.green('running')
      : chalk.gray('stopped');

    table.push([service.name, `${statusIcon} ${statusText}`, chalk.gray(service.url)]);
  }

  console.log(table.toString());
}

export function printConnectionTable(connections: Array<{ name: string; connected: boolean }>): void {
  const table = new Table({
    head: [chalk.bold('Connection'), chalk.bold('Status')],
    colWidths: [15, 15],
    style: { head: [], border: [] },
  });

  for (const conn of connections) {
    const statusIcon = conn.connected ? chalk.green('●') : chalk.gray('○');
    const statusText = conn.connected
      ? chalk.green('connected')
      : chalk.gray('disconnected');

    table.push([conn.name, `${statusIcon} ${statusText}`]);
  }

  console.log(table.toString());
}

export function printSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function printError(message: string): void {
  console.log(chalk.red('✗'), message);
}

export function printWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

export function printInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function printStep(step: number, total: number, message: string): void {
  console.log(chalk.gray(`[${step}/${total}]`), message);
}
