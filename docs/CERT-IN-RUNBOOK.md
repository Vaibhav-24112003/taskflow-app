# CERT-In Incident Response Runbook — TaskFlowCo

_Aligned to the **CERT-In Directions, 2022** (No. 20(3)/2022-CERT-In) and DPDP
breach-notification duties. Owner: Founder. Last reviewed: 2026-09-19._

> **The single hard deadline: report reportable cyber incidents to CERT-In
> within 6 HOURS of noticing them.** Everything else in this runbook exists to
> make that deadline hittable.

## 0. Emergency contacts
| Role | Contact |
|---|---|
| Incident lead | Founder — privacy@taskflowco.in |
| CERT-In reporting | incident@cert-in.org.in · https://www.cert-in.org.in (Incident Report form) · phone as listed on cert-in.org.in |
| Supabase support | dashboard → Support |
| Vercel support | dashboard → Support |

## 1. What must be reported (mandatory)
CERT-In requires reporting of, among others: targeted scanning/probing of
systems, compromise of critical systems, **unauthorised access to data or
systems**, **data breaches / data leaks**, identity theft, and attacks on
servers/applications/databases. For TaskFlow the likely triggers are:
- Any unauthorised access to the Supabase database or the credential vault.
- Leak/exfiltration of client PAN/GSTIN, contact data, or portal credentials.
- Account takeover of a firm admin or of a platform-admin (`@taskflowco.in`).
- Ransomware/defacement or compromise of the Vercel/Supabase/GitHub accounts.

**When in doubt, report.** Under-reporting is the larger risk.

## 2. The 6-hour clock — do these in parallel
1. **Contain** — rotate the affected secret(s): Supabase service/anon keys, the
   credential-vault encryption key (Vault), Vercel/GitHub/Supabase login + MFA,
   Razorpay/Resend keys. Suspend compromised sessions/users.
2. **Preserve evidence** — do NOT wipe. Snapshot DB (PITR), capture Supabase
   logs (`query_logs`), Vercel logs, `credential_access_log`, `cron.job` state.
   Note timestamps in **UTC and IST**.
3. **Assess scope** — which orgs, which data categories, how many records,
   whether credentials were revealed (query `credential_access_log`).
4. **Report to CERT-In within 6 hours** — submit the Incident Report form with:
   time of occurrence & detection, affected systems, incident type, brief
   description, and contact. Keep the acknowledgement/reference number.
5. **DPDP notification** — notify affected customer firms (Data Fiduciaries)
   promptly so they can meet their own Data Principal / Data Protection Board
   obligations. Provide nature, scope, likely consequences, and remediation.

## 3. After containment
- Root-cause analysis; ship the fix as a reviewed migration/PR.
- Run `get_advisors(security)`; re-verify RLS on all public tables.
- Post-incident report filed internally; policy updated if needed.
- Respond to any CERT-In follow-up requests for logs/records.

## 4. Standing CERT-In compliance controls (keep these true)
- **Log retention ≥ 180 days.** Enable extended log retention/log drains for
  Supabase and Vercel so security logs are available for at least 180 days
  within Indian jurisdiction. _Status: to be confirmed at the infra/dashboard
  level — this cannot be set from application code._
- **NTP time synchronisation.** All servers/services sync to NTP (Supabase and
  Vercel managed infra do this; we rely on the provider and record it here).
  Consistent, synced timestamps are mandatory for incident correlation.
- **Point of contact.** privacy@taskflowco.in is our standing security contact;
  keep it monitored.
- **Enable leaked-password protection** in Supabase Auth (dashboard) so breached
  passwords are rejected at sign-up/change.

## 5. Quick evidence queries
```sql
-- Recent credential reveals (who accessed what, when)
select org_id, cred_id, client_id, accessed_by, action, at
from public.credential_access_log
order by at desc limit 200;

-- Active scheduled jobs (detect tampering)
select jobname, schedule, active from cron.job;
```
