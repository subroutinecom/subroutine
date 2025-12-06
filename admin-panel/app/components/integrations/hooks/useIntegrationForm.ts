import { useCallback, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import type { IntegrationFormData } from "../ProviderSelector";
import type { IntegrationProvider, IntegrationProviderDefinition } from "~/types/integration";
import type { McpOAuthDiscoveryResult } from "../McpFormFields";
import { useAdminConfig } from "~/hooks/use-admin-config";

interface UseIntegrationFormOptions {
  providerDefinitions: IntegrationProviderDefinition[];
  discoveryResult: McpOAuthDiscoveryResult | null;
  onProviderChange?: () => void;
}

export const useIntegrationForm = ({
  providerDefinitions,
  discoveryResult,
  onProviderChange,
}: UseIntegrationFormOptions) => {
  const { redirectBase } = useAdminConfig();

  // Helper to get provider definition
  const getProviderDefinition = useCallback(
    (id: IntegrationProvider) => providerDefinitions.find((provider) => provider.id === id),
    [providerDefinitions]
  );

  // Helper to build redirect URI
  const buildDefaultRedirectUri = useCallback(
    (definition?: IntegrationProviderDefinition) => {
      const redirectPath = definition?.oauthConfig?.defaultRedirectPath ?? "/api/oauth/callback";
      if (redirectPath.startsWith("http://") || redirectPath.startsWith("https://")) {
        return redirectPath;
      }
      return `${redirectBase}${redirectPath}`;
    },
    [redirectBase]
  );

  // Initial values
  const initialProviderId = useMemo<IntegrationProvider>(() => {
    return (providerDefinitions[0]?.id as IntegrationProvider) ?? "gmail";
  }, [providerDefinitions]);

  const initialDefinition = getProviderDefinition(initialProviderId);
  const initialScopes = initialDefinition?.oauthConfig?.defaultScopes ?? [];
  const initialRedirectUri = buildDefaultRedirectUri(initialDefinition);

  // Form setup
  const form = useForm<IntegrationFormData>({
    defaultValues: {
      provider: initialProviderId,
      name: "",
      clientId: "",
      clientSecret: "",
      scopes: initialScopes.join(", "),
      redirectUri: initialRedirectUri,
      oauthAuthUrl: "",
      oauthTokenUrl: "",
      oauthScopes: "",
      serverUrl: "",
      transport: "streamable-http",
      authStrategyType: "none",
      apiKey: "",
      apiKeyHeaderName: "",
      apiKeyIsViewerScoped: false,
      customHeaders: "",
      graphqlEndpoint: "",
    },
  });

  const { setValue, watch } = form;

  // Watched values
  const watchedProvider = watch("provider");
  const watchedAuthStrategy = watch("authStrategyType");
  const watchedServerUrl = watch("serverUrl");
  const watchedRedirectUri = watch("redirectUri");
  const watchedApiKeyIsViewerScoped = watch("apiKeyIsViewerScoped");

  // Derived state
  const currentDefinition = getProviderDefinition(watchedProvider);
  const isMcpProvider = currentDefinition?.authType === "mcp";
  const isGraphQLProvider = currentDefinition?.authType === "graphql";

  // Track previous provider to detect changes
  const previousProviderRef = useRef<IntegrationProvider>(initialProviderId);

  // Reset form fields when provider changes
  useEffect(() => {
    if (watchedProvider === previousProviderRef.current) {
      return;
    }
    previousProviderRef.current = watchedProvider;

    onProviderChange?.();

    const definition = getProviderDefinition(watchedProvider);
    if (definition?.authType === "mcp") {
      // Reset MCP fields
      setValue("serverUrl", "");
      setValue("transport", "streamable-http");
      setValue("authStrategyType", "none");
      setValue("apiKey", "");
      setValue("apiKeyHeaderName", "");
      setValue("apiKeyIsViewerScoped", false);
      setValue("customHeaders", "");
      setValue("oauthAuthUrl", "");
      setValue("oauthTokenUrl", "");
      setValue("oauthScopes", "");
      setValue("graphqlEndpoint", "");
    } else if (definition?.authType === "graphql") {
      // Reset GraphQL fields
      setValue("graphqlEndpoint", "");
      setValue("authStrategyType", "none");
      setValue("apiKey", "");
      setValue("apiKeyHeaderName", "");
      setValue("apiKeyIsViewerScoped", false);
      setValue("customHeaders", "");
      setValue("oauthAuthUrl", "");
      setValue("oauthTokenUrl", "");
      setValue("oauthScopes", "");
      setValue("clientId", "");
      setValue("clientSecret", "");
      setValue("serverUrl", "");
    } else {
      // Reset OAuth fields to provider defaults
      setValue("scopes", (definition?.oauthConfig?.defaultScopes ?? []).join(", "));
      setValue("redirectUri", buildDefaultRedirectUri(definition));
      setValue("graphqlEndpoint", "");
    }
  }, [watchedProvider, setValue, getProviderDefinition, buildDefaultRedirectUri, onProviderChange]);

  // Auto-fill OAuth fields when user switches to bearer_oauth after probing
  useEffect(() => {
    if (watchedAuthStrategy === "bearer_oauth" && discoveryResult?.success) {
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

  // Handler for auth method selection from discovery panel
  const handleSelectAuthMethod = useCallback(
    (method: "none" | "api_key" | "bearer_oauth" | "bearer_oauth" | "custom_headers") => {
      setValue("authStrategyType", method);
    },
    [setValue]
  );

  // Apply discovery result to form (called when probing succeeds and auth is already bearer_oauth)
  const applyDiscoveryResult = useCallback(
    (result: McpOAuthDiscoveryResult) => {
      if (result.success && watchedAuthStrategy === "bearer_oauth") {
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
    },
    [watchedAuthStrategy, setValue]
  );

  return {
    form,
    // Watched values
    watchedProvider,
    watchedAuthStrategy,
    watchedServerUrl,
    watchedRedirectUri,
    watchedApiKeyIsViewerScoped,
    // Derived state
    currentDefinition,
    isMcpProvider,
    isGraphQLProvider,
    // Helpers
    getProviderDefinition,
    handleSelectAuthMethod,
    applyDiscoveryResult,
  };
};
