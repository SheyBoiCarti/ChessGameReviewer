// tests/setup/test-discovery.test.ts
import { describe, expect, it } from 'vitest';
import config from '../../vitest.config';

describe('test discovery and coverage gates', () => {
  it('includes API contract tests in the DOM project', () => {
    const projects = config.test?.projects ?? [];
    expect(JSON.stringify(projects)).toContain('tests/api/**/*.test.ts');
  });

  it('enforces the documented global coverage minimums', () => {
    const coverage = config.test?.coverage;
    const thresholds = coverage && 'thresholds' in coverage ? coverage.thresholds : undefined;
    expect(thresholds).toMatchObject({
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    });
  });
});
