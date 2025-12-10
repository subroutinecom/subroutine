import { IntegrationAuthRequiredError } from "../../models/errors";
import { getIntegrationOrGlobal } from "../../models/integration";
import {
  buildSandboxIntegrationById,
  executeSandboxCode,
} from "../../services/sandbox";
import { getLogger } from "../../utils/logger";
import { getTestCaseById, getTestCasesForProvider } from "./test-cases";
import type { IntegrationTestCase, TestCaseResult, TestRunRequest, TestRunResult } from "./types";

const logger = getLogger("api/integrations/testing/test-executor.ts");

/**
 * Run a single test case.
 */
const runTestCase = async (
  testCase: IntegrationTestCase,
  integrationId: string,
  organizationId: string,
  viewerId: string
): Promise<TestCaseResult> => {
  const startTime = Date.now();

  try {
    // Build sandbox integration config using shared utility
    const sandboxIntegration = await buildSandboxIntegrationById({
      integrationId,
      organizationId,
      viewerId,
      nameOverride: "__test_integration__",
    });

    // Prepend zod import to the code
    const fullCode = `import { z } from "zod";\n${testCase.sandboxCode}`;

    // Execute the test code
    const result = await executeSandboxCode({
      code: fullCode,
      integrations: [sandboxIntegration],
    });

    const durationMs = Date.now() - startTime;

    if (!result.success) {
      return {
        testCaseId: testCase.id,
        success: false,
        message: result.error || "Test execution failed",
        durationMs,
        error: {
          name: "ExecutionError",
          message: result.error || "Unknown error",
        },
      };
    }

    // Check if the result indicates success
    const output = result.result as Record<string, unknown> | undefined;
    const testSuccess = output?.success === true;

    return {
      testCaseId: testCase.id,
      success: testSuccess,
      message: testSuccess
        ? `${testCase.name} passed`
        : (output?.error as string) || `${testCase.name} failed`,
      details: output,
      durationMs,
    };
  } catch (error) {
    // Handle auth required errors specially
    if (error instanceof IntegrationAuthRequiredError) {
      throw error;
    }

    return {
      testCaseId: testCase.id,
      success: false,
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    };
  }
};

/**
 * Run integration tests for a given integration.
 *
 * This is the main entry point for the testing harness.
 * It requires valid credentials (OAuth token or API key) for the viewer.
 */
export const runIntegrationTests = async (request: TestRunRequest): Promise<TestRunResult> => {
  const { integrationId, organizationId, viewerId, testCaseIds } = request;

  // 1. Get the integration
  const integration = await getIntegrationOrGlobal(integrationId, organizationId);
  if (!integration) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  // 2. Get test cases
  const allTestCases = getTestCasesForProvider(integration.provider);
  if (allTestCases.length === 0) {
    throw new Error(`No test cases available for provider: ${integration.provider}`);
  }

  let testCasesToRun: IntegrationTestCase[];
  if (testCaseIds && testCaseIds.length > 0) {
    testCasesToRun = testCaseIds
      .map((id) => getTestCaseById(id))
      .filter((tc): tc is IntegrationTestCase => tc !== undefined);

    if (testCasesToRun.length === 0) {
      throw new Error("None of the specified test case IDs were found.");
    }
  } else {
    testCasesToRun = allTestCases;
  }

  // 3. Run each test case
  logger.info(
    `Running ${testCasesToRun.length} test(s) for integration ${integration.name} (${integration.provider})`
  );

  const results: TestCaseResult[] = [];
  for (const testCase of testCasesToRun) {
    logger.info(`Running test: ${testCase.name}`);

    try {
      const result = await runTestCase(testCase, integrationId, organizationId, viewerId);
      results.push(result);
      logger.info(
        `Test ${testCase.name}: ${result.success ? "PASSED" : "FAILED"} (${result.durationMs}ms)`
      );
    } catch (error) {
      // If auth is required, convert the error to TestRunResult format
      if (error instanceof IntegrationAuthRequiredError) {
        const requirement = error.requirements[0];
        logger.info(
          `Auth required for viewer ${viewerId}, type: ${requirement.patLinkUrl ? "pat" : "oauth"}`
        );

        return {
          integrationId,
          providerId: integration.provider,
          results: [],
          summary: {
            total: 0,
            passed: 0,
            failed: 0,
            totalDurationMs: 0,
          },
          executedAt: new Date().toISOString(),
          authRequired: true,
          authorizationUrl: requirement.authorizationUrl,
          authRequirement: {
            integrationId: requirement.integrationId,
            integrationName: requirement.integrationName,
            provider: requirement.provider,
            authorizationUrl: requirement.authorizationUrl,
            state: requirement.state,
            patLinkUrl: requirement.patLinkUrl,
            authInstructions: requirement.authInstructions,
          },
        };
      }
      throw error;
    }
  }

  // 4. Build summary
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  return {
    integrationId,
    providerId: integration.provider,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      totalDurationMs,
    },
    executedAt: new Date().toISOString(),
  };
};

/**
 * Get available test cases for an integration.
 */
export const getAvailableTestCases = (providerId: string): IntegrationTestCase[] => {
  return getTestCasesForProvider(providerId);
};
