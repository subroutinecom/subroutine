import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";

export default function SetupOrganization() {
  const navigate = useNavigate();
  const { isAuthenticated, organizations, isLoading: authLoading, refetch } = useAuth();
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Redirect if user already has organizations
  useEffect(() => {
    if (!authLoading && organizations.length > 0) {
      navigate("/");
    }
  }, [authLoading, organizations, navigate]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!organizationName.trim()) {
      setError("Organization name is required");
      return;
    }

    const slug = generateSlug(organizationName);
    if (!slug) {
      setError("Organization name must contain at least one alphanumeric character");
      return;
    }

    setLoading(true);

    try {
      const { data: organization, error: createError } = await authClient.organization.create({
        name: organizationName.trim(),
        slug,
      });

      if (createError) {
        setError(createError.message || "Failed to create organization");
        setLoading(false);
        return;
      }

      if (!organization) {
        setError("Failed to create organization");
        setLoading(false);
        return;
      }

      const { error: setActiveError } = await authClient.organization.setActive({
        organizationId: organization.id,
      });

      if (setActiveError) {
        setError(setActiveError.message || "Failed to set organization as active");
        setLoading(false);
        return;
      }

      await refetch();

      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl mb-2">Create Your Organization</h2>
          <p className="text-sm text-base-content/70 mb-4">
            To get started, create an organization. You'll be able to invite team members later.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-2">Organization Name</label>
              <input
                type="text"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Acme Inc"
                className="input input-bordered w-full"
                required
                disabled={loading}
                autoFocus
              />
              {organizationName && (
                <p className="text-xs text-base-content/50 mt-1">
                  Slug: {generateSlug(organizationName) || "(invalid)"}
                </p>
              )}
            </div>

            {error && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner"></span>
              ) : (
                "Create Organization"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
