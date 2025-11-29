import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useMemo } from "react";
import { getAuthClient } from "~/lib/auth-client";
import { useAdminConfig } from "~/hooks/use-admin-config";

export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  logo?: string | null;
  createdAt: Date;
  metadata?: Record<string, any> | null;
}

interface AuthContextValue {
  user?: User;
  organizations: Organization[];
  activeOrganizationId?: string;
  activeOrganization?: Organization;
  isAuthenticated: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const config = useAdminConfig();
  const authClient = useMemo(() => getAuthClient(config), [config]);
  const [user, setUser] = useState<User | undefined>();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  const fetchAuthData = useCallback(async () => {
    try {
      const { data: session } = await authClient.getSession();

      if (session?.user) {
        setUser(session.user);
        const activeOrgId =
          session.session && "activeOrganizationId" in session.session
            ? (session.session.activeOrganizationId as string | undefined)
            : undefined;
        setActiveOrganizationId(activeOrgId);

        const { data: orgs } = await authClient.organization.list();
        setOrganizations(orgs || []);
      } else {
        setUser(undefined);
        setOrganizations([]);
        setActiveOrganizationId(undefined);
      }
    } catch (error) {
      console.error("Failed to fetch auth data:", error);
      setUser(undefined);
      setOrganizations([]);
      setActiveOrganizationId(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [authClient]);

  useEffect(() => {
    fetchAuthData();
  }, [fetchAuthData]);

  const activeOrganization = activeOrganizationId
    ? organizations.find((org) => org.id === activeOrganizationId)
    : undefined;

  const value: AuthContextValue = {
    user,
    organizations,
    activeOrganizationId,
    activeOrganization,
    isAuthenticated: !!user,
    isLoading,
    refetch: fetchAuthData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
