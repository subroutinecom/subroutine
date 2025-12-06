import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { createGraphqlClient } from "~/lib/graphql-client";
import type {
  IntegrationConfig,
  McpIntegrationConfig,
  AuthStrategy,
  McpTransport,
  OAuth2IntegrationConfig,
} from "~/types/integration";
import { useAdminConfig } from "~/hooks/use-admin-config";

export function meta() {
  return [
    { title: "Edit Integration - Subroutine" },
    { name: "description", content: "Edit integration configuration" },
  ];
}

const GET_INTEGRATION_QUERY = gql`
  query GetIntegrationForEdit($id: String!) {
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

const UPDATE_INTEGRATION_MUTATION = gql`
  mutation UpdateIntegration($id: String!, $name: String, $authConfig: String, $enabled: Boolean) {
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
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

interface ParsedIntegration extends Omit<IntegrationResponse, "authConfig"> {
  authConfig: IntegrationConfig;
}

type AuthStrategyType = "none" | "api_key" | "bearer_oauth" | "custom_headers";

type IntegrationFormData = {
  name: string;
  enabled: boolean;
  // OAuth2 fields
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
  // MCP fields
  serverUrl: string;
  transport: McpTransport;
  authStrategyType: AuthStrategyType;
  apiKey: string;
  apiKeyHeaderName: string;
  customHeaders: string;
};

export default function EditIntegrationPage() {
  const navigate = useNavigate();
  const config = useAdminConfig();
  const client = useMemo(() => createGraphqlClient(config), [config]);
  const params = useParams();
  const { activeOrganization } = useAuth();
  const integrationId = params.integrationId!;

  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<ParsedIntegration | null>(null);
  const [canManage, setCanManage] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<IntegrationFormData>({
    defaultValues: {
      name: "",
      enabled: true,
      // OAuth2 fields
      clientId: "",
      clientSecret: "",
      scopes: "",
      redirectUri: "",
      // MCP fields
      serverUrl: "",
      transport: "streamable-http",
      authStrategyType: "none",
      apiKey: "",
      apiKeyHeaderName: "",
      customHeaders: "",
    },
  });

  const watchedAuthStrategy = watch("authStrategyType");
  const isMcpIntegration = integration?.authConfig.type === "mcp";

  useEffect(() => {
    const fetchIntegration = async () => {
      try {
        setLoading(true);
        const data = await client.request<{
          integration: IntegrationResponse;
          isSuperadmin: boolean;
        }>(GET_INTEGRATION_QUERY, { id: integrationId });
        const parsed: ParsedIntegration = {
          ...data.integration,
          authConfig: JSON.parse(data.integration.authConfig) as IntegrationConfig,
        };
        setIntegration(parsed);

        // Check if user can manage this integration
        const isGlobal = parsed.visibility === "global";
        const userCanManage = !isGlobal || data.isSuperadmin;
        setCanManage(userCanManage);

        if (parsed.authConfig.type === "mcp") {
          // MCP integration
          const mcpConfig = parsed.authConfig as McpIntegrationConfig;
          reset({
            name: parsed.name,
            enabled: parsed.enabled,
            serverUrl: mcpConfig.serverUrl,
            transport: mcpConfig.transport,
            authStrategyType: mcpConfig.auth.strategy.type as AuthStrategyType,
            apiKey: "",
            apiKeyHeaderName:
              mcpConfig.auth.strategy.type === "api_key"
                ? mcpConfig.auth.strategy.headerName || ""
                : "",
            customHeaders:
              mcpConfig.auth.strategy.type === "custom_headers"
                ? JSON.stringify(mcpConfig.auth.strategy.headers, null, 2)
                : "",
            // Clear OAuth fields
            clientId: "",
            clientSecret: "",
            scopes: "",
            redirectUri: "",
          });
        } else {
          // OAuth2 integration
          const oauthConfig = parsed.authConfig as OAuth2IntegrationConfig;
          reset({
            name: parsed.name,
            enabled: parsed.enabled,
            clientId: oauthConfig.clientId,
            clientSecret: "",
            scopes: oauthConfig.scopes.join(", "),
            redirectUri: oauthConfig.redirectUri,
            // Clear MCP fields
            serverUrl: "",
            transport: "streamable-http",
            authStrategyType: "none",
            apiKey: "",
            apiKeyHeaderName: "",
            customHeaders: "",
          });
        }
      } catch (err) {
        setServerError(err instanceof Error ? err.message : "Failed to load integration");
      } finally {
        setLoading(false);
      }
    };

    fetchIntegration();
  }, [integrationId, reset]);

  const onSubmit = async (data: IntegrationFormData) => {
    setServerError(null);

    if (!integration) return;

    try {
      let authConfig: string;

      if (integration.authConfig.type === "mcp") {
        // Build MCP auth config
        if (!data.serverUrl.trim()) {
          setServerError("Server URL is required");
          return;
        }

        // Validate URL
        try {
          new URL(data.serverUrl.trim());
        } catch {
          setServerError("Invalid server URL");
          return;
        }

        // Build auth strategy based on type
        let authStrategy: AuthStrategy;
        switch (data.authStrategyType) {
          case "none":
            authStrategy = { type: "none" };
            break;
          case "api_key":
            authStrategy = {
              type: "api_key",
              ...(data.apiKeyHeaderName.trim() && { headerName: data.apiKeyHeaderName.trim() }),
            };
            break;
          case "bearer_oauth":
            authStrategy = { type: "bearer_oauth" };
            break;
          case "custom_headers":
            try {
              const headers = data.customHeaders.trim()
                ? JSON.parse(data.customHeaders.trim())
                : {};
              authStrategy = { type: "custom_headers", headers };
            } catch {
              setServerError("Custom headers must be valid JSON");
              return;
            }
            break;
          default:
            authStrategy = { type: "none" };
        }

        const mcpAuthConfig: Record<string, unknown> = {
          type: "mcp",
          serverUrl: data.serverUrl.trim(),
          transport: data.transport,
          authStrategy,
        };

        // Only include apiKey if it was provided (for rotation)
        if (data.authStrategyType === "api_key" && data.apiKey.trim()) {
          mcpAuthConfig.apiKey = data.apiKey.trim();
        }

        authConfig = JSON.stringify(mcpAuthConfig);
      } else {
        // Build OAuth2 auth config
        const scopeArray = data.scopes
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (scopeArray.length === 0) {
          setServerError("At least one scope is required");
          return;
        }

        const oauthConfig = integration.authConfig as OAuth2IntegrationConfig;
        const authConfigPayload: Record<string, unknown> = {
          type: "oauth2",
          clientId: data.clientId.trim(),
          scopes: scopeArray,
          authUrl: oauthConfig.authUrl,
          tokenUrl: oauthConfig.tokenUrl,
          redirectUri: data.redirectUri.trim(),
        };

        const secret = data.clientSecret.trim();
        if (secret) {
          authConfigPayload.clientSecret = secret;
        }

        authConfig = JSON.stringify(authConfigPayload);
      }

      await client.request<{
        updateIntegration: {
          id: string;
          name: string;
          enabled: boolean;
        };
      }>(UPDATE_INTEGRATION_MUTATION, {
        id: integrationId,
        name: data.name.trim(),
        enabled: data.enabled,
        authConfig,
      });

      navigate(`/integrations/${integrationId}`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to update integration");
    }
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

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Access Denied"
          subtitle={activeOrganization?.name}
          action={
            <Link to={`/integrations/${integrationId}`} className="btn btn-ghost">
              <ArrowLeft size={20} />
              Back
            </Link>
          }
        />
        <div className="alert alert-warning">
          <span>
            This is a global integration and can only be modified by superadmins. You can view the
            integration details but cannot edit them.
          </span>
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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {serverError && (
              <div className="alert alert-error">
                <span>{serverError}</span>
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
                {...register("name", { required: "Name is required" })}
                placeholder="e.g., Production Gmail"
                className="input input-bordered"
              />
              {errors.name && (
                <label className="label">
                  <span className="label-text-alt text-error">{errors.name.message}</span>
                </label>
              )}
            </div>

            {/* MCP-specific fields */}
            {isMcpIntegration && (
              <>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Server URL</span>
                  </label>
                  <input
                    type="url"
                    {...register("serverUrl")}
                    placeholder="https://example.com/mcp"
                    className="input input-bordered font-mono text-sm"
                  />
                  <label className="label">
                    <span className="label-text-alt">The URL of the MCP server endpoint</span>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Transport</span>
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        {...register("transport")}
                        value="streamable-http"
                        className="radio radio-primary"
                      />
                      <span>Streamable HTTP</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        {...register("transport")}
                        value="sse"
                        className="radio radio-primary"
                      />
                      <span>SSE (Server-Sent Events)</span>
                    </label>
                  </div>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Authentication</span>
                  </label>
                  <select
                    {...register("authStrategyType")}
                    className="select select-bordered w-full"
                  >
                    <option value="none">No Authentication</option>
                    <option value="api_key">API Key</option>
                    <option value="bearer_oauth">Bearer OAuth</option>
                    <option value="custom_headers">Custom Headers</option>
                  </select>
                </div>

                {watchedAuthStrategy === "api_key" && (
                  <>
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-medium">API Key</span>
                      </label>
                      <input
                        type="password"
                        {...register("apiKey")}
                        placeholder="Your API key"
                        className="input input-bordered font-mono text-sm"
                      />
                      <label className="label">
                        <span className="label-text-alt text-warning">
                          Provide a new key to rotate credentials. Leave blank to keep the current
                          key.
                        </span>
                      </label>
                    </div>

                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-medium">Header Name (Optional)</span>
                      </label>
                      <input
                        type="text"
                        {...register("apiKeyHeaderName")}
                        placeholder="Authorization (default)"
                        className="input input-bordered font-mono text-sm"
                      />
                      <label className="label">
                        <span className="label-text-alt">
                          Custom header name for API key. Defaults to Authorization with Bearer
                          prefix.
                        </span>
                      </label>
                    </div>
                  </>
                )}

                {watchedAuthStrategy === "bearer_oauth" && (
                  <div className="alert alert-info">
                    <span>
                      Bearer passthrough will use the viewer&apos;s OAuth access token to
                      authenticate with the MCP server. Users will need to connect their accounts
                      via OAuth.
                    </span>
                  </div>
                )}

                {watchedAuthStrategy === "custom_headers" && (
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium">Custom Headers (JSON)</span>
                    </label>
                    <textarea
                      {...register("customHeaders")}
                      placeholder='{"X-API-Key": "your-key", "X-Custom": "value"}'
                      className="textarea textarea-bordered font-mono text-sm h-24"
                    />
                    <label className="label">
                      <span className="label-text-alt">
                        JSON object of headers to include in MCP requests
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}

            {/* OAuth2-specific fields */}
            {!isMcpIntegration && (
              <>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Client ID</span>
                  </label>
                  <input
                    type="text"
                    {...register("clientId")}
                    placeholder="OAuth Client ID"
                    className="input input-bordered font-mono text-sm"
                  />
                  {errors.clientId && (
                    <label className="label">
                      <span className="label-text-alt text-error">{errors.clientId.message}</span>
                    </label>
                  )}
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Client Secret</span>
                  </label>
                  <input
                    type="password"
                    {...register("clientSecret")}
                    placeholder="OAuth Client Secret"
                    className="input input-bordered font-mono text-sm"
                  />
                  {errors.clientSecret && (
                    <label className="label">
                      <span className="label-text-alt text-error">
                        {errors.clientSecret.message}
                      </span>
                    </label>
                  )}
                  <label className="label">
                    <span className="label-text-alt text-warning">
                      Provide a new secret to rotate credentials. Leave blank to keep the current
                      secret.
                    </span>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium">Scopes</span>
                  </label>
                  <input
                    type="text"
                    {...register("scopes")}
                    placeholder="Comma-separated scopes"
                    className="input input-bordered font-mono text-sm"
                  />
                  {errors.scopes && (
                    <label className="label">
                      <span className="label-text-alt text-error">{errors.scopes.message}</span>
                    </label>
                  )}
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
                    {...register("redirectUri")}
                    placeholder="OAuth Redirect URI"
                    className="input input-bordered font-mono text-sm"
                  />
                  {errors.redirectUri && (
                    <label className="label">
                      <span className="label-text-alt text-error">
                        {errors.redirectUri.message}
                      </span>
                    </label>
                  )}
                  <label className="label">
                    <span className="label-text-alt">
                      The callback URL configured in your OAuth app
                    </span>
                  </label>
                </div>
              </>
            )}

            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-4">
                <input
                  type="checkbox"
                  {...register("enabled")}
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
              <Link to={`/integrations/${integrationId}`} className="btn btn-ghost">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? (
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
