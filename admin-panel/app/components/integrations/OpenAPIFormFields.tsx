import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AuthStrategyType } from "./types";
import { AuthStrategySelector } from "./AuthStrategySelector";
import { AuthFields } from "./AuthFields";

// deno-lint-ignore no-explicit-any
type AnyFormRegister = UseFormRegister<any>;
// deno-lint-ignore no-explicit-any
type AnyFormErrors = FieldErrors<any>;

interface OpenAPIFormFieldsProps {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  watchedAuthStrategy: AuthStrategyType;
  watchedApiKeyIsViewerScoped?: boolean;
  redirectUri?: string;
}

const inputClasses = `
  w-full px-4 py-3 rounded-lg
  bg-base-200/50 border-2 border-base-300/50
  text-base-content placeholder:text-base-content/30
  focus:outline-none focus:border-primary/50 focus:bg-base-200/70
  transition-all duration-200
`;

export const OpenAPIFormFields = ({
  register,
  errors,
  watchedAuthStrategy,
  watchedApiKeyIsViewerScoped,
  redirectUri,
}: OpenAPIFormFieldsProps) => {
  return (
    <div className="space-y-8">
      {/* Endpoint Section */}
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
            API Configuration
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
        </div>

        <div className="space-y-2">
          <label htmlFor="baseUrl" className="text-sm font-medium text-base-content/70">
            Base URL
          </label>
          <input
            id="baseUrl"
            type="url"
            {...register("baseUrl", { required: "Base URL is required" })}
            placeholder="https://api.example.com"
            className={inputClasses}
          />
          {errors.baseUrl && (
            <p className="text-sm text-error">{String(errors.baseUrl.message)}</p>
          )}
          <p className="text-xs text-base-content/40 pl-1">
            The base URL for the REST API (without trailing slash)
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="specUrl" className="text-sm font-medium text-base-content/70">
            OpenAPI Spec URL (Optional)
          </label>
          <input
            id="specUrl"
            type="url"
            {...register("specUrl")}
            placeholder="https://api.example.com/openapi.json"
            className={inputClasses}
          />
          {errors.specUrl && (
            <p className="text-sm text-error">{String(errors.specUrl.message)}</p>
          )}
          <p className="text-xs text-base-content/40 pl-1">
            URL to the OpenAPI 3.x specification (JSON or YAML). If not provided, you can upload the spec manually.
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
