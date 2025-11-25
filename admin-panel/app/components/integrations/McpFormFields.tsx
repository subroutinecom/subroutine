import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { IntegrationFormData } from "./ProviderSelector";

type McpAuthStrategyType = "none" | "api_key" | "bearer_passthrough" | "custom_headers";

interface McpFormFieldsProps {
  register: UseFormRegister<IntegrationFormData>;
  errors: FieldErrors<IntegrationFormData>;
  watchedAuthStrategy: McpAuthStrategyType;
}

export const McpFormFields = ({ register, errors, watchedAuthStrategy }: McpFormFieldsProps) => {
  return (
    <>
      <div className="space-y-3">
        <label htmlFor="serverUrl" className="block">
          <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
            Server URL
          </span>
        </label>
        <input
          id="serverUrl"
          type="url"
          {...register("serverUrl")}
          placeholder="https://example.com/mcp"
          className="input input-bordered w-full font-mono text-sm"
        />
        {errors.serverUrl && <p className="text-sm text-error">{errors.serverUrl.message}</p>}
        <p className="text-sm text-base-content/60">The URL of the MCP server endpoint</p>
      </div>

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
        <div className="alert alert-info">
          <span>
            Bearer passthrough will use the viewer&apos;s OAuth access token to authenticate with
            the MCP server. Users will need to connect their accounts via OAuth.
          </span>
        </div>
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
          <p className="text-sm text-base-content/60">
            JSON object of headers to include in MCP requests
          </p>
        </div>
      )}
    </>
  );
};
