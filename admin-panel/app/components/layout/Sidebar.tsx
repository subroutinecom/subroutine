import { Link, useLocation } from "react-router";
import { useState } from "react";
import { Building, ChevronDown, Home, Key, LogOut, Moon, Plug, Sun } from "lucide-react";
import { useAuth } from "~/components/providers/AuthProvider";
import { authClient } from "~/lib/auth-client";
import { useEffect } from "react";

export const Sidebar = () => {
  const { user, organizations, activeOrganization } = useAuth();
  const location = useLocation();
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const prefersDark = globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme || (prefersDark ? "dark" : "light");
    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  };

  if (!user) {
    return null;
  }

  const handleSwitchOrganization = async (organizationId: string) => {
    if (switchingOrg) return;
    setSwitchingOrg(true);
    setIsOrgDropdownOpen(false);

    try {
      await authClient.organization.setActive({
        organizationId,
      });

      // Reload the page to refresh with new org context
      globalThis.location.reload();
    } catch (error) {
      console.error("Failed to switch organization:", error);
      setSwitchingOrg(false);
    }
  };

  const userInitial = user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();

  const navItems = [
    { to: "/", icon: Home, label: "Dashboard" },
    { to: "/integrations", icon: Plug, label: "Integrations" },
    { to: "/api-keys", icon: Key, label: "API Keys" },
  ];

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <aside className="w-64 h-screen sticky top-0 flex flex-col border-r border-base-300 bg-base-100">
      {/* Brand */}
      <div className="p-6 border-b border-base-300">
        <Link to="/" className="block text-center group">
          <span className="text-xl font-bold text-base-content">subroutine</span>
        </Link>
      </div>

      {/* Organization Selector */}
      {activeOrganization && (
        <div className="px-4 py-4 border-b border-base-300">
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
              Organization
            </span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
              className="w-full px-3 py-2 rounded-lg hover:bg-base-200 transition-colors flex items-center justify-between gap-2 text-left group"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Building size={16} className="text-base-content/50 flex-shrink-0" />
                <span className="text-sm font-medium text-base-content truncate">
                  {activeOrganization.name}
                </span>
              </div>
              <ChevronDown
                size={14}
                className={`text-base-content/60 transition-transform flex-shrink-0 ${
                  isOrgDropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown */}
            {isOrgDropdownOpen && organizations.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-base-100 border border-base-300 rounded-box p-1 z-50 animate-scale-in">
                {organizations
                  .filter((org) => org.id !== activeOrganization.id)
                  .map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => handleSwitchOrganization(org.id)}
                      disabled={switchingOrg}
                      className="w-full px-3 py-2 rounded-md hover:bg-base-200 transition-colors text-left text-sm text-base-content disabled:opacity-50"
                    >
                      {org.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
                ${
                  active
                    ? "bg-primary text-primary-content font-medium"
                    : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
                }
              `}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-base-300 space-y-2">
        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors text-base-content/60 hover:text-base-content"
        >
          {theme === "light" ? (
            <>
              <Moon size={20} />
              <span className="text-sm">Dark mode</span>
            </>
          ) : (
            <>
              <Sun size={20} />
              <span className="text-sm">Light mode</span>
            </>
          )}
        </button>

        {/* User Menu Dropdown */}
        <div className="dropdown dropdown-top w-full">
          <button
            type="button"
            tabIndex={0}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-base-200 transition-colors"
          >
            <div className="avatar placeholder">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-content flex items-center justify-center">
                <span className="text-xs font-medium">{userInitial}</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-base-content truncate">
                {user.name || user.email.split("@")[0]}
              </p>
            </div>
          </button>
          <ul
            tabIndex={0}
            className="dropdown-content menu bg-base-100 border border-base-300 rounded-lg w-56 p-2 mb-2 shadow-lg"
          >
            <li className="menu-title px-3 py-2">
              <span className="text-xs text-base-content/50">Signed in as</span>
            </li>
            <li className="px-3 py-2 pointer-events-none">
              <span className="text-sm text-base-content font-medium">{user.email}</span>
            </li>
            <div className="divider my-1"></div>
            <li>
              <Link to="/logout" className="text-error hover:bg-error/10">
                <LogOut size={16} />
                Logout
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </aside>
  );
};
