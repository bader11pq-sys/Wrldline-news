# Office regression checklist

- Office floor: open the app, select an employee, use 2D and 3D, return to 2D, and confirm fallback without WebGL.
- Chat: send a quick order, a private message, and an @mention; inspect the intended employee and task progression.
- Approvals: preview evidence, select a cover, approve a demo draft, reject another with feedback, and review a batch. Demo never appears in the public reader.
- Verify and stage: single-source order blocks; staging requires explicit simulated approval and writes an audit event.
- Office management: task filters, activity, morning picks, evening report, analytics, budget setting and connection status.
- V2: Arabic briefing room, dedicated team directory, role-specific suggestions, clear stale/unconfigured statuses, Thai-free RTL overflow check, and keyboard/touch navigation.
- Site integration: `/ai-office/` keeps private UI separate; `/ai-office/api/public/articles` exposes only approved and published live data. Existing site remains usable if the Worker is missing or offline.
- Models: settings display actual inferred configuration and selectable providers/tiers; demo doesn't charge or call a provider. Production connection probe requires CEO auth and never returns keys or provider output.
