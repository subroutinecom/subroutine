import { useState, useEffect } from "react";
import { Link } from "react-router";
import { IconPlus, IconBrandGithub, IconMail, IconPencil, IconTrash, IconToggleLeft, IconToggleRight } from "@tabler/icons-react";
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
  const { activeOrganization } = useAuth();
  const [integrations, setIntegrations] = useState<ParsedIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await graphqlClient.request<{ integrations: IntegrationResponse[] }>(INTEGRATIONS_QUERY);
      const parsed = data.integrations.map((integration) => ({
        ...integration,
        authConfig: JSON.parse(integration.authConfig) as IntegrationAuthConfig,
      }));
      setIntegrations(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this integration? This will also remove all connected accounts.")) {
      return;
    }

    try {
      setDeletingId(id);
      await graphqlClient.request<{ deleteIntegration: boolean }>(DELETE_INTEGRATION_MUTATION, { id });
      setIntegrations((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete integration");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      setTogglingId(id);
      const data = await graphqlClient.request<{ updateIntegration: IntegrationResponse }>(
        UPDATE_INTEGRATION_MUTATION,
        { id, enabled: !currentEnabled }
      );
      setIntegrations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, enabled: data.updateIntegration.enabled } : i))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle integration");
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        subtitle={activeOrganization?.name}
        action={
          <Link to="/integrations/new" className="btn btn-primary">
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
          icon={<IconPlus size={32} />}
          title="No integrations yet"
          description="Add your first integration to connect external services like Gmail or GitHub."
          action={
            <Link to="/integrations/new" className="btn btn-primary">
              <IconPlus size={20} />
              Add Integration
            </Link>
          }
        />
      ) : (
        <div className="card bg-base-100 shadow-sm border border-base-300">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Name</th>
                  <th>Client ID</th>
                  <th>Scopes</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((integration) => (
                  <tr key={integration.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        {getProviderIcon(integration.provider)}
                        <span className="font-medium capitalize">{integration.provider}</span>
                      </div>
                    </td>
                    <td>{integration.name}</td>
                    <td>
                      <code className="text-xs bg-base-200 px-2 py-1 rounded">
                        {integration.authConfig.clientId}
                      </code>
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap max-w-xs">
                        {integration.authConfig.scopes.slice(0, 3).map((scope) => (
                          <span key={scope} className="badge badge-sm badge-ghost">
                            {scope}
                          </span>
                        ))}
                        {integration.authConfig.scopes.length > 3 && (
                          <span className="badge badge-sm badge-ghost">
                            +{integration.authConfig.scopes.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(integration.id, integration.enabled)}
                        disabled={togglingId === integration.id}
                        className="btn btn-ghost btn-sm gap-2"
                      >
                        {togglingId === integration.id ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : integration.enabled ? (
                          <>
                            <IconToggleRight size={18} className="text-success" />
                            <span className="text-success">Enabled</span>
                          </>
                        ) : (
                          <>
                            <IconToggleLeft size={18} className="text-base-content/50" />
                            <span className="text-base-content/50">Disabled</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/integrations/${integration.id}`}
                          className="btn btn-ghost btn-sm"
                        >
                          View
                        </Link>
                        <Link
                          to={`/integrations/${integration.id}/edit`}
                          className="btn btn-ghost btn-sm"
                        >
                          <IconPencil size={16} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(integration.id)}
                          disabled={deletingId === integration.id}
                          className="btn btn-ghost btn-sm text-error"
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
