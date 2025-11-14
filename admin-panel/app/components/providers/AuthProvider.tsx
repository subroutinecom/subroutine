import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { authClient } from "~/lib/auth-client";

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
  const [user, setUser] = useState<User | undefined>();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  const fetchAuthData = useCallback(async () => {
    try {
      const { data: session } = await authClient.getSession();

      if (session?.user) {
        setUser(session.user);
        setActiveOrganizationId(session.session?.activeOrganizationId || undefined);

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
  }, []);

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
