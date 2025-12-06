import { Key, Globe, Shield, FileCode } from "lucide-react";
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
  icon: React.ReactNode;
}> = [
  {
    value: "none",
    label: "No Authentication",
    description: "Public endpoint with no auth required",
    icon: <Globe size={18} />,
  },
  {
    value: "api_key",
    label: "API Key",
    description: "Static key in request header",
    icon: <Key size={18} />,
  },
  {
    value: "bearer_oauth",
    label: "OAuth 2.0 Bearer",
    description: "Dynamic tokens via OAuth flow",
    icon: <Shield size={18} />,
  },
  {
    value: "custom_headers",
    label: "Custom Headers",
    description: "Custom static headers",
    icon: <FileCode size={18} />,
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
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
          Authentication
        </span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredOptions.map((option) => {
          const isSelected = currentStrategy === option.value;

          return (
            <label
              key={option.value}
              className={`
                flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all
                ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-base-300 hover:border-base-content/30"
                }
              `}
            >
              <input
                type="radio"
                value={option.value}
                {...register("authStrategy")}
                className="radio radio-primary mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base-content/60">{option.icon}</span>
                  <span className="font-medium text-base-content">{option.label}</span>
                </div>
                <div className="text-sm text-base-content/60 mt-1">{option.description}</div>
              </div>
            </label>
          );
        })}
      </div>

      {errors.authStrategy && (
        <p className="text-sm text-error">{String(errors.authStrategy.message)}</p>
      )}
    </div>
  );
};
