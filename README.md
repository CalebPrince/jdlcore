# JDL Core Platform

JDL Core is a multi-division oil and gas platform covering independent inspection services, source-grounded industry analytics, and practical operations training.

The application combines public marketing sites with secure workspaces for staff, clients, inspectors, analytics subscribers, and academy learners.

## Stack

- Next.js 15 App Router, React 19, and TypeScript
- Tailwind CSS v4
- shadcn/ui and Radix UI primitives
- Lucide icons
- Drizzle ORM with Supabase Postgres
- Space Grotesk for display typography and IBM Plex Sans for body text through `next/font`
- Next.js Server Actions for authenticated workflows and forms

## Apple-inspired UI system

The interface follows Apple-caliber design principles adapted to the JDL Core brand. It does not reproduce Apple product pages or proprietary interface styling.

The system prioritizes:

- Immediate comprehension and strong information hierarchy
- Content-first layouts with generous, responsive spacing
- Deep navy, industrial gold, warm neutral surfaces, and restrained translucency
- Subtle borders and material separation instead of heavy shadows
- Comfortable touch targets and consistent keyboard focus states
- Purposeful motion that respects `prefers-reduced-motion`
- Responsive layouts designed separately for mobile and desktop
- Lucide icons rather than emoji, text glyphs, or improvised interface symbols
- Authentic JDL Core logo assets rendered with Next.js Image

Shared design tokens and cross-product surface rules live in `src/app/globals.css`. Tailwind remains the primary styling layer, while shadcn primitives provide accessible foundations for buttons, cards, fields, alerts, tables, sheets, menus, and related controls.

### Public experience

The public UI includes:

- JDL Core group landing page
- Inspection Services marketing site
- Analytics marketing and beta access pages
- Academy marketing site and public course catalogue
- Contact and lead-generation forms
- Shared translucent navigation, mobile drawers, and structured footers

### Authentication

Admin, Client Portal, Inspector Portal, Analytics, and Academy authentication screens use a shared two-column system:

- Context and product messaging on the left
- Login or registration form on the right
- A focused single-column form experience on mobile
- shadcn Input, Label, Button, Alert, and Card behavior
- Consistent validation, loading, password recovery, and focus treatments

### Authenticated workspaces

The backend UI uses a shared workspace language while preserving the navigation model appropriate to each product:

- Admin Command Center with responsive sidebar navigation
- Client Portal with job tracking, service requests, reports, documents, invoices, and comments
- Inspector Portal with assignment, fieldwork, and submission workflows
- Analytics chat workspace with citations, exports, conversation history, and paired mobile drawers
- Academy LMS with courses, assessments, progress, and certificates

Cards, tables, fields, navigation states, page gutters, and responsive behavior share the same backend tokens. Desktop top menus collapse into shadcn Sheet drawers on mobile.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project and add the required environment variables to `.env` or `.env.local`:

   ```env
   DATABASE_URL=
   ADMIN_PASSWORD=
   SESSION_SECRET=
   ```

3. Create or update the database tables:

   ```bash
   npm run db:push
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000`.

## Project structure

```text
src/app/
  page.tsx                 Group landing page
  inspection/              Inspection marketing site
  analytics/               Marketing, subscriber auth, and chat workspace
  academy/                 Marketing, catalogue, learner auth, and LMS
  contact/                 Contact experience
  portal/                  Client authentication and workspace
  inspector/               Inspector authentication and workspace
  admin/                   Staff authentication and Command Center
  actions/                 Server Actions for platform workflows
  api/                     Documents, reports, chat, and certificate endpoints

src/components/
  auth/                    Shared authentication shell
  backend/                 Shared authenticated mobile navigation
  ui/                      shadcn interface primitives
  admin/                   Admin components and forms
  portal/                  Client Portal components
  inspector/               Inspector workflow components
  analytics/               Analytics chat and authentication UI
  academy/                 Academy authentication and LMS UI

src/db/                    Drizzle client and schema
src/lib/                   Authentication, business logic, reporting, and settings
scripts/                   Migrations, seeds, and maintenance scripts
_legacy/                   Original static site retained for reference
```

## Quality checks

```bash
npm run lint
npm run build
```

The production build performs compilation, type checking, route generation, and page optimization. The repository-wide lint command may also scan generated Netlify or temporary browser artifacts if those directories exist locally; targeted source linting can be run with `npx eslint src`.

## Deployment

- Configure production environment variables on the hosting provider.
- Run the required migrations against the production database.
- The project includes Netlify configuration, but the Next.js application can be deployed to any compatible host.
- Do not commit `.env`, `.env.local`, temporary browser data, generated platform output, or private client documents.

## Current asset note

The Inspection and Analytics divisions use supplied brand logos. JDL Core Academy currently uses a text-based brand treatment because a dedicated Academy logo has not been provided.
