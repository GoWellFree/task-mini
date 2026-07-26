# task-mini — agent regламент

Two review-only product agents exist for this project (`.claude/agents/`): **ux-ui-designer** and **marketing-growth-strategist**. Both review and report; neither deploys, touches production secrets, or publishes anything without a separate, explicit instruction to do exactly that.

## When to invoke them yourself (event-triggered — not on a calendar)

These can't be cron-scheduled since they're triggered by what changed, not by wall-clock time. Follow them as standing practice whenever you (Claude) are the one making the change:

- **After any frontend change** (anything under `frontend/src/`): invoke `ux-ui-designer` to review what changed before considering the change done.
- **After changes to onboarding, `/start`, invites, notifications, or any user-facing copy** (bot replies/notifications in `backend/src/lib/bot.ts`, onboarding screens, invite-link landing behavior): invoke `marketing-growth-strategist`.
- **2–4 hours before a release**: invoke `ux-ui-designer` for a pre-release check.
- **24–48 hours before a release**: invoke `marketing-growth-strategist` for a pre-release check.
- Releases aren't visible on any calendar available here — if the user mentions one is planned, proactively schedule these two checks relative to the stated release time rather than waiting to be asked.

## Calendar-triggered runs (handled by scheduled tasks, not this file)

Set up via the scheduled-tasks system (persists across sessions, runs while the app is open):

- Weekdays 21:30 (Moscow time) — `ux-ui-designer`, only if frontend changed that day.
- Wednesdays 19:00 (Moscow time) — `ux-ui-designer`, full UX audit regardless of what changed.
- First Saturday of the month, 12:00 (Moscow time) — `ux-ui-designer`, design-system audit.
- Mondays 11:00 (Moscow time) — `marketing-growth-strategist`: full growth audit on the first Monday of the month, the regular weekly growth review otherwise.
- Thursdays 16:00 (Moscow time) — `marketing-growth-strategist`, content and marketing hypotheses.

These assume the app's local timezone is Moscow time (that's what every trigger above was specified in) — if that's wrong, the schedules will fire at the wrong wall-clock time and should be corrected.
