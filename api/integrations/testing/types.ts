/**
 * Integration Testing Harness Types
 *
 * This module defines types for the manual integration testing system.
 * Tests are NOT run in CI - they require real OAuth authentication
 * and run against production APIs.
 */

/**
 * A test case for a specific integration provider.
 * Each test case contains TypeScript code that runs in the sandbox
 * with the connected account's credentials.
 */
export interface IntegrationTestCase {
  /** Unique identifier for the test case */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this test validates */
  description: string;

  /** Provider ID this test is for (e.g., "linear", "slack") */
  providerId: string;

  /** Whether this test only reads data (no mutations) */
  readonly: boolean;

  /**
   * TypeScript code to execute in sandbox.
   * Must export a default async function that receives (inputs, context).
   * Should return an object with success status and relevant data.
   */
  sandboxCode: string;
}

/**
 * Result of running a single test case
 */
export interface TestCaseResult {
  /** The test case that was run */
  testCaseId: string;

  /** Whether the test passed */
  success: boolean;

  /** Human-readable message about the result */
  message: string;

  /** Additional details/data from the test */
  details?: Record<string, unknown>;

  /** How long the test took in milliseconds */
  durationMs: number;

  /** Error details if the test failed */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Request to run integration tests
 */
export interface TestRunRequest {
  /** Integration ID to test */
  integrationId: string;

  /** Organization ID */
  organizationId: string;

  /** Viewer ID (user running the tests) */
  viewerId: string;

  /** Specific test case IDs to run (if omitted, runs all for provider) */
  testCaseIds?: string[];
}

/**
 * Result of a test run
 */
export interface TestRunResult {
  /** Integration that was tested */
  integrationId: string;

  /** Provider ID */
  providerId: string;

  /** Results for each test case */
  results: TestCaseResult[];

  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDurationMs: number;
  };

  /** When the test run was executed */
  executedAt: string;
}
