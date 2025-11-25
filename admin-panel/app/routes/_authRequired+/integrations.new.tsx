import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";
import type {
  IntegrationProvider,
  IntegrationProviderDefinition,
  McpAuthStrategy,
} from "~/types/integration";
import {
  type IntegrationFormData,
  McpFormFields,
  OAuthFormFields,
  ProviderSelector,
} from "~/components/integrations";
import type { McpOAuthDiscoveryResult } from "~/components/integrations/McpFormFields";

export function meta() {
  return [
    { title: "New Integration - Subroutine" },
    { name: "description", content: "Create a new integration" },
  ];
}

const INTEGRATION_PROVIDERS_QUERY = gql`
  query IntegrationProviders {
    integrationProviders {
      id
      name
      description
      viewerScoped
      authType
      oauthConfig {
        authUrl
        tokenUrl
        defaultScopes
        requiredScopes
        defaultRedirectPath
      }
      mcpConfig {
        serverUrl
        transport
        authStrategy {
          type
          headerName
          headers
        }
      }
    }
  }
`;

const CREATE_INTEGRATION_MUTATION = gql`
  mutation CreateIntegration($provider: String!, $name: String!, $authConfig: String!) {
    createIntegration(provider: $provider, name: $name, authConfig: $authConfig) {
      id
      provider
      name
    }
  }
`;

const DISCOVER_MCP_OAUTH_QUERY = gql`
  query DiscoverMcpOAuth($serverUrl: String!) {
    discoverMcpOAuth(serverUrl: $serverUrl) {
      success
      serverName
      authorizationServer
      authorizationEndpoint
      tokenEndpoint
      registrationEndpoint
      scopesSupported
      pkceSupported
      dynamicRegistrationSupported
      error
    }
  }
`;

export const clientLoader = async () => {
  const data = await graphqlClient.request<{
    integrationProviders: IntegrationProviderDefinition[];
  }>(INTEGRATION_PROVIDERS_QUERY);
  return { providerDefinitions: data.integrationProviders ?? [] };
};

const DEFAULT_REDIRECT_BASE = "http://localhost:3002";

export default function NewIntegrationPage() {
  const navigate = useNavigate();
  const { activeOrganization: _activeOrganization } = useAuth();
  const { providerDefinitions } = useLoaderData<typeof clientLoader>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<McpOAuthDiscoveryResult | null>(null);

  const getProviderDefinition = useCallback(
    (id: IntegrationProvider) => providerDefinitions.find((provider) => provider.id === id),
    [providerDefinitions]
  );

  const initialProviderId = useMemo<IntegrationProvider>(() => {
    return (providerDefinitions[0]?.id as IntegrationProvider) ?? "gmail";
  }, [providerDefinitions]);

  const buildDefaultRedirectUri = useCallback((definition?: IntegrationProviderDefinition) => {
    const redirectPath = definition?.oauthConfig?.defaultRedirectPath ?? "/api/oauth/callback";
    if (redirectPath.startsWith("http://") || redirectPath.startsWith("https://")) {
      return redirectPath;
    }
    return `${DEFAULT_REDIRECT_BASE}${redirectPath}`;
  }, []);

  const initialDefinition = getProviderDefinition(initialProviderId);
  const initialScopes = initialDefinition?.oauthConfig?.defaultScopes ?? [];
  const initialRedirectUri = buildDefaultRedirectUri(initialDefinition);

  // Form setup
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<IntegrationFormData>({
    defaultValues: {
      provider: initialProviderId,
      name: "",

      clientId: "",
      clientSecret: "",
      scopes: initialScopes.join(", "),
      redirectUri: initialRedirectUri,
      oauthAuthUrl: "",
      oauthTokenUrl: "",

      serverUrl: "",
      transport: "streamable-http",
      authStrategyType: "none",
      apiKey: "",
      apiKeyHeaderName: "",
      customHeaders: "",
    },
  });

  // Watch form values for conditional rendering
  const watchedProvider = watch("provider");
  const watchedAuthStrategy = watch("authStrategyType");
  const watchedServerUrl = watch("serverUrl");
  const watchedRedirectUri = watch("redirectUri");

  const currentDefinition = getProviderDefinition(watchedProvider);
  const isMcpProvider = currentDefinition?.authType === "mcp";

  // Probe MCP server for OAuth discovery
  const handleProbeServer = useCallback(async () => {
    const serverUrl = watchedServerUrl?.trim();
    if (!serverUrl) return;

    setIsProbing(true);
    setDiscoveryResult(null);
    setServerError(null);

    try {
      const data = await graphqlClient.request<{
        discoverMcpOAuth: McpOAuthDiscoveryResult;
      }>(DISCOVER_MCP_OAUTH_QUERY, { serverUrl });

      const result = data.discoverMcpOAuth;
      setDiscoveryResult(result);

      // Only auto-fill OAuth fields if user has already selected bearer_passthrough
      // Don't automatically switch auth strategy - let user choose
      if (result.success && watchedAuthStrategy === "bearer_passthrough") {
        if (result.authorizationEndpoint) {
          setValue("oauthAuthUrl", result.authorizationEndpoint);
        }
        if (result.tokenEndpoint) {
          setValue("oauthTokenUrl", result.tokenEndpoint);
        }
        if (result.scopesSupported && result.scopesSupported.length > 0) {
          setValue("scopes", result.scopesSupported.join(", "));
        }
      }
    } catch (err) {
      setDiscoveryResult({
        success: false,
        error: err instanceof Error ? err.message : "Failed to probe server",
      });
    } finally {
      setIsProbing(false);
    }
  }, [watchedServerUrl, watchedAuthStrategy, setValue]);

  const previousProviderRef = useRef<IntegrationProvider>(initialProviderId);

  useEffect(() => {
    if (watchedProvider === previousProviderRef.current) {
      return;
    }
    previousProviderRef.current = watchedProvider;

    // Clear discovery result on provider change
    setDiscoveryResult(null);

    const definition = getProviderDefinition(watchedProvider);
    if (definition?.authType === "mcp") {
      setValue("serverUrl", "");
      setValue("transport", "streamable-http");
      setValue("authStrategyType", "none");
      setValue("apiKey", "");
      setValue("apiKeyHeaderName", "");
      setValue("customHeaders", "");
      setValue("oauthAuthUrl", "");
      setValue("oauthTokenUrl", "");
    } else {
      setValue("scopes", (definition?.oauthConfig?.defaultScopes ?? []).join(", "));
      setValue("redirectUri", buildDefaultRedirectUri(definition));
    }
  }, [watchedProvider, setValue, getProviderDefinition, buildDefaultRedirectUri]);

  // Auto-fill OAuth fields when user switches to bearer_passthrough after probing
  useEffect(() => {
    if (watchedAuthStrategy === "bearer_passthrough" && discoveryResult?.success) {
      if (discoveryResult.authorizationEndpoint) {
        setValue("oauthAuthUrl", discoveryResult.authorizationEndpoint);
      }
      if (discoveryResult.tokenEndpoint) {
        setValue("oauthTokenUrl", discoveryResult.tokenEndpoint);
      }
      if (discoveryResult.scopesSupported && discoveryResult.scopesSupported.length > 0) {
        setValue("scopes", discoveryResult.scopesSupported.join(", "));
      }
    }
  }, [watchedAuthStrategy, discoveryResult, setValue]);

  // Handle auth method selection from discovery panel cards
  const handleSelectAuthMethod = useCallback(
    (method: "none" | "api_key" | "bearer_passthrough" | "custom_headers") => {
      setValue("authStrategyType", method);
    },
    [setValue]
  );

  const onSubmit = async (data: IntegrationFormData) => {
    setServerError(null);

    const definition = getProviderDefinition(data.provider);
    if (!definition) {
      setServerError("Selected provider not found");
      return;
    }

    try {
      let authConfig: string;

      if (definition.authType === "mcp") {
        // Validate MCP fields
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

        // Build auth strategy
        let authStrategy: McpAuthStrategy;
        let oauthConfig:
          | {
              clientId: string;
              clientSecret: string;
              authUrl: string;
              tokenUrl: string;
              redirectUri: string;
              scopes: string[];
            }
          | undefined;

        switch (data.authStrategyType) {
          case "none":
            authStrategy = { type: "none" };
            break;
          case "api_key":
            if (!data.apiKey.trim()) {
              setServerError("API key is required for API Key authentication");
              return;
            }
            authStrategy = {
              type: "api_key",
              ...(data.apiKeyHeaderName.trim() && { headerName: data.apiKeyHeaderName.trim() }),
            };
            break;
          case "bearer_passthrough": {
            authStrategy = { type: "bearer_passthrough" };

            // Validate OAuth config for bearer_passthrough
            if (!data.oauthAuthUrl.trim()) {
              setServerError("OAuth Authorization URL is required for Bearer Passthrough");
              return;
            }
            if (!data.oauthTokenUrl.trim()) {
              setServerError("OAuth Token URL is required for Bearer Passthrough");
              return;
            }
            if (!data.clientId.trim()) {
              setServerError("OAuth Client ID is required for Bearer Passthrough");
              return;
            }
            if (!data.clientSecret.trim()) {
              setServerError("OAuth Client Secret is required for Bearer Passthrough");
              return;
            }
            if (!data.redirectUri.trim()) {
              setServerError("OAuth Redirect URI is required for Bearer Passthrough");
              return;
            }

            // Validate URLs
            try {
              new URL(data.oauthAuthUrl.trim());
            } catch {
              setServerError("Invalid OAuth Authorization URL");
              return;
            }
            try {
              new URL(data.oauthTokenUrl.trim());
            } catch {
              setServerError("Invalid OAuth Token URL");
              return;
            }

            const scopeArray = data.scopes
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);

            if (scopeArray.length === 0) {
              setServerError("At least one OAuth scope is required for Bearer Passthrough");
              return;
            }

            oauthConfig = {
              clientId: data.clientId.trim(),
              clientSecret: data.clientSecret.trim(),
              authUrl: data.oauthAuthUrl.trim(),
              tokenUrl: data.oauthTokenUrl.trim(),
              redirectUri: data.redirectUri.trim(),
              scopes: scopeArray,
            };
            break;
          }
          case "custom_headers":
            try {
              const headers = data.customHeaders.trim()
                ? JSON.parse(data.customHeaders.trim())
                : {};
              if (Object.keys(headers).length === 0) {
                setServerError("Custom headers must have at least one header");
                return;
              }
              authStrategy = { type: "custom_headers", headers };
            } catch {
              setServerError("Custom headers must be valid JSON");
              return;
            }
            break;
          default:
            authStrategy = { type: "none" };
        }

        authConfig = JSON.stringify({
          type: "mcp" as const,
          serverUrl: data.serverUrl.trim(),
          transport: data.transport,
          authStrategy,
          ...(data.authStrategyType === "api_key" &&
            data.apiKey.trim() && { apiKey: data.apiKey.trim() }),
          ...(oauthConfig && { oauthConfig }),
        });
      } else if (definition.authType === "oauth2" && definition.oauthConfig) {
        // Validate OAuth fields
        const scopeArray = data.scopes
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (scopeArray.length === 0) {
          setServerError("At least one scope is required");
          return;
        }

        authConfig = JSON.stringify({
          type: "oauth2" as const,
          clientId: data.clientId.trim(),
          clientSecret: data.clientSecret.trim(),
          scopes: scopeArray,
          authUrl: definition.oauthConfig.authUrl,
          tokenUrl: definition.oauthConfig.tokenUrl,
          redirectUri: data.redirectUri.trim(),
        });
      } else {
        setServerError("Selected provider is not configured properly");
        return;
      }

      await graphqlClient.request<{
        createIntegration: { id: string; provider: string; name: string };
      }>(CREATE_INTEGRATION_MUTATION, {
        provider: data.provider,
        name: data.name.trim(),
        authConfig,
      });

      navigate("/integrations");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to create integration");
    }
  };

  // Empty state
  if (providerDefinitions.length === 0) {
    return (
      <div className="space-y-10">
        <PageHeader
          title="New Integration"
          description="Connect a new external service to automate workflows."
          action={
            <Link to="/integrations" className="btn btn-ghost gap-2 h-12">
              <ArrowLeft size={20} />
              Back
            </Link>
          }
        />
        <div className="alert alert-error">
          <span>No integration providers are available.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="New Integration"
        description="Connect a new external service to automate workflows."
        action={
          <Link to="/integrations" className="btn btn-ghost gap-2 h-12">
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

          <ProviderSelector
            control={control}
            providerDefinitions={providerDefinitions}
            getProviderDefinition={getProviderDefinition}
          />

          <div className="space-y-3">
            <label htmlFor="name" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Name
              </span>
            </label>
            <input
              id="name"
              type="text"
              {...register("name", { required: "Name is required" })}
              placeholder="e.g., Production Gmail"
              className="input input-bordered w-full text-base"
            />
            {errors.name && <p className="text-sm text-error">{errors.name.message}</p>}
            <p className="text-sm text-base-content/60">A descriptive name for this integration</p>
          </div>

          {/* MCP-specific fields */}
          {isMcpProvider && (
            <McpFormFields
              register={register}
              errors={errors}
              watchedAuthStrategy={watchedAuthStrategy}
              serverUrl={watchedServerUrl}
              onProbeServer={handleProbeServer}
              isProbing={isProbing}
              discoveryResult={discoveryResult}
              onSelectAuthMethod={handleSelectAuthMethod}
              redirectUri={watchedRedirectUri}
            />
          )}

          {/* OAuth2-specific fields */}
          {!isMcpProvider && <OAuthFormFields register={register} errors={errors} />}

          <div className="border-t border-base-300 pt-6"></div>

          <div className="flex gap-3 justify-end">
            <Link to="/integrations" className="btn btn-ghost px-6">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary px-8" disabled={isSubmitting}>
              {isSubmitting ? (
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
  );
}
