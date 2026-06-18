# CLAUDE.md — SMPoster (working title)

Personal AI-powered social media scheduler. Single user (Shayne). Upload a CSV of
posts, the app generates matching images (Gemini Nano Banana Pro) and vertical video
(fal.ai → Kling 3.0), Shayne previews/approves, then it publishes and schedules to
Facebook Pages, Instagram, and (phase 2) TikTok. Each "brand" has its own style
knowledge base so generated assets match that brand's look.

---

## NON-NEGOTIABLE BUILD CONSTRAINTS — READ FIRST

- **All project files live at the REPOSITORY ROOT.** Do NOT create a nested project
  subfolder (e.g. `smposter/`) and build inside it. The repo root *is* the app root.
- **Branch:** first branch is renamed `main`. From then on, push directly to `main`.
  **No pull requests.** Railway auto-deploys on push to `main`.
- **Deploy:** GitHub → Railway. Build at root.
- **Server:** Hono + `@hono/node-server`. Static files served BEFORE API routes.
- **Build output:** server compiles to CommonJS via `tsconfig.server.json`. Post-build,
  write a nested `package.json` containing `{"type":"commonjs"}` into the server build
  output dir to override the root `"type":"module"`. (Standard Shayne Railway pattern.)
- **Redis:** use `ioredis` (NOT `@upstash/redis`).
- **Cron:** use `node-cron` for scheduled jobs.
- **Timezone:** ALWAYS `America/New_York` (EST/EDT). Store timestamps as `timestamptz`
  (UTC) in Postgres; convert to/from Eastern at the edges (CSV parse + UI display).

---

## STACK

- Hono (`@hono/node-server`) + TypeScript
- PostgreSQL (Railway) via `pg` Pool
- Redis (Railway) via `ioredis` — job queue (BullMQ) + rate-limit counters
- Railway Storage Bucket (S3-compatible) via `@aws-sdk/client-s3`
- React + Vite frontend
- Single-user auth (reuse Shayne's `auth.*` module or a simple session gate)
- Gemini API — Nano Banana Pro (image generation)
- fal.ai — video generation, default Kling 3.0, routable to Seedance/Veo by quality tier
- Meta Graph API — Facebook Pages + Instagram publishing
- TikTok Content Posting API — phase 2

---

## ENVIRONMENT VARIABLES

```
# Provided by Shayne / Railway
DATABASE_URL=
REDIS_URL=
BUCKET_ENDPOINT_URL=
BUCKET_REGION=
BUCKET_NAME=
BUCKET_ACCESS_KEY_ID=
BUCKET_SECRET_ACCESS_KEY=

# Generation
GEMINI_API_KEY=
FAL_KEY=

# Meta (app: SMposter, under verified ReelMotion business portfolio)
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=        # OAuth callback to connect Pages/IG accounts

# Auth / misc
SESSION_SECRET=
TZ=America/New_York

# Phase 2
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

---

## DATABASE SCHEMA (lean — 7 tables)

**1. brands** — Shayne's "pages." A brand/vibe unit with its own style + KB.
- `id` (pk), `name`, `style_instructions` (text — the hand-written style guide), `created_at`

**2. channels** — connected posting destinations under a brand.
- `id` (pk), `brand_id` (fk→brands), `platform` (enum: facebook|instagram|tiktok),
  `external_id` (FB page id / IG user id / TikTok id), `access_token` (encrypted),
  `token_expires_at`, `is_active`, `created_at`

**3. knowledge_base_assets** — style samples uploaded per brand, used as generation references.
- `id` (pk), `brand_id` (fk→brands), `kind` (image|video), `storage_key`,
  `notes`, `created_at`

**4. posts** — one CSV row / one Quick Post = one post idea.
- `id` (pk), `brand_id` (fk→brands), `copy` (text — main caption),
  `scheduled_at` (timestamptz),
  `status` (draft|generating|pending_approval|approved|scheduled|posted|failed|cancelled),
  `quality_tier` (cheap|standard|premium — drives video model routing),
  `source` (csv|manual), `created_at`, `updated_at`

**5. post_assets** — generated (or uploaded) media for a post. One post may spawn several
  (image + reel + story via the CSV checkboxes).
- `id` (pk), `post_id` (fk→posts), `asset_type` (image|reel|story),
  `generation_status` (pending|generating|ready|failed|approved|rejected),
  `storage_key`, `prompt_used` (text), `provider` (gemini|fal-kling|fal-seedance|fal-veo|manual),
  `cost` (numeric), `created_at`

**6. post_targets** — cross-post fan-out + per-platform override + result + latest metrics.
- `id` (pk), `post_id` (fk→posts), `channel_id` (fk→channels),
  `caption_override` (text, nullable — blank = use post.copy),
  `status` (pending|posted|failed), `external_post_id`, `posted_at`, `error_message`,
  `likes`, `comments`, `shares`, `views`, `reach`, `last_synced_at`
  *(Historical analytics trends are out of scope for V1 — only latest snapshot is stored
  here. Split into an `analytics` history table later if trend charts are wanted.)*

**7. settings** — singleton config row.
- `id` (pk), `monthly_budget_cap` (numeric), `current_spend` (derived/cached),
  `timezone` (default 'America/New_York')

*Asset→channel surface mapping (which asset goes where) is handled in the publish worker,
not modeled as a table: e.g. image→FB feed + IG feed; reel→IG Reels + TikTok; story→IG/FB
story. Keep it in code for V1.*

---

## CSV FORMAT

One row = one post idea. Downloadable template provided in-app.

| column | notes |
|---|---|
| brand | which brand/page (must match an existing brand name) |
| copy | the main caption |
| scheduled_date | YYYY-MM-DD (Eastern) |
| scheduled_time | HH:MM (Eastern, 24h) |
| image | checkbox: TRUE/FALSE → generate a static image |
| reel | checkbox: TRUE/FALSE → generate a vertical video Reel |
| story | checkbox: TRUE/FALSE → generate a vertical video Story |
| facebook | TRUE/FALSE → cross-post to this brand's FB channel |
| instagram | TRUE/FALSE → cross-post to this brand's IG channel |
| tiktok | TRUE/FALSE → cross-post to this brand's TikTok channel (phase 2) |
| quality_tier | cheap \| standard \| premium (video model routing; default standard) |
| caption_fb | optional per-platform override |
| caption_ig | optional per-platform override |
| caption_tiktok | optional per-platform override |

Cross-post-by-default with per-platform overrides: blank caption_* = use `copy`.

---

## GENERATION

- **Images:** Gemini Nano Banana Pro. Prompt = post `copy` + brand `style_instructions`
  + brand KB image samples as reference. Cheap; near-instant.
- **Video:** fal.ai. Default **Kling 3.0** (~$0.10/sec). Quality tier routing:
  - `cheap` → Seedance 2.0 Fast (~$0.09/sec, 1080p, no native audio)
  - `standard` → Kling 3.0
  - `premium` → Veo 3.1 (hero posts; most expensive)
  - Vertical 9:16, short-form. Long-running job → poll until done.
- All generation runs through the **BullMQ queue on Redis** (async; video takes ~1min+).
  Approval dashboard fills in progressively as jobs complete.
- Generated files saved to the Railway bucket; `storage_key` recorded on `post_assets`.

---

## PUBLISHING (the App Review gate)

Meta app **SMposter** lives under the verified ReelMotion business portfolio
(business verification already done). Use cases added: "Manage everything on your Page"
+ "Manage messaging & content on Instagram". Permissions in "Ready for testing":
`pages_manage_posts`, `pages_show_list`, `pages_read_engagement`, `instagram_basic`,
`instagram_content_publish`. App Review required before going live.

- **Instagram publish = 3-step container flow:**
  1. `POST /{ig-user-id}/media` → returns `container_id`
  2. `GET /{container_id}?fields=status_code` → poll until `FINISHED` (Reels need extra
     polling — video processing isn't instant)
  3. `POST /{ig-user-id}/media_publish` → returns published media id
- **IG rate cap:** ~25 API-published posts per account per 24h. Enforce a counter in Redis.
- **Facebook Pages:** publish via Pages API with `pages_manage_posts`.
- Per-platform result + `external_post_id` recorded on `post_targets`.

---

## UI (clean left sidebar)

- **Calendar** (home) — month view, posts color-coded by platform; click a day to see/edit
  what's scheduled.
- **Upload** — CSV drop + downloadable template + parse/validate → posts land as drafts →
  generation kicks off → approval grid.
- **Approval grid** — cards: copy, generated image/video preview, scheduled time, target
  platforms. Approve / reject / regenerate per card. Select-all / approve-all for batches.
  Show per-batch cost estimate before committing generation.
- **Quick Post** — manual: upload own asset, write caption, pick brand + platforms + time.
  No generation step.
- **Knowledge Base** — per brand: upload style samples, edit style_instructions.
- **Archive** — searchable past posts with latest engagement numbers; "repost" any past post.
- **Settings** — budget cap + current spend, connected channels (OAuth connect Pages/IG).

Editable/reschedulable after approval, before it goes live.

---

## SCHEDULING & SYNC

- `node-cron` scheduler fires approved posts at `scheduled_at` (Eastern). On fire → enqueue
  publish job → publish to each `post_target` → record status/external_post_id.
- Daily analytics sync (early-morning Eastern cron): pull engagement for posted targets,
  update latest metrics on `post_targets`. No real-time polling in V1.

---

## BUDGET GUARDRAILS

- `settings.monthly_budget_cap` set by Shayne.
- Per-batch cost estimate shown on the approval/generation screen before committing.
- Running `current_spend` = sum of `post_assets.cost` for the period.
- Optional hard cap: refuse to enqueue generation that would exceed the cap (with override).

---

## BUILD MILESTONES (mockup approval BEFORE code each step)

- **M0 — Scaffold + deploy skeleton.** Root layout, Hono server (static-before-API),
  Postgres + Redis + bucket connections, hello-world deploys green on Railway via `main`.
- **M1 — Schema + brands/channels.** Migrations, brand CRUD, OAuth connect FB Page + IG.
- **M2 — Knowledge base.** Upload style samples to bucket, edit style_instructions per brand.
- **M3 — CSV upload + parser + template + draft posts.**
- **M4 — Generation engine + approval grid.** Gemini images, fal video via queue, previews,
  approve/reject/regenerate, cost estimate.
- **M5 — Meta publishing + Quick Post.** FB Pages + IG container flow. ← unlocks App Review:
  build → connect own accounts → test publish in Graph API Explorer → screencast → submit.
- **M6 — Scheduler (node-cron, Eastern).** Fire approved posts at scheduled time.
- **M7 — Analytics daily sync + archive + repost.**
- **M8 — Budget guardrails finalize.**
- **M9 — TikTok (after Meta approved).**

> M5 testing/submission can run in parallel with M6–M8 (the ~2–4 week App Review wait is the
> long pole — keep building while it's pending).

---

## WORKING STYLE

- Discussion first. Approve visual mockups before any code is written.
- Deliver complete, ready-to-paste files — not partial snippets.
- One milestone at a time.
- This file (CLAUDE.md) is the source of truth — keep it updated as decisions change.
