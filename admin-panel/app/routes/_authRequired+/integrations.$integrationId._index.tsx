import { useMemo, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { ArrowLeft, Check, CheckCircle, Clock, Github, Mail, Pencil, Play, Server, Trash2, X, XCircle } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { createGraphqlClient } from "~/lib/graphql-client";
import type { IntegrationConfig, McpIntegrationConfig, OAuth2IntegrationConfig } from "~/types/integration";
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

const GET_CONNECTED_ACCOUNTS_QUERY = gql`
  query GetConnectedAccounts($integrationId: String!) {
    connectedAccountsByIntegration(integrationId: $integrationId) {
      id
      integrationId
      viewerId
      accountIdentifier
      status
      lastUsedAt
      createdAt
      updatedAt
    }
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

interface ConnectedAccountResponse {
  id: string;
  integrationId: string;
  viewerId: string;
  accountIdentifier: string | null;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const clientLoader = async ({ params }: { params: { integrationId: string } }) => {
  const integrationId = params.integrationId;
  const config = await fetchAdminConfig();
  const client = createGraphqlClient(config);

  const [integrationData, accountsData] = await Promise.all([
    client.request<{ integration: IntegrationResponse; isSuperadmin: boolean }>(
      GET_INTEGRATION_QUERY,
      {
        id: integrationId,
      }
    ),
    client.request<{ connectedAccountsByIntegration: ConnectedAccountResponse[] }>(
      GET_CONNECTED_ACCOUNTS_QUERY,
      { integrationId }
    ),
  ]);

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
    connectedAccounts: accountsData.connectedAccountsByIntegration,
    testCases,
  };
};

const getProviderIcon = (provider: string) => {
  switch (provider) {
    case "github":
      return <Github size={24} />;
    case "gmail":
      return <Mail size={24} />;
    case "mcp":
      return <Server size={24} />;
    default:
      return null;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "active":
      return <Check size={16} className="text-success" />;
    case "expired":
      return <Clock size={16} className="text-warning" />;
    case "revoked":
    case "error":
      return <X size={16} className="text-error" />;
    default:
      return null;
  }
};

export default function IntegrationDetailPage() {
  const config = useAdminConfig();
  const client = useMemo(() => createGraphqlClient(config), [config]);
  const navigate = useNavigate();
  const { activeOrganization } = useAuth();
  const { integration, isSuperadmin, connectedAccounts, testCases } = useLoaderData<typeof clientLoader>();

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

  const hasActiveConnectedAccount = connectedAccounts.some(
    (account) => account.status === "active"
  );

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
                  {getProviderIcon(integration.provider)}
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

        {/* Configuration - OAuth2 or MCP */}
        {integration.authConfig.type === "mcp" ? (
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-lg mb-4">MCP Configuration</h2>
              <div className="space-y-4">
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
                      {(integration.authConfig as McpIntegrationConfig).auth.strategy.type.replace(
                        "_",
                        " "
                      )}
                    </span>
                  </div>
                </div>

                {(integration.authConfig as McpIntegrationConfig).auth.strategy.type === "api_key" &&
                  (integration.authConfig as McpIntegrationConfig).auth.strategy.type === "api_key" && (
                    <div>
                      <label className="text-sm text-base-content/70">Header Name</label>
                      <p className="font-medium mt-1">
                        {(
                          (integration.authConfig as McpIntegrationConfig).auth.strategy as {
                            type: "api_key";
                            headerName?: string;
                          }
                        ).headerName || "Authorization (default)"}
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body">
              <h2 className="card-title text-lg mb-4">OAuth Configuration</h2>
              <div className="space-y-4">
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
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connected Accounts */}
      <div className="card bg-base-100 shadow-sm border border-base-300">
        <div className="card-body">
          <h2 className="card-title text-lg mb-4">
            Connected Accounts
            <span className="badge badge-neutral">{connectedAccounts.length}</span>
          </h2>

          {connectedAccounts.length === 0 ? (
            <div className="text-center py-8 text-base-content/70">
              <p>No accounts connected yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Status</th>
                    <th>Last Used</th>
                    <th>Connected</th>
                  </tr>
                </thead>
                <tbody>
                  {connectedAccounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        {account.accountIdentifier || (
                          <span className="text-base-content/50 italic">Not specified</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(account.status)}
                          <span className="capitalize">{account.status}</span>
                        </div>
                      </td>
                      <td>
                        {account.lastUsedAt ? (
                          format(new Date(account.lastUsedAt), "PPp")
                        ) : (
                          <span className="text-base-content/50 italic">Never</span>
                        )}
                      </td>
                      <td>{format(new Date(account.createdAt), "PPp")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                disabled={runningTests || !hasActiveConnectedAccount}
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

            {!hasActiveConnectedAccount && (
              <div className="alert alert-warning mb-4">
                <span>Connect an account to run integration tests</span>
              </div>
            )}

            {testError && (
              <div className="alert alert-error mb-4">
                <span>{testError}</span>
              </div>
            )}

            {/* Test Results */}
            {testResults && (
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
