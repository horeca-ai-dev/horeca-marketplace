import { AppShell } from "@/components/domain/shell/app-shell";

export default function Layout({ children }: LayoutProps<"/admin">) {
  return <AppShell area="admin">{children}</AppShell>;
}
