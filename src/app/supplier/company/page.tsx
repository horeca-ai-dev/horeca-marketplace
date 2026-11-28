/**
 * /supplier/company (D5-A3): the company profile and the bank details for payouts.
 *
 * Reads in one transaction through the domain (rule 4); the organization is the actor's, never from
 * the URL. Who may edit what comes from policy.can — the same table the server enforces:
 *   - the profile: the owner only (orgProfile.update)
 *   - the bank details: the owner only, to SEE as well (supplierProfile.viewBankDetails) — for a
 *     member the IBAN is not even read, so it cannot end up in the page
 */
import { getTranslations } from "next-intl/server";
import { CompanyProfile } from "@/components/domain/company/company-profile";
import { toProfileView } from "@/components/domain/company/profile-view";
import { ForbiddenPage } from "@/components/domain/errors/status-pages";
import { PageHeader } from "@/components/domain/shell/page-header";
import { requireArea } from "@/server/auth/guard";
import { withTx } from "@/server/db/tx";
import { getBankDetails } from "@/server/domain/bank-details";
import { getOrgProfile } from "@/server/domain/org-profile";
import { can } from "@/server/domain/policy";
import { loadPage } from "@/server/http/load-page";
import { BankDetails } from "./bank-details";

export default async function SupplierCompanyPage() {
  const { actor } = await requireArea("/supplier");
  const own = { orgId: actor.orgId };
  const canViewBank = can(actor, "supplierProfile.viewBankDetails", own);

  const result = await loadPage(() =>
    withTx(actor, async (tx) => ({
      profile: await getOrgProfile(tx, actor),
      bank: canViewBank ? await getBankDetails(tx, actor) : null,
    })),
  );
  if (!result.ok) return <ForbiddenPage area="supplier" />;
  const { profile, bank } = result.data;

  const t = await getTranslations();
  return (
    <>
      <PageHeader
        title={t("nav.supplier.company")}
        description={t("company.description.supplier")}
      />
      <CompanyProfile
        profile={toProfileView(profile)}
        canEdit={can(actor, "orgProfile.update", own)}
      />
      {bank ? (
        <BankDetails canView iban={bank.iban} />
      ) : (
        <BankDetails canView={false} />
      )}
    </>
  );
}
