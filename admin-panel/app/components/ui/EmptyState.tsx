import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body items-center text-center">
        <div className="avatar placeholder mb-4">
          <div className="bg-primary/10 text-primary rounded-full w-16 flex items-center justify-center">
            {icon}
          </div>
        </div>
        <h2 className="card-title">{title}</h2>
        <p className="opacity-60">{description}</p>
        {action && (
          <div className="card-actions mt-4">
            {action}
          </div>
        )}
      </div>
    </div>
  );
};
