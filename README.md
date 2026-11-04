# Max Planner

Phone-first calendar PWA for Max and Mum. Published from `main` through GitHub Pages.

## PWA 1.20.7 — daily appointments from 6 Nov through 31 Dec 2026

- Copy the four highlighted appointments on Friday 6 November to every day until 31 December 2026 inclusive: **08:15–09:00 Wake up, shower, coffee** (green), **09:15–09:45 Walk the dogs** (Shared / family, blue), **10:00–10:30 Make Breakfast** (green), and **14:00–14:45 Lunch/Food** (blue).
- The two purple Travel Time appointments are not copied: they are outside the intended four appointment entries.
- On first opening version 1.20.7, a safety snapshot is captured before any local migration. Dates before 6 November and dates in 2027 are untouched.
- Exact matching appointments already entered by hand are preserved rather than duplicated.
- Older, untouched auto-generated 08:30 morning entries are adjusted to 08:15 in place, preserving their IDs. If the exact 08:15 appointment already exists, the old 08:30 generated entry is retained in storage but hidden to prevent displaying duplicates. Manually changed or completed legacy records are preserved.
- All other appointments, personal notes, work shifts, to-dos, finance links, calendar integrations and backup files remain unchanged. A saved migration flag prevents repeating the changes.

## PWA 1.20.6 — automatic unfinished to-do rollover

- At 23:00 **device-local time**, unfinished to-dos from today move into tomorrow's to-do list. Completed to-dos stay on their original dates.
- When the app has been closed or suspended, overdue unfinished tasks catch up to the current active to-do day when the app is next opened or focused. A closed browser cannot execute JavaScript at 23:00.
- On first use after this update, rollover starts with that day's tasks; historical unfinished tasks from before activation are not silently swept into today.
- Task IDs, custom details, existing destination tasks, appointments, work shifts, recurring items, notes, and finance links are preserved. Manual next-day and previous-day moves are unchanged.
- Before the first upgraded initialization and each actual automatic transfer, a verified local safety snapshot is made. A failed save keeps the original to-dos.
- Tests cover cutoff time, catch-up, idempotence, completed history, activation, and storage failures.

## PWA 1.20.0

- The existing planner, recurring-item, and settings storage keys are unchanged.
- Before initialization, the app verifies a raw device-local safety snapshot in IndexedDB, with a verified local-storage fallback. If both fail, initialization stops and offers a recovery download instead of resetting data.
- Saves use a complete write-ahead journal. Interrupted writes are recovered before initialization. Storage failures stay visible and offer an export of the current in-memory planner.
- Confirmed embedded appointments, Samsung imports, and existing legacy snapshots are retained. Legacy migrations are add-only. The repository still contains historical embedded personal data; removing that data was deliberately deferred to preserve the supplied records.
- Calendar downloads bypass caches. Failed or partially downloaded calendars leave existing entries untouched. Deleted/missing remote events are retained locally with an explanatory label. Editing a linked event keeps its identity, local edits, notes, completion state, and finance link. Previous edits with a recoverable encoded event ID are relinked.
- Google sign-in is hosted inside this project; it no longer depends on FormFill Lite or Android Chrome intent URLs. Both Mum's account and another account with access to Mum's shared calendar are supported. Other accounts' primary calendars are not imported as Mum's events. Access stays read-only.
- Browser Google access tokens expire. The app preserves imported events and explicitly indicates when reconnection is required; this static PWA does not provide unattended server-side refresh.
- Drive uploads use files tagged for the current device. Legacy and other-device backups are never selected as upload destinations. Restore lists available backups and snapshots local state before replacement.
- The service worker caches only this app's shell and deletes only older `max-planner-pwa-` caches. Google APIs, authorization pages, and other applications are excluded from shell caching.
- Month navigation handles month ends and leap years. The day view expands to show early/late appointments when present.

## Verification

Run from the repository directory:

```sh
node --test tests/regressions.test.cjs
```

The regression checks run the actual application source with isolated browser/storage/API fixtures, plus pure calendar and service-worker checks. They never access real Google accounts. Live OAuth consent and calendar access still require the authorized account to sign in.

## Recovery

The pre-update source is preserved on `backup/pre-data-preserving-audit-fixes-2026-10-18` at commit `37d9fe9208442fddbeb06eba93063efea1fbf17f`.

The existing **Download safety snapshot** menu action exports the verified snapshot. Explicit file, safety, and Drive restores create another snapshot first and pause automatic Drive uploads until reconnected. No restore or deletion is performed automatically on a user's device.
