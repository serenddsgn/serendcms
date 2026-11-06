import type { TestProject } from 'vitest/node';
import { setupTestCluster } from '@serend/db/testing';

export default function setup(project: TestProject) {
  return setupTestCluster(project);
}
