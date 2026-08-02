# Quantum Security Group — Community Site

A Facebook-style community for QSG followers. Members post announcements, photos,
and updates. Followers sign in, react, comment, reply, and follow — all on a
permanent home that can't be banned.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Clerk** — accounts (free forever up to 50,000 members)
- **Supabase** — database + image storage (your own project)
- **Vercel** — hosting

## Features

- Sign up / log in via Clerk (email/password or Google)
- Profile with name + bio only (no photo uploads — anti-tampering)
- Feed: org **members** post text + photos; **followers** view/react/comment
- Reactions: like / love / care / wow on posts and comments
- Threaded comments & replies
- Follow system + profile pages
- Admin panel: pin posts, hide/delete posts & comments, assign roles
- Photo security: image-only files (magic-byte checked), random filenames,
  server-side uploads only, no public write access to storage

## Setup

### 1. Environment variables

Copy `.env.example` to `.env.local` and fill in real values.

### 2. Clerk

1. Create a free app at https://clerk.com
2. Copy your **Publishable key** and **Secret key** into `.env.local`
   (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
3. Optional: enable Google sign-in under User & Authentication → Social Connections

### 3. Supabase

1. Create a project at https://supabase.com
2. Open the **SQL editor** and run `supabase/migrations/0001_init.sql`
   (creates all tables, indexes, triggers, RLS, and the `qsc-images` bucket)
3. Copy your **Project URL** and **Service Role key** into `.env.local`
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

> The app uses the service-role key **server-side only** (Clerk is the auth
> provider). Never put the service role key in `NEXT_PUBLIC_` variables.

### 4. First admin

The **first user** who signs up automatically becomes the **admin**. Use the
admin panel at `/admin` to promote team members and manage posts/comments.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Import it at https://vercel.com/new
3. Add the same environment variables in Project → Settings → Environment Variables
4. Deploy

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
