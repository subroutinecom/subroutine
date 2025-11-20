import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-16">
        <div className="flex flex-col items-center text-center space-y-8 max-w-md mx-auto">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
          <div className="space-y-3">
            <h3 className="text-2xl font-bold text-base-content">{title}</h3>
            <p className="text-base text-base-content/60">{description}</p>
          </div>
          {action && <div className="pt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
};
