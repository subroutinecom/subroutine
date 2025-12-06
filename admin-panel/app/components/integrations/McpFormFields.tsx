import { Search, CheckCircle, Loader2 } from "lucide-react";
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
    <div className="space-y-6">
      {/* Server URL */}
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
            {...register("serverUrl", { required: "Server URL is required" })}
            placeholder="https://mcp-server.example.com"
            className="input input-bordered flex-1"
          />
          <button
            type="button"
            onClick={onProbeServer}
            disabled={!serverUrl || isProbing}
            className="btn btn-outline gap-2"
          >
            {isProbing ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Search size={18} />
            )}
            Discover
          </button>
        </div>
        {errors.serverUrl && <p className="text-sm text-error">{String(errors.serverUrl.message)}</p>}
        <p className="text-sm text-base-content/60">
          MCP server endpoint. Click Discover to detect authentication methods.
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
      <div className="space-y-3">
        <label htmlFor="transport" className="block">
          <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
            Transport
          </span>
        </label>
        <select id="transport" {...register("transport")} className="select select-bordered w-full">
          <option value="sse">SSE (Server-Sent Events)</option>
          <option value="streamable-http">Streamable HTTP</option>
        </select>
        <p className="text-sm text-base-content/60">
          Communication protocol for the MCP connection
        </p>
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
    <div className="alert bg-success/10 border-success/30">
      <CheckCircle size={20} className="text-success" />
      <div className="flex-1">
        <div className="font-medium">Server discovered</div>
        <div className="text-sm text-base-content/70">
          {result.serverInfo.name}
          {result.serverInfo.version && ` v${result.serverInfo.version}`}
        </div>

        {/* Auth methods from discovery */}
        {result.authMethods && result.authMethods.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="text-sm font-medium">Available authentication:</div>
            <div className="flex flex-wrap gap-2">
              {result.authMethods.map((method, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectAuthMethod(method)}
                  className={`btn btn-sm ${
                    currentStrategy === method.type ? "btn-primary" : "btn-outline"
                  }`}
                >
                  {method.type === "bearer_oauth" ? "OAuth 2.0" : method.type === "api_key" ? "API Key" : "None"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
