import type { IntegrationTestCase } from "../types";
import { linearTestCases } from "./linear";
import { slackTestCases } from "./slack";

/**
 * All registered test cases, keyed by provider ID.
 */
const testCasesByProvider: Record<string, IntegrationTestCase[]> = {
  linear: linearTestCases,
  slack: slackTestCases,
};

/**
 * Get all test cases for a specific provider.
 */
export const getTestCasesForProvider = (providerId: string): IntegrationTestCase[] => {
  return testCasesByProvider[providerId] ?? [];
};

/**
 * Get a specific test case by ID.
 */
export const getTestCaseById = (testCaseId: string): IntegrationTestCase | undefined => {
  for (const cases of Object.values(testCasesByProvider)) {
    const found = cases.find((tc) => tc.id === testCaseId);
    if (found) return found;
  }
  return undefined;
};

/**
 * Get all available test cases.
 */
export const getAllTestCases = (): IntegrationTestCase[] => {
  return Object.values(testCasesByProvider).flat();
};

/**
 * Get provider IDs that have test cases.
 */
export const getProvidersWithTests = (): string[] => {
  return Object.keys(testCasesByProvider);
};
