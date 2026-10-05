# Company Applicant Resumes

## Rollout Status

User authorized production rollout on 2026-10-05. Production migration succeeded
through the Supabase SQL dashboard. Applicant IDs use UUIDs in production;
the RPC and isolated fixtures use the same type. Frontend rollout is in progress.
No existing resume has been modified, redacted, or published by this work.

## Behavior

- Company Applicants offers a resume view for each applicant, not only assignments.
- Only an approved company owning a request can resolve its applicants' reviewed PDF.
- Original PDFs remain in the existing private resume-files bucket.
- Separately redacted and reviewed PDFs belong in the private company-resumes bucket.
- An administrator registers the PDF in the interpreter detail Activity tab and confirms
  that contact data, including hidden content, has actually been removed.
- This feature is a reviewed-copy publication workflow, not an automatic redaction engine.
- Browser overlays, CSS hiding, or drawing a rectangle over PDF text are not safe redaction.
- A source URL or upload timestamp change invalidates the approved copy.
- Signed URLs expire after 60 seconds. Already downloaded copies cannot be recalled;
  an already-issued URL may remain usable until it expires.
- No reviewed copy or a private profile yields no resume path. There is no original-file fallback.

## Verification

- node scripts/test-company-reviewed-resumes.mjs passed in an isolated PostgreSQL fixture.
- Company applicant access succeeds without any assignment fixture.
- Other-company, anonymous, private-profile, unapproved-company access denied.
- Company writes to the bucket denied and reviewed-copy metadata remains admin-only.
- Source replacement invalidates RPC and storage access.
- Existing npm run test:security passed.
- Component ESLint and production build passed; existing bundle-size warning remains.
- Live DB, real PDF contents, and live frontend verification are pending rollout.

## Deployment

1. Confirm the reviewed-copy approach and obtain action-time approval for company resume access.
2. Apply supabase/migrations/20261005160000_company_reviewed_resumes.sql to production.
3. Deploy the frontend and verify applicant ownership and private-bucket isolation.
4. Test using a synthetic PDF without personal data; do not publish an actual original for testing.
5. Before publishing a real resume, permanently redact contacts and remove hidden data,
   check every page visually, check extracted text/links/metadata, then register the reviewed copy.

The standardized DOCX template does not prove an uploaded PDF is contact-free or structurally
identical. Older resumes, scanned pages, shifted layout, QR codes, embedded attachments,
and free-text contacts need review. These are why automatic publication is not enabled.
