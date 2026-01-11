// Vitest setup file for frontend tests
// Updated to Vitest 4.0.16 (January 2026)

import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/dom';

// Cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// Extend Vitest matchers with custom assertions if needed
expect.extend({
  // Custom matchers can be added here
});
