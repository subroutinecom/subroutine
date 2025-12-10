import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check, Server, Database, Globe, X } from "lucide-react";
import type { IntegrationProviderDefinition } from "~/types/integration";

interface IntegrationComboboxProps {
  providers: IntegrationProviderDefinition[];
  value: string | null;
  onChange: (providerId: string) => void;
  placeholder?: string;
}

// Category display configuration
const CATEGORY_CONFIG: Record<string, { label: string; order: number }> = {
  "project-management": { label: "Project Management", order: 1 },
  "communication": { label: "Communication", order: 2 },
  "developer-tools": { label: "Developer Tools", order: 3 },
  "productivity": { label: "Productivity", order: 4 },
  "analytics": { label: "Analytics", order: 5 },
  "crm": { label: "CRM", order: 6 },
  "storage": { label: "Storage", order: 7 },
};

// Protocol type to icon mapping
const getProviderIcon = (authType: string) => {
  switch (authType) {
    case "mcp":
      return Server;
    case "graphql":
      return Database;
    case "openapi":
      return Globe;
    default:
      return Server;
  }
};

// Protocol type accent colors
const getProtocolAccent = (authType: string) => {
  switch (authType) {
    case "mcp":
      return "text-emerald-400";
    case "graphql":
      return "text-fuchsia-400";
    case "openapi":
      return "text-sky-400";
    default:
      return "text-base-content/60";
  }
};

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export const IntegrationCombobox = ({
  providers,
  value,
  onChange,
  placeholder = "Search integrations...",
}: IntegrationComboboxProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter to only non-generic providers (first-party integrations)
  const firstPartyProviders = useMemo(
    () => providers.filter((p) => p.category && p.category !== "generic"),
    [providers]
  );

  // Filter providers based on search
  const filteredProviders = useMemo(() => {
    if (!search.trim()) return firstPartyProviders;
    const query = search.toLowerCase();
    return firstPartyProviders.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
    );
  }, [firstPartyProviders, search]);

  // Group providers by category
  const groupedProviders = useMemo(() => {
    const groups: Record<string, IntegrationProviderDefinition[]> = {};
    for (const provider of filteredProviders) {
      const category = provider.category || "other";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(provider);
    }

    // Sort groups by configured order
    return Object.entries(groups)
      .sort(([a], [b]) => {
        const orderA = CATEGORY_CONFIG[a]?.order ?? 999;
        const orderB = CATEGORY_CONFIG[b]?.order ?? 999;
        return orderA - orderB;
      })
      .map(([category, items]) => ({
        category,
        label: CATEGORY_CONFIG[category]?.label ?? category.replace(/-/g, " "),
        items,
      }));
  }, [filteredProviders]);

  // Flatten for keyboard navigation
  const flattenedItems = useMemo(
    () => groupedProviders.flatMap((g) => g.items),
    [groupedProviders]
  );

  // Selected provider details
  const selectedProvider = useMemo(
    () => (value ? providers.find((p) => p.id === value) : null),
    [providers, value]
  );

  // Update dropdown position based on trigger element
  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px gap
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  // Handle click outside - check both trigger and dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedDropdown = dropdownRef.current?.contains(target);

      if (!clickedTrigger && !clickedDropdown) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update position when opening and on scroll/resize
  useEffect(() => {
    if (isOpen) {
      updatePosition();

      const handleScrollOrResize = () => updatePosition();
      globalThis.addEventListener("scroll", handleScrollOrResize, true);
      globalThis.addEventListener("resize", handleScrollOrResize);

      return () => {
        globalThis.removeEventListener("scroll", handleScrollOrResize, true);
        globalThis.removeEventListener("resize", handleScrollOrResize);
      };
    }
  }, [isOpen, updatePosition]);

  // Reset highlighted index when filtered items change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredProviders]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlightedEl = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      highlightedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((i) => Math.min(i + 1, flattenedItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flattenedItems[highlightedIndex]) {
            onChange(flattenedItems[highlightedIndex].id);
            setIsOpen(false);
            setSearch("");
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setSearch("");
          break;
      }
    },
    [isOpen, flattenedItems, highlightedIndex, onChange]
  );

  const handleSelect = (providerId: string) => {
    onChange(providerId);
    setIsOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
    inputRef.current?.focus();
  };

  // Build flat index map for highlighting
  let currentIndex = 0;
  const getItemIndex = () => currentIndex++;

  // Dropdown content rendered via portal
  const dropdownContent = isOpen && dropdownPosition && (
    <div
      ref={dropdownRef}
      className="fixed rounded-xl overflow-hidden bg-base-100 border-2 border-base-300/50 animate-scale-in origin-top"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
        zIndex: 9999,
        boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.25)",
      }}
    >
      {/* Results count */}
      <div className="px-4 py-2 text-xs text-base-content/40 border-b border-base-300/30">
        {filteredProviders.length === 0
          ? "No integrations found"
          : `${filteredProviders.length} integration${filteredProviders.length === 1 ? "" : "s"}`}
      </div>

      {/* Scrollable list */}
      <div ref={listRef} className="max-h-80 overflow-y-auto">
        {groupedProviders.map((group) => (
          <div key={group.category}>
            {/* Category header */}
            <div className="px-4 py-2 sticky top-0 bg-base-200/80 backdrop-blur-sm">
              <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-[0.15em]">
                {group.label}
              </span>
            </div>

            {/* Items */}
            {group.items.map((provider) => {
              const index = getItemIndex();
              const isHighlighted = index === highlightedIndex;
              const isSelected = value === provider.id;
              const Icon = getProviderIcon(provider.authType);

              return (
                <button
                  key={provider.id}
                  data-index={index}
                  type="button"
                  onClick={() => handleSelect(provider.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`
                    w-full px-4 py-3 flex items-center gap-3 text-left
                    transition-colors duration-100
                    ${isHighlighted ? "bg-primary/10" : ""}
                    ${isSelected ? "bg-primary/5" : ""}
                  `}
                >
                  <div className={`
                    w-9 h-9 rounded-lg flex items-center justify-center
                    ${isHighlighted ? "bg-primary/20" : "bg-base-200/70"}
                    transition-colors duration-100
                  `}>
                    <Icon size={18} className={getProtocolAccent(provider.authType)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`
                        font-medium truncate
                        ${isHighlighted ? "text-primary" : "text-base-content"}
                      `}>
                        {provider.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-base-300/50 text-base-content/40 uppercase tracking-wider flex-shrink-0">
                        {provider.authType}
                      </span>
                    </div>
                    {provider.description && (
                      <p className="text-xs text-base-content/50 truncate mt-0.5">
                        {provider.description}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <Check size={18} className="text-primary flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Empty state */}
        {filteredProviders.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-base-content/50 text-sm">No matching integrations</p>
            <p className="text-base-content/30 text-xs mt-1">
              Try a different search term
            </p>
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="px-4 py-2 border-t border-base-300/30 flex items-center gap-4 text-[10px] text-base-content/30">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-base-200 font-mono">↑↓</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-base-200 font-mono">↵</kbd>
          select
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-base-200 font-mono">esc</kbd>
          close
        </span>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {/* Trigger / Search Input */}
      <div
        ref={triggerRef}
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`
          flex items-center gap-3 w-full px-4 py-3 rounded-xl cursor-text
          bg-base-200/50 border-2 transition-all duration-200
          ${isOpen
            ? "border-primary/50 bg-base-200/70 ring-4 ring-primary/10"
            : "border-base-300/50 hover:border-base-300"
          }
        `}
      >
        <Search size={18} className="text-base-content/40 flex-shrink-0" />

        {selectedProvider && !isOpen ? (
          <div className="flex items-center gap-3 flex-1">
            {(() => {
              const Icon = getProviderIcon(selectedProvider.authType);
              return <Icon size={18} className={getProtocolAccent(selectedProvider.authType)} />;
            })()}
            <span className="font-medium text-base-content">{selectedProvider.name}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-base-300/50 text-base-content/50 uppercase tracking-wider">
              {selectedProvider.authType}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto p-1 rounded hover:bg-base-300/50 text-base-content/40 hover:text-base-content transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="flex-1 bg-transparent outline-none text-base-content placeholder:text-base-content/30"
          />
        )}

        <ChevronDown
          size={18}
          className={`text-base-content/40 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {/* Dropdown rendered via portal to escape stacking context */}
      {typeof document !== "undefined" && createPortal(dropdownContent, document.body)}
    </div>
  );
};
