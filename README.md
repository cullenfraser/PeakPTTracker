# PeakPTTracker

## Elevate Expansion Overview

Recent work adds three major surfaces:

- **Consult (wizard)** — existing Elevate flow with refreshed intro hero.
- **Movement Screen** — new camera-driven assessment entry point.
- **Elevation Map** — fused consult + screen dashboard and printable report (incoming).

## Routes

- `/elevate/screen?clientId=` — pattern chooser for movement screens.
- `/elevate/screen/:pattern?clientId=` — per-pattern capture workspace (Squat, Lunge, Hinge, Push, Pull).
- `/elevate/map?clientId=` — Elevation Map hub placeholder awaiting fusion logic.

## Environment Variables

Set the following (see `.env.example`):

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
SUPABASE_BUCKET=movement-clips
```

`SUPABASE_SERVICE_ROLE_KEY` is required by Netlify functions for privileged reads/writes. `GEMINI_API_KEY` powers `/api/gemini/interpret`.

Add both to Netlify site environment variables (Build & Deploy → Environment) so `gemini-interpret`, `screen-analyze`, and `movement-screen-save` can run in production. Ensure `SUPABASE_BUCKET` is set (defaults to `movement-clips`).

## Database Migration

`migrations/20251018_elevation_map_scaffolding.sql` adds tables for movement screens, KPI logs, raw feature storage, clips, elevation map snapshots, and milestones. Apply it via Supabase SQL editor or `psql` before persisting screen results.

## Netlify Functions

- `netlify/functions/gemini-interpret.ts` — stub for Gemini 1.5 Flash analysis. Validates payload and awaits integration with FeaturePayload.
- `netlify/functions/elevation-fuse.ts` — stub for combining consult + screen data into Elevation Map snapshots.
- `netlify/functions/movement-screen-save.ts` — persists screen sessions, KPI logs, and raw features before triggering Elevation Map refresh.
- `netlify/functions/screen-analyze.ts` — multipart upload → ffmpeg 4 fps (≤20 frames) → OpenAI GPT‑4o strict JSON schema (variation + 4 KPIs + briefing) → uploads original clip to Supabase Storage (`movement-clips`) and returns storage path, frame count, duration estimate, and validated analysis JSON.

## Next Steps

- Implement pose capture (MoveNet/BlazePose) and FeaturePayload builder in `src/pages/ElevateMovementScreenPage.tsx`.
- Flesh out Gemini and Elevation Map functions to write/read from Supabase and return real KPI + fusion outputs.
- Render Elevation Map tiles, priority board, plan summary, trajectories, milestones, and PDF export.
