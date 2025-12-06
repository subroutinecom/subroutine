import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AuthStrategyType } from "./types";
import { AuthStrategySelector } from "./AuthStrategySelector";
import { AuthFields } from "./AuthFields";

// deno-lint-ignore no-explicit-any
type AnyFormRegister = UseFormRegister<any>;
// deno-lint-ignore no-explicit-any
type AnyFormErrors = FieldErrors<any>;

interface GraphQLFormFieldsProps {
  register: AnyFormRegister;
  errors: AnyFormErrors;
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
    <div className="space-y-6">
      {/* GraphQL Endpoint */}
      <div className="space-y-3">
        <label htmlFor="endpoint" className="block">
          <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
            GraphQL Endpoint
          </span>
        </label>
        <input
          id="endpoint"
          type="url"
          {...register("endpoint", { required: "GraphQL endpoint is required" })}
          placeholder="https://api.example.com/graphql"
          className="input input-bordered w-full"
        />
        {errors.endpoint && <p className="text-sm text-error">{String(errors.endpoint.message)}</p>}
        <p className="text-sm text-base-content/60">
          The GraphQL API endpoint URL
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
