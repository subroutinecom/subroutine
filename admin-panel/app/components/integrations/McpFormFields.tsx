import { Search, CheckCircle, Loader2, Zap } from "lucide-react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AuthStrategyType, McpDiscoveryResult, McpDiscoveryAuthMethod } from "./types";
import { AuthStrategySelector } from "./AuthStrategySelector";
import { AuthFields } from "./AuthFields";

// deno-lint-ignore no-explicit-any
type AnyFormRegister = UseFormRegister<any>;
// deno-lint-ignore no-explicit-any
type AnyFormErrors = FieldErrors<any>;

interface McpFormFieldsProps {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  watchedAuthStrategy: AuthStrategyType;
  watchedApiKeyIsViewerScoped?: boolean;
  serverUrl?: string;
  onProbeServer: () => Promise<void>;
  isProbing: boolean;
  discoveryResult: McpDiscoveryResult | null;
  onSelectAuthMethod: (method: McpDiscoveryAuthMethod) => void;
  redirectUri?: string;
}

const inputClasses = `
  w-full px-4 py-3 rounded-lg
  bg-base-200/50 border-2 border-base-300/50
  text-base-content placeholder:text-base-content/30
  focus:outline-none focus:border-primary/50 focus:bg-base-200/70
  transition-all duration-200
`;

export const McpFormFields = ({
  register,
  errors,
  watchedAuthStrategy,
  watchedApiKeyIsViewerScoped,
  serverUrl,
  onProbeServer,
  isProbing,
  discoveryResult,
  onSelectAuthMethod,
  redirectUri,
}: McpFormFieldsProps) => {
  return (
    <div className="space-y-8">
      {/* Connection Section */}
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
            Connection
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
        </div>

        {/* Server URL with discover button */}
        <div className="space-y-2">
          <label htmlFor="serverUrl" className="text-sm font-medium text-base-content/70">
            Server URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="serverUrl"
                type="url"
                {...register("serverUrl", { required: "Server URL is required" })}
                placeholder="https://mcp-server.example.com"
                className={inputClasses}
              />
            </div>
            <button
              type="button"
              onClick={onProbeServer}
              disabled={!serverUrl || isProbing}
              className={`
                px-5 py-3 rounded-lg font-medium transition-all duration-200
                flex items-center gap-2 border-2
                ${isProbing
                  ? 'border-primary/30 bg-primary/5 text-primary cursor-wait'
                  : serverUrl
                    ? 'border-emerald-500/50 hover:border-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                    : 'border-base-300/50 bg-base-200/50 text-base-content/30 cursor-not-allowed'
                }
              `}
            >
              {isProbing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Probing</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Discover</span>
                </>
              )}
            </button>
          </div>
          {errors.serverUrl && (
            <p className="text-sm text-error">{String(errors.serverUrl.message)}</p>
          )}
          <p className="text-xs text-base-content/40 pl-1">
            MCP server endpoint. Click Discover to auto-detect authentication methods.
          </p>
        </div>

        {/* Discovery Result */}
        {discoveryResult && (
          <DiscoveryResultCard
            result={discoveryResult}
            onSelectAuthMethod={onSelectAuthMethod}
            currentStrategy={watchedAuthStrategy}
          />
        )}

        {/* Transport */}
        <div className="space-y-2">
          <label htmlFor="transport" className="text-sm font-medium text-base-content/70">
            Transport Protocol
          </label>
          <select
            id="transport"
            {...register("transport")}
            className={`${inputClasses} cursor-pointer`}
          >
            <option value="sse">SSE (Server-Sent Events)</option>
            <option value="streamable-http">Streamable HTTP</option>
          </select>
          <p className="text-xs text-base-content/40 pl-1">
            Communication method for the MCP connection
          </p>
        </div>
      </div>

      {/* Auth Strategy */}
      <AuthStrategySelector
        register={register}
        errors={errors}
        currentStrategy={watchedAuthStrategy}
      />

      {/* Auth Fields */}
      <AuthFields
        register={register}
        errors={errors}
        authStrategy={watchedAuthStrategy}
        apiKeyIsViewerScoped={watchedApiKeyIsViewerScoped}
        redirectUri={redirectUri}
      />
    </div>
  );
};

// Discovery result display
const DiscoveryResultCard = ({
  result,
  onSelectAuthMethod,
  currentStrategy,
}: {
  result: McpDiscoveryResult;
  onSelectAuthMethod: (method: McpDiscoveryAuthMethod) => void;
  currentStrategy: AuthStrategyType;
}) => {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5">
      {/* Decorative corner accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/20 to-transparent" />

      <div className="relative flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <CheckCircle size={20} className="text-emerald-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-base-content">Server Discovered</span>
            <Zap size={14} className="text-emerald-400" />
          </div>

          <p className="text-sm text-base-content/60">
            {result.serverInfo.name}
            {result.serverInfo.version && (
              <span className="ml-2 text-xs font-mono text-base-content/40">
                v{result.serverInfo.version}
              </span>
            )}
          </p>

          {/* Auth methods from discovery */}
          {result.authMethods && result.authMethods.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-base-content/50 uppercase tracking-wide">
                Detected Authentication
              </div>
              <div className="flex flex-wrap gap-2">
                {result.authMethods.map((method, idx) => {
                  const isActive = currentStrategy === method.type;
                  const label = method.type === "bearer_oauth"
                    ? "OAuth 2.0"
                    : method.type === "api_key"
                      ? "API Key"
                      : "None";

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSelectAuthMethod(method)}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
                        border-2
                        ${isActive
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                          : 'border-base-content/20 hover:border-emerald-500/50 bg-base-100/50 text-base-content/70 hover:text-emerald-300'
                        }
                      `}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
