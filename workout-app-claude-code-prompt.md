# Build "Lift & Run": a personal daily-workout PWA on GitHub Pages

You are building a single-user workout app for me. It runs as a static site on GitHub Pages, is installed on my iPhone via "Add to Home Screen", works offline, and syncs its data to a private GitHub Gist. There is no backend and no build step.

Read this whole document before doing anything. Then start in plan mode: restate the design in your own words, list any assumptions you need to make that are not covered here, and ask me at most five questions. Do not relitigate the decisions in the "Decisions already made" section. After I approve the plan, build it phase by phase in the order given at the end, running the tests after each phase.

## 1. Goal and constraints

- One user (me). No accounts, no multi-user features.
- I train every day, 45 minutes per session including warm-up. The app must be built around that budget; a session that is realistically 60 minutes is a bug.
- Seven-day template that covers every major muscle group across the week plus two low-intensity (Zone 2) runs and one high-intensity (Zone 5) run.
- Strength bias: heavy, low-rep work (5x5 style) on the main barbell lifts, not high-rep bodybuilding schemes. Accessories are small and fast.
- Equipment: full commercial gym (barbell, rack, bench, cables, dumbbells, machines). Cardio is running outdoors.
- Units: pounds. Bar = 45 lb. Plates available: 45, 35, 25, 10, 5, 2.5. Microplates (1.25 lb) are a setting, default off.
- The first time I do each main lift, the app runs a calibration protocol to set my working weight. After that it prescribes weight automatically and progresses it. Every prescribed number must be manually overridable.
- Mobile first. One-handed use in a gym with sweaty hands: big tap targets, minimal typing, nothing that requires precision scrolling. Dark theme by default.

## 2. Decisions already made (do not reopen)

- Static site, vanilla HTML/CSS/JS with ES modules, no framework, no bundler, no npm dependencies at runtime. Tests use Node's built-in `node:test` runner. Deployed from the `main` branch root of a public GitHub repo via GitHub Pages.
- PWA: `manifest.webmanifest` with `display: standalone`, a service worker that caches the app shell for offline use, and the iOS meta tags and `apple-touch-icon` so Add to Home Screen behaves like an app.
- Data lives in `localStorage` (single JSON document) and syncs to a secret GitHub Gist using a fine-grained personal access token that I paste into Settings at runtime. The token is never in the repo. JSON export/import is also provided as a fallback.
- Calibration is a ramp to a 5-rep max (5RM), not a 1RM attempt and not AMRAP.
- Schedule is calendar-anchored: Monday is always Day 1. A missed day is just missed; there is no catch-up. I can swap in a different day's workout with one tap if I need to.
- Progression is simple linear progression per lift with a fixed increment, a repeat-on-fail rule, and an automatic 10% deload after three consecutive failures. No RPE-driven autoregulation in v1 (RPE is logged but not used by the algorithm).

## 3. Weekly template

| Day | Session | Main work | Secondary | Accessories (superset, 3 sets) |
|---|---|---|---|---|
| Mon | Lower A | Back squat 5x5 | Romanian deadlift 3x5 | Leg curl 10-12, standing calf raise 12-15 |
| Tue | Upper A | Bench press 5x5 | Barbell row 5x5 | DB lateral raise 10-12, cable triceps pushdown 10-12 |
| Wed | Zone 2 run | 40 min easy | | |
| Thu | Lower B | Deadlift 3x5 | Front squat 3x5 | Hanging leg raise 10-12, ab wheel or cable crunch 10-12 |
| Fri | Upper B | Overhead press 5x5 | Weighted chin-up 5x5 (or lat pulldown 5x5 if bodyweight 5 reps is at or above RPE 9) | Barbell curl 10-12, face pull 12-15 |
| Sat | Zone 5 run | Intervals (see section 6) | | |
| Sun | Zone 2 run | 40 min easy (settings toggle: "make Sunday an easy walk instead") | | |

Muscle coverage check: quads (squat, front squat), hamstrings and glutes (RDL, deadlift), chest (bench), upper back and lats (row, chin-up), shoulders (OHP, lateral raise), triceps (bench, OHP, pushdown), biceps (chin-up, curl), rear delts (face pull), core (leg raise, ab wheel), calves.

### 3b. Exercise menus per slot and rotation

The four main lifts (back squat, bench press, deadlift, overhead press) are fixed and never rotate; linear progression depends on repeating them weekly. Every secondary and accessory slot has a menu of alternatives. The table above lists the defaults. Full menus:

| Slot | Default | Alternatives |
|---|---|---|
| Lower A secondary (3x5) | Romanian deadlift | Good morning, barbell hip thrust |
| Lower A accessory 1 | Leg curl | Nordic curl (bodyweight, reps 5-8) |
| Lower A accessory 2 | Standing calf raise | Seated calf raise |
| Upper A secondary (5x5) | Barbell row | Pendlay row, chest-supported row |
| Upper A accessory 1 | DB lateral raise | Cable lateral raise |
| Upper A accessory 2 | Cable triceps pushdown | Dips (bodyweight; add weight once 12 reps is reached), incline DB press (8-12) |
| Lower B secondary (3x5) | Front squat | Bulgarian split squat (3x5 per leg, dumbbells), leg press |
| Lower B accessory 1 | Hanging leg raise | Ab wheel |
| Lower B accessory 2 | Cable crunch | Walking lunges (10-12 per leg, dumbbells) |
| Upper B secondary (5x5) | Weighted chin-up | Weighted pull-up, lat pulldown |
| Upper B accessory 1 | Barbell curl | Incline DB curl, hammer curl |
| Upper B accessory 2 | Face pull | Rear-delt DB fly |

Rotation rule: during every scheduled deload week (section 5), the Week screen shows a "Rotate for next block?" prompt listing each rotatable slot with its current exercise and a picker for the alternatives. Default is keep. A change takes effect the first week after the deload. A rotated-in secondary lift starts uncalibrated and runs the section 4 protocol on its first appearance; its previous state is retained so rotating back later restores its last working weight (with a warning if it is more than 8 weeks old). Accessories carry their stored weight if they have one, otherwise ask for a starting weight. The user can also swap a slot at any time from the exercise detail screen; the deload-week prompt is just the nudge.

Unilateral work (Bulgarian split squat, walking lunges) counts sets per leg, so the app shows both legs as separate rows and the time budget shows the honest number (Bulgarian split squat 3x5 per leg is roughly 12 min, not 9).

Time budget per lifting day, which the app must display and roughly enforce with its rest timer:

- Warm-up: 5 min (general, then bar and ramp sets for the first lift, which are generated automatically: empty bar x5, then 40%, 60%, 80% of working weight x3, x2, x1).
- Main lift 5x5: 3 min rest between working sets. About 18-20 min including ramp sets.
- Secondary lift: 2 min rest. Its ramp is two sets (50% x5, 75% x3). About 9-12 min.
- Accessory superset: alternate the two exercises, 60-90 s rest after each pair. About 7 min.
- Total: 40-44 min. If the running total (elapsed time in the session) passes 45 min, the app shows the accessories as optional rather than hiding them.

## 4. Calibration protocol (main and secondary lifts only)

Applies to every main and secondary lift, including the alternatives in section 3b. Accessories are not calibrated; see section 5.

Triggered the first time a calibrated lift appears in a session and the lift has no stored 5RM. Replaces that lift's normal work for that session (still inside the 45 min budget: the ramp is the workout).

1. Start weight and ramp jump per lift (store these on the exercise as `calibStart` and `calibJump`):

| Lift | Start | Ramp jump | Progression increment |
|---|---|---|---|
| Back squat | 45 (bar) | +20 | +5 |
| Deadlift | 95 (bar + 25s, correct bar height) | +20 | +10 |
| Bench press | 45 | +10 | +5 |
| Overhead press | 45 | +5 | +5 (+2.5 with microplates) |
| Romanian deadlift | 45 | +15 | +5 |
| Good morning | 45 | +10 | +5 |
| Barbell hip thrust | 95 | +20 | +10 |
| Front squat | 45 | +15 | +5 |
| Bulgarian split squat (DBs, per hand) | 20 | +10 | +5 (next dumbbell) |
| Leg press | 90 | +40 | +10 |
| Barbell row / Pendlay row | 45 | +10 | +5 |
| Chest-supported row | 50 | +10 | +5 |
| Weighted chin-up / pull-up | bodyweight | +5 (belt) | +2.5 |
| Lat pulldown | 70 | +10 | +5 |

2. Each ramp set is 5 reps (per leg for unilateral lifts). Rest 2 min between sets early, 3 min once RPE reaches 7.
3. After the user logs RPE 8 on a set, halve the ramp jump (rounded to available plates or the next dumbbell).
4. After each set the user taps one of: "Easy" (RPE 6 or less), "Moderate" (RPE 7), "Hard" (RPE 8), "Near max" (RPE 9), "Failed" (did not complete 5 reps).
5. Stop conditions: user taps "Near max" (that set's weight is the 5RM), or "Failed" (the previous completed set's weight is the 5RM), or 8 ramp sets have been completed (last completed weight is the 5RM, and the app flags "calibration capped, consider re-running").
6. Outputs stored on the lift: `fiveRM`, `e1RM = fiveRM * 1.1667` (Epley), `workingWeight = roundDownToPlates(fiveRM * 0.875)`, `calibratedAt`.
7. The next occurrence of that lift uses `workingWeight` as the prescription.

Re-calibration can be triggered manually from the exercise's detail screen at any time; it clears `fiveRM` and follows the same flow.

## 5. Progression and deload rules

Implement these as pure functions in `src/engine/` with unit tests. No DOM, no storage access inside the engine.

Main and secondary lifts (5x5 or 3x5):

- A session on a lift is a "success" if every prescribed working set hit the prescribed reps. Otherwise it is a "fail".
- Success: next prescription = current + increment, using the increment column of the table in section 4.
- Fail: repeat the same weight next time, `failStreak += 1`.
- Third consecutive fail: next prescription = `roundDownToPlates(current * 0.9)`, `failStreak = 0`, and the lift's history records a deload event.
- All prescriptions are rounded down to what can be loaded with available plates (the rounding function takes bar weight and the plate set from settings). With the default plate set, rounding is to 5 lb, or 2.5 lb with microplates.
- Manual override: the user can set the next prescription for any lift to any number from the exercise detail screen. This does not reset `failStreak`.

Accessories (double progression):

- Prescription is a weight and a rep range (e.g., 10-12). The first time an accessory appears, the app asks the user to pick a starting weight (with a text hint like "pick a weight you could do for about 12 reps") and stores it.
- If all 3 sets hit the top of the range, add the smallest available step next time (5 lb for cables and barbells, next dumbbell up for DB work; store a per-exercise `step`). If any set fell below the bottom of the range, repeat.

Scheduled deload week:

- Every 7th week from the program start date, or immediately after two different main lifts have triggered an automatic deload within a 14-day window, the next Mon-Sun is a deload week: all calibrated lifts at 80% of working weight for 3x5, accessories at the same weight for 2 sets, Saturday's Zone 5 session becomes a 30-min Zone 2 run. The following week resumes the normal working weights (not incremented). The deload week is also when the rotation prompt from section 3b appears.

## 6. Cardio prescriptions (running outdoors)

Heart rate is optional. Settings has a `maxHR` field; if blank, the app computes `220 - age` from an `age` field, and if both are blank it prescribes by effort only.

Zone 2 (Wed, Sun): 40 min continuous easy run. Guidance shown on screen: conversational pace, nose-breathing possible, 60-70% of max HR if HR is available. Log fields: duration (prefilled 40), distance (optional), average HR (optional), RPE (1-10), notes. Progression: none on duration (it is capped by the 45-min budget). The history screen shows a pace trend (distance/duration) as the fitness signal.

Zone 5 (Sat): 10 min easy warm-up, N intervals of T minutes hard with equal-length easy jog recovery, 5 min cool-down. Hard means 90-100% of max HR or, without HR, an effort you cannot hold for more than about 5 minutes. Starting prescription is step 0. Progression ladder, one step every two weeks provided the user completed all prescribed intervals both weeks (no recovery jog after the final interval; totals include the 10-min warm-up and 5-min cool-down):

| Step | Intervals | Recovery jog | Total |
|---|---|---|---|
| 0 | 4 x 3 min | 3 min | 36 min |
| 1 | 5 x 3 min | 3 min | 42 min |
| 2 | 6 x 3 min | 2 min | 43 min |
| 3 | 4 x 4 min | 3 min | 40 min |
| 4 | 5 x 4 min | 2 min | 43 min |

Step 4 is the cap; after that, progress is measured by distance covered per interval rather than by adding volume. Encode these exact numbers in `cardio.js` and test that every step totals 45 min or less. Log fields: intervals completed, distance (optional), average HR (optional), RPE, notes. If fewer intervals were completed than prescribed, hold the current step.

The app shows a simple interval timer on the Zone 5 screen (work/rest countdown with vibration if `navigator.vibrate` exists, and a large on-screen phase indicator). Keep the screen awake during any workout with the Wake Lock API when available.

## 7. Screens

1. Today: the workout for today's weekday (or a swapped-in day). Each exercise is a card: name, prescribed weight and sets, plate breakdown per side (e.g., "135 = 45 + 45 per side"), one row per set with a tap-to-log control (defaults to prescribed reps; tapping the rep count cycles it down; a long press opens a numeric field for weight and reps). Logging a set starts the rest timer, which is a persistent bar at the bottom with a countdown and a skip button. A completed session gets a "Finish" button that saves it and shows a one-line summary and the resulting next prescriptions.
2. Calibration wizard: the ramp flow from section 4, one set per screen, five big RPE buttons, and a "stop here" option.
3. Week: seven tiles showing the template, which days are done this week, and a "do this workout today instead" action on each tile.
4. History: per-lift chart of working weight and e1RM over time (plain SVG or canvas, no chart library), a list of past sessions, and cardio pace trends.
5. Exercise detail: current prescription, fiveRM/e1RM, full history for that lift, edit prescription, re-calibrate, and swap the slot to one of its alternatives from the section 3b menu. Swapping keeps the slot and the progression rules; a swapped-in calibrated lift with no stored state runs calibration on its first appearance, and one with stored state restores it (see section 3b).
6. Settings: units (lb only in v1, but keep the field), bar weight, plate set, microplates toggle, age/maxHR, Sunday walk toggle, program start date, Gist sync (token, connect, sync now, status, disconnect), export JSON, import JSON, reset all data (with confirmation).

## 8. Data model

One JSON document, versioned for migrations:

```
{
  "schemaVersion": 1,
  "updatedAt": "ISO timestamp",
  "settings": { "units": "lb", "barWeight": 45, "plates": [45,35,25,10,5,2.5], "microplates": false,
                "age": null, "maxHR": null, "sundayWalk": false, "programStart": "YYYY-MM-DD" },
  "exercises": { "<id>": { "id", "name", "type": "main|secondary|accessory", "muscles": [],
                           "increment", "calibStart", "calibJump", "unilateral": false,
                           "repScheme": {"sets":5,"reps":5} | {"sets":3,"repMin":10,"repMax":12},
                           "calibrated": true|false } },
  "slots": { "<slotId>": { "id", "dayIndex", "role": "main|secondary|accessory", "rotatable": true|false,
                           "options": ["<exerciseId>"], "current": "<exerciseId>" } },
  "liftState": { "<exerciseId>": { "fiveRM", "e1RM", "workingWeight", "failStreak", "calibratedAt",
                                   "lastPerformed", "manualOverride": null|number } },
  "template": [ /* 7 day objects, Mon..Sun, each with an ordered list of slotIds, or a cardio spec */ ],
  "rotations": [ { "date", "slotId", "from", "to" } ],
  "cardioState": { "z5Step": 0, "z5WeeksAtStep": 0 },
  "sessions": [ { "id", "date", "dayIndex", "kind": "lift|z2|z5", "startedAt", "finishedAt",
                  "exercises": [ { "exerciseId", "prescribedWeight", "sets": [ {"weight","reps","rpe"} ], "result": "success|fail|calibration" } ],
                  "cardio": { "duration", "distance", "avgHR", "intervalsCompleted", "rpe" }, "notes" } ],
  "deloads": [ { "date", "exerciseId" } ]
}
```

Storage layer: `src/storage.js` exposes `load()`, `save(doc)`, `exportJSON()`, `importJSON(text)`, and runs migrations by `schemaVersion`. Every `save` sets `updatedAt` and marks the document dirty for sync.

## 9. Gist sync

- Settings explains how to create a fine-grained token with only "Gists: read and write" permission, and where to paste it. The token is stored in `localStorage` only. Show a one-line warning that anyone with access to the phone's browser storage could read it, and provide "Disconnect" which deletes it.
- On connect: if no `gistId` is stored, create a secret gist (`POST https://api.github.com/gists`, `public: false`) containing `lift-and-run.json`, and store `gistId`. If the user pastes an existing gist id, use that instead (this is how a second device joins).
- Push: debounced 3 s after any save while online; on `online` and `visibilitychange` (to visible) events, push if dirty.
- Pull: on app open and on "Sync now". Compare `updatedAt`. If remote is newer and local is not dirty, adopt remote. If both changed since the last sync, merge: `sessions` and `deloads` are unioned by `id`/date; for each `liftState` entry take the one with the later `lastPerformed` or `calibratedAt`; `settings` and `cardioState` take the newer document; then push the merged result. Log merges to the sync status panel.
- Errors (401, 404, network) set a visible sync status and never block the workout. The app must be fully usable with sync disconnected.
- Never write the token to the gist, the repo, console logs, or exports.

## 10. Repo layout and deployment

```
index.html            app shell
manifest.webmanifest
sw.js                 service worker, cache-first for shell, network-only for api.github.com, cache name includes a version string bumped on deploy
icons/                192 and 512 png, apple-touch-icon 180
src/
  engine/             pure functions: template.js, calibration.js, progression.js, cardio.js, plates.js
  storage.js
  sync.js
  ui/                 one module per screen plus timer.js
  app.js              router (hash-based) and bootstrap
tests/                node:test files mirroring src/engine
README.md             how to deploy, install on iPhone, create the token, run tests
```

Deploy instructions in the README: push to `main`, enable Pages from `main` / root, open the URL in Safari, Share -> Add to Home Screen. Note that `sw.js` must be at the site root and that the cache version has to change on every deploy or iOS will serve stale files.

## 11. Implementation phases and acceptance criteria

Run `node --test` after every phase. Do not start a phase until the previous one's criteria pass.

Phase 1, engine: `plates.js` (round to loadable weight, plate breakdown per side), `calibration.js` (ramp generator, stop conditions, outputs), `progression.js` (success/fail/deload transitions, accessory double progression, deload-week detection), `cardio.js` (Z5 ladder with exact minute schedules that all total 45 or less), `template.js` (seven-day template and the calendar-anchored "what is today" logic including swaps). Acceptance: tests cover every rule in sections 3-6 with at least one case each, including rounding edge cases (e.g., 0.875 x 135 = 118.1 rounds to 115) and the third-fail deload.

Phase 2, storage: document creation with defaults, migrations, export/import round trip. Acceptance: tests for round trip and for a v0 -> v1 migration stub.

Phase 3, Today screen and calibration wizard with the rest timer and Finish flow. Acceptance: I can do a full Lower A session on my phone including the squat calibration, and the next Lower A shows the correct prescriptions.

Phase 4, Week, History, Exercise detail, Settings (without sync). Acceptance: manual override, re-calibrate, and swap all work and are reflected on Today; the deload-week rotation prompt appears in a simulated deload week (add a dev-only "force deload week" toggle in Settings for this), and rotating RDL to good morning then back restores the RDL working weight.

Phase 5, PWA and deploy: manifest, service worker, icons, wake lock, README. Acceptance: installs to the iPhone home screen, opens standalone, and loads with airplane mode on after one online visit.

Phase 6, Gist sync per section 9. Acceptance: connect on phone, log a session, open the site on a laptop with the same gist id and token, see the session; then make a change on each side while offline and confirm the merge keeps both.

## 12. Things you may choose

CSS approach (plain CSS is fine), hash vs history routing (hash is simpler on Pages), how the interval timer sounds, icon design, and the exact copy on screens. Keep every file small enough to read in one sitting and keep the engine free of UI concerns so I can change the program later without touching the screens.
