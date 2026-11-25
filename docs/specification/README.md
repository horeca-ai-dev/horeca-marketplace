# Software Specification

The programme's Software Specification (mentors' template: `software_specification_horeca.docx`, v0.1 of
23.11.2026) is **submitted on D4 (G1)**. This folder holds the parts that are kept as text next to the code and
**link to the decision files instead of copying them**.

| Template section | File | Owner |
|---|---|---|
| §3.2 Detailed requirements — money rules | [money-rules.md](money-rules.md) | Member B |
| §6 Data model (ERD, entities, validation) | [data-model.md](data-model.md) | Member B |
| §7.3 Authentication and authorization (permission matrix) | [permissions.md](permissions.md) | Member B |
| §1–§5, §8–§11 overview, requirements, architecture, workflow, deployment, UI, plan | *(Member A — D3-AB1)* | Member A |

## Source of truth

| Topic | Read |
|---|---|
| Everything the 012 decision changed | [`docs/decisions/012-purchase-modes-payments-stock.md`](../decisions/012-purchase-modes-payments-stock.md) — wins over everything older |
| What changed since the schema / permission / money drafts | [`docs/decisions-9-11/APPLIED.md`](../decisions-9-11/APPLIED.md) |
| Original decisions 9–11 (permission matrix, catalogue model, order and money model) | [`docs/decisions-9-11/`](../decisions-9-11/) |
| Diagrams | [`docs/diagrams/`](../diagrams/) — some pictures predate 012 until D4-B4 / D14-B3 (see data-model.md §6.1) |

## Known differences between the template and the system as decided

The template (v0.1) was written **before decisions 9–12**. Before submission, these must be brought in line:
supplier approval / `pending` flow (now: the admin creates suppliers as `approved`) · payment by bank transfer
(now: purchase modes `direct` / `platform`, card payment on a mock gateway) · pro-forma "paid by bank transfer"
(now: platform part only) · full-text search in Postgres (`tsvector`, `pg_trgm` — now Meilisearch) · English-only UI
(now Montenegrin through `next-intl`). Member A's sections carry the overview and requirements part of this
clean-up; Member B's sections here already use the decided state.
