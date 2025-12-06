import { Key, Globe, Shield, FileCode, Check } from "lucide-react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";
import type { AuthStrategyType } from "./types";

// deno-lint-ignore no-explicit-any
type AnyFormRegister = UseFormRegister<any>;
// deno-lint-ignore no-explicit-any
type AnyFormErrors = FieldErrors<any>;

interface AuthStrategySelectorProps {
  register: AnyFormRegister;
  errors: AnyFormErrors;
  currentStrategy: AuthStrategyType;
  availableStrategies?: AuthStrategyType[];
}

const STRATEGY_OPTIONS: Array<{
  value: AuthStrategyType;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  shortLabel: string;
}> = [
  {
    value: "none",
    label: "No Authentication",
    shortLabel: "None",
    description: "Public endpoint, no credentials required",
    icon: Globe,
  },
  {
    value: "api_key",
    label: "API Key",
    shortLabel: "API Key",
    description: "Static key sent in request headers",
    icon: Key,
  },
  {
    value: "bearer_oauth",
    label: "OAuth 2.0",
    shortLabel: "OAuth",
    description: "Dynamic tokens via authorization flow",
    icon: Shield,
  },
  {
    value: "custom_headers",
    label: "Custom Headers",
    shortLabel: "Custom",
    description: "Define custom static headers",
    icon: FileCode,
  },
];

export const AuthStrategySelector = ({
  register,
  errors,
  currentStrategy,
  availableStrategies = ["none", "api_key", "bearer_oauth", "custom_headers"],
}: AuthStrategySelectorProps) => {
  const filteredOptions = STRATEGY_OPTIONS.filter((opt) =>
    availableStrategies.includes(opt.value)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
          Authentication
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {filteredOptions.map((option) => {
          const isSelected = currentStrategy === option.value;
          const Icon = option.icon;

          return (
            <label
              key={option.value}
              className={`
                group relative flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer
                transition-all duration-200 border-2
                ${isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-base-300/50 hover:border-base-content/20 bg-base-200/20 hover:bg-base-200/40'
                }
              `}
            >
              <input
                type="radio"
                value={option.value}
                {...register("authStrategy")}
                className="sr-only"
              />

              {/* Icon */}
              <div className={`
                w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200
                ${isSelected
                  ? 'bg-primary/10 text-primary'
                  : 'bg-base-100/50 text-base-content/40 group-hover:text-base-content/60'
                }
              `}>
                <Icon size={20} strokeWidth={1.5} />
              </div>

              {/* Label */}
              <span className={`
                text-sm font-medium text-center transition-colors
                ${isSelected ? 'text-base-content' : 'text-base-content/60 group-hover:text-base-content/80'}
              `}>
                {option.shortLabel}
              </span>

              {/* Selection checkmark */}
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <Check size={12} className="text-primary-content" strokeWidth={3} />
                </div>
              )}
            </label>
          );
        })}
      </div>

      {/* Description for selected option */}
      {currentStrategy && (
        <p className="text-sm text-base-content/50 pl-1">
          {STRATEGY_OPTIONS.find(o => o.value === currentStrategy)?.description}
        </p>
      )}

      {errors.authStrategy && (
        <p className="text-sm text-error">{String(errors.authStrategy.message)}</p>
      )}
    </div>
  );
};
