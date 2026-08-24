# JDL Core — Group Site

A static marketing site for the JDL Core group: independent oil & gas inspection services today, plus two divisions in development (an industry-data chat subscription and an education academy).

## Stack

Plain HTML/CSS/JS — no framework, no build step. One shared stylesheet and two shared scripts across all pages.

## Getting started

Open `index.html` directly in a browser, or serve the folder locally so relative asset paths behave the same as production:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Structure

```
index.html          Hub page — intro to the group + links to all three divisions
inspection.html      Inspection Services (flagship, live) — services, process, quote form
analytics.html        Analytics (coming soon) — subscription chat concept, waitlist
academy.html          Academy (coming soon) — tutorials/practice tests concept, waitlist
styles.css            Shared design system (navy/gold palette, Space Grotesk + IBM Plex Sans)
script.js             Nav drawer, scroll reveals, stat counters, demo form handlers
chat-widget.js         Sample support chat widget (see below) — injects itself into every page
assets/
  logo-inspection.png   Inspection Services logo (background removed, cropped)
  logo-analytics.png    Analytics logo (background removed, cropped)
```

## Chat widget

`chat-widget.js` is a scripted, menu-driven support chat sample — quick-reply chips, a small rule-based responder, and a two-route human handoff (call placeholder + a "leave your details" form). No AI, no backend. Pattern modeled on the `scripted-responder` / handoff flow in the `abyshub` project, reimplemented in vanilla JS since this site has no build step.

## Known placeholders / open items

Before this goes live, replace or wire up:

- **Contact details** — phone/email in every footer are placeholders.
- **Forms** — the quote form (`inspection.html`), the waitlist forms (`analytics.html`, `academy.html`), and the chat handoff form are all client-side only; nothing is actually sent or stored yet.
- **Mockups** — the dashboard/chat/course panels on each hero are hand-built UI mockups illustrating planned features, not real screenshots or real data.
- **Chat widget** — currently a scripted demo (see above); swap in a real backend/AI if it should go live.
- **Academy logo** — no dedicated logo exists yet, so `academy.html` reuses the Inspection Services mark in its header.
- **Analytics & Academy content** — both divisions are described from a one-line brief; expand once real product details exist.

Each page also carries an HTML comment at the top of `<body>` listing what's placeholder on that specific page.
