import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { ArrowLeft, Check, Clock, Github, Mail, Pencil, Server, Trash2, X } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";
import type { IntegrationAuthConfig, McpAuthConfig, OAuth2AuthConfig } from "~/types/integration";
import { format } from "date-fns";

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
      createdAt
      updatedAt
    }
  }
`;

const GET_CONNECTED_ACCOUNTS_QUERY = gql`
  query GetConnectedAccounts($integrationId: String!) {
    connectedAccountsByIntegration(integrationId: $integrationId) {
      id
      integrationId
      userId
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

interface IntegrationResponse {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  authConfig: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ParsedIntegration extends Omit<IntegrationResponse, "authConfig"> {
  authConfig: IntegrationAuthConfig;
}

interface ConnectedAccountResponse {
  id: string;
  integrationId: string;
  userId: string;
  accountIdentifier: string | null;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const clientLoader = async ({ params }: { params: { integrationId: string } }) => {
  const integrationId = params.integrationId;

  const [integrationData, accountsData] = await Promise.all([
    graphqlClient.request<{ integration: IntegrationResponse }>(GET_INTEGRATION_QUERY, {
      id: integrationId,
    }),
    graphqlClient.request<{ connectedAccountsByIntegration: ConnectedAccountResponse[] }>(
      GET_CONNECTED_ACCOUNTS_QUERY,
      { integrationId }
    ),
  ]);

  const integration = {
    ...integrationData.integration,
    authConfig: JSON.parse(integrationData.integration.authConfig) as IntegrationAuthConfig,
  };

  return {
    integration,
    connectedAccounts: accountsData.connectedAccountsByIntegration,
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
  const navigate = useNavigate();
  const { activeOrganization } = useAuth();
  const { integration, connectedAccounts } = useLoaderData<typeof clientLoader>();

  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await graphqlClient.request<{ deleteIntegration: boolean }>(DELETE_INTEGRATION_MUTATION, {
        id: integration.id,
      });
      navigate("/integrations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete integration");
      setDeleting(false);
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
                    {(integration.authConfig as McpAuthConfig).serverUrl}
                  </code>
                </div>

                <div>
                  <label className="text-sm text-base-content/70">Transport</label>
                  <p className="font-medium mt-1 capitalize">
                    {(integration.authConfig as McpAuthConfig).transport === "streamable-http"
                      ? "Streamable HTTP"
                      : "SSE (Server-Sent Events)"}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-base-content/70">Authentication</label>
                  <div className="mt-1">
                    <span className="badge badge-ghost capitalize">
                      {(integration.authConfig as McpAuthConfig).authStrategy.type.replace("_", " ")}
                    </span>
                  </div>
                </div>

                {(integration.authConfig as McpAuthConfig).authStrategy.type === "api_key" &&
                  (integration.authConfig as McpAuthConfig).authStrategy.type === "api_key" && (
                    <div>
                      <label className="text-sm text-base-content/70">Header Name</label>
                      <p className="font-medium mt-1">
                        {((integration.authConfig as McpAuthConfig).authStrategy as { type: "api_key"; headerName?: string }).headerName || "Authorization (default)"}
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
                    {(integration.authConfig as OAuth2AuthConfig).clientId}
                  </code>
                </div>

                <div>
                  <label className="text-sm text-base-content/70">Redirect URI</label>
                  <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                    {(integration.authConfig as OAuth2AuthConfig).redirectUri}
                  </code>
                </div>

                <div>
                  <label className="text-sm text-base-content/70">Scopes</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(integration.authConfig as OAuth2AuthConfig).scopes.map((scope: string) => (
                      <span key={scope} className="badge badge-sm badge-ghost">
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-base-content/70">Auth URL</label>
                  <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                    {(integration.authConfig as OAuth2AuthConfig).authUrl}
                  </code>
                </div>

                <div>
                  <label className="text-sm text-base-content/70">Token URL</label>
                  <code className="block bg-base-200 px-3 py-2 rounded mt-1 text-xs break-all">
                    {(integration.authConfig as OAuth2AuthConfig).tokenUrl}
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
    </div>
  );
}
