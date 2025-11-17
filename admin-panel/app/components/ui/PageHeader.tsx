import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string | ReactNode;
  action?: ReactNode;
  description?: string;
}

export const PageHeader = ({ title, subtitle, action, description }: PageHeaderProps) => {
  return (
    <div className="mb-12">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-3 flex-1">
          <h1 className="text-4xl font-bold text-base-content">
            {title}
          </h1>
          {subtitle && (
            <p className="text-lg text-base-content/60">
              {subtitle}
            </p>
          )}
          {description && (
            <p className="text-base text-base-content/50 max-w-3xl">
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </div>
  );
};
