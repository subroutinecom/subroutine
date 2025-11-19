import { useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { ArrowLeft, Check, ChevronDown, Github, Mail, Plug } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";
import type {
  IntegrationProvider,
  IntegrationProviderDefinition,
} from "~/types/integration";

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
    }
  }
`;

const CREATE_INTEGRATION_MUTATION = gql`
  mutation CreateIntegration(
    $provider: String!
    $name: String!
    $authConfig: String!
  ) {
    createIntegration(
      provider: $provider
      name: $name
      authConfig: $authConfig
    ) {
      id
      provider
      name
    }
  }
`;

type IntegrationFormData = {
  provider: IntegrationProvider;
  name: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
};

export const clientLoader = async () => {
  const data = await graphqlClient.request<{
    integrationProviders: IntegrationProviderDefinition[];
  }>(INTEGRATION_PROVIDERS_QUERY);
  return { providerDefinitions: data.integrationProviders ?? [] };
};

const DEFAULT_REDIRECT_BASE = "http://localhost:3002";

const getProviderIcon = (provider: IntegrationProvider) => {
  switch (provider) {
    case "github":
      return <Github size={20} />;
    case "gmail":
      return <Mail size={20} />;
    default:
      return <Plug size={20} />;
  }
};

export default function NewIntegrationPage() {
  const navigate = useNavigate();
  const { activeOrganization: _activeOrganization } = useAuth();
  const { providerDefinitions } = useLoaderData<typeof clientLoader>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getProviderDefinition = (id: IntegrationProvider) =>
    providerDefinitions.find((provider) => provider.id === id);

  const initialProviderId = useMemo<IntegrationProvider>(() => {
    return providerDefinitions[0]?.id ?? "gmail";
  }, [providerDefinitions]);

  const buildDefaultRedirectUri = (definition?: IntegrationProviderDefinition) => {
    const redirectPath = definition?.oauthConfig?.defaultRedirectPath ?? "/api/oauth/callback";
    if (redirectPath.startsWith("http://") || redirectPath.startsWith("https://")) {
      return redirectPath;
    }
    return `${DEFAULT_REDIRECT_BASE}${redirectPath}`;
  };

  const initialScopes = useMemo(() => {
    const definition = getProviderDefinition(initialProviderId);
    return definition?.oauthConfig?.defaultScopes ?? [];
  }, [initialProviderId, providerDefinitions]);

  const initialRedirectUri = useMemo(() => {
    const definition = getProviderDefinition(initialProviderId);
    return buildDefaultRedirectUri(definition);
  }, [initialProviderId, providerDefinitions]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<IntegrationFormData>({
    defaultValues: {
      provider: initialProviderId,
      name: "",
      clientId: "",
      clientSecret: "",
      scopes: initialScopes.join(", "),
      redirectUri: initialRedirectUri,
    },
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleProviderChange = (newProvider: IntegrationProvider) => {
    const definition = getProviderDefinition(newProvider);
    setValue("provider", newProvider);
    setValue("scopes", (definition?.oauthConfig?.defaultScopes ?? []).join(", "));
    setValue("redirectUri", buildDefaultRedirectUri(definition));
    setDropdownOpen(false);
  };

  const onSubmit = async (data: IntegrationFormData) => {
    setServerError(null);

    const scopeArray = data.scopes
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (scopeArray.length === 0) {
      setServerError("At least one scope is required");
      return;
    }

    const definition = getProviderDefinition(data.provider);
    if (!definition || definition.authType !== "oauth2" || !definition.oauthConfig) {
      setServerError("Selected provider is not configured for OAuth2");
      return;
    }

    try {
      const authConfig = JSON.stringify({
        type: "oauth2" as const,
        clientId: data.clientId.trim(),
        clientSecret: data.clientSecret.trim(),
        scopes: scopeArray,
        authUrl: definition.oauthConfig.authUrl,
        tokenUrl: definition.oauthConfig.tokenUrl,
        redirectUri: data.redirectUri.trim(),
      });

      await graphqlClient.request<{
        createIntegration: {
          id: string;
          provider: string;
          name: string;
        };
      }>(CREATE_INTEGRATION_MUTATION, {
        provider: data.provider,
        name: data.name.trim(),
        authConfig,
      });

      navigate("/integrations");
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to create integration",
      );
    }
  };

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

          <Controller
            name="provider"
            control={control}
            render={({ field }) => {
              const selectedDefinition = getProviderDefinition(field.value);
              return (
                <div className="space-y-3">
                  <label htmlFor="provider" className="block">
                    <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                      Provider
                    </span>
                  </label>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="w-full input input-bordered h-auto p-0 flex items-center justify-between cursor-pointer hover:border-primary/50 transition-all group"
                    >
                      <div className="flex items-center gap-3 px-4 py-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/15 transition-colors">
                          {getProviderIcon(field.value)}
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="font-semibold text-base-content capitalize">
                            {selectedDefinition?.name ?? field.value}
                          </span>
                          {selectedDefinition?.description && (
                            <span className="text-xs text-base-content/60">
                              {selectedDefinition.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="px-4">
                        <ChevronDown
                          size={20}
                          className={`text-base-content/70 transition-transform duration-300 ${
                            dropdownOpen ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </button>

                    {dropdownOpen && (
                      <div className="absolute z-50 w-full mt-2 bg-base-100 border border-neutral/20 rounded-lg overflow-hidden shadow-xl animate-slide-in-top">
                        <div className="py-1">
                          {providerDefinitions.map((definition) => {
                            const isSelected = field.value === definition.id;
                            return (
                              <button
                                key={definition.id}
                                type="button"
                                onClick={() => handleProviderChange(definition.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 transition-all ${
                                  isSelected
                                    ? "bg-primary/10 text-primary"
                                    : "hover:bg-base-200 text-base-content"
                                }`}
                              >
                                <div
                                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? "bg-primary text-primary-content"
                                      : "bg-base-200 text-primary"
                                  }`}
                                >
                                  {getProviderIcon(definition.id)}
                                </div>
                                <div className="flex-1 flex flex-col items-start">
                                  <span className="font-semibold">{definition.name}</span>
                                  {definition.description && (
                                    <span className="text-xs text-base-content/60">
                                      {definition.description}
                                    </span>
                                  )}
                                </div>
                                {isSelected && <Check size={20} className="text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-base-content/60">
                    Select the service you want to integrate with
                  </p>
                </div>
              );
            }}
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
            <p className="text-sm text-base-content/60">
              A descriptive name for this integration
            </p>
          </div>

          <div className="space-y-3">
            <label htmlFor="clientId" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Client ID
              </span>
            </label>
            <input
              id="clientId"
              type="text"
              {...register("clientId", { required: "Client ID is required" })}
              placeholder="OAuth Client ID"
              className="input input-bordered w-full font-mono text-sm"
            />
            {errors.clientId && <p className="text-sm text-error">{errors.clientId.message}</p>}
          </div>

          <div className="space-y-3">
            <label htmlFor="clientSecret" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Client Secret
              </span>
            </label>
            <input
              id="clientSecret"
              type="password"
              {...register("clientSecret", {
                required: "Client Secret is required",
              })}
              placeholder="OAuth Client Secret"
              className="input input-bordered w-full font-mono text-sm"
            />
            {errors.clientSecret && (
              <p className="text-sm text-error">{errors.clientSecret.message}</p>
            )}
            <p className="text-sm text-warning flex items-center gap-2">
              <span className="inline-block w-1 h-1 rounded-full bg-warning"></span>
              This will be stored encrypted
            </p>
          </div>

          <div className="space-y-3">
            <label htmlFor="scopes" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Scopes
              </span>
            </label>
            <input
              id="scopes"
              type="text"
              {...register("scopes", { required: "Scopes are required" })}
              placeholder="Comma-separated scopes"
              className="input input-bordered w-full font-mono text-sm"
            />
            {errors.scopes && <p className="text-sm text-error">{errors.scopes.message}</p>}
            <p className="text-sm text-base-content/60">
              OAuth scopes required for this integration (comma-separated)
            </p>
          </div>

          <div className="space-y-3">
            <label htmlFor="redirectUri" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Redirect URI
              </span>
            </label>
            <input
              id="redirectUri"
              type="url"
              {...register("redirectUri", {
                required: "Redirect URI is required",
              })}
              placeholder="OAuth Redirect URI"
              className="input input-bordered w-full font-mono text-sm"
            />
            {errors.redirectUri && (
              <p className="text-sm text-error">{errors.redirectUri.message}</p>
            )}
            <p className="text-sm text-base-content/60">
              The callback URL configured in your OAuth app
            </p>
          </div>

          <div className="border-t border-base-300 pt-6"></div>

          <div className="flex gap-3 justify-end">
            <Link to="/integrations" className="btn btn-ghost px-6">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary px-8"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Creating...
                  </>
                )
                : (
                  "Create Integration"
                )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
