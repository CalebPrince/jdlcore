# JDL Core — Group Site (Next.js)

Marketing site for the JDL Core group: independent oil & gas inspection
services today, plus two divisions in development (an industry-data chat
subscription and an education academy).

Rebuilt from the original static HTML/CSS site (`_legacy/`) into **Next.js
(App Router) + Tailwind CSS v4 + shadcn/ui**, with a **Supabase Postgres**
backend powering the forms and an admin panel.

## Stack

- Next.js 15 (App Router, Server Actions) · React 19 · TypeScript
- Tailwind CSS v4 with the original navy/gold design tokens
- shadcn/ui components (admin UI, form primitives)
- Drizzle ORM + Postgres (Supabase)
- Fonts: Space Grotesk (display) + IBM Plex Sans (body), self-hosted via `next/font`

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a free [Supabase](https://supabase.com) project and copy its
   connection string (**Project Settings → Database → Connection string**,
   use the *Transaction pooler* URI). Then set up `.env`:

   ```bash
   cp .env.example .env
   # edit .env and fill in DATABASE_URL, ADMIN_PASSWORD, SESSION_SECRET
   ```

3. Create the tables:

   ```bash
   npm run db:push
   ```

4. Run it:

   ```bash
   npm run dev
   ```

Then visit `http://localhost:3000`. The site renders even without
`DATABASE_URL` configured (contact details fall back to placeholders), but
forms and the admin panel need the database.

## Structure

```
src/app/
  page.tsx               Hub page — group intro + links to all three divisions
  inspection/page.tsx    Inspection Services (flagship) — services, process, quote form
  analytics/page.tsx     Analytics (coming soon) — expanded concept + waitlist
  academy/page.tsx       Academy (coming soon) — planned modules + waitlist
  contact/page.tsx       Contact — message form + live details from DB
  actions/               Server Actions: form submissions + admin auth/settings
  admin/                 Password-protected admin panel
    login/               Sign-in
    (dashboard)/         Inbox (all submissions) + Site Settings (contact details)
src/components/          Header/footer, chat widget, mockups, forms, ui/
src/db/                  Drizzle client + schema (settings, submissions)
_legacy/                 Original static site, kept for reference
docs/                    Client requirements document (future portal spec)
```

## Admin panel

Visit `/admin` and sign in with the `ADMIN_PASSWORD` from `.env`
(default `jdl-admin` — change this before deploying!).

- **Inbox** — every quote request, contact message, chat handoff, and
  waitlist signup, filterable by type.
- **Site Settings** — edit the phone/email/address/WhatsApp details shown in
  every footer and on the contact page; saves straight to the database and is
  live immediately.

## Chat widget

The bottom-right chat launcher is still a scripted, menu-driven demo (no AI):
quick-reply chips, a small rule-based responder, and human handoff. Unlike
the legacy version, the "leave your details" handoff now actually stores
submissions in the database.

## Deployment notes

- Set `DATABASE_URL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` as environment
  variables on your host.
- Run `npm run db:push` once against production (or from any machine with
  the same env vars).
- Forms submit via Next.js Server Actions — no third-party form service
  needed.

## Known placeholders / open items

- Contact details start as placeholders until they're set in `/admin`.
- The dashboard/chat/course panels in each hero are hand-built UI mockups,
  not real screenshots.
- The chat widget itself is scripted (see above); swap in a real backend/AI
  later if wanted.
- Academy logo — no dedicated logo exists yet; the Inspection mark is reused.
- The client/operations/inspector portal described in `docs/JDL Core
  Inspection Services.docx` is a separate future project, not part of this
  marketing site.
