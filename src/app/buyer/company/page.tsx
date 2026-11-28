/**
 * /buyer/company (D5-A3): the company profile and the delivery locations.
 *
 * Reads in one transaction through the domain (rule 4); the organization is the actor's, never from
 * the URL. Who may edit what comes from policy.can — the same table the server enforces:
 *   - the profile: the owner only (orgProfile.update)
 */
import { getTranslations } from "next-intl/server";
import { CompanyProfile } from "@/components/domain/company/company-profile";
import { toProfileView } from "@/components/domain/company/profile-view";
import { ForbiddenPage } from "@/components/domain/errors/status-pages";
import { PageHeader } from "@/components/domain/shell/page-header";
import { requireArea } from "@/server/auth/guard";
import { withTx } from "@/server/db/tx";
import { getOrgProfile } from "@/server/domain/org-profile";
import { can } from "@/server/domain/policy";
import { loadPage } from "@/server/http/load-page";

export default async function BuyerCompanyPage() {
  const { actor } = await requireArea("/buyer");
  const result = await loadPage(() =>
    withTx(actor, (tx) => getOrgProfile(tx, actor)),
  );
  if (!result.ok) return <ForbiddenPage area="buyer" />;

  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("nav.buyer.company")}
        description={t("company.description.buyer")}
      />
      <CompanyProfile
        profile={toProfileView(result.data)}
        canEdit={can(actor, "orgProfile.update", { orgId: actor.orgId })}
      />
    </>
  );
}
