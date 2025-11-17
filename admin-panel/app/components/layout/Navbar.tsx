import { Link } from "react-router";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "~/components/providers/AuthProvider";
import { authClient } from "~/lib/auth-client";
import { ThemeToggle } from "~/components/ThemeToggle";

export const Navbar = () => {
  const { user, organizations, activeOrganization } = useAuth();
  const [switchingOrg, setSwitchingOrg] = useState(false);

  if (!user) {
    return null;
  }

  const handleSwitchOrganization = async (organizationId: string) => {
    if (switchingOrg) return;
    setSwitchingOrg(true);

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

  const userInitial =
    user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();

  return (
    <div className="navbar bg-base-100 border-b border-base-300 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto w-full">
        <div className="navbar-start">
          <Link
            to="/"
            className="btn btn-ghost text-xl font-semibold normal-case"
          >
            subroutine
          </Link>
        </div>

        <div className="navbar-end gap-2">
          <ThemeToggle />

          <div className="dropdown dropdown-end">
            <button
              type="button"
              tabIndex={0}
              className="btn btn-ghost btn-sm gap-2"
            >
              <div className="avatar placeholder">
                <div className="w-8 rounded-full bg-primary text-primary-content flex items-center justify-center">
                  <span className="text-sm">{userInitial}</span>
                </div>
              </div>
            </button>

            <ul
              tabIndex={0}
              className="dropdown-content menu menu-sm bg-base-100 rounded-box shadow-lg border border-base-300 w-72 p-2 mt-2 z-10"
            >
              <li className="menu-title px-4">
                <span>{user.email}</span>
              </li>

              {organizations.length > 0 && (
                <>
                  <li className="menu-title px-4 mt-2">
                    <span>Organizations</span>
                  </li>
                  {organizations.map((org) => (
                    <li key={org.id}>
                      <button
                        type="button"
                        onClick={() => handleSwitchOrganization(org.id)}
                        disabled={switchingOrg}
                        className={
                          activeOrganization?.id === org.id ? "active" : ""
                        }
                      >
                        {org.name}
                        {activeOrganization?.id === org.id && (
                          <span className="badge badge-sm badge-primary">
                            Active
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                  <div className="divider my-1"></div>
                </>
              )}

              <li>
                <Link to="/logout" className="text-error">
                  <LogOut size={16} />
                  Logout
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
