import { useMemo, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
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
  ProviderSelector,
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
      openapiConfig {
        baseUrl
        authStrategy {
          type
          headerName
          headers
        }
      }
    }
    isSuperadmin
  }
`;

const CREATE_INTEGRATION_MUTATION = gql`
  mutation CreateIntegration(
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

export default function NewIntegrationPage() {
  const navigate = useNavigate();
  const config = useAdminConfig();
  const client = useMemo(() => createGraphqlClient(config), [config]);
  const { providerDefinitions: allProviders, isSuperadmin } = useLoaderData<typeof clientLoader>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("");
  const [makeGlobal, setMakeGlobal] = useState<boolean>(false);

  // Filter to only show MCP, GraphQL, and OpenAPI providers (no OAuth providers or mocks)
  const providerDefinitions = useMemo(
    () => allProviders.filter((p) => p.authType === "mcp" || p.authType === "graphql" || p.authType === "openapi"),
    [allProviders]
  );

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
    control,
    formState: { errors, isSubmitting },
  } = form;

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

    // Build the config using the utility
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

      <div className="max-w-3xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {serverError && (
            <div className="rounded-xl border-2 border-error/30 bg-error/10 p-4">
              <p className="text-error text-sm font-medium">{serverError}</p>
            </div>
          )}

          {/* Main form card */}
          <div className="rounded-2xl border border-base-300/50 bg-base-100/50 backdrop-blur-sm p-8 space-y-8">
            <ProviderSelector
              control={control}
              providerDefinitions={providerDefinitions}
            />

            {/* Details Section */}
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
                <p className="text-xs text-base-content/40 pl-1">
                  A descriptive name for this integration
                </p>
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
                  placeholder="Helps the AI understand when and how to use this integration..."
                  className={`${inputClasses} min-h-[100px] resize-y`}
                />
                <p className="text-xs text-base-content/40 pl-1">
                  Context for AI to determine when this integration is relevant
                </p>
              </div>
            </div>

            {/* Make Global toggle - only visible to superadmins */}
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

          {/* Protocol-specific configuration card */}
          {(isMcpProvider || isGraphQLProvider || isOpenAPIProvider) && (
            <div className="rounded-2xl border border-base-300/50 bg-base-100/50 backdrop-blur-sm p-8">
              {/* MCP-specific fields */}
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

              {/* GraphQL-specific fields */}
              {isGraphQLProvider && (
                <GraphQLFormFields
                  register={register as Parameters<typeof GraphQLFormFields>[0]["register"]}
                  errors={errors}
                  watchedAuthStrategy={watchedAuthStrategy}
                  watchedApiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
                  redirectUri={watchedRedirectUri}
                />
              )}

              {/* OpenAPI-specific fields */}
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

          {/* OAuth2-specific fields (legacy - shouldn't show with filtered providers) */}
          {!isMcpProvider && !isGraphQLProvider && !isOpenAPIProvider && (
            <div className="rounded-2xl border border-base-300/50 bg-base-100/50 backdrop-blur-sm p-8">
              <OAuthFormFields
                register={register as Parameters<typeof OAuthFormFields>[0]["register"]}
                errors={errors}
                redirectUri={watchedRedirectUri}
              />
            </div>
          )}

          {/* Actions */}
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
                  ? 'bg-primary/50 text-primary-content/70 cursor-wait'
                  : 'bg-primary hover:bg-primary/90 text-primary-content shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30'
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
        </form>
      </div>
    </div>
  );
}
