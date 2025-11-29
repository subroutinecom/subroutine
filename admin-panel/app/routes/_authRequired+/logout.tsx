import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { getAuthClient } from "~/lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";
import { useAdminConfig } from "~/hooks/use-admin-config";

export default function Logout() {
  const navigate = useNavigate();
  const config = useAdminConfig();
  const authClient = useMemo(() => getAuthClient(config), [config]);
  const { refetch } = useAuth();

  useEffect(() => {
    const signOut = async () => {
      await authClient.signOut();
      await refetch();
      navigate("/login");
    };
    signOut();
  }, [navigate, refetch, authClient]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="text-center">
        <span className="loading loading-spinner loading-lg"></span>
        <p className="mt-4">Signing out...</p>
      </div>
    </div>
  );
}
