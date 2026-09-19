# Data Protection, Retention & Deletion SOP — TaskFlowCo

_Aligned to DPDP Act 2023, IT Act/SPDI Rules 2011. Owner: Founder.
Last reviewed: 2026-09-19._

## 1. Data categories & purpose
| Category | Examples | Purpose | Store |
|---|---|---|---|
| Account data | user name, email, org membership/role | authentication, access control | Supabase (ap-south-1) |
| Client master | name, PAN, GSTIN, contact | practice management for the firm | Supabase |
| Work data | worksheets, tasks, attendance, time logs | firm operations | Supabase |
| **Credential vault** | client portal usernames/passwords | let firms act for clients | Supabase (column-encrypted) |
| Billing | subscription, invoices, Razorpay events | payments | Supabase + Razorpay |
| Comms | reminder emails | notifications | Resend |

**Data residency:** primary datastore is in **India (ap-south-1)**.

## 2. Legal basis / consent
- Customer firms are **Data Fiduciaries** for their clients' data; TaskFlow is a
  **Data Processor** acting on the firm's instructions.
- Storing a client **credential** requires the firm to affirm authorisation in
  the app (recorded in `client_credentials.consent_at` / `consent_by`).
- The public site shows a DPDP-friendly cookie/consent notice; we use only
  strictly-necessary storage (sign-in + preferences), no ad/tracking cookies.

## 3. Retention schedule
| Data | Retention |
|---|---|
| Active account & work data | while the org subscription is active |
| Data after org deletion | purged on delete (FK `ON DELETE CASCADE`); backups age out per PITR window |
| Security/access logs (`credential_access_log`, infra logs) | **≥ 180 days** (CERT-In) |
| Billing/invoice records | as required by tax/accounting law (retain, do not auto-purge) |
| Backups (PITR) | per Supabase plan retention window |

## 4. Deletion / erasure SOP (right to erasure)
1. Verify the requester is the org owner (or the firm on a client's behalf).
2. For a single client: delete via app; cascades remove worksheet/credential/
   log rows tied to the client (`credential_access_log.cred_id` set null,
   retaining the audit trail without the secret).
3. For a whole org: owner-initiated org delete cascades across billing, members,
   credentials, and logs (verified FKs).
4. Confirm removal from the primary DB. Note that **backups** retain data until
   the PITR window elapses — communicate this to the requester.
5. Record the request and completion date.

## 5. Sub-processor register
| Sub-processor | Purpose | Data exposed | Region |
|---|---|---|---|
| Supabase | database, auth, storage, functions | all app data | ap-south-1 (India) |
| Vercel | static SPA hosting / CDN | none at rest (client-side app) | global edge |
| Razorpay | payments | billing identifiers, payment events | India |
| Resend | transactional/reminder email | recipient email, message content | — |

Material changes to sub-processors are communicated to customer firms.

## 6. Cross-border transfer
Primary processing is in India. Any transfer outside India (e.g. email delivery,
CDN edge) is limited to non-sensitive operational data and only to jurisdictions
permitted under DPDP. Contracts with sub-processors include confidentiality and
data-protection terms.

## 7. Manual / dashboard controls to keep enabled
These cannot be enforced from application code and must be verified in the
provider dashboards:
- **Supabase → Auth:** leaked-password protection **ON**.
- **Supabase → Database:** **PITR / backups** enabled.
- **Supabase / Vercel → Logs:** retention/drain configured for **≥ 180 days**.
- **NTP** time sync (provider-managed; recorded for CERT-In).
- MFA on Supabase, Vercel, GitHub, Razorpay, Resend.
