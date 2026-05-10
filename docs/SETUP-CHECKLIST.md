# Setup Checklist

## Accounts to create

1. GitHub account
2. Clerk account
3. Supabase account
4. Netlify account

## Local tools

Install:

1. Node.js LTS
2. VS Code or Cursor
3. Git

## First local run

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Clerk setup

1. Create a Clerk app.
2. Copy Publishable Key to NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
3. Copy Secret Key to CLERK_SECRET_KEY.
4. Enable Organizations.
5. Disable open public sign-up before production unless you intentionally want self-signup.
6. Create your owner user first.

## Supabase setup

1. Create a Supabase project.
2. Copy Project URL to NEXT_PUBLIC_SUPABASE_URL.
3. Copy anon key to NEXT_PUBLIC_SUPABASE_ANON_KEY.
4. Copy service role key to SUPABASE_SERVICE_ROLE_KEY.
5. Run supabase/schema.sql in the SQL Editor.
6. Do not expose service role key in browser code.

## Netlify setup

1. Push repo to GitHub.
2. Connect GitHub repo to Netlify.
3. Add environment variables in Netlify site settings.
4. Build command: npm run build
5. Publish directory: .next

## Before going live

- Confirm owner account cannot be disabled.
- Confirm non-owner admins cannot create another owner.
- Confirm suspended users are blocked.
- Confirm customer users cannot access carrier data.
- Confirm carrier users cannot access competitor pricing.
- Confirm exports are only available to allowed roles.
- Confirm audit logs are created.
