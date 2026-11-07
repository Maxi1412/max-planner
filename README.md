# Max Planner

Phone-first calendar PWA for Max and Mum. Published from `main` through GitHub Pages.

## PWA 1.20.10 — waiter shifts 9–22 November 2026

- The two user-provided weekly roster screenshots confirm **11 waiter shifts**, each from **19:00–23:00**:
  - **9–15 Nov:** Tuesday 10, Wednesday 11, Friday 13, Saturday 14 and Sunday 15 (off dates shown: Monday 9 and Thursday 12).
  - **16–22 Nov:** Monday 16, Tuesday 17, Wednesday 18, Friday 20, Saturday 21 and Sunday 22 (off date shown: Thursday 19).
- A staged, one-time, device-local upgrade adds **Work** appointments for those dates using the existing `who: 'work'`, `category: 'work'`, `subcategory: 'shift'` format. These are normal editable appointments and enable the planner's existing automatic **18:00–18:30 get ready** and **18:30–19:00 drive to work** support blocks.
- If an exact shift already exists, or the day has an overlapping work shift, no duplicate is added and the previously entered shift is preserved. A cancelled shift at exactly 19:00–23:00 is also respected; no replacement is forced.
- Empty days in the screenshots are **not** changed into 'OFF' entries, and existing appointments on those dates are never removed. Other dates and personal notes, tasks, recurrence and synced calendars remain untouched.
- The `meta.workRosterNov9To22V50Applied` marker prevents re-adding manually removed shifts after the first successful update. The original device data is protected by the existing pre-upgrade safety snapshot, and a failed save rolls the staging back.
- A matching PWA cache version ensures the update reaches installed devices.

## PWA 1.20.9 — daily Travel Time, Breakfast, and Mum's right-hand lane

- Every day **6 November–31 December 2026** gets two purple 15-minute **Travel Time** appointments: **09:00–09:15** and **09:45–10:00**. Exact matching manual records are retained and recoloured purple, not duplicated.
- The **10:00–10:30** appointment is **Breakfast**, in green, rather than **Make Breakfast**. An existing Breakfast entry takes priority; otherwise the newer Make Breakfast entry is renamed in place, retaining its identifier and all personal details. Redundant records are **preserved in storage but hidden** rather than erased, preventing lost notes or status history. The older virtual default Breakfast is automatically suppressed by the corresponding real entry.
- All appointments assigned to **Mum**, whether created by the user, imported from Google, or recurring, use the same dark-red text and pale red background as her important reminders across day, week and month.
- On the **Day** timeline, Mum's appointments always occupy the **right half** of the appointment area; non-Mum appointments occupy the left half when overlapping her. Ordinary appointments remain full-width when there is no Mum overlap. Multiple appointments on the same side share that side without colliding.
- The grey 11:00–14:00 client hours and normal appointment editing, notes, backup, recurrence and calendar sync remain unchanged.
- A safety snapshot precedes the first 1.20.9 upgrade; the migration is staged and rolled back if saving fails. No new appointments are created after 31 December 2026.

## PWA 1.20.8 — visual client hours (every day)

- Shade the full-width day-view time rows between 11:00 and 14:00 in light grey, with a darker suitable shade in dark mode.
- The grey area is **background only**, not an appointment. Existing hour labels, add buttons, scrolling, overlap layout, and user interactions are unchanged.
- Any appointments booked within those hours keep their original category colours and ordinary placement, including overlapping side-by-side appointments.
- There are no data migrations, edits to appointments, or new scheduled records; it applies to every calendar day, including future dates.
- PWA shell cache is updated so the new styling reaches installed devices.

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
