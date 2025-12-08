import { useEffect, useCallback } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { IntegrationProviderDefinition } from "~/types/integration";
import type { IntegrationFormData, McpDiscoveryResult, McpDiscoveryAuthMethod, AuthStrategyType } from "../types";

interface UseIntegrationFormOptions {
  providerDefinitions: IntegrationProviderDefinition[];
  discoveryResult?: McpDiscoveryResult | null;
  initialData?: Partial<IntegrationFormData>;
  onProviderChange?: () => void;
}

export const useIntegrationForm = (options: UseIntegrationFormOptions) => {
  const { providerDefinitions, initialData, onProviderChange } = options;

  const form = useForm<IntegrationFormData>({
    defaultValues: {
      provider: initialData?.provider ?? providerDefinitions[0]?.id ?? "",
      name: initialData?.name ?? "",
      serverUrl: initialData?.serverUrl ?? "",
      transport: initialData?.transport ?? "sse",
      endpoint: initialData?.endpoint ?? "",
      baseUrl: initialData?.baseUrl ?? "",
      specUrl: initialData?.specUrl ?? "",
      authStrategy: initialData?.authStrategy ?? "none",
      apiKey: initialData?.apiKey ?? "",
      apiKeyHeaderName: initialData?.apiKeyHeaderName ?? "X-API-Key",
      apiKeyIsViewerScoped: initialData?.apiKeyIsViewerScoped ?? false,
      oauthClientId: initialData?.oauthClientId ?? "",
      oauthClientSecret: initialData?.oauthClientSecret ?? "",
      oauthAuthUrl: initialData?.oauthAuthUrl ?? "",
      oauthTokenUrl: initialData?.oauthTokenUrl ?? "",
      oauthRedirectUri: initialData?.oauthRedirectUri ?? "",
      oauthScopes: initialData?.oauthScopes ?? "",
      customHeaders: initialData?.customHeaders ?? "{}",
    },
  });

  const { control, setValue } = form;

  // Watch key fields
  const watchedProvider = useWatch({ control, name: "provider" });
  const watchedAuthStrategy = useWatch({ control, name: "authStrategy" });
  const watchedServerUrl = useWatch({ control, name: "serverUrl" });
  const watchedRedirectUri = useWatch({ control, name: "oauthRedirectUri" });
  const watchedApiKeyIsViewerScoped = useWatch({ control, name: "apiKeyIsViewerScoped" });

  // Get provider definition
  const getProviderDefinition = useCallback(
    (providerId: string) => providerDefinitions.find((p) => p.id === providerId),
    [providerDefinitions]
  );

  const currentProvider = getProviderDefinition(watchedProvider);
  const isMcpProvider = currentProvider?.authType === "mcp";
  const isGraphQLProvider = currentProvider?.authType === "graphql";
  const isOpenAPIProvider = currentProvider?.authType === "openapi";
  const isOAuthProvider = currentProvider?.authType === "oauth2";

  // Handle provider change - reset auth-related fields
  useEffect(() => {
    if (!currentProvider) return;

    // Set defaults based on provider type
    if (isMcpProvider && currentProvider.mcpConfig) {
      setValue("serverUrl", currentProvider.mcpConfig.serverUrl || "");
      setValue("transport", currentProvider.mcpConfig.transport || "sse");

      // Set auth strategy from provider config
      const authType = currentProvider.mcpConfig.auth?.strategy?.type ?? "none";
      setValue("authStrategy", authType as AuthStrategyType);
    } else if (isGraphQLProvider && currentProvider.graphqlConfig) {
      setValue("endpoint", currentProvider.graphqlConfig.endpoint || "");

      // Set auth strategy from provider config
      const authType = currentProvider.graphqlConfig.auth?.strategy?.type ?? "none";
      setValue("authStrategy", authType as AuthStrategyType);
    } else if (isOpenAPIProvider && currentProvider.openapiConfig) {
      setValue("baseUrl", currentProvider.openapiConfig.baseUrl || "");
      setValue("specUrl", currentProvider.openapiConfig.specUrl || "");

      // Set auth strategy from provider config
      const authType = currentProvider.openapiConfig.auth?.strategy?.type ?? "none";
      setValue("authStrategy", authType as AuthStrategyType);
    } else if (isOAuthProvider && currentProvider.oauthConfig) {
      setValue("oauthAuthUrl", currentProvider.oauthConfig.authUrl || "");
      setValue("oauthTokenUrl", currentProvider.oauthConfig.tokenUrl || "");
      setValue("oauthScopes", currentProvider.oauthConfig.defaultScopes?.join(" ") || "");
      setValue("authStrategy", "bearer_oauth");
    }

    onProviderChange?.();
  }, [watchedProvider, currentProvider, isMcpProvider, isGraphQLProvider, isOpenAPIProvider, isOAuthProvider, setValue, onProviderChange]);

  // Handle auth strategy selection from discovery
  const handleSelectAuthMethod = useCallback(
    (method: McpDiscoveryAuthMethod) => {
      setValue("authStrategy", method.type as AuthStrategyType);

      if (method.type === "bearer_oauth" && method.oauth) {
        setValue("oauthAuthUrl", method.oauth.authorizationUrl);
        setValue("oauthTokenUrl", method.oauth.tokenUrl);
        setValue("oauthScopes", method.oauth.scopes?.join(" ") ?? "");
      }
    },
    [setValue]
  );

  // Apply discovery result
  const applyDiscoveryResult = useCallback(
    (result: McpDiscoveryResult) => {
      if (result.authMethods && result.authMethods.length > 0) {
        const firstMethod = result.authMethods[0];
        handleSelectAuthMethod(firstMethod);
      }
    },
    [handleSelectAuthMethod]
  );

  return {
    form,
    watchedProvider,
    watchedAuthStrategy,
    watchedServerUrl,
    watchedRedirectUri,
    watchedApiKeyIsViewerScoped,
    isMcpProvider,
    isGraphQLProvider,
    isOpenAPIProvider,
    isOAuthProvider,
    getProviderDefinition,
    handleSelectAuthMethod,
    applyDiscoveryResult,
  };
};
