import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { IntegrationFormData } from "./ProviderSelector";

interface OAuthFormFieldsProps {
  register: UseFormRegister<IntegrationFormData>;
  errors: FieldErrors<IntegrationFormData>;
}

export const OAuthFormFields = ({ register, errors }: OAuthFormFieldsProps) => {
  return (
    <>
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
          {...register("clientSecret")}
          placeholder="OAuth Client Secret"
          className="input input-bordered w-full font-mono text-sm"
        />
        {errors.clientSecret && <p className="text-sm text-error">{errors.clientSecret.message}</p>}
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
          {...register("scopes")}
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
          {...register("redirectUri")}
          placeholder="OAuth Redirect URI"
          className="input input-bordered w-full font-mono text-sm"
        />
        {errors.redirectUri && <p className="text-sm text-error">{errors.redirectUri.message}</p>}
        <p className="text-sm text-base-content/60">
          The callback URL configured in your OAuth app
        </p>
      </div>
    </>
  );
};
