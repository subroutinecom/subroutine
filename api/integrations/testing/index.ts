/**
 * Integration Testing Harness
 *
 * This module provides a manual testing system for validating integrations
 * with real OAuth credentials. Tests are NOT run in CI - they require
 * user authentication and run against production APIs.
 *
 * Usage:
 * 1. User connects their account via OAuth
 * 2. User runs tests from the admin panel
 * 3. Tests execute in sandbox with connected account credentials
 * 4. Results displayed in admin panel
 */

export { runIntegrationTests, getAvailableTestCases } from "./test-executor";
export { getTestCasesForProvider, getTestCaseById, getAllTestCases, getProvidersWithTests } from "./test-cases";
export type {
  IntegrationTestCase,
  TestCaseResult,
  TestRunRequest,
  TestRunResult,
} from "./types";
