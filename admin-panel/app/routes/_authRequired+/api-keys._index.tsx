import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { gql } from "graphql-request";
import { graphqlClient } from "~/lib/graphql-client";
import { PageHeader } from "~/components/ui/PageHeader";
import { EmptyState } from "~/components/ui/EmptyState";
import { Key, Plus, Copy, Trash2, CheckCircle2 } from "lucide-react";

const API_KEYS_QUERY = gql`
  query GetApiKeys {
    apiKeys {
      id
      name
      start
      prefix
      enabled
      expiresAt
      createdAt
      updatedAt
    }
  }
`;

const DELETE_API_KEY_MUTATION = gql`
  mutation DeleteApiKey($id: String!) {
    deleteApiKey(id: $id)
  }
`;

interface ApiKey {
  id: string;
  name?: string | null;
  start?: string | null;
  prefix?: string | null;
  enabled?: boolean | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const clientLoader = async () => {
  const data = await graphqlClient.request<{
    apiKeys: ApiKey[];
  }>(API_KEYS_QUERY);
  return { apiKeys: data.apiKeys || [] };
};

export default function ApiKeysPage() {
  const { apiKeys: initialApiKeys } = useLoaderData<typeof clientLoader>();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(initialApiKeys);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleDelete = async (id: string, name?: string | null) => {
    const displayName = name || "this API key";
    if (
      !confirm(`Are you sure you want to delete ${displayName}? This action cannot be undone.`)
    ) {
      return;
    }

    try {
      setDeletingId(id);
      setError(null);

      await graphqlClient.request(DELETE_API_KEY_MUTATION, { id });

      setApiKeys((prev) => prev.filter((key) => key.id !== id));
    } catch (err) {
      console.error("Failed to delete API key:", err);
      setError(
        err instanceof Error ? err.message : "Failed to delete API key"
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async (keyStart: string, id: string) => {
    try {
      await navigator.clipboard.writeText(keyStart);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <PageHeader
        title="API Keys"
        description="Manage API keys for secure programmatic access to your integrations and workflows."
        action={
          <Link to="/api-keys/new" className="btn btn-primary gap-2">
            <Plus size={18} />
            Create API Key
          </Link>
        }
      />

      {error && (
        <div className="alert alert-error mt-6">
          <span>{error}</span>
        </div>
      )}

      {apiKeys.length === 0 ? (
        <EmptyState
          icon={<Key size={48} />}
          title="No API Keys"
          description="Create your first API key to enable programmatic access to your workflows and integrations."
          action={
            <Link to="/api-keys/new" className="btn btn-primary gap-2">
              <Plus size={18} />
              Create API Key
            </Link>
          }
        />
      ) : (
        <div className="card bg-base-100 border border-base-300 overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="table table-lg w-full">
              <thead>
                <tr className="border-b-2 border-neutral/20">
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Name
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Key
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Status
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Created
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6">
                    Expires
                  </th>
                  <th className="text-xs font-semibold uppercase tracking-wider text-base-content/60 py-4 px-6 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((apiKey) => (
                  <tr
                    key={apiKey.id}
                    className="border-b border-base-300 hover:bg-base-200/50"
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <Key size={16} className="text-base-content/60" />
                        <span className="font-medium">
                          {apiKey.name || "Unnamed Key"}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <code className="bg-base-200 px-2 py-1 rounded text-sm font-mono">
                          {apiKey.start || "********"}...
                        </code>
                        {apiKey.start && (
                          <button
                            type="button"
                            onClick={() => handleCopy(apiKey.start!, apiKey.id)}
                            className="btn btn-ghost btn-xs"
                            title="Copy key prefix"
                          >
                            {copiedId === apiKey.id ? (
                              <CheckCircle2
                                size={14}
                                className="text-success"
                              />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {isExpired(apiKey.expiresAt) ? (
                        <span className="badge badge-error badge-sm">
                          Expired
                        </span>
                      ) : apiKey.enabled === false ? (
                        <span className="badge badge-warning badge-sm">
                          Disabled
                        </span>
                      ) : (
                        <span className="badge badge-success badge-sm">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-base-content/70 text-sm">
                      {formatDate(apiKey.createdAt)}
                    </td>
                    <td className="py-4 px-6 text-base-content/70 text-sm">
                      {apiKey.expiresAt ? (
                        <span
                          className={
                            isExpired(apiKey.expiresAt) ? "text-error" : ""
                          }
                        >
                          {formatDate(apiKey.expiresAt)}
                        </span>
                      ) : (
                        <span className="text-base-content/40">Never</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => handleDelete(apiKey.id, apiKey.name)}
                          disabled={deletingId === apiKey.id}
                          className="btn btn-sm btn-ghost text-error hover:bg-error/10 gap-1"
                        >
                          {deletingId === apiKey.id ? (
                            <span className="loading loading-spinner loading-xs"></span>
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Delete
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

      <div className="mt-6 p-4 bg-base-200 rounded-lg">
        <p className="text-sm text-base-content/70">
          <strong>Note:</strong> Keep your API keys secure. The full key is only shown once during creation.
          After that, only the prefix is visible for identification purposes.
        </p>
      </div>
    </div>
  );
}
