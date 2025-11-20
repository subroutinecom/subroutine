import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { gql } from "graphql-request";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "~/components/ui/PageHeader";
import { graphqlClient } from "~/lib/graphql-client";
import type { IntegrationAuthConfig } from "~/types/integration";

export function meta() {
  return [
    { title: "Edit Integration - Subroutine" },
    { name: "description", content: "Edit integration configuration" },
  ];
}

const GET_INTEGRATION_QUERY = gql`
  query GetIntegration($id: String!) {
    integration(id: $id) {
      id
      organizationId
      provider
      name
      authConfig
      enabled
      createdAt
      updatedAt
    }
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
  createdAt: string;
  updatedAt: string;
}

interface ParsedIntegration extends Omit<IntegrationResponse, "authConfig"> {
  authConfig: IntegrationAuthConfig;
}

type IntegrationFormData = {
  name: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
  enabled: boolean;
};

export default function EditIntegrationPage() {
  const navigate = useNavigate();
  const params = useParams();
  const { activeOrganization } = useAuth();
  const integrationId = params.integrationId!;

  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<ParsedIntegration | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IntegrationFormData>({
    defaultValues: {
      name: "",
      clientId: "",
      clientSecret: "",
      scopes: "",
      redirectUri: "",
      enabled: true,
    },
  });

  useEffect(() => {
    const fetchIntegration = async () => {
      try {
        setLoading(true);
        const data = await graphqlClient.request<{ integration: IntegrationResponse }>(
          GET_INTEGRATION_QUERY,
          { id: integrationId }
        );
        const parsed: ParsedIntegration = {
          ...data.integration,
          authConfig: JSON.parse(data.integration.authConfig) as IntegrationAuthConfig,
        };
        setIntegration(parsed);
        reset({
          name: parsed.name,
          clientId: parsed.authConfig.clientId,
          clientSecret: "",
          scopes: parsed.authConfig.scopes.join(", "),
          redirectUri: parsed.authConfig.redirectUri,
          enabled: parsed.enabled,
        });
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

    const scopeArray = data.scopes
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (scopeArray.length === 0) {
      setServerError("At least one scope is required");
      return;
    }

    if (!integration) return;

    try {
      const secret = data.clientSecret.trim();
      const authConfigPayload: Record<string, unknown> = {
        type: "oauth2",
        clientId: data.clientId.trim(),
        scopes: scopeArray,
        authUrl: integration.authConfig.authUrl,
        tokenUrl: integration.authConfig.tokenUrl,
        redirectUri: data.redirectUri.trim(),
      };
      if (secret) {
        authConfigPayload.clientSecret = secret;
      }
      const authConfig = JSON.stringify(authConfigPayload);

      await graphqlClient.request<{
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

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">Client ID</span>
              </label>
              <input
                type="text"
                {...register("clientId", { required: "Client ID is required" })}
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
                  <span className="label-text-alt text-error">{errors.clientSecret.message}</span>
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
                {...register("scopes", { required: "Scopes are required" })}
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
                {...register("redirectUri", {
                  required: "Redirect URI is required",
                })}
                placeholder="OAuth Redirect URI"
                className="input input-bordered font-mono text-sm"
              />
              {errors.redirectUri && (
                <label className="label">
                  <span className="label-text-alt text-error">{errors.redirectUri.message}</span>
                </label>
              )}
              <label className="label">
                <span className="label-text-alt">
                  The callback URL configured in your OAuth app
                </span>
              </label>
            </div>

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
