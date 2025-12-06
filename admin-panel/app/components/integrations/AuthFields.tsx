import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AuthStrategyType } from "./types";

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

// Shared input styling
const inputClasses = `
  w-full px-4 py-3 rounded-lg
  bg-base-200/50 border-2 border-base-300/50
  text-base-content placeholder:text-base-content/30
  focus:outline-none focus:border-primary/50 focus:bg-base-200/70
  transition-all duration-200
`;

const labelClasses = "text-sm font-medium text-base-content/70";

// API Key fields
const ApiKeyFields = ({
  register,
  errors,
  isViewerScoped,
}: {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  isViewerScoped?: boolean;
}) => {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-5 p-5 rounded-xl bg-base-200/30 border border-base-300/30">
      <div className="space-y-2">
        <label htmlFor="apiKeyHeaderName" className={labelClasses}>
          Header Name
        </label>
        <input
          id="apiKeyHeaderName"
          type="text"
          {...register("apiKeyHeaderName")}
          placeholder="Authorization"
          className={inputClasses}
        />
        <p className="text-xs text-base-content/40 pl-1">
          HTTP header where the API key will be sent
        </p>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg bg-base-100/50 border border-base-300/30">
        <input
          id="apiKeyIsViewerScoped"
          type="checkbox"
          {...register("apiKeyIsViewerScoped")}
          className="checkbox checkbox-sm checkbox-primary"
        />
        <label htmlFor="apiKeyIsViewerScoped" className="flex-1 cursor-pointer">
          <span className="text-sm font-medium text-base-content">User-provided key</span>
          <p className="text-xs text-base-content/50 mt-0.5">
            Each user enters their own API key when connecting
          </p>
        </label>
      </div>

      {!isViewerScoped && (
        <div className="space-y-2">
          <label htmlFor="apiKey" className={labelClasses}>
            API Key
          </label>
          <div className="relative">
            <input
              id="apiKey"
              type={showKey ? "text" : "password"}
              {...register("apiKey")}
              placeholder="Enter your API key"
              className={`${inputClasses} pr-12 font-mono`}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md
                text-base-content/40 hover:text-base-content/60 hover:bg-base-300/50
                transition-all"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.apiKey && <p className="text-sm text-error">{String(errors.apiKey.message)}</p>}
        </div>
      )}
    </div>
  );
};

// OAuth fields
const OAuthFields = ({
  register,
  errors,
  redirectUri,
}: {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  redirectUri?: string;
}) => {
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyRedirectUri = () => {
    if (redirectUri) {
      navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-5 p-5 rounded-xl bg-base-200/30 border border-base-300/30">
      {/* Client credentials row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="oauthClientId" className={labelClasses}>
            Client ID
          </label>
          <input
            id="oauthClientId"
            type="text"
            {...register("oauthClientId")}
            placeholder="OAuth client ID"
            className={`${inputClasses} font-mono text-sm`}
          />
          {errors.oauthClientId && (
            <p className="text-sm text-error">{String(errors.oauthClientId.message)}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="oauthClientSecret" className={labelClasses}>
            Client Secret
          </label>
          <div className="relative">
            <input
              id="oauthClientSecret"
              type={showSecret ? "text" : "password"}
              {...register("oauthClientSecret")}
              placeholder="OAuth client secret"
              className={`${inputClasses} pr-12 font-mono text-sm`}
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md
                text-base-content/40 hover:text-base-content/60 hover:bg-base-300/50
                transition-all"
            >
              {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* URLs row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="oauthAuthUrl" className={labelClasses}>
            Authorization URL
          </label>
          <input
            id="oauthAuthUrl"
            type="url"
            {...register("oauthAuthUrl")}
            placeholder="https://provider.com/oauth/authorize"
            className={`${inputClasses} text-sm`}
          />
          {errors.oauthAuthUrl && (
            <p className="text-sm text-error">{String(errors.oauthAuthUrl.message)}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="oauthTokenUrl" className={labelClasses}>
            Token URL
          </label>
          <input
            id="oauthTokenUrl"
            type="url"
            {...register("oauthTokenUrl")}
            placeholder="https://provider.com/oauth/token"
            className={`${inputClasses} text-sm`}
          />
          {errors.oauthTokenUrl && (
            <p className="text-sm text-error">{String(errors.oauthTokenUrl.message)}</p>
          )}
        </div>
      </div>

      {/* Scopes */}
      <div className="space-y-2">
        <label htmlFor="oauthScopes" className={labelClasses}>
          Scopes
        </label>
        <input
          id="oauthScopes"
          type="text"
          {...register("oauthScopes")}
          placeholder="read write admin (space-separated)"
          className={inputClasses}
        />
        <p className="text-xs text-base-content/40 pl-1">
          Space-separated list of OAuth permission scopes
        </p>
      </div>

      {/* Redirect URI - read only with copy */}
      {redirectUri && (
        <div className="space-y-2">
          <label className={labelClasses}>Redirect URI</label>
          <div className="flex items-center gap-2">
            <div className={`
              flex-1 px-4 py-3 rounded-lg font-mono text-sm
              bg-base-100/50 border border-base-300/30 text-base-content/60
              overflow-hidden text-ellipsis whitespace-nowrap
            `}>
              {redirectUri}
            </div>
            <button
              type="button"
              onClick={copyRedirectUri}
              className={`
                px-4 py-3 rounded-lg border-2 transition-all duration-200
                ${copied
                  ? 'border-success/50 bg-success/10 text-success'
                  : 'border-base-300/50 hover:border-primary/50 hover:bg-primary/5 text-base-content/60 hover:text-primary'
                }
              `}
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
            </button>
          </div>
          <p className="text-xs text-base-content/40 pl-1">
            Add this URL to your OAuth application's allowed redirect URIs
          </p>
        </div>
      )}
    </div>
  );
};

// Custom headers fields
const CustomHeadersFields = ({
  register,
  errors,
}: {
  register: AnyFormRegister;
  errors: AnyFormErrors;
}) => (
  <div className="space-y-4 p-5 rounded-xl bg-base-200/30 border border-base-300/30">
    <div className="space-y-2">
      <label htmlFor="customHeaders" className={labelClasses}>
        Custom Headers
        <span className="ml-2 text-xs font-normal text-base-content/40">JSON format</span>
      </label>
      <textarea
        id="customHeaders"
        {...register("customHeaders")}
        placeholder={`{
  "X-Custom-Header": "value",
  "Authorization": "Bearer token"
}`}
        className={`${inputClasses} font-mono text-sm min-h-[140px] resize-y`}
      />
      <p className="text-xs text-base-content/40 pl-1">
        JSON object with header names as keys and values
      </p>
      {errors.customHeaders && (
        <p className="text-sm text-error">{String(errors.customHeaders.message)}</p>
      )}
    </div>
  </div>
);
