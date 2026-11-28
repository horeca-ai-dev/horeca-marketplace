import { AppShell } from "@/components/domain/shell/app-shell";
import { requireShell } from "@/server/auth/guard";

export default async function Layout({ children }: LayoutProps<"/admin">) {
  const { orgName, organizations } = await requireShell("/admin");
  return (
    <AppShell area="admin" orgName={orgName} organizations={organizations}>
      {children}
    </AppShell>
  );
}
