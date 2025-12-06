import { Key, Shield, UserCheck } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { IntegrationFormData } from "./ProviderSelector";

// Full auth strategy type from form (includes MCP's bearer_oauth for type compatibility)
type AuthStrategyType = "none" | "api_key" | "bearer_oauth" | "bearer_oauth" | "custom_headers";

interface GraphQLFormFieldsProps {
  register: UseFormRegister<IntegrationFormData>;
  errors: FieldErrors<IntegrationFormData>;
  watchedAuthStrategy: AuthStrategyType;
  watchedApiKeyIsViewerScoped?: boolean;
  redirectUri?: string;
}

export const GraphQLFormFields = ({
  register,
  errors,
  watchedAuthStrategy,
  watchedApiKeyIsViewerScoped,
  redirectUri,
}: GraphQLFormFieldsProps) => {
  return (
    <>
      <div className="space-y-3">
        <label htmlFor="graphqlEndpoint" className="block">
          <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
            GraphQL Endpoint
          </span>
        </label>
        <input
          id="graphqlEndpoint"
          type="url"
          {...register("graphqlEndpoint")}
          placeholder="https://api.example.com/graphql"
          className="input input-bordered w-full font-mono text-sm"
        />
        {errors.graphqlEndpoint && (
          <p className="text-sm text-error">{errors.graphqlEndpoint.message}</p>
        )}
        <p className="text-sm text-base-content/60">
          The URL of the GraphQL API endpoint
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="authStrategyType" className="block">
          <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
            Authentication
          </span>
        </label>
        <select
          id="authStrategyType"
          {...register("authStrategyType")}
          className="select select-bordered w-full"
        >
          <option value="none">No Authentication</option>
          <option value="api_key">API Key</option>
          <option value="bearer_oauth">Bearer Token (OAuth)</option>
          <option value="custom_headers">Custom Headers</option>
        </select>
        <p className="text-sm text-base-content/60">
          How to authenticate with the GraphQL server
        </p>
      </div>

      {/* Auth method explanation cards */}
      {watchedAuthStrategy === "none" && (
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body py-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-base-content/50 mt-0.5" />
              <div>
                <h4 className="font-medium text-base-content">Public API</h4>
                <p className="text-sm text-base-content/60 mt-1">
                  No authentication required. Use this for public GraphQL APIs.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {watchedAuthStrategy === "api_key" && (
        <>
          {/* Viewer-scoped toggle */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                {...register("apiKeyIsViewerScoped")}
                className="checkbox checkbox-primary mt-1"
              />
              <div>
                <span className="font-medium text-base-content">
                  Personal Access Token (viewer-scoped)
                </span>
                <p className="text-sm text-base-content/60 mt-1">
                  Each user will provide their own token when connecting their account
                </p>
              </div>
            </label>
          </div>

          {/* Org-level API key explanation and field */}
          {!watchedApiKeyIsViewerScoped && (
            <>
              <div className="alert bg-base-200 border-base-300">
                <Key className="w-4 h-4" />
                <span className="text-sm">
                  This API key will be used for all requests and is shared across all users.
                </span>
              </div>

              <div className="space-y-3">
                <label htmlFor="apiKey" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    API Key
                  </span>
                </label>
                <input
                  id="apiKey"
                  type="password"
                  {...register("apiKey")}
                  placeholder="Your API key"
                  className="input input-bordered w-full font-mono text-sm"
                />
                <p className="text-sm text-warning flex items-center gap-2">
                  <span className="inline-block w-1 h-1 rounded-full bg-warning"></span>
                  This will be stored encrypted
                </p>
              </div>
            </>
          )}

          {/* Viewer-scoped PAT explanation */}
          {watchedApiKeyIsViewerScoped && (
            <div className="alert bg-base-200 border-base-300">
              <UserCheck className="w-4 h-4" />
              <span className="text-sm">
                Users will be prompted to enter their Personal Access Token when they connect.
              </span>
            </div>
          )}

          <div className="space-y-3">
            <label htmlFor="apiKeyHeaderName" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Header Name (Optional)
              </span>
            </label>
            <input
              id="apiKeyHeaderName"
              type="text"
              {...register("apiKeyHeaderName")}
              placeholder="Authorization (default)"
              className="input input-bordered w-full font-mono text-sm"
            />
            <p className="text-sm text-base-content/60">
              The HTTP header name. Defaults to &quot;Authorization&quot;.
            </p>
          </div>
        </>
      )}

      {watchedAuthStrategy === "bearer_oauth" && (
        <>
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body py-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-base-content">OAuth Authentication</h4>
                  <p className="text-sm text-base-content/60 mt-1">
                    Users will authenticate via OAuth. Their access token will be passed
                    to the GraphQL server.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* OAuth Configuration */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-base-content/70 hover:text-base-content flex items-center gap-2">
              <span
                className="inline-block transition-transform group-open:rotate-90"
                style={{ fontSize: "0.75rem" }}
              >
                &#9654;
              </span>
              OAuth Configuration
            </summary>
            <div className="mt-4 space-y-4 pl-4 border-l-2 border-base-300">
              <div className="space-y-3">
                <label htmlFor="clientId" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Client ID
                  </span>
                </label>
                <input
                  id="clientId"
                  type="text"
                  {...register("clientId")}
                  placeholder="OAuth client ID"
                  className="input input-bordered w-full font-mono text-sm"
                />
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
                  {...register("clientSecret")}
                  placeholder="OAuth client secret"
                  className="input input-bordered w-full font-mono text-sm"
                />
              </div>

              <div className="space-y-3">
                <label htmlFor="oauthAuthUrl" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Authorization URL
                  </span>
                </label>
                <input
                  id="oauthAuthUrl"
                  type="url"
                  {...register("oauthAuthUrl")}
                  placeholder="https://auth.example.com/authorize"
                  className="input input-bordered w-full font-mono text-sm"
                />
              </div>

              <div className="space-y-3">
                <label htmlFor="oauthTokenUrl" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Token URL
                  </span>
                </label>
                <input
                  id="oauthTokenUrl"
                  type="url"
                  {...register("oauthTokenUrl")}
                  placeholder="https://auth.example.com/token"
                  className="input input-bordered w-full font-mono text-sm"
                />
              </div>

              <div className="space-y-3">
                <label htmlFor="oauthScopes" className="block">
                  <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                    Scopes
                  </span>
                </label>
                <input
                  id="oauthScopes"
                  type="text"
                  {...register("oauthScopes")}
                  placeholder="read write (space-separated)"
                  className="input input-bordered w-full font-mono text-sm"
                />
              </div>

              {redirectUri && (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                      Redirect URI
                    </span>
                  </label>
                  <input
                    type="text"
                    value={redirectUri}
                    readOnly
                    className="input input-bordered w-full font-mono text-sm bg-base-200"
                  />
                  <p className="text-sm text-base-content/60">
                    Configure this in your OAuth provider settings
                  </p>
                </div>
              )}
            </div>
          </details>
        </>
      )}

      {watchedAuthStrategy === "custom_headers" && (
        <>
          <div className="card bg-base-200 border border-base-300">
            <div className="card-body py-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-base-content/50 mt-0.5" />
                <div>
                  <h4 className="font-medium text-base-content">Custom Headers</h4>
                  <p className="text-sm text-base-content/60 mt-1">
                    Add custom HTTP headers for authentication. These will be sent with every request.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="customHeaders" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Headers (JSON)
              </span>
            </label>
            <textarea
              id="customHeaders"
              {...register("customHeaders")}
              placeholder='{"X-API-Key": "your-key"}'
              className="textarea textarea-bordered w-full font-mono text-sm h-24"
            />
            <p className="text-sm text-base-content/60">
              Enter headers as a JSON object
            </p>
          </div>
        </>
      )}
    </>
  );
};
