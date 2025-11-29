import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { getAuthClient } from "~/lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";
import { Sidebar } from "~/components/layout/Sidebar";
import { useAdminConfig } from "~/hooks/use-admin-config";

export const handle = { id: "auth-required" };

export default function AuthRequired() {
  const navigate = useNavigate();
  const location = useLocation();
  const config = useAdminConfig();
  const authClient = useMemo(() => getAuthClient(config), [config]);
  const { isAuthenticated, organizations, activeOrganizationId, isLoading, refetch } = useAuth();
  const [isCheckingRoute, setIsCheckingRoute] = useState(true);

  useEffect(() => {
    const handleRouting = async () => {
      if (isLoading) return;

      if (!isAuthenticated) {
        navigate("/login");
        return;
      }

      const pathname = location.pathname;
      const isSetupRoute =
        pathname === "/invitations" || pathname === "/setup-organization" || pathname === "/logout";

      if (isSetupRoute) {
        setIsCheckingRoute(false);
        return;
      }

      const hasOrganizations = organizations.length > 0;

      if (!hasOrganizations) {
        const { data: invitations } = await authClient.organization.listUserInvitations();
        const hasPendingInvitations = invitations && invitations.length > 0;

        if (hasPendingInvitations) {
          navigate("/invitations");
          return;
        }

        navigate("/setup-organization");
        return;
      }

      if (!activeOrganizationId && organizations.length > 0) {
        await authClient.organization.setActive({
          organizationId: organizations[0].id,
        });
        await refetch();
        return;
      }

      setIsCheckingRoute(false);
    };

    handleRouting();
  }, [
    isLoading,
    isAuthenticated,
    organizations,
    activeOrganizationId,
    location.pathname,
    navigate,
    refetch,
    authClient,
  ]);

  if (isLoading || isCheckingRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
