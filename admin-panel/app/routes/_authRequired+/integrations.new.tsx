import { useState } from "react";
import { useNavigate } from "react-router";
import { IconArrowLeft, IconBrandGithub, IconMail } from "@tabler/icons-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";
import type { IntegrationProvider } from "~/types/integration";

export function meta() {
  return [
    { title: "New Integration - Subroutine" },
    { name: "description", content: "Create a new integration" },
  ];
}

const CREATE_INTEGRATION_MUTATION = gql`
  mutation CreateIntegration(
    $provider: String!
    $name: String!
    $authConfig: String!
  ) {
    createIntegration(provider: $provider, name: $name, authConfig: $authConfig) {
      id
      provider
      name
    }
  }
`;

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
}

const PROVIDER_CONFIGS: Record<IntegrationProvider, ProviderConfig> = {
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    defaultScopes: ["user", "repo"],
  },
};

export default function NewIntegrationPage() {
  const navigate = useNavigate();
  const { activeOrganization } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<IntegrationProvider>("gmail");
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState<string[]>(PROVIDER_CONFIGS.gmail.defaultScopes);
  const [redirectUri, setRedirectUri] = useState("http://localhost:3002/api/integrations/callback");

  const handleProviderChange = (newProvider: IntegrationProvider) => {
    setProvider(newProvider);
    setScopes(PROVIDER_CONFIGS[newProvider].defaultScopes);
  };

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

    try {
      setSubmitting(true);
      const config = PROVIDER_CONFIGS[provider];

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
        createIntegration: {
          id: string;
          provider: string;
          name: string;
        };
      }>(CREATE_INTEGRATION_MUTATION, {
        provider,
        name: name.trim(),
        authConfig,
      });

      navigate("/integrations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create integration");
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Integration"
        subtitle={activeOrganization?.name}
        action={
          <Link to="/integrations" className="btn btn-ghost">
            <IconArrowLeft size={20} />
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
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleProviderChange("gmail")}
                  className={`btn btn-outline h-auto flex-col gap-2 py-4 ${
                    provider === "gmail" ? "btn-primary" : ""
                  }`}
                >
                  <IconMail size={32} />
                  <span>Gmail</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange("github")}
                  className={`btn btn-outline h-auto flex-col gap-2 py-4 ${
                    provider === "github" ? "btn-primary" : ""
                  }`}
                >
                  <IconBrandGithub size={32} />
                  <span>GitHub</span>
                </button>
              </div>
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
              <label className="label">
                <span className="label-text-alt">
                  A descriptive name for this integration
                </span>
              </label>
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

            <div className="divider"></div>

            <div className="flex gap-3 justify-end">
              <Link to="/integrations" className="btn btn-ghost">
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
                    Creating...
                  </>
                ) : (
                  "Create Integration"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
