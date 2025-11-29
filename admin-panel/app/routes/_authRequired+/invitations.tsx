import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getAuthClient } from "~/lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";
import { useAdminConfig } from "~/hooks/use-admin-config";

interface Invitation {
  id: string;
  email: string;
  organizationId: string;
  organizationName?: string;
  role: string;
  inviterEmail?: string;
  expiresAt: Date;
  status: string;
}

export default function Invitations() {
  const navigate = useNavigate();
  const config = useAdminConfig();
  const authClient = useMemo(() => getAuthClient(config), [config]);
  const { isAuthenticated, organizations, isLoading: authLoading, refetch } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(true);

  const hasOrganizations = organizations.length > 0;

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Fetch invitations
  useEffect(() => {
    const fetchInvitations = async () => {
      if (!isAuthenticated) return;

      try {
        const { data: invitations } = await authClient.organization.listUserInvitations();
        setInvitations(invitations || []);
      } catch (err) {
        console.error("Failed to fetch invitations:", err);
        setInvitations([]);
      } finally {
        setIsLoadingInvitations(false);
      }
    };

    fetchInvitations();
  }, [isAuthenticated, authClient]);

  const handleAccept = async (invitationId: string) => {
    setError("");
    setLoading(invitationId);

    try {
      const { data: result, error: acceptError } = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if (acceptError) {
        setError(acceptError.message || "Failed to accept invitation");
        setLoading(null);
        return;
      }

      if (result?.invitation?.organizationId) {
        await authClient.organization.setActive({
          organizationId: result.invitation.organizationId,
        });
      }

      await refetch();

      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));

      if (invitations.length === 1 || result?.invitation?.organizationId) {
        navigate("/");
        return;
      }

      setLoading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(null);
    }
  };

  const handleReject = async (invitationId: string) => {
    setError("");
    setLoading(invitationId);

    try {
      const { error: rejectError } = await authClient.organization.rejectInvitation({
        invitationId,
      });

      if (rejectError) {
        setError(rejectError.message || "Failed to reject invitation");
        setLoading(null);
        return;
      }

      // Remove the rejected invitation from the list
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));

      setLoading(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(null);
    }
  };

  const handleCreateOrganization = () => {
    navigate("/setup-organization");
  };

  // If no invitations and no organizations, redirect to setup
  useEffect(() => {
    if (!isLoadingInvitations && invitations.length === 0 && !hasOrganizations) {
      navigate("/setup-organization");
    }
  }, [isLoadingInvitations, invitations.length, hasOrganizations, navigate]);

  // Show loading state
  if (authLoading || isLoadingInvitations) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  // If user has organizations but no invitations, redirect to home
  if (invitations.length === 0 && hasOrganizations) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-full max-w-2xl bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl mb-2">Organization Invitations</h2>
          <p className="text-sm text-base-content/70 mb-4">
            You have been invited to join {invitations.length} organization
            {invitations.length !== 1 ? "s" : ""}. Accept an invitation to get started.
          </p>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="card bg-base-200">
                <div className="card-body p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">
                        {invitation.organizationName || "Organization"}
                      </h3>
                      <p className="text-sm text-base-content/70">
                        Role: <span className="badge badge-sm">{invitation.role}</span>
                      </p>
                      {invitation.inviterEmail && (
                        <p className="text-xs text-base-content/50 mt-1">
                          Invited by {invitation.inviterEmail}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAccept(invitation.id)}
                        className="btn btn-success btn-sm"
                        disabled={loading === invitation.id}
                      >
                        {loading === invitation.id ? (
                          <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                          "Accept"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(invitation.id)}
                        className="btn btn-ghost btn-sm"
                        disabled={loading === invitation.id}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!hasOrganizations && (
            <>
              <div className="divider">OR</div>
              <button
                type="button"
                onClick={handleCreateOrganization}
                className="btn btn-outline w-full"
                disabled={loading !== null}
              >
                Create New Organization
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
