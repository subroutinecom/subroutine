import { Key, Users, Check, Star } from "lucide-react";
import type { IntegrationAuthOption } from "~/types/integration";

interface AuthOptionSelectorProps {
  options: IntegrationAuthOption[];
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
}

/**
 * Selector for choosing between multiple authentication options.
 * Used when a provider supports multiple auth methods (e.g., OAuth + API Key).
 */
export const AuthOptionSelector = ({
  options,
  selectedOptionId,
  onSelect,
}: AuthOptionSelectorProps) => {
  if (options.length === 0) return null;

  // Get icon based on strategy type
  const getIcon = (strategyType: string) => {
    switch (strategyType) {
      case "bearer_oauth":
        return Users;
      case "api_key":
        return Key;
      default:
        return Key;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-bold text-base-content/40 uppercase tracking-[0.2em]">
          Authentication Method
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-base-content/10 to-transparent" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((option) => {
          const isSelected = selectedOptionId === option.id;
          const Icon = getIcon(option.strategy.type);

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className={`
                relative p-4 rounded-xl text-left transition-all duration-200
                border-2 hover:scale-[1.01]
                ${isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-base-300/50 hover:border-base-300 bg-base-200/30 hover:bg-base-200/50"
                }
              `}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`
                    w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                    ${isSelected ? "bg-primary/10" : "bg-base-300/50"}
                  `}
                >
                  <Icon
                    size={20}
                    className={isSelected ? "text-primary" : "text-base-content/50"}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`
                        font-semibold
                        ${isSelected ? "text-primary" : "text-base-content"}
                      `}
                    >
                      {option.label}
                    </span>
                    {option.recommended && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">
                        <Star size={10} />
                        Recommended
                      </span>
                    )}
                  </div>
                  {option.description && (
                    <p className="text-xs text-base-content/50 mt-1 line-clamp-2">
                      {option.description}
                    </p>
                  )}
                  {option.viewerScoped !== undefined && (
                    <p className="text-[10px] text-base-content/40 mt-2">
                      {option.viewerScoped
                        ? "Per-user authentication"
                        : "Organization-wide access"}
                    </p>
                  )}
                </div>

                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Check size={12} className="text-primary-content" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
