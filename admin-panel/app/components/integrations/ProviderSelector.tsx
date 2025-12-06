import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import { Server, Database } from "lucide-react";
import type { IntegrationProviderDefinition } from "~/types/integration";
import type { IntegrationFormData } from "./types";

interface ProviderSelectorProps {
  control: Control<IntegrationFormData>;
  providerDefinitions: IntegrationProviderDefinition[];
}

const getProviderIcon = (authType: string) => {
  switch (authType) {
    case "mcp":
      return Server;
    case "graphql":
      return Database;
    default:
      return Server;
  }
};

const getProviderAccent = (authType: string) => {
  switch (authType) {
    case "mcp":
      return {
        gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
        border: "border-emerald-500/40",
        activeBorder: "border-emerald-400",
        icon: "text-emerald-400",
        badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
      };
    case "graphql":
      return {
        gradient: "from-fuchsia-500/20 via-fuchsia-500/5 to-transparent",
        border: "border-fuchsia-500/40",
        activeBorder: "border-fuchsia-400",
        icon: "text-fuchsia-400",
        badge: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
      };
    default:
      return {
        gradient: "from-base-content/10 via-base-content/5 to-transparent",
        border: "border-base-content/20",
        activeBorder: "border-base-content/50",
        icon: "text-base-content/60",
        badge: "bg-base-content/10 text-base-content/60 ring-base-content/20",
      };
  }
};

export const ProviderSelector = ({
  control,
  providerDefinitions,
}: ProviderSelectorProps) => {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
          Protocol
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
      </div>

      <Controller
        name="provider"
        control={control}
        rules={{ required: "Provider is required" }}
        render={({ field }) => (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {providerDefinitions.map((provider) => {
              const isSelected = field.value === provider.id;
              const Icon = getProviderIcon(provider.authType);
              const accent = getProviderAccent(provider.authType);

              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => field.onChange(provider.id)}
                  className={`
                    group relative overflow-hidden rounded-xl p-5 text-left transition-all duration-300
                    border-2 backdrop-blur-sm
                    ${isSelected
                      ? `${accent.activeBorder} bg-gradient-to-br ${accent.gradient}`
                      : `border-base-300/50 hover:${accent.border} bg-base-200/30 hover:bg-base-200/50`
                    }
                  `}
                >
                  {/* Subtle grid pattern overlay */}
                  <div
                    className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Cpath d='M0 0h1v1H0zM19 0h1v1h-1zM0 19h1v1H0zM19 19h1v1h-1z'/%3E%3C/g%3E%3C/svg%3E")`,
                    }}
                  />

                  <div className="relative flex items-start gap-4">
                    {/* Icon container */}
                    <div className={`
                      flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center
                      transition-all duration-300
                      ${isSelected
                        ? `${accent.icon} bg-base-100/50`
                        : 'text-base-content/40 bg-base-100/30 group-hover:bg-base-100/50'
                      }
                    `}>
                      <Icon size={24} strokeWidth={1.5} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`
                          font-semibold text-base tracking-tight transition-colors
                          ${isSelected ? 'text-base-content' : 'text-base-content/80 group-hover:text-base-content'}
                        `}>
                          {provider.name}
                        </span>
                        <span className={`
                          px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ring-1
                          ${isSelected ? accent.badge : 'bg-base-content/5 text-base-content/40 ring-base-content/10'}
                        `}>
                          {provider.authType}
                        </span>
                      </div>

                      {provider.description && (
                        <p className="text-sm text-base-content/50 leading-relaxed line-clamp-2">
                          {provider.description}
                        </p>
                      )}
                    </div>

                    {/* Selection indicator */}
                    <div className={`
                      absolute top-3 right-3 w-2 h-2 rounded-full transition-all duration-300
                      ${isSelected
                        ? `${accent.icon.replace('text-', 'bg-')} shadow-lg`
                        : 'bg-base-content/10 group-hover:bg-base-content/20'
                      }
                    `} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      />
    </div>
  );
};
