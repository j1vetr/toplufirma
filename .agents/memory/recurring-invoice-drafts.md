---
name: Recurring invoices & draft (taslak) status
description: How recurring invoice items and the taslak status interact across schema, generation, and income reporting
---

Recurring invoice definitions keep their original scalar columns (aciklama/birimFiyat/kdvOrani for a single line) AND have a child items table for multiple line items. Generation reads the child items if any exist, otherwise falls back to the single scalar line.
**Why:** backward compatibility — old single-line definitions must keep generating without a data migration.
**How to apply:** when generating an invoice from a recurring def, always check for child items first and only fall back to the scalar columns. When creating/updating a def with multiple items, also set the scalar columns from the first item so legacy code paths and list summaries still work.

Auto/manually generated recurring invoices are created in "taslak" status, not "acik".
**Why:** drafts must be reviewable before they count as real receivables/income.
**How to apply:** any new income/receivable aggregation that sums invoices MUST exclude durum === "taslak". Receivable filters that already whitelist only acik/kismi_odendi exclude taslak automatically; raw income sums (e.g. monthly/company income) need an explicit taslak exclusion. Finalizing a draft = PATCH durum to "acik" (reuses the normal durum-change path).
