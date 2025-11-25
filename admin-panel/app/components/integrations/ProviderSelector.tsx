import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Github, Mail, Plug, Server } from "lucide-react";
import type { Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { IntegrationProvider, IntegrationProviderDefinition } from "~/types/integration";

export type IntegrationFormData = {
  provider: IntegrationProvider;
  name: string;
  // OAuth2 fields (also used for MCP bearer_passthrough)
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
  // OAuth URLs (for OAuth2 providers, these come from provider definition)
  // For MCP bearer_passthrough, user must provide these
  oauthAuthUrl: string;
  oauthTokenUrl: string;
  // MCP fields
  serverUrl: string;
  transport: "sse" | "streamable-http";
  authStrategyType: "none" | "api_key" | "bearer_passthrough" | "custom_headers";
  apiKey: string;
  apiKeyHeaderName: string;
  apiKeyIsViewerScoped: boolean;
  customHeaders: string;
};

interface ProviderSelectorProps {
  control: Control<IntegrationFormData>;
  providerDefinitions: IntegrationProviderDefinition[];
  getProviderDefinition: (id: IntegrationProvider) => IntegrationProviderDefinition | undefined;
}

const getProviderIcon = (provider: IntegrationProvider) => {
  switch (provider) {
    case "github":
      return <Github size={20} />;
    case "gmail":
      return <Mail size={20} />;
    case "mcp":
      return <Server size={20} />;
    default:
      return <Plug size={20} />;
  }
};

export const ProviderSelector = ({
  control,
  providerDefinitions,
  getProviderDefinition,
}: ProviderSelectorProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <Controller
      name="provider"
      control={control}
      render={({ field }) => {
        const selectedDef = getProviderDefinition(field.value);
        return (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-semibold text-base-content uppercase tracking-wide">
                Provider
              </span>
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full input input-bordered h-auto p-0 flex items-center justify-between cursor-pointer hover:border-primary/50 transition-all group"
              >
                <div className="flex items-center gap-3 px-4 py-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/15 transition-colors">
                    {getProviderIcon(field.value)}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-semibold text-base-content capitalize">
                      {selectedDef?.name ?? field.value}
                    </span>
                    {selectedDef?.description && (
                      <span className="text-xs text-base-content/60">
                        {selectedDef.description}
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-4">
                  <ChevronDown
                    size={20}
                    className={`text-base-content/70 transition-transform duration-300 ${
                      dropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {dropdownOpen && (
                <div className="absolute z-50 w-full mt-2 bg-base-100 border border-neutral/20 rounded-lg overflow-hidden shadow-xl animate-slide-in-top">
                  <div className="py-1">
                    {providerDefinitions.map((def) => {
                      const isSelected = field.value === def.id;
                      return (
                        <button
                          key={def.id}
                          type="button"
                          onClick={() => {
                            field.onChange(def.id);
                            setDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3 transition-all ${
                            isSelected
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-base-200 text-base-content"
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                              isSelected
                                ? "bg-primary text-primary-content"
                                : "bg-base-200 text-primary"
                            }`}
                          >
                            {getProviderIcon(def.id as IntegrationProvider)}
                          </div>
                          <div className="flex-1 flex flex-col items-start">
                            <span className="font-semibold">{def.name}</span>
                            {def.description && (
                              <span className="text-xs text-base-content/60">
                                {def.description}
                              </span>
                            )}
                          </div>
                          {isSelected && <Check size={20} className="text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <p className="text-sm text-base-content/60">
              Select the service you want to integrate with
            </p>
          </div>
        );
      }}
    />
  );
};
