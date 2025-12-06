import type { UseFormRegister, FieldErrors } from "react-hook-form";

// deno-lint-ignore no-explicit-any
type AnyFormRegister = UseFormRegister<any>;
// deno-lint-ignore no-explicit-any
type AnyFormErrors = FieldErrors<any>;

interface OAuthFormFieldsProps {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  redirectUri?: string;
}

export const OAuthFormFields = ({ register, errors, redirectUri }: OAuthFormFieldsProps) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label htmlFor="oauthClientId" className="block">
            <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
              Client ID
            </span>
          </label>
          <input
            id="oauthClientId"
            type="text"
            {...register("oauthClientId", { required: "Client ID is required" })}
            placeholder="OAuth client ID"
            className="input input-bordered w-full"
          />
          {errors.oauthClientId && (
            <p className="text-sm text-error">{String(errors.oauthClientId.message)}</p>
          )}
        </div>

        <div className="space-y-3">
          <label htmlFor="oauthClientSecret" className="block">
            <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
              Client Secret
            </span>
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
          className="input input-bordered w-full"
        />
        <p className="text-sm text-base-content/60">
          Space-separated list of OAuth scopes to request
        </p>
      </div>

      {redirectUri && (
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
              Redirect URI
            </span>
          </label>
          <div className="input input-bordered w-full flex items-center bg-base-200 text-base-content/70 font-mono text-sm">
            {redirectUri}
          </div>
          <p className="text-sm text-base-content/60">
            Configure this URL in your OAuth provider settings
          </p>
        </div>
      )}
    </div>
  );
};
