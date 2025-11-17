import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  IconPlus,
  IconBrandGithub,
  IconMail,
  IconPencil,
  IconTrash,
  IconToggleLeft,
  IconToggleRight,
} from "@tabler/icons-react";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { EmptyState } from "~/components/ui/EmptyState";
import { graphqlClient } from "~/lib/graphql-client";
import type { IntegrationAuthConfig } from "~/types/integration";

export function meta() {
  return [
    { title: "Integrations - Subroutine" },
    { name: "description", content: "Manage your organization's integrations" },
  ];
}

const INTEGRATIONS_QUERY = gql`
  query GetIntegrations {
    integrations {
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
  authConfig: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ParsedIntegration extends Omit<IntegrationResponse, "authConfig"> {
  authConfig: IntegrationAuthConfig;
}

const getProviderIcon = (provider: string) => {
  switch (provider) {
    case "github":
      return <IconBrandGithub size={20} />;
    case "gmail":
      return <IconMail size={20} />;
    default:
      return null;
  }
};

export default function IntegrationsPage() {
  const { activeOrganization: _activeOrganization } = useAuth();
  const [integrations, setIntegrations] = useState<ParsedIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await graphqlClient.request<{
        integrations: IntegrationResponse[];
      }>(INTEGRATIONS_QUERY);
      const parsed = data.integrations.map((integration) => ({
        ...integration,
        authConfig: JSON.parse(integration.authConfig) as IntegrationAuthConfig,
      }));
      setIntegrations(parsed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load integrations",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this integration? This will also remove all connected accounts.",
      )
    ) {
      return;
    }

    try {
      setDeletingId(id);
      await graphqlClient.request<{ deleteIntegration: boolean }>(
        DELETE_INTEGRATION_MUTATION,
        { id },
      );
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete integration",
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      setTogglingId(id);
      const data = await graphqlClient.request<{
        updateIntegration: IntegrationResponse;
      }>(UPDATE_INTEGRATION_MUTATION, { id, enabled: !currentEnabled });
      setIntegrations((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, enabled: data.updateIntegration.enabled } : i,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to toggle integration",
      );
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Integrations"
        description="Connect external services to automate workflows and streamline operations."
        action={
          <Link to="/integrations/new" className="btn btn-primary gap-2 h-12">
            <IconPlus size={20} />
            Add Integration
          </Link>
        }
      />

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {integrations.length === 0 ? (
        <EmptyState
          icon={<IconPlus size={40} />}
          title="No integrations yet"
          description="Add your first integration to connect external services like Gmail or GitHub."
          action={
            <Link to="/integrations/new" className="btn btn-primary gap-2 h-12">
              <IconPlus size={20} />
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
                    Client ID
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Scopes
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Status
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((integration, index) => (
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
                        <span className="font-medium text-base-content capitalize">
                          {integration.provider}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-base-content font-medium">
                        {integration.name}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <code className="text-xs font-mono bg-base-200 px-3 py-1.5 rounded-md text-base-content/70">
                        {integration.authConfig.clientId}
                      </code>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex gap-1.5 flex-wrap max-w-xs">
                        {integration.authConfig.scopes
                          .slice(0, 3)
                          .map((scope) => (
                            <span
                              key={scope}
                              className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-base-200 text-base-content/70 border border-base-300"
                            >
                              {scope}
                            </span>
                          ))}
                        {integration.authConfig.scopes.length > 3 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-base-200 text-base-content/60 border border-base-300">
                            +{integration.authConfig.scopes.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleEnabled(
                            integration.id,
                            integration.enabled,
                          )
                        }
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
                            <IconToggleRight
                              size={18}
                              className="text-success"
                            />
                            <span className="text-sm font-medium text-success">
                              Enabled
                            </span>
                          </>
                        ) : (
                          <>
                            <IconToggleLeft
                              size={18}
                              className="text-base-content/60"
                            />
                            <span className="text-sm font-medium text-base-content/60">
                              Disabled
                            </span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/integrations/${integration.id}`}
                          className="btn btn-sm bg-base-200 hover:bg-base-300 border-0 text-base-content"
                        >
                          View
                        </Link>
                        <Link
                          to={`/integrations/${integration.id}/edit`}
                          className="btn btn-sm btn-ghost text-base-content/70 hover:text-base-content"
                        >
                          <IconPencil size={16} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(integration.id)}
                          disabled={deletingId === integration.id}
                          className="btn btn-sm btn-ghost text-error hover:bg-error/10"
                        >
                          {deletingId === integration.id ? (
                            <span className="loading loading-spinner loading-xs"></span>
                          ) : (
                            <IconTrash size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
