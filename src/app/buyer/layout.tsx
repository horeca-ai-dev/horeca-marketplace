import { AppShell } from "@/components/domain/shell/app-shell";

export default function Layout({ children }: LayoutProps<"/buyer">) {
  return <AppShell area="buyer">{children}</AppShell>;
}
