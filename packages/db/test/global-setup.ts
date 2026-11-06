import type { TestProject } from 'vitest/node';
import { setupTestCluster } from '../src/testing.js';

export default function setup(project: TestProject) {
  return setupTestCluster(project);
}
