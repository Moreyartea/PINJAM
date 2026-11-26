import { RoleGuard } from "@/components/auth/role-guard";
import { KomtingShell } from "@/components/layout/komting-shell";
import { ProjectorListView } from "@/features/projectors/projector-list-view";

export default function KomtingProjectorsPage() {
  return (
    <RoleGuard allowedRoles={["KOMTING"]}>
      <KomtingShell>
        <ProjectorListView />
      </KomtingShell>
    </RoleGuard>
  );
}
