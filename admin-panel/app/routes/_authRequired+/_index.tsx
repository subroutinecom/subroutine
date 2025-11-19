import { Activity, ArrowRight, Plug, Sparkles, TrendingUp, Users } from "lucide-react";
import { useAuth } from "~/components/providers/AuthProvider";
import { Link } from "react-router";

export function meta() {
  return [
    { title: "Dashboard - Subroutine" },
    { name: "description", content: "Subroutine Admin Panel" },
  ];
}

export default function Home() {
  const { activeOrganization, user } = useAuth();

  // Mock data - replace with real data from GraphQL
  const stats = [
    {
      label: "Active Integrations",
      value: "3",
      change: "+2 this month",
      icon: Plug,
      trend: "up" as const,
    },
    {
      label: "Subroutines",
      value: "0",
      change: "Get started",
      icon: Activity,
      trend: "neutral" as const,
    },
    {
      label: "Team Members",
      value: "1",
      change: "Invite teammates",
      icon: Users,
      trend: "neutral" as const,
    },
    {
      label: "API Calls",
      value: "1.2k",
      change: "+18% this week",
      icon: TrendingUp,
      trend: "up" as const,
    },
  ];

  const quickActions = [
    {
      title: "Create Subroutine",
      description: "Automate workflows with custom logic",
      icon: Sparkles,
      href: "#",
      primary: true,
    },
    {
      title: "Add Integration",
      description: "Connect to Gmail, GitHub, and more",
      icon: Plug,
      href: "/integrations/new",
      primary: false,
    },
    {
      title: "Invite Team",
      description: "Collaborate with your organization",
      icon: Users,
      href: "#",
      primary: false,
    },
  ];

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-5xl font-bold text-base-content">
          Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-xl text-base-content/60">
          {activeOrganization?.name}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, _index) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="card bg-base-100 border border-base-300"
            >
              <div className="card-body p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
                    {stat.label}
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon size={24} className="text-primary" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl font-bold text-base-content">{stat.value}</div>
                  <div
                    className={`text-sm font-medium ${
                      stat.trend === "up" ? "text-success" : "text-base-content/50"
                    }`}
                  >
                    {stat.change}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="space-y-8">
        <h2 className="text-3xl font-bold text-base-content">
          Quick Actions
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                to={action.href}
                className="card bg-base-100 border border-base-300 hover:border-primary/50 transition-all group"
              >
                <div className="card-body p-8">
                  <div
                    className={`
                    w-16 h-16 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105 mb-6
                    ${action.primary ? "bg-primary" : "bg-primary/10"}
                  `}
                  >
                    <Icon
                      size={28}
                      className={action.primary ? "text-primary-content" : "text-primary"}
                    />
                  </div>
                  <h3 className="text-xl font-bold text-base-content mb-3 flex items-center justify-between">
                    {action.title}
                    <ArrowRight
                      size={20}
                      className="text-base-content/30 group-hover:translate-x-1 transition-transform"
                    />
                  </h3>
                  <p className="text-base text-base-content/60">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="space-y-8">
        <h2 className="text-3xl font-bold text-base-content">
          Recent Activity
        </h2>
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body p-16 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Activity size={32} className="text-primary" />
            </div>
            <h3 className="text-xl font-bold text-base-content mb-3">
              No activity yet
            </h3>
            <p className="text-base text-base-content/60 max-w-lg mx-auto">
              Your recent workflow runs and integration activity will appear here
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
