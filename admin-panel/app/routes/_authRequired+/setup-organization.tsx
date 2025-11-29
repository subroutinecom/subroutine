import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { getAuthClient } from "~/lib/auth-client";
import { useAuth } from "~/components/providers/AuthProvider";
import { useAdminConfig } from "~/hooks/use-admin-config";

type OrganizationFormData = {
  organizationName: string;
};

export default function SetupOrganization() {
  const navigate = useNavigate();
  const config = useAdminConfig();
  const authClient = useMemo(() => getAuthClient(config), [config]);
  const { isAuthenticated, organizations, isLoading: authLoading, refetch } = useAuth();
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationFormData>();

  const organizationName = watch("organizationName", "");

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

  const onSubmit = async (data: OrganizationFormData) => {
    setServerError("");

    const slug = generateSlug(data.organizationName);
    if (!slug) {
      setServerError("Organization name must contain at least one alphanumeric character");
      return;
    }

    try {
      const { data: organization, error: createError } = await authClient.organization.create({
        name: data.organizationName.trim(),
        slug,
      });

      if (createError) {
        setServerError(createError.message || "Failed to create organization");
        return;
      }

      if (!organization) {
        setServerError("Failed to create organization");
        return;
      }

      const { error: setActiveError } = await authClient.organization.setActive({
        organizationId: organization.id,
      });

      if (setActiveError) {
        setServerError(setActiveError.message || "Failed to set organization as active");
        return;
      }

      await refetch();

      navigate("/");
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "An unexpected error occurred");
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm mb-2">Organization Name</label>
              <input
                type="text"
                {...register("organizationName", {
                  required: "Organization name is required",
                })}
                placeholder="Acme Inc"
                className="input input-bordered w-full"
                disabled={isSubmitting}
                autoFocus
              />
              {errors.organizationName && (
                <p className="text-xs text-error mt-1">{errors.organizationName.message}</p>
              )}
              {organizationName && (
                <p className="text-xs text-base-content/50 mt-1">
                  Slug: {generateSlug(organizationName) || "(invalid)"}
                </p>
              )}
            </div>

            {serverError && (
              <div className="alert alert-error">
                <span>{serverError}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? (
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
