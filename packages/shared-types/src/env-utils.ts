/**
 * Environment Variable Utilities
 * Safe parsing of environment variables with NaN protection and logging
 */

/**
 * Parse an integer environment variable with validation
 * Returns the default value if:
 * - Environment variable is not set
 * - Value cannot be parsed as an integer (NaN)
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if missing or invalid
 * @returns Parsed integer or default value
 */
export function parseIntEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;

  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    console.warn(`[ENV] Invalid ${key}="${raw}", using default ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

/**
 * Parse a float environment variable with validation
 * Returns the default value if:
 * - Environment variable is not set
 * - Value cannot be parsed as a float (NaN)
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if missing or invalid
 * @returns Parsed float or default value
 */
export function parseFloatEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;

  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) {
    console.warn(`[ENV] Invalid ${key}="${raw}", using default ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}
