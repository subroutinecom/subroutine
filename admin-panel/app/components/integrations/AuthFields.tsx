import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AuthStrategyType } from "./types";

// Common field names expected in both IntegrationFormData and EditFormData
type CommonAuthFields = {
  apiKeyHeaderName?: string;
  apiKeyIsViewerScoped?: boolean;
  apiKey?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthAuthUrl?: string;
  oauthTokenUrl?: string;
  oauthScopes?: string;
  customHeaders?: string;
};

// deno-lint-ignore no-explicit-any
type AnyFormRegister = UseFormRegister<any>;
// deno-lint-ignore no-explicit-any
type AnyFormErrors = FieldErrors<any>;

interface AuthFieldsProps {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  authStrategy: AuthStrategyType;
  apiKeyIsViewerScoped?: boolean;
  redirectUri?: string;
}

export const AuthFields = ({
  register,
  errors,
  authStrategy,
  apiKeyIsViewerScoped,
  redirectUri,
}: AuthFieldsProps) => {
  if (authStrategy === "none") {
    return null;
  }

  if (authStrategy === "api_key") {
    return <ApiKeyFields register={register} errors={errors} isViewerScoped={apiKeyIsViewerScoped} />;
  }

  if (authStrategy === "bearer_oauth") {
    return <OAuthFields register={register} errors={errors} redirectUri={redirectUri} />;
  }

  if (authStrategy === "custom_headers") {
    return <CustomHeadersFields register={register} errors={errors} />;
  }

  return null;
};

// API Key fields
const ApiKeyFields = ({
  register,
  errors,
  isViewerScoped,
}: {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  isViewerScoped?: boolean;
}) => (
  <div className="space-y-4 p-4 bg-base-200/50 rounded-lg">
    <div className="space-y-3">
      <label htmlFor="apiKeyHeaderName" className="block">
        <span className="text-sm font-medium text-base-content">Header Name</span>
      </label>
      <input
        id="apiKeyHeaderName"
        type="text"
        {...register("apiKeyHeaderName")}
        placeholder="X-API-Key"
        className="input input-bordered w-full"
      />
      <p className="text-sm text-base-content/60">HTTP header to send the API key in</p>
    </div>

    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          id="apiKeyIsViewerScoped"
          type="checkbox"
          {...register("apiKeyIsViewerScoped")}
          className="toggle toggle-sm"
        />
        <label htmlFor="apiKeyIsViewerScoped" className="text-sm font-medium text-base-content cursor-pointer">
          User-provided API key
        </label>
      </div>
      <p className="text-sm text-base-content/60">
        Each user will provide their own API key when connecting
      </p>
    </div>

    {!isViewerScoped && (
      <div className="space-y-3">
        <label htmlFor="apiKey" className="block">
          <span className="text-sm font-medium text-base-content">API Key</span>
        </label>
        <input
          id="apiKey"
          type="password"
          {...register("apiKey")}
          placeholder="Enter API key"
          className="input input-bordered w-full"
        />
        {errors.apiKey && <p className="text-sm text-error">{String(errors.apiKey.message)}</p>}
      </div>
    )}
  </div>
);

// OAuth fields
const OAuthFields = ({
  register,
  errors,
  redirectUri,
}: {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  redirectUri?: string;
}) => (
  <div className="space-y-4 p-4 bg-base-200/50 rounded-lg">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <label htmlFor="oauthClientId" className="block">
          <span className="text-sm font-medium text-base-content">Client ID</span>
        </label>
        <input
          id="oauthClientId"
          type="text"
          {...register("oauthClientId")}
          placeholder="OAuth client ID"
          className="input input-bordered w-full"
        />
        {errors.oauthClientId && <p className="text-sm text-error">{String(errors.oauthClientId.message)}</p>}
      </div>

      <div className="space-y-3">
        <label htmlFor="oauthClientSecret" className="block">
          <span className="text-sm font-medium text-base-content">Client Secret</span>
        </label>
        <input
          id="oauthClientSecret"
          type="password"
          {...register("oauthClientSecret")}
          placeholder="OAuth client secret"
          className="input input-bordered w-full"
        />
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <label htmlFor="oauthAuthUrl" className="block">
          <span className="text-sm font-medium text-base-content">Authorization URL</span>
        </label>
        <input
          id="oauthAuthUrl"
          type="url"
          {...register("oauthAuthUrl")}
          placeholder="https://provider.com/oauth/authorize"
          className="input input-bordered w-full"
        />
        {errors.oauthAuthUrl && <p className="text-sm text-error">{String(errors.oauthAuthUrl.message)}</p>}
      </div>

      <div className="space-y-3">
        <label htmlFor="oauthTokenUrl" className="block">
          <span className="text-sm font-medium text-base-content">Token URL</span>
        </label>
        <input
          id="oauthTokenUrl"
          type="url"
          {...register("oauthTokenUrl")}
          placeholder="https://provider.com/oauth/token"
          className="input input-bordered w-full"
        />
        {errors.oauthTokenUrl && <p className="text-sm text-error">{String(errors.oauthTokenUrl.message)}</p>}
      </div>
    </div>

    <div className="space-y-3">
      <label htmlFor="oauthScopes" className="block">
        <span className="text-sm font-medium text-base-content">Scopes</span>
      </label>
      <input
        id="oauthScopes"
        type="text"
        {...register("oauthScopes")}
        placeholder="read write (space-separated)"
        className="input input-bordered w-full"
      />
      <p className="text-sm text-base-content/60">Space-separated list of OAuth scopes</p>
    </div>

    {redirectUri && (
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-base-content">Redirect URI</span>
        </label>
        <div className="input input-bordered w-full flex items-center bg-base-200 text-base-content/70">
          {redirectUri}
        </div>
        <p className="text-sm text-base-content/60">
          Use this URL when configuring your OAuth application
        </p>
      </div>
    )}
  </div>
);

// Custom headers fields
const CustomHeadersFields = ({
  register,
  errors,
}: {
  register: AnyFormRegister;
  errors: AnyFormErrors;
}) => (
  <div className="space-y-4 p-4 bg-base-200/50 rounded-lg">
    <div className="space-y-3">
      <label htmlFor="customHeaders" className="block">
        <span className="text-sm font-medium text-base-content">Custom Headers (JSON)</span>
      </label>
      <textarea
        id="customHeaders"
        {...register("customHeaders")}
        placeholder='{"X-Custom-Header": "value"}'
        className="textarea textarea-bordered w-full font-mono text-sm min-h-[100px]"
      />
      <p className="text-sm text-base-content/60">
        JSON object with header names and values
      </p>
      {errors.customHeaders && <p className="text-sm text-error">{String(errors.customHeaders.message)}</p>}
    </div>
  </div>
);
