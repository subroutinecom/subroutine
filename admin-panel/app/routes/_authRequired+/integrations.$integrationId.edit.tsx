import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";
import type { IntegrationProvider, IntegrationAuthConfig } from "~/types/integration";

export function meta() {
  return [
    { title: "Edit Integration - Subroutine" },
    { name: "description", content: "Edit integration configuration" },
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

const UPDATE_INTEGRATION_MUTATION = gql`
  mutation UpdateIntegration(
    $id: String!
    $name: String
    $authConfig: String
    $enabled: Boolean
  ) {
    updateIntegration(id: $id, name: $name, authConfig: $authConfig, enabled: $enabled) {
      id
      name
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

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
}

const PROVIDER_CONFIGS: Record<IntegrationProvider, ProviderConfig> = {
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
  },
};

export default function EditIntegrationPage() {
  const navigate = useNavigate();
  const params = useParams();
  const { activeOrganization } = useAuth();
  const integrationId = params.integrationId!;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<ParsedIntegration | null>(null);

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [redirectUri, setRedirectUri] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const fetchIntegration = async () => {
      try {
        setLoading(true);
        const data = await graphqlClient.request<{ integration: IntegrationResponse }>(
          GET_INTEGRATION_QUERY,
          { id: integrationId }
        );
        const parsed: ParsedIntegration = {
          ...data.integration,
          authConfig: JSON.parse(data.integration.authConfig) as IntegrationAuthConfig,
        };
        setIntegration(parsed);
        setName(parsed.name);
        setClientId(parsed.authConfig.clientId);
        setClientSecret(parsed.authConfig.clientSecret);
        setScopes(parsed.authConfig.scopes);
        setRedirectUri(parsed.authConfig.redirectUri);
        setEnabled(parsed.enabled);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load integration");
      } finally {
        setLoading(false);
      }
    };

    fetchIntegration();
  }, [integrationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!clientId.trim()) {
      setError("Client ID is required");
      return;
    }

    if (!clientSecret.trim()) {
      setError("Client Secret is required");
      return;
    }

    if (scopes.length === 0) {
      setError("At least one scope is required");
      return;
    }

    if (!integration) return;

    try {
      setSubmitting(true);
      const config = PROVIDER_CONFIGS[integration.provider as IntegrationProvider];

      const authConfig = JSON.stringify({
        type: "oauth2",
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        scopes,
        authUrl: config.authUrl,
        tokenUrl: config.tokenUrl,
        redirectUri: redirectUri.trim(),
      });

      await graphqlClient.request<{
        updateIntegration: {
          id: string;
          name: string;
          enabled: boolean;
        };
      }>(UPDATE_INTEGRATION_MUTATION, {
        id: integrationId,
        name: name.trim(),
        enabled,
        authConfig,
      });

      navigate(`/integrations/${integrationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update integration");
      setSubmitting(false);
    }
  };

  const handleScopesChange = (value: string) => {
    const scopeArray = value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setScopes(scopeArray);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!integration) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integration Not Found" subtitle={activeOrganization?.name} />
        <div className="alert alert-error">
          <span>Integration not found</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Integration"
        subtitle={activeOrganization?.name}
        action={
          <Link to={`/integrations/${integrationId}`} className="btn btn-ghost">
            <ArrowLeft size={20} />
            Back
          </Link>
        }
      />

      <div className="card bg-base-100 shadow-sm border border-base-300 max-w-2xl">
        <div className="card-body">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Provider</span>
              </label>
              <div className="badge badge-lg capitalize">{integration.provider}</div>
              <label className="label">
                <span className="label-text-alt">Provider cannot be changed</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Name</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Production Gmail"
                className="input input-bordered"
                required
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Client ID</span>
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="OAuth Client ID"
                className="input input-bordered font-mono text-sm"
                required
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Client Secret</span>
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="OAuth Client Secret"
                className="input input-bordered font-mono text-sm"
                required
              />
              <label className="label">
                <span className="label-text-alt text-warning">
                  This will be stored encrypted
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Scopes</span>
              </label>
              <input
                type="text"
                value={scopes.join(", ")}
                onChange={(e) => handleScopesChange(e.target.value)}
                placeholder="Comma-separated scopes"
                className="input input-bordered font-mono text-sm"
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  OAuth scopes required for this integration (comma-separated)
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Redirect URI</span>
              </label>
              <input
                type="url"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                placeholder="OAuth Redirect URI"
                className="input input-bordered font-mono text-sm"
                required
              />
              <label className="label">
                <span className="label-text-alt">
                  The callback URL configured in your OAuth app
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-4">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="checkbox checkbox-primary"
                />
                <div>
                  <span className="label-text font-medium">Enabled</span>
                  <p className="label-text-alt">
                    Disable to prevent new connections without deleting the integration
                  </p>
                </div>
              </label>
            </div>

            <div className="divider"></div>

            <div className="flex gap-3 justify-end">
              <Link
                to={`/integrations/${integrationId}`}
                className="btn btn-ghost"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
