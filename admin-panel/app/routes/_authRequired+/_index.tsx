import { IconPlus } from "@tabler/icons-react";
import { useAuth } from "~/components/providers/AuthProvider";
import { PageHeader } from "../../components/ui/PageHeader.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";

export function meta() {
  return [
    { title: "Dashboard - Subroutine" },
    { name: "description", content: "Subroutine Admin Panel" },
  ];
}

export default function Home() {
  const { activeOrganization } = useAuth();

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle={activeOrganization?.name} />

      <EmptyState
        icon={<IconPlus size={32} />}
        title="Get Started"
        description="Create your first subroutine to automate tasks and streamline your operations."
        action={
          <button type="button" className="btn btn-primary">
            Create Subroutine
          </button>
        }
      />
    </div>
  );
}
