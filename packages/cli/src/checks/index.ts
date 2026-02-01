import type { CategoryResult } from '../utils/output.js';
import { checkPrerequisites } from './prerequisites.js';
import { checkInfrastructure } from './infrastructure.js';
import { checkServices } from './services.js';
import { checkExternal } from './external.js';
import { checkApiKeys } from './api-keys.js';

export interface HealthCheckOptions {
  verbose?: boolean | undefined;
}

export interface HealthCheckSummary {
  categories: CategoryResult[];
  hasIssues: boolean;
  hasWarnings: boolean;
  issueCount: number;
  warningCount: number;
}

export async function runAllChecks(options: HealthCheckOptions = {}): Promise<HealthCheckSummary> {
  const categories: CategoryResult[] = [];

  // Run checks in order of dependency
  const prerequisites = await checkPrerequisites(options);
  categories.push(prerequisites);

  // Only continue if prerequisites pass
  const prereqsFailed = prerequisites.checks.some((c) => c.status === 'fail');
  if (!prereqsFailed) {
    const infrastructure = await checkInfrastructure(options);
    categories.push(infrastructure);

    const services = await checkServices(options);
    categories.push(services);

    const external = await checkExternal(options);
    categories.push(external);
  }

  const apiKeys = await checkApiKeys(options);
  categories.push(apiKeys);

  // Calculate summary
  let issueCount = 0;
  let warningCount = 0;

  for (const category of categories) {
    for (const check of category.checks) {
      if (check.status === 'fail') issueCount++;
      if (check.status === 'warn') warningCount++;
    }
  }

  return {
    categories,
    hasIssues: issueCount > 0,
    hasWarnings: warningCount > 0,
    issueCount,
    warningCount,
  };
}

export { checkPrerequisites } from './prerequisites.js';
export { checkInfrastructure } from './infrastructure.js';
export { checkServices } from './services.js';
export { checkExternal } from './external.js';
export { checkApiKeys } from './api-keys.js';
