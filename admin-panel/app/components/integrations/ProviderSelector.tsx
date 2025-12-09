import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import { Server, Database, Globe } from "lucide-react";
import type { IntegrationProviderDefinition } from "~/types/integration";
import type { IntegrationFormData } from "./types";

interface ProviderSelectorProps {
  control: Control<IntegrationFormData>;
  providerDefinitions: IntegrationProviderDefinition[];
}

const PROTOCOL_CONFIG = {
  mcp: {
    icon: Server,
    accent: {
      gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
      border: "border-emerald-500/40",
      activeBorder: "border-emerald-400",
      icon: "text-emerald-400",
      badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    },
  },
  graphql: {
    icon: Database,
    accent: {
      gradient: "from-fuchsia-500/20 via-fuchsia-500/5 to-transparent",
      border: "border-fuchsia-500/40",
      activeBorder: "border-fuchsia-400",
      icon: "text-fuchsia-400",
      badge: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
    },
  },
  openapi: {
    icon: Globe,
    accent: {
      gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
      border: "border-sky-500/40",
      activeBorder: "border-sky-400",
      icon: "text-sky-400",
      badge: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
    },
  },
} as const;

export const ProviderSelector = ({
  control,
  providerDefinitions,
}: ProviderSelectorProps) => {
  // Only show generic protocol providers (mcp, graphql, openapi)
  const genericProviders = providerDefinitions.filter(
    (p) => p.category === "generic"
  );

  return (
    <Controller
      name="provider"
      control={control}
      rules={{ required: "Provider is required" }}
      render={({ field }) => (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {genericProviders.map((provider) => {
            const isSelected = field.value === provider.id;
            const config = PROTOCOL_CONFIG[provider.authType as keyof typeof PROTOCOL_CONFIG];
            const Icon = config?.icon ?? Server;
            const accent = config?.accent ?? PROTOCOL_CONFIG.mcp.accent;

            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => field.onChange(provider.id)}
                className={`
                  group relative overflow-hidden rounded-xl p-4 text-left transition-all duration-300
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

                <div className="relative flex items-center gap-3">
                  {/* Icon */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                    transition-all duration-300
                    ${isSelected
                      ? `${accent.icon} bg-base-100/50`
                      : 'text-base-content/40 bg-base-100/30 group-hover:bg-base-100/50'
                    }
                  `}>
                    <Icon size={20} strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className={`
                      font-semibold text-sm tracking-tight transition-colors block
                      ${isSelected ? 'text-base-content' : 'text-base-content/80 group-hover:text-base-content'}
                    `}>
                      {provider.name}
                    </span>
                    {provider.description && (
                      <p className="text-xs text-base-content/40 truncate mt-0.5">
                        {provider.description}
                      </p>
                    )}
                  </div>

                  {/* Selection indicator */}
                  <div className={`
                    w-2 h-2 rounded-full transition-all duration-300 flex-shrink-0
                    ${isSelected
                      ? `${accent.icon.replace('text-', 'bg-')}`
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
  );
};
