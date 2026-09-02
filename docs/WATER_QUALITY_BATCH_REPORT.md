# Batch report — cycle context + Water Quality screen (template)

Frontend repo only. No backend change of any kind was made; the backend was
used read-mostly, as a live contract check (see §5).

---

## 1. Phase 0 — what existed, and what did not

**Active farm: already there, unchanged.** `FarmSelectionService`
(`src/app/core/services/farm-selection.ts`) holds the pick as a signal backed by
`localStorage`, and `authInterceptor` (`src/app/core/interceptors/auth-interceptor.ts:44`)
attaches it as `X-Farm-Id` on **every** call, REST and GraphQL alike. `/api/auth/me`
reports back the farm the backend actually applied. Nothing here needed touching, and
both new screens ride it: each reloads on a farm switch by reading
`selectedFarmId()` inside an `effect`.

**Cycle context: did not exist.** Confirmed, not assumed:

- `app.routes.ts` had seven routes — login, signup, change-password, dashboard, farms,
  approvals, members. No production route.
- `app-shell.ts` carried `navUnits` and `navCycles` as **route-less placeholders**,
  rendered inert with a "coming soon" title.
- The Dashboard issued `productionUnits` + `cycles` as a **read-only** query for its
  tiles. Nothing selected anything.
- `createProductionUnit` appeared in `src/` exactly once — as a fixture string inside
  `graphql.spec.ts`. `createCycle` appeared **nowhere**.

So there was no cycle for a log screen to be about. This batch builds the minimum that
fixes that, and nothing more.

**The backend shapes the screens depend on** (from `spring-backend`'s
`schema.graphqls`, then confirmed live — §5):

| Operation | Shape | Permission |
|---|---|---|
| `productionUnits` | `unitId(ID!) code type sizeM3 waterSource status` | `view_dashboard` |
| `cycles(status)` | `cycleId(ID!) unit{…} speciesName stockingDate fingerlingsCount survivalRateEstimate expectedHarvestDate actualHarvestDate status` | `view_dashboard` |
| `species` | `speciesId(ID!) name growthMonthsAvg avgHarvestWeightKg` | `view_dashboard` |
| `createProductionUnit(input)` | `code! type! sizeM3 waterSource` | `manage_units` |
| `createCycle(input)` | `unitId(ID!) speciesId(ID!) stockingDate! fingerlingsCount! survivalRateEstimate` | `edit_cycle` |
| `waterQualityLogs(unitId, cycleId)` | `logId logDate ph temperature oxygen ammonia notes recordedByName unit{…}` | `view_dashboard` |
| `logWaterQuality(input)` | `unitId(Int!) logDate ph temperature oxygen ammonia notes` | `log_water_quality` |

Two asymmetries drove the design and are worth restating, because either one looks like
a bug if you meet it cold:

1. **`ID!` serialises as a STRING.** `unitId`, `cycleId` and `speciesId` come back
   quoted even though the columns are integers. `logWaterQuality.unitId` and
   `waterQualityLogs.cycleId`, meanwhile, are `Int`. Every id therefore gets converted
   at the boundary, and the tests assert the converted values.
2. **Water quality READS by cycle and WRITES by unit.** `water_quality_logs` has no
   `cycle_id` column at all — the water belongs to the tank, not to the fish in it this
   season. The query accepts `cycleId` as a convenience and resolves it to the unit
   server-side. So the screen reads with the cycle it holds and writes with that
   cycle's unit.

---

## 2. What was built

### A. Minimal cycle context

| File | What it is |
|---|---|
| `src/app/core/services/cycle-selection.ts` | `CycleSelectionService` — the selected cycle as a signal, persisted, modelled on `FarmSelectionService` |
| `src/app/core/services/production.ts` | `ProductionService` — `loadContext()` (units + cycles + species in one round trip), `listCycles()`, `createUnit()`, `createCycle()` |
| `src/app/production/production.{ts,html,scss,i18n.ts}` | The Production screen |
| `src/app/core/models/species.ts` | `Species` |
| `src/app/core/models/production-unit.ts` | extended with `UNIT_TYPES` and `CreateProductionUnitInput` |
| `src/app/core/models/cycle.ts` | extended with `CreateCycleInput` |

The screen lists the active farm's units and cycles, creates a unit (gated
`manage_units`), starts a cycle on a unit (gated `edit_cycle`), and **selects the active
cycle** into `CycleSelectionService`. Creating a cycle selects it immediately — the next
thing anyone does is record against it.

**The selection is a request, never the truth.** A stored id is resolved against the
cycles the backend just returned *for the active farm*; anything not in that list is
treated as nothing selected and dropped (`Production.syncSelection`). That is what keeps
a farm switch, a deleted cycle, or last week's browser value from pointing a log screen
at a cycle this farm does not have — and the stale id is never sent anywhere, because
the cycles query takes no argument.

**Deliberately absent: any cycle lifecycle.** No edit, no close, no harvest. The backend
has no mutation for any of them — `createCycle` sets `ACTIVE` and nothing in the API ever
moves a cycle out of it. A "close cycle" button with nothing behind it would be worse
than its absence. (Backend gap, recorded in `spring-backend/docs/REPO_AUDIT.md` §5.)

### B. Water Quality screen — the template

| File | What it is |
|---|---|
| `src/app/core/services/water-quality.ts` | `WaterQualityService` — `logsForCycle()`, `log()` |
| `src/app/water-quality/water-quality.{ts,html,scss,i18n.ts}` | The screen |
| `src/app/core/models/water-quality.ts` | `WaterQualityLog`, `LogWaterQualityInput` |

Form: pH, temperature, oxygen, ammonia, note — submitted to `logWaterQuality`. List:
the readings for the selected cycle, with a dash where a measurement is missing rather
than a zero. D-4 error handling throughout (`ApiError` → in-context message), `{sw,en}`.

**Out-of-range readings are NOT rejected.** DO 0.8, pH 4.2, ammonia 0.9 are the readings
worth having — they are why anyone measures — and a form that refused them would
suppress the emergency it exists to report. The backend takes the same position and
refuses only what cannot be a measurement at all; that answer arrives as
`VALIDATION_ERROR` and is shown in the backend's own words, because they name the actual
limit ("pH lazima iwe kati ya 0 na 14."). Two tests pin this, including one that asserts
`oxygen: 0` is sent as a measurement and not swallowed as a blank.

**The one client-side rule** is "at least one measurement". It is not a judgement about
the water: a reading with all four fields blank records nothing, so there is nothing to
save. Flagged here because it is the only check in this batch that the batch spec did
not ask for.

### The four shapes the next batch should copy

1. The cycle comes from the **selection**, never a route param and never a hardcoded id.
2. The stored id is **resolved against the backend** before it is used.
3. **Reading and writing are different permissions** — `view_dashboard` shows the table,
   the write code puts the form on the page at all.
4. The form **does not second-guess the domain values**; only the backend does.

### C. Wiring

- `app.routes.ts` — `/production` and `/water-quality`, both on `authGuard`.
  **Not `permissionGuard`:** unlike Farms/Approvals/Members these are read screens with
  gated controls inside them. Reading is `view_dashboard`, which every role holds;
  gating the route on a write permission would shut a VIEWER out of data they are
  entitled to see.
- `app-shell.ts` — `navUnits`/`navCycles` placeholders replaced by one real
  `navProduction` entry at `/production`; `navWater` now routes to `/water-quality`.
  Units and cycles share one entry because they are one screen.
- `auth.ts` — `logout()` and `storeSession()` now clear the cycle selection alongside
  the farm selection. A cycle belongs to a farm, and a farm to a session; otherwise the
  next user on the browser opens a log screen already pointed at a cycle they have never
  seen.

---

## 3. The `log_water_quality` permission addition

The audit flagged it as the one backend permission the frontend's `PERMISSION` model did
not declare. Added to `src/app/core/models/permissions.ts`:

```ts
LOG_WATER_QUALITY: 'log_water_quality',
```

It gates the log form via `*appHasPermission`, exactly as the other codes gate their
controls. A VIEWER holds `view_dashboard` and no `log_water_quality`: they get the
readings table and **no form at all** — asserted in both directions.

`VIEW_FINANCE` remains declared and gating nothing. That is correct for now and not an
oversight on this batch: it mirrors the backend, where `view_finance` is seeded and
consumed by no check because there is no finance module to consume it.

---

## 4. Tests

**`ng test` — full suite, one command, green.**

```
Test Files  15 passed (15)
     Tests  145 passed (145)
  Duration  ~24s
```

Baseline before this batch was 12 files / 108 tests (the figure recorded in
`vitest.config.ts`). This batch adds **3 files and 37 tests**, and changes none of the
existing ones — the `maxForks: 4` fix stayed in place and the whole suite still runs in
a single command.

| Spec | Tests | Covers |
|---|---|---|
| `core/services/cycle-selection.spec.ts` | 6 | pick recorded in signal + storage; survives a reload; clear; a corrupt stored value is dropped rather than sent; logout clears it |
| `production/production.spec.ts` | 15 | one-round-trip context load; select → service + storage, as a **number** from a string id; selection survives a reload and resolves to the whole cycle; a stale id from another farm is dropped; per-control gating for `manage_units` vs `edit_cycle` vs neither; create unit sends blank optionals as `null`; CONFLICT lands on the code field; blank code never leaves the browser; create cycle sends the stocking event and selects the new cycle; FORBIDDEN on the whole context; English render |
| `water-quality/water-quality.spec.ts` | 16 | no cycle → **no request at all** and a "pick a cycle" panel; cycle named with its unit; reads by `cycleId: 9`; stale id → panel, no readings query; missing measurements render as a dash; empty state; form absent for VIEWER / present with the permission; submit writes `unitId: 27` (the cycle's **unit**) and re-reads; a killing-water reading is sent unaltered; `oxygen: 0` is sent; a wholly blank reading is refused locally; FORBIDDEN in the UI language; VALIDATION_ERROR in the backend's words; load failure with retry; English render |

---

## 5. Live contract verification

The frontend's exact operations were run against the **running backend**
(`localhost:8082`, 2026-09-02), signed in as the dev OWNER (`0700100001`) and dev VIEWER
(`0700100003`):

| # | Operation | Result |
|---|---|---|
| 1 | `ProductionContext` (units + cycles + species) | 200, data as modelled — `unitId "30"`, `cycleId "6"`, `speciesId "1"` all **strings**, confirming the `ID!` conversion |
| 2 | `WaterQualityLogs($cycleId: Int)` | 200, 8 readings for cycle 6, nullable measurements arriving as `null` |
| 3 | `LogWaterQuality` with pH 15 | `VALIDATION_ERROR` — *"pH lazima iwe kati ya 0 na 14."* |
| 4 | `CreateProductionUnit` with `type: "SPACESHIP"` | `VALIDATION_ERROR` — *"Aina ya kitengo si sahihi. Chagua: TANK, POND, BWAWA."* |
| 5 | `CreateCycle` with an unknown `speciesId` | `VALIDATION_ERROR` — *"Aina ya samaki haijulikani"* |
| 6 | `LogWaterQuality` as VIEWER | `FORBIDDEN` — *"Huna ruhusa ya 'log_water_quality'."* |

The three mutations were sent with **deliberately invalid input**, so each proves the
variable and input shape parsed correctly while writing no row. The dev database was
not modified by this verification.

Every error message and code in the test fixtures is now the backend's verbatim text.

### What was NOT verified

- **No browser run.** The screens were not opened in a browser and no screenshot was
  taken; correctness rests on the 145 unit tests plus the contract checks above.
- **No successful write was executed end to end.** Creating a unit, starting a cycle and
  saving a reading are covered by tests against mocked HTTP and by the contract checks,
  but no real row was written through the UI.
- **Cross-farm (D-1) behaviour was not exercised live** — the stale-selection path is
  covered by unit tests only.

---

## 6. Commits

Branch `feat/water-quality-screen`, off `main` (`74b1a1f`).

| Hash | Subject |
|---|---|
| _(see git log; recorded at push time)_ | feat(production): pick the cycle every log screen needs |
| | feat(water-quality): record the reading that explains a sudden kill |
| | test(water-quality): pin the gate, the unit it writes to, and the killing reading |

---

## Out of scope, untouched

Feed and Tasks screens (next batch, on this pattern), any backend change, cycle
lifecycle / harvest UI, Reminders / Finance / Reports.
