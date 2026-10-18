# Max Planner

Phone-first calendar PWA for Max and Mum. Published from `main` through GitHub Pages.

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
