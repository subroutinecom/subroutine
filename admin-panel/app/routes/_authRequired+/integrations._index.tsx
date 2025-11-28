import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import {
  Github,
  Globe,
  Mail,
  Pencil,
  Plus,
  Server,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
} from "lucide-react";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { EmptyState } from "~/components/ui/EmptyState";
import { graphqlClient } from "~/lib/graphql-client";
import type { IntegrationAuthConfig, McpAuthConfig, OAuth2AuthConfig } from "~/types/integration";

export function meta() {
  return [
    { title: "Integrations - Subroutine" },
    { name: "description", content: "Manage your organization's integrations" },
  ];
}

const INTEGRATIONS_QUERY = gql`
  query GetIntegrations {
    orgIntegrations: integrations(visibility: "private") {
      id
      organizationId
      provider
      name
      description
      authConfig
      enabled
      visibility
      createdAt
      updatedAt
    }
    globalIntegrations: integrations(visibility: "global") {
      id
      organizationId
      provider
      name
      description
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

const UPDATE_INTEGRATION_MUTATION = gql`
  mutation ToggleIntegrationEnabled($id: String!, $enabled: Boolean) {
    updateIntegration(id: $id, enabled: $enabled) {
      id
      enabled
    }
  }
`;

interface IntegrationResponse {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  description: string | null;
  authConfig: string;
  enabled: boolean;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

interface ParsedIntegration extends Omit<IntegrationResponse, "authConfig"> {
  authConfig: IntegrationAuthConfig;
  isGlobal?: boolean;
}

export const clientLoader = async () => {
  const data = await graphqlClient.request<{
    orgIntegrations: IntegrationResponse[];
    globalIntegrations: IntegrationResponse[];
    isSuperadmin: boolean;
  }>(INTEGRATIONS_QUERY);

  // Parse org-specific integrations (visibility filter already applied by backend)
  const integrations = data.orgIntegrations.map((integration) => ({
    ...integration,
    authConfig: JSON.parse(integration.authConfig) as IntegrationAuthConfig,
    isGlobal: false,
  }));

  // Parse global integrations
  const globalIntegrations = data.globalIntegrations.map((integration) => ({
    ...integration,
    authConfig: JSON.parse(integration.authConfig) as IntegrationAuthConfig,
    isGlobal: true,
  }));

  return { integrations, globalIntegrations, isSuperadmin: data.isSuperadmin };
};

const getProviderIcon = (provider: string) => {
  switch (provider) {
    case "github":
      return <Github size={20} />;
    case "gmail":
      return <Mail size={20} />;
    case "mcp":
      return <Server size={20} />;
    default:
      return null;
  }
};

export default function IntegrationsPage() {
  const { activeOrganization: _activeOrganization } = useAuth();
  const {
    integrations: initialIntegrations,
    globalIntegrations: initialGlobalIntegrations,
    isSuperadmin,
  } = useLoaderData<typeof clientLoader>();
  const [integrations, setIntegrations] = useState<ParsedIntegration[]>(initialIntegrations);
  const [globalIntegrations, setGlobalIntegrations] =
    useState<ParsedIntegration[]>(initialGlobalIntegrations);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleDelete = async (id: string, isGlobal: boolean) => {
    if (
      !confirm(
        "Are you sure you want to delete this integration? This will also remove all connected accounts."
      )
    ) {
      return;
    }

    try {
      setDeletingId(id);
      await graphqlClient.request<{ deleteIntegration: boolean }>(DELETE_INTEGRATION_MUTATION, {
        id,
      });
      if (isGlobal) {
        setGlobalIntegrations((prev) => prev.filter((i) => i.id !== id));
      } else {
        setIntegrations((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete integration");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleEnabled = async (id: string, currentEnabled: boolean, isGlobal: boolean) => {
    try {
      setTogglingId(id);
      const data = await graphqlClient.request<{
        updateIntegration: IntegrationResponse;
      }>(UPDATE_INTEGRATION_MUTATION, { id, enabled: !currentEnabled });
      if (isGlobal) {
        setGlobalIntegrations((prev) =>
          prev.map((i) => (i.id === id ? { ...i, enabled: data.updateIntegration.enabled } : i))
        );
      } else {
        setIntegrations((prev) =>
          prev.map((i) => (i.id === id ? { ...i, enabled: data.updateIntegration.enabled } : i))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle integration");
    } finally {
      setTogglingId(null);
    }
  };

  const allIntegrations = [...globalIntegrations, ...integrations];

  const renderIntegrationRow = (integration: ParsedIntegration, index: number) => {
    const isGlobal = integration.isGlobal ?? false;
    const canManage = !isGlobal || isSuperadmin;

    return (
      <tr
        key={integration.id}
        className="border-b border-base-300 hover:bg-base-200/50 transition-colors animate-slide-in-right"
        style={{ animationDelay: `${index * 30}ms` }}
      >
        <td className="py-4 px-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center text-primary">
              {getProviderIcon(integration.provider)}
            </div>
            <div className="flex flex-col">
              <span className="font-medium text-base-content capitalize">
                {integration.provider}
              </span>
              {isGlobal && (
                <span className="inline-flex items-center gap-1 text-xs text-info">
                  <Globe size={12} />
                  Global
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="py-4 px-6">
          <div className="flex flex-col gap-1">
            <span className="text-base-content font-medium">{integration.name}</span>
            {integration.description && (
              <span className="text-xs text-base-content/60 max-w-xs truncate">
                {integration.description}
              </span>
            )}
          </div>
        </td>
        <td className="py-4 px-6">
          {integration.authConfig.type === "mcp" ? (
            <div className="space-y-1">
              <code className="text-xs font-mono bg-base-200 px-3 py-1.5 rounded-md text-base-content/70 block max-w-xs truncate">
                {(integration.authConfig as McpAuthConfig).serverUrl}
              </code>
              <div className="flex gap-1.5 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-base-200 text-base-content/70 border border-base-300 capitalize">
                  {(integration.authConfig as McpAuthConfig).authStrategy.type.replace("_", " ")}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <code className="text-xs font-mono bg-base-200 px-3 py-1.5 rounded-md text-base-content/70 block max-w-xs truncate">
                {(integration.authConfig as OAuth2AuthConfig).clientId}
              </code>
              <div className="flex gap-1.5 flex-wrap max-w-xs">
                {(integration.authConfig as OAuth2AuthConfig).scopes
                  .slice(0, 3)
                  .map((scope: string) => (
                    <span
                      key={scope}
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-base-200 text-base-content/70 border border-base-300"
                    >
                      {scope}
                    </span>
                  ))}
                {(integration.authConfig as OAuth2AuthConfig).scopes.length > 3 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-base-200 text-base-content/60 border border-base-300">
                    +{(integration.authConfig as OAuth2AuthConfig).scopes.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </td>
        <td className="py-4 px-6">
          {canManage ? (
            <button
              type="button"
              onClick={() => handleToggleEnabled(integration.id, integration.enabled, isGlobal)}
              disabled={togglingId === integration.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                integration.enabled
                  ? "bg-success/10 hover:bg-success/20"
                  : "bg-base-200 hover:bg-base-300"
              }`}
            >
              {togglingId === integration.id ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : integration.enabled ? (
                <>
                  <ToggleRight size={18} className="text-success" />
                  <span className="text-sm font-medium text-success">Enabled</span>
                </>
              ) : (
                <>
                  <ToggleLeft size={18} className="text-base-content/60" />
                  <span className="text-sm font-medium text-base-content/60">Disabled</span>
                </>
              )}
            </button>
          ) : (
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                integration.enabled ? "bg-success/10" : "bg-base-200"
              }`}
            >
              {integration.enabled ? (
                <>
                  <ToggleRight size={18} className="text-success" />
                  <span className="text-sm font-medium text-success">Enabled</span>
                </>
              ) : (
                <>
                  <ToggleLeft size={18} className="text-base-content/60" />
                  <span className="text-sm font-medium text-base-content/60">Disabled</span>
                </>
              )}
            </span>
          )}
        </td>
        <td className="py-4 px-6">
          <div className="flex justify-end gap-2">
            <Link
              to={`/integrations/${integration.id}`}
              className="btn btn-sm bg-base-200 hover:bg-base-300 border-0 text-base-content"
            >
              View
            </Link>
            {canManage && (
              <>
                <Link
                  to={`/integrations/${integration.id}/edit`}
                  className="btn btn-sm btn-ghost text-base-content/70 hover:text-base-content"
                >
                  <Pencil size={16} />
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(integration.id, isGlobal)}
                  disabled={deletingId === integration.id}
                  className="btn btn-sm btn-ghost text-error hover:bg-error/10"
                >
                  {deletingId === integration.id ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-10">
      <PageHeader
        title="Integrations"
        description="Connect external services to automate workflows and streamline operations."
        action={
          <div className="flex gap-3">
            {isSuperadmin && (
              <Link to="/superadmin/import" className="btn btn-ghost gap-2 h-12">
                <Upload size={20} />
                Import YAML
              </Link>
            )}
            <Link to="/integrations/new" className="btn btn-primary gap-2 h-12">
              <Plus size={20} />
              Add Integration
            </Link>
          </div>
        }
      />

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {allIntegrations.length === 0 ? (
        <EmptyState
          icon={<Plus size={40} />}
          title="No integrations yet"
          description="Add your first integration to connect external services like Gmail or GitHub."
          action={
            <Link to="/integrations/new" className="btn btn-primary gap-2 h-12">
              <Plus size={20} />
              Add Integration
            </Link>
          }
        />
      ) : (
        <div className="card bg-base-100 border border-base-300 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-lg w-full">
              <thead>
                <tr className="border-b-2 border-neutral/20">
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Provider
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Name
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Configuration
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Status
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>{allIntegrations.map(renderIntegrationRow)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
