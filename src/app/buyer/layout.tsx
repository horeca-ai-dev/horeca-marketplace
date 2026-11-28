import { AppShell } from "@/components/domain/shell/app-shell";
import { requireShell } from "@/server/auth/guard";

export default async function Layout({ children }: LayoutProps<"/buyer">) {
  const { orgName, organizations } = await requireShell("/buyer");
  return (
    <AppShell area="buyer" orgName={orgName} organizations={organizations}>
      {children}
    </AppShell>
  );
}
