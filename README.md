# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Automated Email Sending

ON-LI 자동 메일은 브라우저에서 Resend를 직접 호출하지 않고 Supabase Edge Function `send-email`을 통해 발송합니다.

Required Supabase secret:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
```

Deploy the Edge Function:

```bash
supabase functions deploy send-email
```

Local test example:

```bash
supabase functions serve send-email --env-file .env.local
curl -i --request POST 'http://127.0.0.1:54321/functions/v1/send-email' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "job_applied_user",
    "to": "applicant@example.com",
    "payload": {
      "name": "홍길동",
      "jobTitle": "Beautyworld Japan 통역 공고",
      "date": "2026-05-18 ~ 2026-05-20"
    }
  }'
```

Frontend admin notification recipients are currently managed in `src/lib/email.js` as `ADMIN_EMAILS`.
TODO: move these recipients to `.env` or Supabase secrets when the production configuration is finalized.

Supported email types:

- `interpreter_registered_user`
- `interpreter_registered_admin`
- `job_applied_user`
- `job_applied_admin`
- `company_request_received_user`
- `company_request_received_admin`
- `company_request_under_review`
- `company_matching_confirmed`
- `interpreter_approved`
- `interpreter_matching_confirmed`
- `interpreter_schedule_reminder`

Current automatic send points:

- Interpreter registration: interpreter receipt email and admin notification.
- Interpreter approval: interpreter approval email.
- Company request submission: company receipt email and admin notification.
- Job application submission: applicant receipt email and admin notification.
- Interpreter assignment: interpreter assignment email, company matching email, and admin notification.

Schedule reminders are template-ready through `interpreter_schedule_reminder`; actual scheduled sending should be added later with Supabase Scheduled Functions or cron.

Security notes:

- Do not expose `RESEND_API_KEY` as a `VITE_` frontend variable.
- Do not call the Resend SDK or API directly from browser code.
- Do not place a Supabase `service_role` key in frontend code.
- Email failures are logged but must not block interpreter registration or job application submission.
- The current sender is `onboarding@resend.dev`; after domain verification it can be changed in `supabase/functions/send-email/index.ts`.
