import { getConfig } from "../../config/loader";
import { getConnectedAccountByViewer } from "../../models/connected-account";
import { IntegrationAuthRequiredError } from "../../models/errors";
import { getIntegrationOrGlobal, type IntegrationWithConfig } from "../../models/integration";
import { generatePatLinkUrl } from "../../models/pat-link";
import type { IntegrationProvider } from "../providers";
import { generateAuthorizationUrl } from "../../services/oauth";
import { getLogger } from "../../utils/logger";
import { getTestCaseById, getTestCasesForProvider } from "./test-cases";
import type { IntegrationTestCase, TestCaseResult, TestRunRequest, TestRunResult } from "./types";
import type { AuthStrategy, OAuthConfig } from "../providers/types";

const logger = getLogger("api/integrations/testing/test-executor.ts");

// ============================================================================
// Viewer Credential Resolution (same pattern as run.ts)
// ============================================================================

type ViewerCredentialRequirement = { type: "none" } | { type: "oauth" } | { type: "pat" };

const getViewerCredentialRequirement = (authStrategy: AuthStrategy): ViewerCredentialRequirement => {
  switch (authStrategy.type) {
    case "bearer_oauth":
      return { type: "oauth" };
    case "api_key":
      return authStrategy.viewerScoped ? { type: "pat" } : { type: "none" };
    case "none":
    case "custom_headers":
      return { type: "none" };
    default: {
      const _exhaustive: never = authStrategy;
      throw new Error(`Unknown auth strategy type: ${JSON.stringify(_exhaustive)}`);
    }
  }
};

/**
 * Extracts auth strategy and oauth config from an integration's auth config.
 * Handles all protocol types (oauth2, mcp, graphql, openapi).
 */
const extractAuthConfig = (
  integration: IntegrationWithConfig
): { authStrategy: AuthStrategy; oauthConfig?: OAuthConfig; metadata?: Record<string, unknown> } => {
  const authConfig = integration.authConfig;

  if (authConfig.type === "oauth2") {
    // OAuth2 integrations have their own auth strategy
    return {
      authStrategy: { type: "bearer_oauth" },
      oauthConfig: {
        clientId: authConfig.clientId,
        clientSecret: authConfig.clientSecret,
        authUrl: authConfig.authUrl,
        tokenUrl: authConfig.tokenUrl,
        redirectUri: authConfig.redirectUri,
        scopes: authConfig.scopes ?? [],
      },
    };
  }

  if (authConfig.type === "mcp" || authConfig.type === "graphql" || authConfig.type === "openapi") {
    return {
      authStrategy: authConfig.auth.strategy,
      oauthConfig: authConfig.auth.oauthConfig,
      metadata: authConfig.metadata,
    };
  }

  throw new Error(`Unknown integration type: ${(authConfig as { type: string }).type}`);
};

/**
 * Resolves viewer credentials for testing. Returns access token if available,
 * or throws IntegrationAuthRequiredError with the appropriate auth URL.
 */
const resolveTestCredentials = async (params: {
  integration: IntegrationWithConfig;
  viewerId: string;
  organizationId: string;
}): Promise<string> => {
  const { integration, viewerId, organizationId } = params;
  const { authStrategy, oauthConfig, metadata } = extractAuthConfig(integration);
  const requirement = getViewerCredentialRequirement(authStrategy);

  if (requirement.type === "none") {
    // No credentials needed - return empty string (tests will work without token)
    return "";
  }

  // Check for existing connected account
  const connectedAccount = await getConnectedAccountByViewer(viewerId, integration.id, organizationId);

  if (connectedAccount?.status === "active" && connectedAccount.credentials.accessToken) {
    return connectedAccount.credentials.accessToken;
  }

  // No valid credentials - generate appropriate auth URL
  const provider = integration.provider as IntegrationProvider;

  if (requirement.type === "oauth") {
    if (!oauthConfig) {
      throw new Error(
        `Integration ${integration.name} is configured for OAuth but missing OAuth configuration. ` +
          `Please configure clientId, clientSecret, and other OAuth settings.`
      );
    }

    const auth = await generateAuthorizationUrl({
      integrationId: integration.id,
      organizationId,
      viewerId,
    });

    throw new IntegrationAuthRequiredError({
      viewerId,
      requirements: [
        {
          integrationId: integration.id,
          integrationName: integration.name,
          provider,
          authorizationUrl: auth.url,
          state: auth.state,
        },
      ],
    });
  }

  if (requirement.type === "pat") {
    const patLink = await generatePatLinkUrl({
      integrationId: integration.id,
      viewerId,
      organizationId,
    });

    throw new IntegrationAuthRequiredError({
      viewerId,
      requirements: [
        {
          integrationId: integration.id,
          integrationName: integration.name,
          provider,
          authorizationUrl: patLink.url,
          state: "",
          patLinkUrl: patLink.url,
          authInstructions: metadata?.authInstructions as string | undefined,
        },
      ],
    });
  }

  return "";
};

/**
 * Build a sandbox-compatible integration payload from an integration and connected account.
 */
const buildSandboxIntegration = (
  integration: IntegrationWithConfig,
  accessToken: string
): Record<string, unknown> => {
  const authConfig = integration.authConfig;

  const base = {
    id: integration.id,
    provider: integration.provider,
    // Use a test name that the sandbox code will reference
    name: "__test_integration__",
    authConfig: {
      ...authConfig,
    },
  };

  // Add protocol-specific config based on integration type
  if (authConfig.type === "graphql") {
    return {
      ...base,
      graphqlConfig: {
        endpoint: authConfig.endpoint,
        authStrategy: authConfig.auth.strategy,
        accessToken,
      },
    };
  }

  if (authConfig.type === "openapi") {
    return {
      ...base,
      openapiConfig: {
        baseUrl: authConfig.baseUrl,
        authStrategy: authConfig.auth.strategy,
        accessToken,
        spec: authConfig.spec,
        specVersion: authConfig.specVersion,
      },
    };
  }

  if (authConfig.type === "mcp") {
    return {
      ...base,
      mcpConfig: {
        serverUrl: authConfig.serverUrl,
        transport: authConfig.transport,
        authStrategy: authConfig.auth.strategy,
        accessToken,
      },
    };
  }

  // Fallback for other types (shouldn't happen in practice)
  return base;
};

/**
 * Execute TypeScript code in the sandbox.
 */
const executeSandboxCode = async (
  code: string,
  integrations: Record<string, unknown>[]
): Promise<{ success: boolean; result?: unknown; error?: string }> => {
  const config = await getConfig();
  const sandboxUrl = config.internalSandboxUrl || "http://sandbox.subroutine.internal";

  // Prepend zod import to the code (same as test fixture)
  const fullCode = `import { z } from "zod";\n${code}`;

  try {
    const response = await fetch(`${sandboxUrl}/test/executeTypescript`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: fullCode,
        inputs: {},
        integrations,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Sandbox execution failed: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Run a single test case.
 */
const runTestCase = async (
  testCase: IntegrationTestCase,
  integration: IntegrationWithConfig,
  accessToken: string
): Promise<TestCaseResult> => {
  const startTime = Date.now();

  try {
    // Build sandbox-compatible integration config
    const sandboxIntegration = buildSandboxIntegration(integration, accessToken);

    // Execute the test code
    const result = await executeSandboxCode(testCase.sandboxCode, [sandboxIntegration]);

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

  // 2. Resolve credentials for the viewer (handles OAuth and PAT generically)
  let accessToken: string;
  try {
    accessToken = await resolveTestCredentials({
      integration,
      viewerId,
      organizationId,
    });
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
        authorizationUrl: requirement.authorizationUrl, // backwards compat
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

  // 3. Get test cases
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

  // 4. Run each test case
  logger.info(
    `Running ${testCasesToRun.length} test(s) for integration ${integration.name} (${integration.provider})`
  );

  const results: TestCaseResult[] = [];
  for (const testCase of testCasesToRun) {
    logger.info(`Running test: ${testCase.name}`);
    const result = await runTestCase(testCase, integration, accessToken);
    results.push(result);
    logger.info(
      `Test ${testCase.name}: ${result.success ? "PASSED" : "FAILED"} (${result.durationMs}ms)`
    );
  }

  // 5. Build summary
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
