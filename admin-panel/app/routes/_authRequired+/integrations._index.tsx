import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import {
  Database,
  Github,
  Globe,
  Mail,
  Pencil,
  Plus,
  Server,
  Trash2,
  Upload,
} from "lucide-react";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { EmptyState } from "~/components/ui/EmptyState";
import { createGraphqlClient } from "~/lib/graphql-client";
import type { IntegrationConfig, McpIntegrationConfig, OAuth2IntegrationConfig, GraphQLIntegrationConfig, OpenAPIIntegrationConfig } from "~/types/integration";
import { useAdminConfig } from "~/hooks/use-admin-config";
import { useMemo } from "react";
import { fetchAdminConfig } from "~/lib/admin-config";

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
  authConfig: IntegrationConfig;
  isGlobal?: boolean;
}

export const clientLoader = async () => {
  const config = await fetchAdminConfig();
  const client = createGraphqlClient(config);
  const data = await client.request<{
    orgIntegrations: IntegrationResponse[];
    globalIntegrations: IntegrationResponse[];
    isSuperadmin: boolean;
  }>(INTEGRATIONS_QUERY);

  // Parse org-specific integrations (visibility filter already applied by backend)
  const integrations = data.orgIntegrations.map((integration) => ({
    ...integration,
    authConfig: JSON.parse(integration.authConfig) as IntegrationConfig,
    isGlobal: false,
  }));

  // Parse global integrations
  const globalIntegrations = data.globalIntegrations.map((integration) => ({
    ...integration,
    authConfig: JSON.parse(integration.authConfig) as IntegrationConfig,
    isGlobal: true,
  }));

  return { integrations, globalIntegrations, isSuperadmin: data.isSuperadmin };
};

// Protocol styling configuration
const PROTOCOL_CONFIG = {
  mcp: {
    icon: Server,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    label: "MCP",
  },
  graphql: {
    icon: Database,
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/20",
    label: "GraphQL",
  },
  openapi: {
    icon: Globe,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    label: "REST",
  },
  oauth2: {
    icon: Globe,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    label: "OAuth",
  },
} as const;

const getProtocolStyle = (authType: string) => {
  return PROTOCOL_CONFIG[authType as keyof typeof PROTOCOL_CONFIG] || PROTOCOL_CONFIG.openapi;
};

const getProviderIcon = (provider: string, authType?: string) => {
  // First check for specific provider icons
  switch (provider) {
    case "github":
      return <Github size={18} strokeWidth={1.5} />;
    case "gmail":
      return <Mail size={18} strokeWidth={1.5} />;
  }
  // Fall back to protocol-based icon
  const style = getProtocolStyle(authType || "openapi");
  const Icon = style.icon;
  return <Icon size={18} strokeWidth={1.5} />;
};

export default function IntegrationsPage() {
  const config = useAdminConfig();
  const client = useMemo(() => createGraphqlClient(config), [config]);
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
      await client.request<{ deleteIntegration: boolean }>(DELETE_INTEGRATION_MUTATION, {
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
      const data = await client.request<{
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

  // Helper to get endpoint/URL from config
  const getConfigUrl = (config: IntegrationConfig): string => {
    switch (config.type) {
      case "mcp":
        return (config as McpIntegrationConfig).serverUrl;
      case "graphql":
        return (config as GraphQLIntegrationConfig).endpoint;
      case "openapi":
        return (config as OpenAPIIntegrationConfig).baseUrl;
      case "oauth2":
        return (config as OAuth2IntegrationConfig).clientId;
      default:
        return "";
    }
  };

  // Helper to get auth strategy label
  const getAuthLabel = (config: IntegrationConfig): string => {
    if (config.type === "oauth2") return "OAuth 2.0";
    const auth = (config as McpIntegrationConfig | GraphQLIntegrationConfig | OpenAPIIntegrationConfig).auth;
    return auth.strategy.type.replace("_", " ");
  };

  const renderIntegrationRow = (integration: ParsedIntegration, index: number) => {
    const isGlobal = integration.isGlobal ?? false;
    const canManage = !isGlobal || isSuperadmin;
    const protocolStyle = getProtocolStyle(integration.authConfig.type);
    const configUrl = getConfigUrl(integration.authConfig);
    const authLabel = getAuthLabel(integration.authConfig);

    return (
      <tr
        key={integration.id}
        className="group border-b border-base-300/50 hover:bg-base-200/30 transition-all duration-200"
        style={{ animationDelay: `${index * 40}ms` }}
      >
        {/* Provider & Name - Combined for better visual hierarchy */}
        <td className="py-5 px-6">
          <div className="flex items-start gap-4">
            {/* Protocol-colored icon container */}
            <div className={`
              relative w-11 h-11 rounded-xl flex items-center justify-center
              ${protocolStyle.bg} ${protocolStyle.border} border
              transition-transform duration-200 group-hover:scale-105
            `}>
              <span className={protocolStyle.color}>
                {getProviderIcon(integration.provider, integration.authConfig.type)}
              </span>
              {/* Protocol indicator dot */}
              <span className={`
                absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-base-100
                ${integration.enabled ? "bg-emerald-400" : "bg-base-content/20"}
              `} />
            </div>

            <div className="flex flex-col min-w-0">
              {/* Provider name with protocol badge */}
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base-content capitalize tracking-tight">
                  {integration.provider}
                </span>
                <span className={`
                  text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                  ${protocolStyle.bg} ${protocolStyle.color}
                `}>
                  {protocolStyle.label}
                </span>
                {isGlobal && (
                  <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-info/10 text-info">
                    Global
                  </span>
                )}
              </div>

              {/* Integration name */}
              <span className="text-sm text-base-content/70 mt-0.5 truncate max-w-[200px]">
                {integration.name}
              </span>
            </div>
          </div>
        </td>

        {/* Configuration - Refined monospace display */}
        <td className="py-5 px-6">
          <div className="flex flex-col gap-2">
            {/* URL in monospace with subtle background */}
            <div className="flex items-center gap-2 max-w-sm">
              <code className={`
                text-[11px] font-mono px-2.5 py-1.5 rounded-md truncate
                bg-base-200/70 text-base-content/60 border border-base-300/50
                ${protocolStyle.border}
              `}>
                {configUrl}
              </code>
            </div>

            {/* Auth strategy badge */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-base-content/40">
                Auth:
              </span>
              <span className="text-[11px] font-medium text-base-content/60 capitalize">
                {authLabel}
              </span>
            </div>
          </div>
        </td>

        {/* Status - Cleaner toggle */}
        <td className="py-5 px-6">
          {canManage ? (
            <button
              type="button"
              onClick={() => handleToggleEnabled(integration.id, integration.enabled, isGlobal)}
              disabled={togglingId === integration.id}
              className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200
                ${integration.enabled
                  ? "bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20"
                  : "bg-base-200/50 hover:bg-base-200 border border-base-300/50"
                }
              `}
            >
              {togglingId === integration.id ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : integration.enabled ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                    Active
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-base-content/30" />
                  <span className="text-xs font-medium text-base-content/40 uppercase tracking-wide">
                    Inactive
                  </span>
                </>
              )}
            </button>
          ) : (
            <span className={`
              inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
              ${integration.enabled
                ? "bg-emerald-500/10 border border-emerald-500/20"
                : "bg-base-200/50 border border-base-300/50"
              }
            `}>
              {integration.enabled ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                    Active
                  </span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-base-content/30" />
                  <span className="text-xs font-medium text-base-content/40 uppercase tracking-wide">
                    Inactive
                  </span>
                </>
              )}
            </span>
          )}
        </td>

        {/* Actions - Refined buttons */}
        <td className="py-5 px-6">
          <div className="flex justify-end items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <Link
              to={`/integrations/${integration.id}`}
              className="px-3 py-1.5 text-xs font-medium text-base-content/70 hover:text-base-content hover:bg-base-200/70 rounded-lg transition-colors"
            >
              View
            </Link>
            {canManage && (
              <>
                <Link
                  to={`/integrations/${integration.id}/edit`}
                  className="p-2 text-base-content/50 hover:text-base-content hover:bg-base-200/70 rounded-lg transition-colors"
                >
                  <Pencil size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(integration.id, isGlobal)}
                  disabled={deletingId === integration.id}
                  className="p-2 text-base-content/50 hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                >
                  {deletingId === integration.id ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <Trash2 size={14} />
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
        <div className="card bg-base-100 border border-base-300/70 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr className="border-b border-base-300/70 bg-base-200/30">
                  <th className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 py-4 px-6">
                    Integration
                  </th>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 py-4 px-6">
                    Endpoint
                  </th>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 py-4 px-6">
                    Status
                  </th>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-base-content/40 py-4 px-6 text-right">
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
