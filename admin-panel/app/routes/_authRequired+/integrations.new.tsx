import { useMemo, useState, useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { ArrowLeft, Server, Database, Globe, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { PageHeader } from "~/components/ui/PageHeader";
import { createGraphqlClient } from "~/lib/graphql-client";
import type { IntegrationProviderDefinition } from "~/types/integration";
import {
  type IntegrationFormData,
  buildIntegrationConfig,
  GraphQLFormFields,
  OpenAPIFormFields,
  McpFormFields,
  OAuthFormFields,
  IntegrationCombobox,
  useIntegrationForm,
  useMcpDiscovery,
} from "~/components/integrations";
import { fetchAdminConfig } from "~/lib/admin-config";
import { useAdminConfig } from "~/hooks/use-admin-config";

export function meta() {
  return [
    { title: "New Integration - Subroutine" },
    { name: "description", content: "Create a new integration" },
  ];
}

const INTEGRATION_PROVIDERS_QUERY = gql`
  query GetIntegrationProviders {
    integrationProviders {
      id
      name
      description
      category
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
      graphqlConfig {
        endpoint
        authStrategy {
          type
          headerName
          headers
        }
        oauthConfig {
          authUrl
          tokenUrl
          defaultScopes
          requiredScopes
          defaultRedirectPath
        }
      }
      openapiConfig {
        baseUrl
        authStrategy {
          type
          headerName
          headers
        }
        oauthConfig {
          authUrl
          tokenUrl
          defaultScopes
          requiredScopes
          defaultRedirectPath
        }
      }
    }
    isSuperadmin
  }
`;

const CREATE_INTEGRATION_MUTATION = gql`
  mutation CreateNewIntegration(
    $provider: String!
    $name: String!
    $authConfig: String!
    $description: String
    $visibility: String
  ) {
    createIntegration(
      provider: $provider
      name: $name
      authConfig: $authConfig
      description: $description
      visibility: $visibility
    ) {
      id
      provider
      name
    }
  }
`;

// Protocol styling
const PROTOCOL_STYLES = {
  mcp: {
    icon: Server,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    activeBorder: "border-emerald-400",
    label: "MCP",
  },
  graphql: {
    icon: Database,
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/30",
    activeBorder: "border-fuchsia-400",
    label: "GraphQL",
  },
  openapi: {
    icon: Globe,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    activeBorder: "border-sky-400",
    label: "REST API",
  },
} as const;

export const clientLoader = async () => {
  const config = await fetchAdminConfig();
  const client = createGraphqlClient(config);
  const data = await client.request<{
    integrationProviders: IntegrationProviderDefinition[];
    isSuperadmin: boolean;
  }>(INTEGRATION_PROVIDERS_QUERY);
  return {
    providerDefinitions: data.integrationProviders ?? [],
    isSuperadmin: data.isSuperadmin,
  };
};

type TabType = "browse" | "custom";

export default function NewIntegrationPage() {
  const navigate = useNavigate();
  const config = useAdminConfig();
  const client = useMemo(() => createGraphqlClient(config), [config]);
  const { providerDefinitions: allProviders, isSuperadmin } = useLoaderData<typeof clientLoader>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("");
  const [makeGlobal, setMakeGlobal] = useState<boolean>(false);

  // Unified state
  const [activeTab, setActiveTab] = useState<TabType>("browse");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Filter providers
  const providerDefinitions = useMemo(
    () => allProviders.filter((p) => p.authType === "mcp" || p.authType === "graphql" || p.authType === "openapi"),
    [allProviders]
  );

  const firstPartyProviders = useMemo(
    () => providerDefinitions.filter((p) => p.category && p.category !== "generic"),
    [providerDefinitions]
  );

  const genericProviders = useMemo(
    () => providerDefinitions.filter((p) => p.category === "generic"),
    [providerDefinitions]
  );

  // Selected provider object
  const selectedProvider = useMemo(
    () => (selectedProviderId ? providerDefinitions.find((p) => p.id === selectedProviderId) : null),
    [providerDefinitions, selectedProviderId]
  );

  // Determine if selection is first-party or generic
  const isFirstPartySelected = selectedProvider && selectedProvider.category !== "generic";
  const isGenericSelected = selectedProvider && selectedProvider.category === "generic";

  // MCP discovery hook
  const { isProbing, discoveryResult, probeServer, clearDiscoveryResult } = useMcpDiscovery();

  // Form management hook
  const {
    form,
    watchedAuthStrategy,
    watchedServerUrl,
    watchedRedirectUri,
    watchedApiKeyIsViewerScoped,
    isMcpProvider,
    isGraphQLProvider,
    isOpenAPIProvider,
    getProviderDefinition,
    handleSelectAuthMethod,
    applyDiscoveryResult,
  } = useIntegrationForm({
    providerDefinitions,
    discoveryResult,
    onProviderChange: clearDiscoveryResult,
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  // When provider changes, update form
  useEffect(() => {
    if (!selectedProvider) return;

    setValue("provider", selectedProvider.id);
    setValue("name", selectedProvider.name);

    if (selectedProvider.graphqlConfig?.authStrategy?.type) {
      setValue("authStrategy", selectedProvider.graphqlConfig.authStrategy.type as "none" | "api_key" | "bearer_oauth" | "custom_headers");
      setValue("endpoint", selectedProvider.graphqlConfig.endpoint);
      if (selectedProvider.graphqlConfig.oauthConfig) {
        const oauth = selectedProvider.graphqlConfig.oauthConfig;
        setValue("oauthAuthUrl", oauth.authUrl);
        setValue("oauthTokenUrl", oauth.tokenUrl);
        setValue("oauthScopes", oauth.defaultScopes?.join(" ") || "");
      }
    } else if (selectedProvider.openapiConfig?.authStrategy?.type) {
      setValue("authStrategy", selectedProvider.openapiConfig.authStrategy.type as "none" | "api_key" | "bearer_oauth" | "custom_headers");
      setValue("baseUrl", selectedProvider.openapiConfig.baseUrl);
      if (selectedProvider.openapiConfig.oauthConfig) {
        const oauth = selectedProvider.openapiConfig.oauthConfig;
        setValue("oauthAuthUrl", oauth.authUrl);
        setValue("oauthTokenUrl", oauth.tokenUrl);
        setValue("oauthScopes", oauth.defaultScopes?.join(" ") || "");
      }
    } else if (selectedProvider.mcpConfig) {
      setValue("serverUrl", selectedProvider.mcpConfig.serverUrl);
      setValue("transport", selectedProvider.mcpConfig.transport as "sse" | "streamable-http");
      const mcpAuthType = selectedProvider.mcpConfig.authStrategy?.type ?? "none";
      setValue("authStrategy", mcpAuthType as "none" | "api_key" | "bearer_oauth" | "custom_headers");
    }
  }, [selectedProvider, setValue]);

  // Handle provider selection
  const handleSelectProvider = (providerId: string) => {
    setSelectedProviderId(providerId);
  };

  // Handle tab change
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSelectedProviderId(null);
  };

  // Handle MCP probe server
  const handleProbeServer = async () => {
    setServerError(null);
    const result = await probeServer(watchedServerUrl ?? "");
    if (result) {
      applyDiscoveryResult(result);
    }
  };

  // Handle form submission
  const onSubmit = async (data: IntegrationFormData) => {
    setServerError(null);

    const definition = getProviderDefinition(data.provider);
    if (!definition) {
      setServerError("Selected provider not found");
      return;
    }

    const result = buildIntegrationConfig(data, definition);
    if (!result.success) {
      setServerError(result.error);
      return;
    }

    try {
      await client.request<{
        createIntegration: { id: string; provider: string; name: string };
      }>(CREATE_INTEGRATION_MUTATION, {
        provider: data.provider,
        name: data.name.trim(),
        authConfig: result.config,
        description: description.trim() || null,
        visibility: makeGlobal ? "global" : "private",
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

  const inputClasses = `
    w-full px-4 py-3 rounded-lg
    bg-base-200/50 border-2 border-base-300/50
    text-base-content placeholder:text-base-content/30
    focus:outline-none focus:border-primary/50 focus:bg-base-200/70
    transition-all duration-200
  `;

  const hasFirstParty = firstPartyProviders.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="New Integration"
        description="Connect a new external service to automate workflows."
        action={
          <Link to="/integrations" className="btn btn-ghost gap-2 h-11">
            <ArrowLeft size={18} />
            Back
          </Link>
        }
      />

      <div className="w-full">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {serverError && (
            <div className="rounded-xl border-2 border-error/30 bg-error/10 p-4">
              <p className="text-error text-sm font-medium">{serverError}</p>
            </div>
          )}

          {/* Unified Selection Card */}
          <div className="rounded-2xl border border-base-300/50 bg-base-100/50 backdrop-blur-sm">
            {/* Tab Header */}
            {hasFirstParty && (
              <div className="flex border-b border-base-300/50 rounded-t-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleTabChange("browse")}
                  className={`
                    flex-1 px-6 py-4 text-sm font-medium transition-all relative
                    ${activeTab === "browse"
                      ? "text-base-content bg-base-100/50"
                      : "text-base-content/50 hover:text-base-content/70 hover:bg-base-200/30"
                    }
                  `}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Sparkles size={16} />
                    <span>Browse Integrations</span>
                  </div>
                  {activeTab === "browse" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange("custom")}
                  className={`
                    flex-1 px-6 py-4 text-sm font-medium transition-all relative
                    ${activeTab === "custom"
                      ? "text-base-content bg-base-100/50"
                      : "text-base-content/50 hover:text-base-content/70 hover:bg-base-200/30"
                    }
                  `}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Server size={16} />
                    <span>Custom Integration</span>
                  </div>
                  {activeTab === "custom" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              </div>
            )}

            {/* Tab Content */}
            <div className="p-6">
              {/* Browse Tab */}
              {(activeTab === "browse" || !hasFirstParty) && hasFirstParty && (
                <div>
                  <IntegrationCombobox
                    providers={providerDefinitions}
                    value={selectedProviderId}
                    onChange={handleSelectProvider}
                    placeholder="Search for Linear, Slack, Jira, GitHub..."
                  />
                </div>
              )}

              {/* Custom Tab */}
              {(activeTab === "custom" || !hasFirstParty) && (
                <div className="space-y-4">
                  <p className="text-sm text-base-content/60">
                    Connect to any service using one of these protocols:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {genericProviders.map((provider) => {
                      const isSelected = selectedProviderId === provider.id;
                      const style = PROTOCOL_STYLES[provider.authType as keyof typeof PROTOCOL_STYLES];
                      const Icon = style?.icon ?? Server;

                      return (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => handleSelectProvider(provider.id)}
                          className={`
                            group relative p-6 rounded-xl text-left transition-all duration-200
                            border-2 hover:scale-[1.02]
                            ${isSelected
                              ? `${style?.activeBorder ?? "border-primary"} bg-gradient-to-br from-base-100 to-base-200/50`
                              : "border-base-300/50 hover:border-base-300 bg-base-200/30 hover:bg-base-200/50"
                            }
                          `}
                        >
                          <div className="flex flex-col items-center text-center gap-3">
                            <div
                              className={`
                                w-14 h-14 rounded-xl flex items-center justify-center
                                transition-all duration-200
                                ${isSelected ? style?.bg : "bg-base-300/50 group-hover:bg-base-300/70"}
                              `}
                            >
                              <Icon
                                size={28}
                                strokeWidth={1.5}
                                className={`transition-colors ${isSelected ? style?.color : "text-base-content/50 group-hover:text-base-content/70"}`}
                              />
                            </div>
                            <div>
                              <span className="font-semibold text-base-content block">
                                {style?.label ?? provider.name}
                              </span>
                              <p className="text-xs text-base-content/50 mt-1">
                                {provider.description}
                              </p>
                            </div>
                            {isSelected && (
                              <div className={`absolute top-3 right-3 w-2 h-2 rounded-full ${style?.color?.replace("text-", "bg-")}`} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Configuration Section - appears when provider is selected */}
          {selectedProvider && (
            <div className="rounded-2xl border border-base-300/50 bg-base-100/50 backdrop-blur-sm p-6 space-y-6 animate-fade-in">
              {/* Selected provider header */}
              <div className="flex items-center gap-3 pb-4 border-b border-base-300/30">
                {(() => {
                  const style = PROTOCOL_STYLES[selectedProvider.authType as keyof typeof PROTOCOL_STYLES];
                  const Icon = style?.icon ?? Server;
                  return (
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${style?.bg}`}>
                      <Icon size={20} className={style?.color} />
                    </div>
                  );
                })()}
                <div className="flex-1">
                  <h3 className="font-semibold text-base-content">{selectedProvider.name}</h3>
                  <p className="text-xs text-base-content/50">{selectedProvider.description}</p>
                </div>
                <span className="text-[10px] px-2 py-1 rounded bg-base-300/50 text-base-content/40 uppercase tracking-wider">
                  {PROTOCOL_STYLES[selectedProvider.authType as keyof typeof PROTOCOL_STYLES]?.label ?? selectedProvider.authType}
                </span>
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
                    Details
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
                </div>

                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-base-content/70">
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    {...register("name", { required: "Name is required" })}
                    placeholder="e.g., Production API"
                    className={inputClasses}
                  />
                  {errors.name && <p className="text-sm text-error">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium text-base-content/70">
                    Description
                    <span className="ml-2 text-xs font-normal text-base-content/40">optional</span>
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Helps the AI understand when to use this integration..."
                    className={`${inputClasses} min-h-[80px] resize-y`}
                  />
                </div>
              </div>

              {/* Protocol-specific config for custom integrations */}
              {isGenericSelected && (
                <div className="space-y-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
                      Configuration
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
                  </div>

                  {isMcpProvider && (
                    <McpFormFields
                      register={register as Parameters<typeof McpFormFields>[0]["register"]}
                      errors={errors}
                      watchedAuthStrategy={watchedAuthStrategy}
                      watchedApiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
                      serverUrl={watchedServerUrl}
                      onProbeServer={handleProbeServer}
                      isProbing={isProbing}
                      discoveryResult={discoveryResult}
                      onSelectAuthMethod={handleSelectAuthMethod}
                      redirectUri={watchedRedirectUri}
                    />
                  )}

                  {isGraphQLProvider && (
                    <GraphQLFormFields
                      register={register as Parameters<typeof GraphQLFormFields>[0]["register"]}
                      errors={errors}
                      watchedAuthStrategy={watchedAuthStrategy}
                      watchedApiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
                      redirectUri={watchedRedirectUri}
                    />
                  )}

                  {isOpenAPIProvider && (
                    <OpenAPIFormFields
                      register={register as Parameters<typeof OpenAPIFormFields>[0]["register"]}
                      errors={errors}
                      watchedAuthStrategy={watchedAuthStrategy}
                      watchedApiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
                      redirectUri={watchedRedirectUri}
                    />
                  )}
                </div>
              )}

              {/* OAuth info for first-party */}
              {isFirstPartySelected && (selectedProvider.graphqlConfig?.oauthConfig || selectedProvider.openapiConfig?.oauthConfig) && (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-sm text-base-content/70">
                    <span className="font-medium text-primary">OAuth 2.0</span> — Users will authenticate with their {selectedProvider.name} account to grant access.
                  </p>
                </div>
              )}

              {/* Superadmin toggle */}
              {isSuperadmin && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-base-200/30 border border-base-300/30">
                  <input
                    id="makeGlobal"
                    type="checkbox"
                    checked={makeGlobal}
                    onChange={(e) => setMakeGlobal(e.target.checked)}
                    className="checkbox checkbox-sm checkbox-primary"
                  />
                  <label htmlFor="makeGlobal" className="flex-1 cursor-pointer">
                    <span className="text-sm font-medium text-base-content">Make Global</span>
                    <p className="text-xs text-base-content/50 mt-0.5">
                      Available to all organizations
                    </p>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Legacy OAuth fields */}
          {selectedProvider && !isMcpProvider && !isGraphQLProvider && !isOpenAPIProvider && (
            <div className="rounded-2xl border border-base-300/50 bg-base-100/50 backdrop-blur-sm p-6">
              <OAuthFormFields
                register={register as Parameters<typeof OAuthFormFields>[0]["register"]}
                errors={errors}
                redirectUri={watchedRedirectUri}
              />
            </div>
          )}

          {/* Actions */}
          {selectedProvider && (
            <div className="flex gap-3 justify-end pt-4">
              <Link
                to="/integrations"
                className="px-6 py-3 rounded-lg font-medium text-base-content/60 hover:text-base-content hover:bg-base-200/50 transition-all"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`
                  px-8 py-3 rounded-lg font-semibold transition-all duration-200
                  flex items-center gap-2
                  ${isSubmitting
                    ? "bg-primary/50 text-primary-content/70 cursor-wait"
                    : "bg-primary hover:bg-primary/90 text-primary-content shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
                  }
                `}
              >
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
          )}
        </form>
      </div>
    </div>
  );
}
