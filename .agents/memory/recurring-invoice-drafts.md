---
name: Recurring invoices & draft (taslak) status
description: How recurring invoice items and the taslak status interact across schema, generation, and income reporting
---

Recurring invoice definitions keep their original scalar columns (aciklama/birimFiyat/kdvOrani for a single line) AND have a child items table for multiple line items. Generation reads the child items if any exist, otherwise falls back to the single scalar line.
**Why:** backward compatibility — old single-line definitions must keep generating without a data migration.
**How to apply:** when generating an invoice from a recurring def, always check for child items first and only fall back to the scalar columns. When creating/updating a def with multiple items, also set the scalar columns from the first item so legacy code paths and list summaries still work.

Same-month duplicate billing is prevented by tracking which period each generated invoice covers, enforced at the database level, not just in code.
**Why:** manual + automatic generation racing (or a schedule edited backwards) could otherwise double-bill a month silently.
**How to apply:** never insert recurring invoices directly — always go through the shared generator, which owns period tracking, inactive-definition rejection, and safe schedule advancement.

Every code path that auto-allocates an invoice number must share one allocation mechanism (allocation + invoice insert in the same transaction, serialized per parent company).
**Why:** invoice numbers have no DB uniqueness; independent writers (normal, recurring, quote conversion) racing each other issued the same number, and series counters vs count-based numbering were two diverging sequences under the same prefix.
**How to apply:** when adding any new invoice-creating flow, reuse the shared allocator inside its transaction; it prefers the company's default series counter and falls back to count+1. Never read-then-increment a series counter in separate statements.

Auto/manually generated recurring invoices are created in "taslak" status, not "acik".
**Why:** drafts must be reviewable before they count as real receivables/income.
**How to apply:** any new income/receivable aggregation that sums invoices MUST exclude durum === "taslak". Receivable filters that already whitelist only acik/kismi_odendi exclude taslak automatically; raw income sums (e.g. monthly/company income) need an explicit taslak exclusion. Finalizing a draft = PATCH durum to "acik" (reuses the normal durum-change path).
