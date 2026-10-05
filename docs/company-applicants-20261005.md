# Company Applicant Profiles

## Current Status

Implemented locally and verified by security tests and a production build.
Not deployed: production permission approval and SQL application are pending.
Browser verification is incomplete because the Chrome control connection timed out.

## Scope

- Business mypage has an Applicants tab with a request selector, loading/error/empty states, refresh, and expandable public profiles.
- Only approved companies can list applications for requests they own.
- Profiles come from public_interpreters. Unpublished profiles return null.
- The explicit profile allowlist contains name, level, introduction, specialties, regions, experience count, and verification flag.
- Phone, email, application message, resume, financial data, and admin notes are not returned.
- This is read-only; final acceptance and assignment remain administrator actions.

## Contact Display

The supplied screenshot uses the older fixed deployment URL ending in
onli-platform-3yhql5pol-onlinkwith-2439s-projects.vercel.app.
The current production URL is https://onli-platform.vercel.app/business/mypage.
Its current JS bundle contains onlinkwith@gmail.com and does not contain
support@on-li.co.kr or 010-4494-0418. Existing source checks also pass.
No customer profile phone numbers were removed.

## Verification

- npm run test:security: passed, including new own/other/unapproved company, interpreter, anonymous, private profile, and sensitive-field exclusion checks.
- node scripts/test-support-contact.mjs: passed.
- npx eslint src/components/CompanyApplicants.jsx: passed.
- npm run build: passed; existing large bundle warning remains.
- git diff --check: passed.
- Development preview: http://127.0.0.1:5187/business/mypage.

## Rollout

1. Obtain approval for the new company read permission before applying it through the dashboard.
2. Apply supabase/migrations/20261005120000_company_applicant_profiles.sql to the correct production project.
3. Verify company account access to request 117, anonymous denial, other-company denial, and no contact fields.
4. Deploy the frontend and verify the Applicants tab and expanded profile on desktop/mobile.
5. Use the stable production address rather than an old immutable deployment address.

The development frontend currently reports a fetch error if the new RPC has not been applied. That is expected until rollout completes.
