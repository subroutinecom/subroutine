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

const inputClasses = `
  w-full px-4 py-3 rounded-lg
  bg-base-200/50 border-2 border-base-300/50
  text-base-content placeholder:text-base-content/30
  focus:outline-none focus:border-primary/50 focus:bg-base-200/70
  transition-all duration-200
`;

export const GraphQLFormFields = ({
  register,
  errors,
  watchedAuthStrategy,
  watchedApiKeyIsViewerScoped,
  redirectUri,
}: GraphQLFormFieldsProps) => {
  return (
    <div className="space-y-8">
      {/* Endpoint Section */}
      <div className="space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
            Endpoint
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
        </div>

        <div className="space-y-2">
          <label htmlFor="endpoint" className="text-sm font-medium text-base-content/70">
            GraphQL Endpoint
          </label>
          <input
            id="endpoint"
            type="url"
            {...register("endpoint", { required: "GraphQL endpoint is required" })}
            placeholder="https://api.example.com/graphql"
            className={inputClasses}
          />
          {errors.endpoint && (
            <p className="text-sm text-error">{String(errors.endpoint.message)}</p>
          )}
          <p className="text-xs text-base-content/40 pl-1">
            The GraphQL API endpoint URL for queries and mutations
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
