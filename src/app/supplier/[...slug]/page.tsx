/** Placeholder for the screens of this area that are not built yet (see PlaceholderPage). */
import { PlaceholderPage } from "@/components/domain/shell/placeholder-page";

export default async function Page({
  params,
}: PageProps<"/supplier/[...slug]">) {
  const { slug } = await params;
  return (
    <PlaceholderPage area="supplier" path={`/supplier/${slug.join("/")}`} />
  );
}
