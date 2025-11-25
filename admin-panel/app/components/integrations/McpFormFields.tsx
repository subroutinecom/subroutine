import { CheckCircle2, Key, Search, Shield, UserCheck, XCircle } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { IntegrationFormData } from "./ProviderSelector";

type McpAuthStrategyType = "none" | "api_key" | "bearer_passthrough" | "custom_headers";

export interface McpOAuthDiscoveryResult {
  success: boolean;
  serverName?: string | null;
  authorizationServer?: string | null;
  authorizationEndpoint?: string | null;
  tokenEndpoint?: string | null;
  registrationEndpoint?: string | null;
  scopesSupported?: string[] | null;
  pkceSupported?: boolean | null;
  dynamicRegistrationSupported?: boolean | null;
  error?: string | null;
}

interface McpFormFieldsProps {
  register: UseFormRegister<IntegrationFormData>;
  errors: FieldErrors<IntegrationFormData>;
  watchedAuthStrategy: McpAuthStrategyType;
  serverUrl?: string;
  onProbeServer?: () => void;
  isProbing?: boolean;
  discoveryResult?: McpOAuthDiscoveryResult | null;
  onSelectAuthMethod?: (method: McpAuthStrategyType) => void;
  redirectUri?: string;
}

export const McpFormFields = ({
  register,
  errors,
  watchedAuthStrategy,
  serverUrl,
  onProbeServer,
  isProbing,
  discoveryResult,
  onSelectAuthMethod,
  redirectUri,
}: McpFormFieldsProps) => {
  return (
    <>
      <div className="space-y-3">
        <label htmlFor="serverUrl" className="block">
          <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
            Server URL
          </span>
        </label>
        <div className="flex gap-2">
          <input
            id="serverUrl"
            type="url"
            {...register("serverUrl")}
            placeholder="https://example.com/mcp"
            className="input input-bordered flex-1 font-mono text-sm"
          />
          <button
            type="button"
            onClick={onProbeServer}
            disabled={isProbing || !serverUrl}
            title="Probe server for OAuth configuration"
            className="btn btn-ghost btn-sm gap-2 text-base-content/70 hover:text-base-content"
          >
            <Search className={`w-4 h-4 ${isProbing ? "animate-pulse" : ""}`} />
            <span className="hidden sm:inline">{isProbing ? "Probing..." : "Probe"}</span>
          </button>
        </div>
        {errors.serverUrl && <p className="text-sm text-error">{errors.serverUrl.message}</p>}
        <p className="text-sm text-base-content/60">
          The URL of the MCP server endpoint. Use Probe to auto-discover OAuth settings.
        </p>
      </div>

      {/* Discovery Result Panel */}
      {discoveryResult && (
        <div
          className={`relative mt-6 rounded-xl overflow-hidden
          ${
            discoveryResult.success
              ? "bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-cyan-500/5"
              : "bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-red-500/5"
          }`}
        >
          {/* Top accent bar */}
          <div
            className={`h-1 w-full ${
              discoveryResult.success
                ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
                : "bg-gradient-to-r from-amber-500 via-orange-500 to-red-500"
            }`}
          />

          <div className="p-5">
            {discoveryResult.success ? (
              <>
                {/* Success Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20
                    border border-emerald-500/30"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-base-content">
                      {discoveryResult.serverName
                        ? discoveryResult.serverName
                        : "Server Discovery Complete"}
                    </h4>
                    <p className="text-sm text-base-content/60 mt-0.5">
                      OAuth configuration detected. Choose your authentication method:
                    </p>
                  </div>
                </div>

                {/* Auth Options Cards */}
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  {/* API Key Option */}
                  <button
                    type="button"
                    onClick={() => onSelectAuthMethod?.("api_key")}
                    className={`group p-4 rounded-lg text-left
                      border transition-all duration-200 cursor-pointer
                      ${
                        watchedAuthStrategy === "api_key"
                          ? "bg-amber-500/10 border-amber-500/40"
                          : "bg-base-100/50 border-base-content/10 hover:border-amber-500/30 hover:bg-amber-500/5"
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Key
                        className={`w-4 h-4 ${watchedAuthStrategy === "api_key" ? "text-amber-400" : "text-amber-400/70"}`}
                      />
                      <span className="font-medium text-sm">API Key / PAT</span>
                      {watchedAuthStrategy === "api_key" && (
                        <CheckCircle2 className="w-4 h-4 text-amber-400 ml-auto" />
                      )}
                    </div>
                    <p className="text-xs text-base-content/60 leading-relaxed">
                      Use a Personal Access Token for straightforward server-to-server auth
                    </p>
                  </button>

                  {/* OAuth Option */}
                  <button
                    type="button"
                    onClick={() => onSelectAuthMethod?.("bearer_passthrough")}
                    className={`group p-4 rounded-lg text-left
                      border transition-all duration-200 cursor-pointer
                      ${
                        watchedAuthStrategy === "bearer_passthrough"
                          ? "bg-cyan-500/10 border-cyan-500/40"
                          : "bg-base-100/50 border-base-content/10 hover:border-cyan-500/30 hover:bg-cyan-500/5"
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <UserCheck
                        className={`w-4 h-4 ${watchedAuthStrategy === "bearer_passthrough" ? "text-cyan-400" : "text-cyan-400/70"}`}
                      />
                      <span className="font-medium text-sm">Bearer Passthrough</span>
                      {watchedAuthStrategy === "bearer_passthrough" && (
                        <CheckCircle2 className="w-4 h-4 text-cyan-400 ml-auto" />
                      )}
                    </div>
                    <p className="text-xs text-base-content/60 leading-relaxed">
                      Authenticate users with their own OAuth credentials
                    </p>
                  </button>
                </div>

                {/* Discovery Details (Expandable) */}
                {(discoveryResult.authorizationServer ||
                  (discoveryResult.scopesSupported &&
                    discoveryResult.scopesSupported.length > 0)) && (
                  <details className="group">
                    <summary
                      className="flex items-center gap-2 cursor-pointer text-sm
                      text-base-content/60 hover:text-base-content transition-colors
                      select-none"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>OAuth Discovery Details</span>
                      <span
                        className="ml-1 text-xs opacity-60
                        group-open:rotate-90 transition-transform"
                      >
                        ▶
                      </span>
                    </summary>

                    <div
                      className="mt-3 p-3 rounded-lg bg-base-100/30
                      border border-base-content/5 font-mono text-xs space-y-2"
                    >
                      {discoveryResult.authorizationServer && (
                        <div className="flex flex-wrap gap-x-2">
                          <span className="text-teal-400">auth_server:</span>
                          <span className="text-base-content/80 break-all">
                            {discoveryResult.authorizationServer}
                          </span>
                        </div>
                      )}
                      {discoveryResult.scopesSupported &&
                        discoveryResult.scopesSupported.length > 0 && (
                          <div className="flex flex-wrap gap-x-2">
                            <span className="text-teal-400">scopes:</span>
                            <span className="text-base-content/80">
                              [{discoveryResult.scopesSupported.join(", ")}]
                            </span>
                          </div>
                        )}
                      {discoveryResult.pkceSupported !== null &&
                        discoveryResult.pkceSupported !== undefined && (
                          <div className="flex gap-x-2">
                            <span className="text-teal-400">pkce:</span>
                            <span
                              className={
                                discoveryResult.pkceSupported
                                  ? "text-emerald-400"
                                  : "text-base-content/50"
                              }
                            >
                              {discoveryResult.pkceSupported ? "supported" : "not_supported"}
                            </span>
                          </div>
                        )}
                      {discoveryResult.dynamicRegistrationSupported && (
                        <div className="flex gap-x-2">
                          <span className="text-teal-400">dynamic_registration:</span>
                          <span className="text-emerald-400">supported</span>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {/* Auto-fill notification */}
                {watchedAuthStrategy === "bearer_passthrough" && (
                  <div
                    className="mt-4 flex items-center gap-2 text-sm text-emerald-400
                    bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>OAuth endpoints auto-filled from discovery</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Error State */}
                <div className="flex items-start gap-3">
                  <div
                    className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20
                    border border-amber-500/30"
                  >
                    <XCircle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-base-content">OAuth Discovery Unavailable</h4>
                    <p className="text-sm text-base-content/60 mt-1">{discoveryResult.error}</p>
                    <p className="text-sm text-base-content/40 mt-2">
                      You can still use API Key authentication or configure OAuth manually.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
            Transport
          </span>
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              {...register("transport")}
              value="streamable-http"
              className="radio radio-primary"
            />
            <span className="text-base-content">Streamable HTTP</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              {...register("transport")}
              value="sse"
              className="radio radio-primary"
            />
            <span className="text-base-content">SSE (Server-Sent Events)</span>
          </label>
        </div>
        <p className="text-sm text-base-content/60">Transport protocol for MCP communication</p>
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
          <option value="bearer_passthrough">Bearer Passthrough (OAuth)</option>
          <option value="custom_headers">Custom Headers</option>
        </select>
        <p className="text-sm text-base-content/60">How to authenticate with the MCP server</p>
      </div>

      {watchedAuthStrategy === "api_key" && (
        <>
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
              Custom header name for API key. Defaults to Authorization with Bearer prefix.
            </p>
          </div>
        </>
      )}

      {watchedAuthStrategy === "bearer_passthrough" && (
        <>
          <div className="alert alert-info mb-2">
            <span>
              Bearer passthrough will use the viewer&apos;s OAuth access token to authenticate with
              the MCP server. Create an OAuth app with your provider and enter the credentials
              below.
            </span>
          </div>

          {/* Primary fields - Client ID and Secret */}
          <div className="space-y-3">
            <label htmlFor="clientId" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                OAuth Client ID
              </span>
            </label>
            <input
              id="clientId"
              type="text"
              {...register("clientId")}
              placeholder="your-oauth-client-id"
              className="input input-bordered w-full font-mono text-sm"
            />
            {errors.clientId && <p className="text-sm text-error">{errors.clientId.message}</p>}
          </div>

          <div className="space-y-3">
            <label htmlFor="clientSecret" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                OAuth Client Secret
              </span>
            </label>
            <input
              id="clientSecret"
              type="password"
              {...register("clientSecret")}
              placeholder="your-oauth-client-secret"
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

          {/* Redirect URI - Display only */}
          <div className="space-y-3">
            <label htmlFor="redirectUriDisplay" className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                OAuth Redirect URI
              </span>
            </label>
            <input
              id="redirectUriDisplay"
              type="text"
              value={redirectUri || ""}
              readOnly
              disabled
              className="input input-bordered w-full font-mono text-sm bg-base-200 text-base-content/70"
            />
            {/* Hidden input to keep react-hook-form happy */}
            <input type="hidden" {...register("redirectUri")} />
            <p className="text-sm text-base-content/60">
              Use this URL when configuring your OAuth app&apos;s redirect/callback settings
            </p>
          </div>

          {/* OAuth Endpoints - Auto-filled from discovery, collapsible */}
          <details className="group" open={!discoveryResult?.success}>
            <summary className="cursor-pointer text-sm font-semibold text-base-content/70 hover:text-base-content flex items-center gap-2 select-none py-2">
              <span className="group-open:rotate-90 transition-transform">▶</span>
              OAuth Endpoints & Scopes
              {discoveryResult?.success && (
                <span className="text-xs font-normal text-emerald-500 ml-2">
                  (auto-filled from discovery)
                </span>
              )}
            </summary>

            <div className="space-y-6 mt-4 pl-4 border-l-2 border-base-content/10">
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
                  placeholder="https://provider.com/oauth/authorize"
                  className="input input-bordered w-full font-mono text-sm"
                />
                {errors.oauthAuthUrl && (
                  <p className="text-sm text-error">{errors.oauthAuthUrl.message}</p>
                )}
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
                  placeholder="https://provider.com/oauth/token"
                  className="input input-bordered w-full font-mono text-sm"
                />
                {errors.oauthTokenUrl && (
                  <p className="text-sm text-error">{errors.oauthTokenUrl.message}</p>
                )}
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
                  {...register("scopes")}
                  placeholder="read, write, profile"
                  className="input input-bordered w-full font-mono text-sm"
                />
                {errors.scopes && <p className="text-sm text-error">{errors.scopes.message}</p>}
                <p className="text-sm text-base-content/60">Comma-separated list of OAuth scopes</p>
              </div>
            </div>
          </details>
        </>
      )}

      {watchedAuthStrategy === "custom_headers" && (
        <div className="space-y-3">
          <label htmlFor="customHeaders" className="block">
            <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
              Custom Headers (JSON)
            </span>
          </label>
          <textarea
            id="customHeaders"
            {...register("customHeaders")}
            placeholder='{"X-API-Key": "your-key", "X-Custom": "value"}'
            className="textarea textarea-bordered w-full font-mono text-sm h-24"
          />
          {errors.customHeaders && (
            <p className="text-sm text-error">{errors.customHeaders.message}</p>
          )}
          <p className="text-sm text-base-content/60">
            JSON object of headers to include in MCP requests. Must have at least one header.
          </p>
        </div>
      )}
    </>
  );
};
