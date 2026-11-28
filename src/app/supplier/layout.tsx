import { AppShell } from "@/components/domain/shell/app-shell";
import { requireShell } from "@/server/auth/guard";

export default async function Layout({ children }: LayoutProps<"/supplier">) {
  const { orgName, organizations } = await requireShell("/supplier");
  return (
    <AppShell area="supplier" orgName={orgName} organizations={organizations}>
      {children}
    </AppShell>
  );
}
