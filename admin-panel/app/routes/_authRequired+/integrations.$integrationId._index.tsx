import { useMemo, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, CheckCircle, Database, Github, Globe, Key, Link2, Mail, Pencil, Play, Server, Shield, Trash2, XCircle } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { createGraphqlClient } from "~/lib/graphql-client";
import type { IntegrationConfig, McpIntegrationConfig, GraphQLIntegrationConfig, OpenAPIIntegrationConfig, OAuth2IntegrationConfig } from "~/types/integration";
import { format } from "date-fns";
import { fetchAdminConfig } from "~/lib/admin-config";
import { useAdminConfig } from "~/hooks/use-admin-config";

export function meta() {
  return [
    { title: "Integration Details - Subroutine" },
    { name: "description", content: "View integration details" },
  ];
}

const GET_INTEGRATION_QUERY = gql`
  query GetIntegration($id: String!) {
    integration(id: $id) {
      id
      organizationId
      provider
      name
      authConfig
      enabled
      visibility
      createdAt
      updatedAt
    }
    isSuperadmin
  }
`;

const DELETE_INTEGRATION_MUTATION = gql`
  mutation DeleteIntegration($id: String!) {
    deleteIntegration(id: $id)
  }
`;

const GET_TEST_CASES_QUERY = gql`
  query GetIntegrationTestCases($providerId: String!) {
    integrationTestCases(providerId: $providerId) {
      id
      name
      description
      providerId
      readonly
    }
  }
`;

const RUN_TESTS_MUTATION = gql`
  mutation RunIntegrationTests($integrationId: String!, $testCaseIds: [String!]) {
    runIntegrationTests(integrationId: $integrationId, testCaseIds: $testCaseIds) {
      integrationId
      providerId
      results {
        testCaseId
        success
        message
        details
        durationMs
        error {
          name
          message
        }
      }
      summary {
        total
        passed
        failed
        totalDurationMs
      }
      executedAt
      authRequired
      authorizationUrl
      authRequirement {
        integrationId
        integrationName
        provider
        authorizationUrl
        state
        patLinkUrl
        authInstructions
      }
    }
  }
`;

interface TestCase {
  id: string;
  name: string;
  description: string;
  providerId: string;
  readonly: boolean;
}

interface TestCaseResult {
  testCaseId: string;
  success: boolean;
  message: string;
  details: string | null;
  durationMs: number;
  error: { name: string; message: string } | null;
}

interface AuthRequirement {
  integrationId: string;
  integrationName: string;
  provider: string;
  authorizationUrl: string;
  state: string;
  patLinkUrl?: string;
  authInstructions?: string;
}

interface TestRunResult {
  integrationId: string;
  providerId: string;
  results: TestCaseResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDurationMs: number;
  };
  executedAt: string;
  authRequired?: boolean;
  authorizationUrl?: string;
  authRequirement?: AuthRequirement;
}

interface IntegrationResponse {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  authConfig: string;
  enabled: boolean;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

interface ParsedIntegration extends Omit<IntegrationResponse, "authConfig"> {
  authConfig: IntegrationConfig;
}

export const clientLoader = async ({ params }: { params: { integrationId: string } }) => {
  const integrationId = params.integrationId;
  const config = await fetchAdminConfig();
  const client = createGraphqlClient(config);

  const integrationData = await client.request<{ integration: IntegrationResponse; isSuperadmin: boolean }>(
    GET_INTEGRATION_QUERY,
    { id: integrationId }
  );

  const integration = {
    ...integrationData.integration,
    authConfig: JSON.parse(integrationData.integration.authConfig) as IntegrationConfig,
  };

  // Fetch test cases for this provider
  let testCases: TestCase[] = [];
  try {
    const testCasesData = await client.request<{ integrationTestCases: TestCase[] }>(
      GET_TEST_CASES_QUERY,
      { providerId: integration.provider }
    );
    testCases = testCasesData.integrationTestCases;
  } catch {
    // Test cases may not be available for all providers
  }

  return {
    integration,
    isSuperadmin: integrationData.isSuperadmin,
    testCases,
  };
};

const getProviderIcon = (provider: string, authType?: string) => {
  switch (provider) {
    case "github":
      return <Github size={24} />;
    case "gmail":
      return <Mail size={24} />;
    case "mcp":
      return <Server size={24} />;
    case "graphql":
      return <Database size={24} />;
    case "openapi":
      return <Globe size={24} />;
    default:
      // For first-party providers, use protocol-based icon
      if (authType === "graphql") return <Database size={24} />;
      if (authType === "openapi") return <Globe size={24} />;
      if (authType === "mcp") return <Server size={24} />;
      return <Globe size={24} />;
  }
};

export default function IntegrationDetailPage() {
  const config = useAdminConfig();
  const client = useMemo(() => createGraphqlClient(config), [config]);
  const navigate = useNavigate();
  const { activeOrganization } = useAuth();
  const { integration, isSuperadmin, testCases } = useLoaderData<typeof clientLoader>();

  const [deleting, setDeleting] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<TestRunResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGlobal = integration.visibility === "global";
  const canManage = !isGlobal || isSuperadmin;

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this integration? This will also remove all connected accounts."
      )
    ) {
      return;
    }

    try {
      setDeleting(true);
      await client.request<{ deleteIntegration: boolean }>(DELETE_INTEGRATION_MUTATION, {
        id: integration.id,
      });
      navigate("/integrations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete integration");
      setDeleting(false);
    }
  };

  const handleRunTests = async () => {
    setRunningTests(true);
    setTestError(null);
    setTestResults(null);

    try {
      const result = await client.request<{ runIntegrationTests: TestRunResult }>(
        RUN_TESTS_MUTATION,
        { integrationId: integration.id }
      );
      setTestResults(result.runIntegrationTests);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Failed to run tests");
    } finally {
      setRunningTests(false);
    }
  };

  const handleConnectAccount = () => {
    const authReq = testResults?.authRequirement;
    const url = authReq?.patLinkUrl || authReq?.authorizationUrl || testResults?.authorizationUrl;
    if (url) {
      globalThis.location.href = url;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integration Details"
        subtitle={activeOrganization?.name}
        action={
          <div className="flex gap-2">
            <Link to="/integrations" className="btn btn-ghost">
              <ArrowLeft size={20} />
              Back
            </Link>
            {canManage ? (
              <>
                <Link to={`/integrations/${integration.id}/edit`} className="btn btn-primary">
                  <Pencil size={20} />
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="btn btn-error"
                >
                  {deleting ? (
                    <span className="loading loading-spinner loading-sm"></span>
                  ) : (
                    <>
                      <Trash2 size={20} />
                      Delete
                    </>
                  )}
                </button>
              </>
            ) : (
              <span className="badge badge-info badge-lg gap-2">
                Global Integration (Read Only)
              </span>
            )}
          </div>
        }
      />

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Integration Details */}
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-base-content/70">Provider</label>
                <div className="flex items-center gap-2 mt-1">
                  {getProviderIcon(integration.provider, integration.authConfig.type)}
                  <span className="font-medium capitalize">{integration.provider}</span>
                </div>
              </div>

              <div>
                <label className="text-sm text-base-content/70">Name</label>
                <p className="font-medium mt-1">{integration.name}</p>
              </div>

              <div>
                <label className="text-sm text-base-content/70">Status</label>
                <div className="mt-1">
                  <span
                    className={`badge ${integration.enabled ? "badge-success" : "badge-ghost"}`}
                  >
                    {integration.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm text-base-content/70">Created</label>
                <p className="font-medium mt-1">{format(new Date(integration.createdAt), "PPp")}</p>
              </div>

              <div>
                <label className="text-sm text-base-content/70">Last Updated</label>
                <p className="font-medium mt-1">{format(new Date(integration.updatedAt), "PPp")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Configuration Card */}
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">
              {integration.authConfig.type === "mcp" && "MCP Configuration"}
              {integration.authConfig.type === "graphql" && "GraphQL Configuration"}
              {integration.authConfig.type === "openapi" && "REST API Configuration"}
              {integration.authConfig.type === "oauth2" && "OAuth Configuration"}
            </h2>
            <div className="space-y-4">
              {/* MCP Configuration */}
              {integration.authConfig.type === "mcp" && (
                <>
                  <div>
                    <label className="text-sm text-base-content/70">Server URL</label>
                    <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                      {(integration.authConfig as McpIntegrationConfig).serverUrl}
                    </code>
                  </div>
                  <div>
                    <label className="text-sm text-base-content/70">Transport</label>
                    <p className="font-medium mt-1 capitalize">
                      {(integration.authConfig as McpIntegrationConfig).transport === "streamable-http"
                        ? "Streamable HTTP"
                        : "SSE (Server-Sent Events)"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-base-content/70">Authentication</label>
                    <div className="mt-1">
                      <span className="badge badge-ghost capitalize">
                        {(integration.authConfig as McpIntegrationConfig).auth.strategy.type.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* GraphQL Configuration */}
              {integration.authConfig.type === "graphql" && (
                <>
                  <div>
                    <label className="text-sm text-base-content/70">Endpoint</label>
                    <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                      {(integration.authConfig as GraphQLIntegrationConfig).endpoint}
                    </code>
                  </div>
                  <div>
                    <label className="text-sm text-base-content/70">Authentication</label>
                    <div className="mt-1">
                      <span className="badge badge-ghost capitalize">
                        {(integration.authConfig as GraphQLIntegrationConfig).auth.strategy.type.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* OpenAPI Configuration */}
              {integration.authConfig.type === "openapi" && (
                <>
                  <div>
                    <label className="text-sm text-base-content/70">Base URL</label>
                    <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                      {(integration.authConfig as OpenAPIIntegrationConfig).baseUrl}
                    </code>
                  </div>
                  {(integration.authConfig as OpenAPIIntegrationConfig).specUrl && (
                    <div>
                      <label className="text-sm text-base-content/70">OpenAPI Spec URL</label>
                      <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                        {(integration.authConfig as OpenAPIIntegrationConfig).specUrl}
                      </code>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-base-content/70">Authentication</label>
                    <div className="mt-1">
                      <span className="badge badge-ghost capitalize">
                        {(integration.authConfig as OpenAPIIntegrationConfig).auth.strategy.type.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* OAuth2 Configuration */}
              {integration.authConfig.type === "oauth2" && (
                <>
                  <div>
                    <label className="text-sm text-base-content/70">Client ID</label>
                    <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                      {(integration.authConfig as OAuth2IntegrationConfig).clientId}
                    </code>
                  </div>
                  <div>
                    <label className="text-sm text-base-content/70">Redirect URI</label>
                    <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                      {(integration.authConfig as OAuth2IntegrationConfig).redirectUri}
                    </code>
                  </div>
                  <div>
                    <label className="text-sm text-base-content/70">Scopes</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {(integration.authConfig as OAuth2IntegrationConfig).scopes.map((scope: string) => (
                        <span key={scope} className="badge badge-sm badge-ghost">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-base-content/70">Auth URL</label>
                    <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                      {(integration.authConfig as OAuth2IntegrationConfig).authUrl}
                    </code>
                  </div>
                  <div>
                    <label className="text-sm text-base-content/70">Token URL</label>
                    <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                      {(integration.authConfig as OAuth2IntegrationConfig).tokenUrl}
                    </code>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Integration Testing */}
      {testCases.length > 0 && (
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <h2 className="card-title text-lg">
                Integration Testing
                <span className="badge badge-neutral">{testCases.length} tests</span>
              </h2>
              <button
                type="button"
                onClick={handleRunTests}
                disabled={runningTests}
                className="btn btn-primary btn-sm"
              >
                {runningTests ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Running...
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    Run Tests
                  </>
                )}
              </button>
            </div>

            {testError && (
              <div className="alert alert-error mb-4">
                <span>{testError}</span>
              </div>
            )}

            {/* Auth Required - Distinctive auth prompt */}
            {testResults?.authRequired && (testResults.authRequirement || testResults.authorizationUrl) && (
              <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 mb-6">
                {/* Subtle animated gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/5 to-amber-500/0 animate-pulse" />

                <div className="relative p-6">
                  <div className="flex items-start gap-5">
                    {/* Icon container with glow effect */}
                    <div className="flex-shrink-0">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-xl bg-amber-500/20 blur-xl" />
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 backdrop-blur-sm">
                          {testResults.authRequirement?.patLinkUrl ? (
                            <Key className="h-7 w-7 text-amber-400" strokeWidth={1.5} />
                          ) : (
                            <Shield className="h-7 w-7 text-amber-400" strokeWidth={1.5} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-base-content mb-1">
                        {testResults.authRequirement?.patLinkUrl
                          ? "API Key Required"
                          : "Authentication Required"}
                      </h3>
                      <p className="text-sm text-base-content/60 mb-4">
                        {testResults.authRequirement?.patLinkUrl
                          ? testResults.authRequirement.authInstructions || "Link your personal access token to authenticate API requests and run tests."
                          : "Connect your account to authorize API access and run integration tests."}
                      </p>

                      {/* Action button */}
                      <button
                        type="button"
                        onClick={handleConnectAccount}
                        className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:from-amber-400 hover:to-orange-400 transition-all duration-200"
                      >
                        {testResults.authRequirement?.patLinkUrl ? (
                          <>
                            <Link2 size={16} />
                            Link API Key
                          </>
                        ) : (
                          <>
                            <Shield size={16} />
                            Connect Account
                          </>
                        )}
                        <ArrowRight size={14} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>

                    {/* Provider badge */}
                    {testResults.authRequirement?.provider && (
                      <div className="flex-shrink-0 hidden sm:block">
                        <div className="px-3 py-1.5 rounded-full bg-base-200/50 border border-base-300 text-xs font-medium text-base-content/70 capitalize">
                          {testResults.authRequirement.provider}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom accent line */}
                <div className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
              </div>
            )}

            {/* Test Results */}
            {testResults && !testResults.authRequired && (
              <div className="space-y-4">
                <div className="stats stats-horizontal shadow w-full">
                  <div className="stat">
                    <div className="stat-title">Total</div>
                    <div className="stat-value text-lg">{testResults.summary.total}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">Passed</div>
                    <div className="stat-value text-lg text-success">{testResults.summary.passed}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">Failed</div>
                    <div className="stat-value text-lg text-error">{testResults.summary.failed}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">Duration</div>
                    <div className="stat-value text-lg">{testResults.summary.totalDurationMs}ms</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Test</th>
                        <th>Status</th>
                        <th>Message</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testResults.results.map((result) => {
                        const testCase = testCases.find((tc) => tc.id === result.testCaseId);
                        return (
                          <tr key={result.testCaseId}>
                            <td>
                              <div>
                                <p className="font-medium">{testCase?.name || result.testCaseId}</p>
                                {testCase?.description && (
                                  <p className="text-xs text-base-content/60">{testCase.description}</p>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                {result.success ? (
                                  <CheckCircle size={16} className="text-success" />
                                ) : (
                                  <XCircle size={16} className="text-error" />
                                )}
                                <span className={result.success ? "text-success" : "text-error"}>
                                  {result.success ? "Passed" : "Failed"}
                                </span>
                              </div>
                            </td>
                            <td>
                              <p className="text-sm">{result.message}</p>
                              {result.error && (
                                <p className="text-xs text-error">{result.error.message}</p>
                              )}
                            </td>
                            <td>{result.durationMs}ms</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Available Test Cases (when no results) */}
            {!testResults && (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Test Name</th>
                      <th>Description</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCases.map((testCase) => (
                      <tr key={testCase.id}>
                        <td className="font-medium">{testCase.name}</td>
                        <td className="text-sm text-base-content/70">{testCase.description}</td>
                        <td>
                          <span className={`badge badge-sm ${testCase.readonly ? "badge-info" : "badge-warning"}`}>
                            {testCase.readonly ? "Read-only" : "May modify"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
