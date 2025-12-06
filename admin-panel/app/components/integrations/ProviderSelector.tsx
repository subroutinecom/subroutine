import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import type { IntegrationProviderDefinition } from "~/types/integration";
import type { IntegrationFormData } from "./types";

interface ProviderSelectorProps {
  control: Control<IntegrationFormData>;
  providerDefinitions: IntegrationProviderDefinition[];
}

export const ProviderSelector = ({
  control,
  providerDefinitions,
}: ProviderSelectorProps) => {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
          Provider
        </span>
      </label>

      <Controller
        name="provider"
        control={control}
        rules={{ required: "Provider is required" }}
        render={({ field }) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {providerDefinitions.map((provider) => {
              const isSelected = field.value === provider.id;
              const typeLabel = getProviderTypeLabel(provider.authType);

              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => field.onChange(provider.id)}
                  className={`
                    p-4 rounded-lg border-2 text-left transition-all
                    ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-base-300 hover:border-base-content/30"
                    }
                  `}
                >
                  <div className="font-medium text-base-content">{provider.name}</div>
                  <div className="text-xs text-base-content/60 mt-1">{typeLabel}</div>
                  {provider.description && (
                    <div className="text-sm text-base-content/70 mt-2 line-clamp-2">
                      {provider.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      />
    </div>
  );
};

const getProviderTypeLabel = (authType: string): string => {
  switch (authType) {
    case "mcp":
      return "MCP Protocol";
    case "graphql":
      return "GraphQL API";
    case "oauth2":
      return "OAuth 2.0";
    default:
      return authType;
  }
};
