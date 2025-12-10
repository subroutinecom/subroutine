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
  GraphQLIntegrationConfig,
  OpenAPIIntegrationConfig,
  AuthStrategy,
  McpTransport,
  OAuth2IntegrationConfig,
} from "~/types/integration";
import { useAdminConfig } from "~/hooks/use-admin-config";
import { AuthStrategySelector, AuthFields, type AuthStrategyType } from "~/components/integrations";

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

type EditFormData = {
  name: string;
  enabled: boolean;
  // MCP fields
  serverUrl: string;
  transport: McpTransport;
  // GraphQL fields
  endpoint: string;
  // OpenAPI fields
  baseUrl: string;
  specUrl: string;
  // Auth strategy
  authStrategy: AuthStrategyType;
  apiKey: string;
  apiKeyHeaderName: string;
  apiKeyIsViewerScoped: boolean;
  customHeaders: string;
  // OAuth fields
  oauthClientId: string;
  oauthClientSecret: string;
  oauthScopes: string;
  oauthRedirectUri: string;
  oauthAuthUrl: string;
  oauthTokenUrl: string;
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
  } = useForm<EditFormData>({
    defaultValues: {
      name: "",
      enabled: true,
      serverUrl: "",
      transport: "sse",
      endpoint: "",
      baseUrl: "",
      specUrl: "",
      authStrategy: "none",
      apiKey: "",
      apiKeyHeaderName: "X-API-Key",
      apiKeyIsViewerScoped: false,
      customHeaders: "{}",
      oauthClientId: "",
      oauthClientSecret: "",
      oauthScopes: "",
      oauthRedirectUri: "",
      oauthAuthUrl: "",
      oauthTokenUrl: "",
    },
  });

  const watchedAuthStrategy = watch("authStrategy");
  const watchedApiKeyIsViewerScoped = watch("apiKeyIsViewerScoped");
  const isMcpIntegration = integration?.authConfig.type === "mcp";
  const isGraphQLIntegration = integration?.authConfig.type === "graphql";
  const isOpenAPIIntegration = integration?.authConfig.type === "openapi";
  const isOAuthIntegration = integration?.authConfig.type === "oauth2";

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
          const mcpConfig = parsed.authConfig as McpIntegrationConfig;
          reset({
            name: parsed.name,
            enabled: parsed.enabled,
            serverUrl: mcpConfig.serverUrl,
            transport: mcpConfig.transport,
            endpoint: "",
            baseUrl: "",
            specUrl: "",
            authStrategy: mcpConfig.auth.strategy.type as AuthStrategyType,
            apiKey: "",
            apiKeyHeaderName:
              mcpConfig.auth.strategy.type === "api_key"
                ? mcpConfig.auth.strategy.headerName || "X-API-Key"
                : "X-API-Key",
            apiKeyIsViewerScoped:
              mcpConfig.auth.strategy.type === "api_key"
                ? mcpConfig.auth.strategy.viewerScoped || false
                : false,
            customHeaders:
              mcpConfig.auth.strategy.type === "custom_headers"
                ? JSON.stringify(mcpConfig.auth.strategy.headers, null, 2)
                : "{}",
            oauthClientId: mcpConfig.auth.oauthConfig?.clientId || "",
            oauthClientSecret: "",
            oauthScopes: mcpConfig.auth.oauthConfig?.scopes?.join(" ") || "",
            oauthRedirectUri: mcpConfig.auth.oauthConfig?.redirectUri || "",
            oauthAuthUrl: mcpConfig.auth.oauthConfig?.authUrl || "",
            oauthTokenUrl: mcpConfig.auth.oauthConfig?.tokenUrl || "",
          });
        } else if (parsed.authConfig.type === "graphql") {
          const graphqlConfig = parsed.authConfig as GraphQLIntegrationConfig;
          reset({
            name: parsed.name,
            enabled: parsed.enabled,
            serverUrl: "",
            transport: "sse",
            endpoint: graphqlConfig.endpoint,
            baseUrl: "",
            specUrl: "",
            authStrategy: graphqlConfig.auth.strategy.type as AuthStrategyType,
            apiKey: "",
            apiKeyHeaderName:
              graphqlConfig.auth.strategy.type === "api_key"
                ? graphqlConfig.auth.strategy.headerName || "X-API-Key"
                : "X-API-Key",
            apiKeyIsViewerScoped:
              graphqlConfig.auth.strategy.type === "api_key"
                ? graphqlConfig.auth.strategy.viewerScoped || false
                : false,
            customHeaders:
              graphqlConfig.auth.strategy.type === "custom_headers"
                ? JSON.stringify(graphqlConfig.auth.strategy.headers, null, 2)
                : "{}",
            oauthClientId: graphqlConfig.auth.oauthConfig?.clientId || "",
            oauthClientSecret: "",
            oauthScopes: graphqlConfig.auth.oauthConfig?.scopes?.join(" ") || "",
            oauthRedirectUri: graphqlConfig.auth.oauthConfig?.redirectUri || "",
            oauthAuthUrl: graphqlConfig.auth.oauthConfig?.authUrl || "",
            oauthTokenUrl: graphqlConfig.auth.oauthConfig?.tokenUrl || "",
          });
        } else if (parsed.authConfig.type === "openapi") {
          const openapiConfig = parsed.authConfig as OpenAPIIntegrationConfig;
          reset({
            name: parsed.name,
            enabled: parsed.enabled,
            serverUrl: "",
            transport: "sse",
            endpoint: "",
            baseUrl: openapiConfig.baseUrl,
            specUrl: openapiConfig.specUrl || "",
            authStrategy: openapiConfig.auth.strategy.type as AuthStrategyType,
            apiKey: "",
            apiKeyHeaderName:
              openapiConfig.auth.strategy.type === "api_key"
                ? openapiConfig.auth.strategy.headerName || "X-API-Key"
                : "X-API-Key",
            apiKeyIsViewerScoped:
              openapiConfig.auth.strategy.type === "api_key"
                ? openapiConfig.auth.strategy.viewerScoped || false
                : false,
            customHeaders:
              openapiConfig.auth.strategy.type === "custom_headers"
                ? JSON.stringify(openapiConfig.auth.strategy.headers, null, 2)
                : "{}",
            oauthClientId: openapiConfig.auth.oauthConfig?.clientId || "",
            oauthClientSecret: "",
            oauthScopes: openapiConfig.auth.oauthConfig?.scopes?.join(" ") || "",
            oauthRedirectUri: openapiConfig.auth.oauthConfig?.redirectUri || "",
            oauthAuthUrl: openapiConfig.auth.oauthConfig?.authUrl || "",
            oauthTokenUrl: openapiConfig.auth.oauthConfig?.tokenUrl || "",
          });
        } else {
          const oauthConfig = parsed.authConfig as OAuth2IntegrationConfig;
          reset({
            name: parsed.name,
            enabled: parsed.enabled,
            serverUrl: "",
            transport: "sse",
            endpoint: "",
            baseUrl: "",
            specUrl: "",
            authStrategy: "bearer_oauth",
            apiKey: "",
            apiKeyHeaderName: "X-API-Key",
            apiKeyIsViewerScoped: false,
            customHeaders: "{}",
            oauthClientId: oauthConfig.clientId,
            oauthClientSecret: "",
            oauthScopes: oauthConfig.scopes.join(" "),
            oauthRedirectUri: oauthConfig.redirectUri,
            oauthAuthUrl: oauthConfig.authUrl,
            oauthTokenUrl: oauthConfig.tokenUrl,
          });
        }
      } catch (err) {
        setServerError(err instanceof Error ? err.message : "Failed to load integration");
      } finally {
        setLoading(false);
      }
    };

    fetchIntegration();
  }, [integrationId, reset, client]);

  const onSubmit = async (data: EditFormData) => {
    setServerError(null);

    if (!integration) return;

    try {
      let authConfig: string;

      if (integration.authConfig.type === "mcp") {
        if (!data.serverUrl.trim()) {
          setServerError("Server URL is required");
          return;
        }

        try {
          new URL(data.serverUrl.trim());
        } catch {
          setServerError("Invalid server URL");
          return;
        }

        const authStrategy = buildAuthStrategy(data);
        const mcpAuthConfig: McpIntegrationConfig = {
          type: "mcp",
          serverUrl: data.serverUrl.trim(),
          transport: data.transport,
          auth: {
            strategy: authStrategy,
            ...(data.authStrategy === "api_key" && !data.apiKeyIsViewerScoped && data.apiKey.trim()
              ? { apiKey: data.apiKey.trim() }
              : {}),
            ...(data.authStrategy === "bearer_oauth" && data.oauthClientId.trim()
              ? {
                  oauthConfig: {
                    clientId: data.oauthClientId.trim(),
                    clientSecret: data.oauthClientSecret.trim() || "",
                    authUrl: data.oauthAuthUrl.trim(),
                    tokenUrl: data.oauthTokenUrl.trim(),
                    redirectUri: data.oauthRedirectUri.trim(),
                    scopes: data.oauthScopes.split(/[\s,]+/).filter(Boolean),
                  },
                }
              : {}),
          },
        };

        authConfig = JSON.stringify(mcpAuthConfig);
      } else if (integration.authConfig.type === "graphql") {
        if (!data.endpoint.trim()) {
          setServerError("GraphQL endpoint is required");
          return;
        }

        const authStrategy = buildAuthStrategy(data);
        const graphqlAuthConfig: GraphQLIntegrationConfig = {
          type: "graphql",
          endpoint: data.endpoint.trim(),
          auth: {
            strategy: authStrategy,
            ...(data.authStrategy === "api_key" && !data.apiKeyIsViewerScoped && data.apiKey.trim()
              ? { apiKey: data.apiKey.trim() }
              : {}),
            ...(data.authStrategy === "bearer_oauth" && data.oauthClientId.trim()
              ? {
                  oauthConfig: {
                    clientId: data.oauthClientId.trim(),
                    clientSecret: data.oauthClientSecret.trim() || "",
                    authUrl: data.oauthAuthUrl.trim(),
                    tokenUrl: data.oauthTokenUrl.trim(),
                    redirectUri: data.oauthRedirectUri.trim(),
                    scopes: data.oauthScopes.split(/[\s,]+/).filter(Boolean),
                  },
                }
              : {}),
          },
        };

        authConfig = JSON.stringify(graphqlAuthConfig);
      } else if (integration.authConfig.type === "openapi") {
        if (!data.baseUrl.trim()) {
          setServerError("Base URL is required");
          return;
        }

        const authStrategy = buildAuthStrategy(data);
        const openapiAuthConfig: OpenAPIIntegrationConfig = {
          type: "openapi",
          baseUrl: data.baseUrl.trim(),
          ...(data.specUrl.trim() ? { specUrl: data.specUrl.trim() } : {}),
          auth: {
            strategy: authStrategy,
            ...(data.authStrategy === "api_key" && !data.apiKeyIsViewerScoped && data.apiKey.trim()
              ? { apiKey: data.apiKey.trim() }
              : {}),
            ...(data.authStrategy === "bearer_oauth" && data.oauthClientId.trim()
              ? {
                  oauthConfig: {
                    clientId: data.oauthClientId.trim(),
                    clientSecret: data.oauthClientSecret.trim() || "",
                    authUrl: data.oauthAuthUrl.trim(),
                    tokenUrl: data.oauthTokenUrl.trim(),
                    redirectUri: data.oauthRedirectUri.trim(),
                    scopes: data.oauthScopes.split(/[\s,]+/).filter(Boolean),
                  },
                }
              : {}),
          },
        };

        authConfig = JSON.stringify(openapiAuthConfig);
      } else {
        const oauthConfig = integration.authConfig as OAuth2IntegrationConfig;
        const authConfigPayload: Record<string, unknown> = {
          type: "oauth2",
          clientId: data.oauthClientId.trim(),
          scopes: data.oauthScopes.split(/[\s,]+/).filter(Boolean),
          authUrl: oauthConfig.authUrl,
          tokenUrl: oauthConfig.tokenUrl,
          redirectUri: data.oauthRedirectUri.trim(),
        };

        const secret = data.oauthClientSecret.trim();
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
            This is a global integration and can only be modified by superadmins.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Edit Integration"
        description={`Editing ${integration.name}`}
        action={
          <Link to={`/integrations/${integrationId}`} className="btn btn-ghost gap-2 h-12">
            <ArrowLeft size={20} />
            Back
          </Link>
        }
      />

      <div className="card bg-base-100 border border-base-300 max-w-4xl">
        <form onSubmit={handleSubmit(onSubmit)} className="card-body p-10 space-y-10">
          {serverError && (
            <div className="alert alert-error">
              <span>{serverError}</span>
            </div>
          )}

          {/* Provider badge */}
          <div className="space-y-3">
            <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
              Provider
            </span>
            <div className="badge badge-lg badge-outline capitalize">{integration.provider}</div>
            <p className="text-sm text-base-content/60">Provider cannot be changed</p>
          </div>

          {/* Name */}
          <div className="space-y-3">
            <label htmlFor="name" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Name
              </span>
            </label>
            <input
              id="name"
              type="text"
              {...register("name", {
                required: "Name is required",
                pattern: {
                  value: /^[a-z0-9_-]+$/,
                  message: "Name can only contain lowercase letters, numbers, hyphens, and underscores",
                },
              })}
              className="input input-bordered w-full text-base"
            />
            {errors.name && <p className="text-sm text-error">{errors.name.message}</p>}
          </div>

          {/* MCP-specific fields */}
          {isMcpIntegration && (
            <>
              <div className="space-y-3">
                <label htmlFor="serverUrl" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Server URL
                  </span>
                </label>
                <input
                  id="serverUrl"
                  type="url"
                  {...register("serverUrl")}
                  className="input input-bordered w-full"
                />
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Transport
                  </span>
                </label>
                <select {...register("transport")} className="select select-bordered w-full">
                  <option value="sse">SSE (Server-Sent Events)</option>
                  <option value="streamable-http">Streamable HTTP</option>
                </select>
              </div>

              <AuthStrategySelector
                register={register as Parameters<typeof AuthStrategySelector>[0]["register"]}
                errors={errors}
                currentStrategy={watchedAuthStrategy}
              />

              <AuthFields
                register={register as Parameters<typeof AuthFields>[0]["register"]}
                errors={errors}
                authStrategy={watchedAuthStrategy}
                apiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
              />
            </>
          )}

          {/* GraphQL-specific fields */}
          {isGraphQLIntegration && (
            <>
              <div className="space-y-3">
                <label htmlFor="endpoint" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    GraphQL Endpoint
                  </span>
                </label>
                <input
                  id="endpoint"
                  type="url"
                  {...register("endpoint")}
                  className="input input-bordered w-full"
                />
              </div>

              <AuthStrategySelector
                register={register as Parameters<typeof AuthStrategySelector>[0]["register"]}
                errors={errors}
                currentStrategy={watchedAuthStrategy}
              />

              <AuthFields
                register={register as Parameters<typeof AuthFields>[0]["register"]}
                errors={errors}
                authStrategy={watchedAuthStrategy}
                apiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
              />
            </>
          )}

          {/* OpenAPI-specific fields */}
          {isOpenAPIIntegration && (
            <>
              <div className="space-y-3">
                <label htmlFor="baseUrl" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Base URL
                  </span>
                </label>
                <input
                  id="baseUrl"
                  type="url"
                  {...register("baseUrl")}
                  className="input input-bordered w-full"
                />
              </div>

              <div className="space-y-3">
                <label htmlFor="specUrl" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    OpenAPI Spec URL
                  </span>
                  <span className="ml-2 text-xs font-normal text-base-content/40">optional</span>
                </label>
                <input
                  id="specUrl"
                  type="url"
                  {...register("specUrl")}
                  placeholder="https://api.example.com/openapi.json"
                  className="input input-bordered w-full"
                />
              </div>

              <AuthStrategySelector
                register={register as Parameters<typeof AuthStrategySelector>[0]["register"]}
                errors={errors}
                currentStrategy={watchedAuthStrategy}
              />

              <AuthFields
                register={register as Parameters<typeof AuthFields>[0]["register"]}
                errors={errors}
                authStrategy={watchedAuthStrategy}
                apiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
              />
            </>
          )}

          {/* OAuth2-specific fields */}
          {isOAuthIntegration && (
            <div className="space-y-4 p-4 bg-base-200/50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label htmlFor="oauthClientId" className="block">
                    <span className="text-sm font-medium text-base-content">Client ID</span>
                  </label>
                  <input
                    id="oauthClientId"
                    type="text"
                    {...register("oauthClientId")}
                    className="input input-bordered w-full"
                  />
                </div>

                <div className="space-y-3">
                  <label htmlFor="oauthClientSecret" className="block">
                    <span className="text-sm font-medium text-base-content">Client Secret</span>
                  </label>
                  <input
                    id="oauthClientSecret"
                    type="password"
                    {...register("oauthClientSecret")}
                    placeholder="Leave blank to keep current"
                    className="input input-bordered w-full"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="oauthScopes" className="block">
                  <span className="text-sm font-medium text-base-content">Scopes</span>
                </label>
                <input
                  id="oauthScopes"
                  type="text"
                  {...register("oauthScopes")}
                  className="input input-bordered w-full"
                />
              </div>

              <div className="space-y-3">
                <label htmlFor="oauthRedirectUri" className="block">
                  <span className="text-sm font-medium text-base-content">Redirect URI</span>
                </label>
                <input
                  id="oauthRedirectUri"
                  type="url"
                  {...register("oauthRedirectUri")}
                  className="input input-bordered w-full"
                />
              </div>
            </div>
          )}

          {/* Enabled toggle */}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label htmlFor="enabled" className="flex items-center gap-3 cursor-pointer">
                <input
                  id="enabled"
                  type="checkbox"
                  {...register("enabled")}
                  className="toggle toggle-primary"
                />
                <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                  Enabled
                </span>
              </label>
            </div>
            <p className="text-sm text-base-content/60">
              Disable to prevent new connections without deleting the integration
            </p>
          </div>

          <div className="border-t border-base-300 pt-6"></div>

          <div className="flex gap-3 justify-end">
            <Link to={`/integrations/${integrationId}`} className="btn btn-ghost px-6">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary px-8" disabled={isSubmitting}>
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
  );
}

const buildAuthStrategy = (data: EditFormData): AuthStrategy => {
  switch (data.authStrategy) {
    case "api_key":
      return {
        type: "api_key",
        headerName: data.apiKeyHeaderName?.trim() || "X-API-Key",
        viewerScoped: data.apiKeyIsViewerScoped ?? false,
      };

    case "bearer_oauth":
      return { type: "bearer_oauth" };

    case "custom_headers": {
      let headers: Record<string, string> = {};
      try {
        headers = JSON.parse(data.customHeaders ?? "{}");
      } catch {
        headers = {};
      }
      return { type: "custom_headers", headers };
    }

    case "none":
    default:
      return { type: "none" };
  }
};
