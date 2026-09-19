# Information Security Policy — TaskFlowCo

_Owner: Founder / Data Protection point of contact · Review cadence: every 6 months or after any material change · Last reviewed: 2026-09-19_

TaskFlowCo ("TaskFlow", "we") is a SaaS practice-management platform for Indian
CA/tax firms. We process **sensitive personal data and financial identifiers**
on behalf of our customer firms (their clients' PAN, GSTIN, contact details, and
**portal login credentials**). This policy is our internal standard for
protecting that data and is written to align with the **Digital Personal Data
Protection Act, 2023 (DPDP)**, the **IT Act, 2000 + SPDI Rules, 2011**, and the
**CERT-In Directions, 2022**.

## 1. Roles
- **Data Fiduciary (per DPDP):** the customer firm, for its own clients' data.
- **Data Processor:** TaskFlowCo, acting on the firm's documented instructions.
- **Grievance / DPO contact:** privacy@taskflowco.in.

## 2. Data we store and where
- **Primary datastore:** Supabase (Postgres) project `vorxrjekbokqkigfabhr`,
  region **ap-south-1 (Mumbai, India)** — data residency stays in India.
- **Categories:** org/user profiles, clients (name/PAN/GSTIN/contact), worksheet
  &amp; task data, attendance/time logs, billing records, and the **encrypted
  credential vault**.
- **Hosting/CDN:** Vercel (static SPA only — no customer data at rest on Vercel).

## 3. Technical safeguards (implemented)
- **Encryption in transit:** HTTPS/TLS everywhere (Vercel + Supabase).
- **Encryption at rest:** Postgres storage encryption; **credential secrets are
  additionally encrypted at the column level** with `pgp_sym` using a key held in
  Supabase Vault (never in source). Secrets are read only via the
  `cred_get_secret` / `cred_set_secret` SECURITY DEFINER RPCs.
- **Tenant isolation:** **Row Level Security is enabled on every public table**
  with org-scoped policies. RLS is never disabled on a public table.
- **Least privilege:** SECURITY DEFINER functions self-authorise (verify
  `auth.uid()` org membership) and pin `search_path`. Direct table writes to
  audit/log tables are revoked from `anon`/`authenticated`.
- **Consent capture:** storing a client credential requires the firm to confirm
  authorisation; `client_credentials.consent_at` / `consent_by` record it.
- **Access auditing:** every reveal/copy of a decrypted credential is written to
  `credential_access_log` (who, which credential, when). Masked-by-default in UI.
- **Admin surface:** platform-admin views are restricted to `@taskflowco.in`
  identities (`is_tfc_admin()`) and guarded against cross-tenant leakage.

## 4. Access control (people)
- Production DB/dashboard access limited to the founder(s); MFA on Supabase,
  Vercel and GitHub. No shared logins.
- Customer-firm users get only their org's data via RLS and app-level roles
  (owner / admin / member) enforced through membership RPCs.

## 5. Operational safeguards
- **Backups:** Supabase automated backups; **Point-in-Time Recovery (PITR)** to
  be kept enabled (see `docs/DATA-PROTECTION.md`).
- **Logging & time sync:** application/DB logs retained; per **CERT-In** all
  system clocks sync to NTP and security logs are retained **≥ 180 days**
  (infra/dashboard setting — see `docs/CERT-IN-RUNBOOK.md`).
- **Change management:** all schema changes ship as reviewed SQL migrations in
  `supabase/migrations/`; `get_advisors(security)` is run after DDL.
- **Auth hardening:** leaked-password protection (HaveIBeenPwned) to be enabled
  in Supabase Auth settings.

## 6. Sub-processors
See the register in `docs/DATA-PROTECTION.md` (Supabase, Vercel, Razorpay,
Resend). Customer firms are notified of material sub-processor changes.

## 7. Incident response
Security incidents follow `docs/CERT-IN-RUNBOOK.md`, including the **CERT-In
6-hour reporting** obligation and DPDP breach-notification duties.

## 8. Data subject / firm rights
Requests for access, correction, or erasure of personal data are handled per the
retention & deletion SOP in `docs/DATA-PROTECTION.md`.

## Reporting a vulnerability
Email **security@taskflowco.in** with details and reproduction steps. Please do
not open a public GitHub issue for security reports. We aim to acknowledge within
72 hours.
