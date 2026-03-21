/**
 * Centralized service URL configuration
 * Avoids redeclaring the same env var lookups in every route handler.
 */

export const GATEWAY_URL = process.env['GATEWAY_URL'] || 'http://localhost:3001';
export const ORCHESTRATOR_URL = process.env['ORCHESTRATOR_URL'] || 'http://localhost:3002';
