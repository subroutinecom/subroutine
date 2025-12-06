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
  const { providerDefinitions, isSuperadmin } = useLoaderData<typeof clientLoader>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("");
  const [makeGlobal, setMakeGlobal] = useState<boolean>(false);

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

  // Handle probe server
  const handleProbeServer = async () => {
    setServerError(null);
    const result = await probeServer(watchedServerUrl);
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

          <div className="space-y-3">
            <label htmlFor="description" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Description
              </span>
              <span className="text-sm text-base-content/60 ml-2">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., GitHub integration for accessing repositories and managing pull requests"
              className="textarea textarea-bordered w-full text-base min-h-[80px]"
            />
            <p className="text-sm text-base-content/60">
              A description that helps the AI understand when to use this integration
            </p>
          </div>

          {/* Make Global toggle - only visible to superadmins */}
          {isSuperadmin && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label htmlFor="makeGlobal" className="flex items-center gap-3 cursor-pointer">
                  <input
                    id="makeGlobal"
                    type="checkbox"
                    checked={makeGlobal}
                    onChange={(e) => setMakeGlobal(e.target.checked)}
                    className="toggle toggle-primary"
                  />
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Make Global
                  </span>
                </label>
              </div>
              <p className="text-sm text-base-content/60">
                Global integrations are available to all organizations and can be used by any user.
              </p>
            </div>
          )}

          {/* MCP-specific fields */}
          {isMcpProvider && (
            <McpFormFields
              register={register}
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
              register={register}
              errors={errors}
              watchedAuthStrategy={watchedAuthStrategy}
              watchedApiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
              redirectUri={watchedRedirectUri}
            />
          )}

          {/* OAuth2-specific fields */}
          {!isMcpProvider && !isGraphQLProvider && <OAuthFormFields register={register} errors={errors} />}

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
