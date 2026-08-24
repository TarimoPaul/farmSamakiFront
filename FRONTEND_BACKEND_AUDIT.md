# Frontend ↔ Backend Audit + Backend Module Acceptance

**Date:** 2026-08-23
**Frontend:** `D:\KAMPUNI PROJECT\samakiFarmFront` — Angular 21, branch `main` @ `359ff92`
**Backend:** `D:\KAMPUNI PROJECT\spring-backend` — Spring Boot, running on `http://localhost:8082`, PostgreSQL 17.5 `samakiFarm`, Flyway V1→V8 all applied
**Scope:** read-only audit. Nothing was built, fixed or modified. Test data created for Part B was removed (see *Housekeeping*).

> **Correction to the brief:** the frontend is **not** auth-only. `Dashboard` issues a GraphQL query for `productionUnits` + `cycles`. That changes three rows of the gap table.

---

# PART A — Frontend ↔ Backend gap map

## A1. Backend surface (what actually exists in code)

### REST

Auth endpoints below `/api/auth/**` are `permitAll` in `SecurityConfig` except `change-password`, which is `authenticated()` (matcher ordered first, deliberately). Everything else falls through `anyRequest().authenticated()` and then a method-level `@PreAuthorize`.

| # | Method + path | Permission checked | Source |
|---|---|---|---|
| 1 | `POST /api/auth/register` | *public* (IP rate-limited) | `AuthController:44` |
| 2 | `POST /api/auth/login` | *public* (IP rate-limited) | `AuthController:52` |
| 3 | `POST /api/auth/forgot-password` | *public* | `AuthController:61` |
| 4 | `POST /api/auth/reset-password` | *public* | `AuthController:68` |
| 5 | `POST /api/auth/change-password` | valid token only (allowed through the `must_change_password` gate) | `AuthController:80` |
| 6 | `POST /api/users` | `manage_users` | `UserController:38` |
| 7 | `GET /api/users?farmId=` | `manage_users` | `UserController:44` |
| 8 | `GET /api/users/pending` | `approve_users` | `UserController:52` |
| 9 | `POST /api/users/{userId}/approve` | `approve_users` | `UserController:59` |
| 10 | `POST /api/users/{userId}/disable` | `manage_users` | `UserController:65` |
| 11 | `POST /api/users/{userId}/enable` | `manage_users` | `UserController:71` |
| 12 | `POST /api/users/{userId}/memberships` | `manage_users` | `UserController:79` |
| 13 | `PUT /api/users/{userId}/memberships/{farmId}/role` | `manage_users` | `UserController:87` |
| 14 | `DELETE /api/users/{userId}/memberships/{farmId}` | `manage_users` | `UserController:95` |
| 15 | `DELETE /api/users/{userId}` | `manage_users` | `UserController:104` |
| 16 | `GET /api/roles` | `manage_users` | `RoleController:32` |
| 17 | `POST /api/roles` | `manage_users` | `RoleController:38` |
| 18 | `PUT /api/roles/{roleId}/permissions` | `manage_users` | `RoleController:45` |
| 19 | `GET /api/roles/permissions` (paged) | `manage_users` | `RoleController:57` |
| 20 | `POST /api/farms` | `manage_farms` | `FarmController:23` |
| 21 | `GET /api/farms` | `manage_farms` | `FarmController:29` |

`/actuator/health` is `permitAll` in `SecurityConfig` but **no actuator dependency exists in `pom.xml`** — see defect **D-5**.

### GraphQL (single endpoint `POST /graphql`, token required at the filter chain)

Verified by live introspection against the running server, not just by reading the schema file.

```
$ curl -s -X POST http://localhost:8082/graphql -H "Authorization: Bearer <owner>" \
       -d '{"query":"{ __schema { queryType { fields { name } } } }"}'
{"data":{"__schema":{"queryType":{"fields":[
  {"name":"productionUnits"},{"name":"cycles"},{"name":"feedPurchases"},
  {"name":"feedingLogs"},{"name":"feedStockMovements"},{"name":"feedStockBalance"}]}}}}

$ ... '{"query":"{ __schema { mutationType { fields { name } } } }"}'
{"data":{"__schema":{"mutationType":{"fields":[
  {"name":"createProductionUnit"},{"name":"createCycle"},
  {"name":"recordFeedPurchase"},{"name":"logFeeding"}]}}}}
```

| # | Field | Args | Permission (`PermissionChecker.require`) | Source |
|---|---|---|---|---|
| 22 | `Query.productionUnits` | — | `view_dashboard` | `ProductionUnitService:31` |
| 23 | `Query.cycles` | `status: String` | `view_dashboard` | `CycleService:47` |
| 24 | `Query.feedPurchases` | — | `view_dashboard` | `FeedService:63` |
| 25 | `Query.feedingLogs` | `cycleId: Int` | `view_dashboard` (+ `requireSameFarm` when `cycleId` given) | `FeedService:69` |
| 26 | `Query.feedStockMovements` | — | `view_dashboard` | `FeedService:79` |
| 27 | `Query.feedStockBalance` | — | `view_dashboard` | `FeedService:86` |
| 28 | `Mutation.createProductionUnit` | `CreateProductionUnitInput!` | `manage_units` | `ProductionUnitService:38` |
| 29 | `Mutation.createCycle` | `CreateCycleInput!` | `edit_cycle` | `CycleService:57` |
| 30 | `Mutation.recordFeedPurchase` | `RecordFeedPurchaseInput!` | `manage_feed_stock` | `FeedService:92` |
| 31 | `Mutation.logFeeding` | `LogFeedingInput!` | `log_feeding` | `FeedService:112` |

Field resolvers: `Cycle.speciesName`, `FeedingLog.recordedByName`, `FeedStockMovement.direction`.

**There is no `species` query and no `dailyTasks` query.** Probed live:

```
$ ... '{"query":"query { species { speciesId name growthMonthsAvg } }"}'
{"errors":[{"message":"Validation error (FieldUndefined@[species]) : Field 'species' in type 'Query' is undefined", ...}]}

$ ... '{"query":"query { dailyTasks { taskId } }"}'
{"errors":[{"message":"Validation error (FieldUndefined@[dailyTasks]) : Field 'dailyTasks' in type 'Query' is undefined", ...}]}
```

### Permission catalogue (seeded)

`view_dashboard`, `edit_cycle`, `manage_units`, `mark_task_done`, `manage_farms`, `log_feeding`, `manage_feed_stock`, `view_finance`, `manage_users`, `approve_users`.

`mark_task_done` and `view_finance` are seeded and assigned to roles but **no endpoint anywhere checks them** — they gate nothing today.

## A2. Frontend consumption (what the app actually calls)

| Call | Where | Reachable from UI? |
|---|---|---|
| `POST /api/auth/login` | `core/services/auth.ts:69` | Yes — `/login` |
| `POST /api/auth/register` | `core/services/auth.ts:110` | Yes — `/signup` |
| `POST /api/auth/change-password` | `core/services/auth.ts:141` | Yes — `/change-password` (also the forced-gate exit) |
| `POST /api/auth/forgot-password` | `core/services/auth.ts:174` | **No** — no screen, no route. `login.ts:onForgotPassword()` is an empty TODO |
| `POST /api/auth/reset-password` | `core/services/auth.ts:179` | **No** — no screen, no route |
| `POST /graphql` — `query { productionUnits {…} cycles {…} }` | `dashboard/dashboard.ts:14-40` | Yes — `/dashboard` on init |

Routes: `/login`, `/signup`, `/change-password`, `/dashboard`. That is the whole app.
The dashboard renders unit counts/volume/type/status bars and an active-cycle list. Its "week strip" is client-side `Date` arithmetic — it displays **no task data** and calls nothing.

**No other HTTP call exists in the frontend.** All 15 non-auth REST endpoints and 8 of the 10 GraphQL fields are unconsumed.

## A3. Gap table

| Capability | Backend? | Frontend UI? | Verdict |
|---|---|---|---|
| **Auth** ||||
| Login (phone/email + password) | ✅ | ✅ `/login` | **WIRED** |
| Self-registration (PENDING_APPROVAL, no token) | ✅ | ✅ `/signup` | **WIRED** |
| Change password / forced-change gate | ✅ | ✅ `/change-password` + guard + interceptor | **WIRED** |
| Forgot password (request OTP by SMS) | ✅ | ❌ service method only, no screen | **NO_UI** |
| Reset password with OTP | ✅ | ❌ service method only, no screen | **NO_UI** |
| **User management** ||||
| List pending registrations | ✅ | ❌ | **NO_UI** |
| Approve a registration | ✅ | ❌ | **NO_UI** |
| Create a user directly (admin) | ✅ | ❌ | **NO_UI** |
| List users of a farm | ✅ | ❌ | **NO_UI** |
| Disable / enable an account | ✅ | ❌ | **NO_UI** |
| Assign farm membership + role | ✅ | ❌ | **NO_UI** |
| Change a member's role | ✅ | ❌ | **NO_UI** |
| Remove a membership | ✅ | ❌ | **NO_UI** |
| Delete a user | ✅ | ❌ | **NO_UI** |
| **RBAC** ||||
| List roles | ✅ | ❌ | **NO_UI** |
| Create a role | ✅ | ❌ | **NO_UI** |
| Replace a role's permissions | ✅ | ❌ | **NO_UI** |
| Browse permission catalogue (paged) | ✅ | ❌ | **NO_UI** |
| **Farms** ||||
| Create a farm | ✅ | ❌ | **NO_UI** |
| List farms | ✅ | ❌ | **NO_UI** |
| **Production units** ||||
| List units of my farm | ✅ | ✅ dashboard read | **WIRED** |
| Create a unit | ✅ | ❌ | **NO_UI** |
| Edit / retire / set MAINTENANCE | ❌ no mutation | ❌ | *neither* |
| **Cycles** ||||
| List cycles of my farm | ✅ | ✅ dashboard read (unfiltered) | **WIRED** |
| Filter cycles by status | ✅ `cycles(status:)` | ❌ FE never passes the arg | **NO_UI** |
| Create a cycle | ✅ | ❌ | **NO_UI** |
| Harvest / close a cycle (`actual_harvest_date`, status→HARVESTED) | ❌ no mutation | ❌ | *neither* |
| **Species** ||||
| Read species list (needed to populate `speciesId` on create-cycle) | ❌ **no API at all** | ❌ | **UI_NO_BACKEND** |
| Create/update species | ❌ (expected) | ❌ | *out of scope* |
| **Feed** ||||
| Record a feed purchase | ✅ | ❌ | **NO_UI** |
| Log a feeding | ✅ | ❌ | **NO_UI** |
| List purchases | ✅ | ❌ | **NO_UI** |
| List feeding logs (all / per cycle) | ✅ | ❌ | **NO_UI** |
| Stock ledger (IN/OUT movements) | ✅ | ❌ | **NO_UI** |
| Current stock balance (kg) | ✅ | ❌ | **NO_UI** |
| Correct/reverse a purchase or feeding | ❌ no mutation | ❌ | *neither* |
| **Daily tasks** ||||
| Auto-generate tasks on cycle creation | ✅ (internal) | n/a | *internal* |
| Read today's tasks | ❌ | ❌ (dashboard week strip is decorative) | **UI_NO_BACKEND** |
| Mark a task done (`mark_task_done` seeded, unused) | ❌ | ❌ | **UI_NO_BACKEND** |
| Assign a task to a role | ❌ (`assigned_role_id` never written) | ❌ | **UI_NO_BACKEND** |
| **Session/identity** ||||
| "Who am I / my permissions" | ❌ login returns role *name* only, not permission codes | ❌ FE can only branch on role string | **UI_NO_BACKEND** |
| Switch active farm (multi-membership) | ❌ `JwtAuthFilter:264` TODO — first membership only | ❌ | **UI_NO_BACKEND** |
| **Absent modules — nothing to accept** ||||
| Water quality | ❌ table only, no entity | ❌ | *absent* |
| Task completions | ❌ table only, no entity | ❌ | *absent* |
| Reminders + scheduler | ❌ table only, no entity, no `@Scheduled` anywhere | ❌ | *absent* |
| Finance (costs / sales / customers) | ❌ tables only, no entities | ❌ | *absent* |
| Assets | ❌ table only, no entity | ❌ | *absent* |

## A4. Frontend build backlog (the `NO_UI` rows, ordered)

Ordered so each item is usable when it ships. Items 1–2 unblock everything else; nothing in the production modules is demonstrable until a farm + units + a cycle can be created from the UI.

### 1. Admin / onboarding (unblocks all other modules)
1. **Farms** — list + create (`GET/POST /api/farms`, `manage_farms`).
2. **Pending approvals** — list + approve (`GET /api/users/pending`, `POST /api/users/{id}/approve`, `approve_users`).
3. **Members** — list farm users, assign membership + role, change role, remove membership, disable/enable, delete (`/api/users/**`, `manage_users`).
4. **Create user directly** (`POST /api/users`).

### 2. RBAC admin
5. **Roles** — list + create (`GET/POST /api/roles`).
6. **Role permissions editor** — permission catalogue + replace a role's set (`GET /api/roles/permissions`, `PUT /api/roles/{id}/permissions`).

### 3. Production
7. **Production units** — list (already read on the dashboard, needs its own screen) + create (`createProductionUnit`, `manage_units`).
8. **Cycles list with status filter** — pass `cycles(status:)`; today the dashboard filters ACTIVE client-side.
9. **Create cycle** — `createCycle` (`edit_cycle`). ⚠️ **Blocked** on a species read API (D-3) — the form needs a `speciesId` picker.

### 4. Feed (whole module is backend-ready, zero UI)
10. **Feed stock overview** — `feedStockBalance` + `feedStockMovements` ledger.
11. **Record purchase** — `recordFeedPurchase` (`manage_feed_stock`).
12. **Log feeding** — `logFeeding` (`log_feeding`); the WORKER-facing screen.
13. **Feeding history** — `feedingLogs` all-farm and per-cycle.

### 5. Auth tail
14. **Forgot password** — screen + route for `POST /api/auth/forgot-password` (service method already written).
15. **Reset password with OTP** — screen + route for `POST /api/auth/reset-password` (service method already written).

### Cross-cutting, must be fixed before 7–13 are trustworthy
16. **GraphQL error handling in the client** — `GraphqlService` collapses `errors[]` into `new Error(message)` and drops `extensions.errorCode`; resolver errors arrive as HTTP 200 so the auth interceptor never sees them. FORBIDDEN and session failures from GraphQL are silently swallowed today (**D-4**).

---

# PART B — Backend module acceptance

## Test harness

All requests are real HTTP against the running instance on `:8082`. Three principals were used:

| Principal | Identity | Farm | Role |
|---|---|---|---|
| ROOT | `0000000000` / seeded root | *null* | `is_root` bypass |
| **A** | `0799000111` "Audit Tester" | 14 (created for this audit) | OWNER |
| **B** | `0799000222` "Audit Worker" | 14 | WORKER |

A and B were created through the real flow: `POST /api/auth/register` → `POST /api/users/{id}/approve` (ROOT) → `POST /api/users/{id}/memberships` (ROOT). Both logged in normally:

```
$ curl -s -X POST http://localhost:8082/api/auth/login -d '{"phone":"0799000111","password":"Audit@1234"}'
{"success":true,"data":{"token":"eyJ…","user":{"id":"bfd691d6-…","name":"Audit Tester",
 "phone":"0799000111","status":"ACTIVE","farmId":14,"role":"OWNER"},"mustChangePassword":false}}
```

**Auth / RBAC itself was not re-tested** — treated as already verified per the brief. Where an auth behaviour appears below it is incidental evidence for a module check.

---

## B1 — Cycles · **PARTIAL** (all three stated criteria PASS; one blocking defect found in the same mutation)

### `expected_harvest_date` is computed from `species.growth_months_avg` — **PASS**

Seeded species (`psql`): `Sato` id 1 `growth_months_avg = 7.0`; `Kambale` id 2 `growth_months_avg = 6.0`.

```
$ mutation { createCycle(input: {unitId: 22, speciesId: 1, stockingDate: "2026-08-23",
                                 fingerlingsCount: 500, survivalRateEstimate: 0.9}) {…} }

{"data":{"createCycle":{"cycleId":"2","speciesName":"Sato","stockingDate":"2026-08-23",
 "expectedHarvestDate":"2027-03-23","fingerlingsCount":500,"survivalRateEstimate":0.9,
 "status":"ACTIVE","unit":{"unitId":"22","code":"AUD-T1","type":"TANK","status":"ACTIVE"}}}}
```

Math: `2026-08-23 + 7 months = 2027-03-23` ✔ (`CycleService:71`, `stockingDate.plusMonths(growthMonthsAvg.longValue())`).

Second confirmation with a different species — Kambale, 6.0 months:

```
{"data":{"createCycle":{"cycleId":"3","speciesName":"Kambale","expectedHarvestDate":"2027-02-23",…}}}
```

`2026-08-23 + 6 months = 2027-02-23` ✔

Side effect also confirmed: the unit flips `IDLE → ACTIVE` (`CycleService:81`).

⚠️ `growth_months_avg` is `NUMERIC(4,1)` but the service calls `.longValue()`, which **truncates**. A species with 6.5 months would compute as 6. No seeded species has a fractional value today — latent (**D-7**).

### Cycle creation auto-generates `daily_tasks` — **PASS**

```sql
samakiFarm=# select task_id, cycle_id, task_type, scheduled_time, frequency, assigned_role_id
             from daily_tasks where cycle_id = 2;
 task_id | cycle_id |     task_type     | scheduled_time | frequency | assigned_role_id
---------+----------+-------------------+----------------+-----------+------------------
       4 |        2 | Kulisha - Asubuhi | 07:00:00       | DAILY     |
       5 |        2 | Kulisha - Jioni   | 17:00:00       | DAILY     |
       6 |        2 | Kuangalia Maji    | 08:00:00       | DAILY     |
(3 rows)
```

3 rows, all linked to cycle 2, written inside the same `@Transactional` as the cycle (`CycleService:88-105`). `assigned_role_id` is left NULL — the column is never written by any code path.

### `cycles(status:)` filtering — **PASS**

```
query { cycles { cycleId speciesName status } }              → [{"cycleId":"2",…,"status":"ACTIVE"}]
query { cycles(status: "ACTIVE") { … } }                     → [{"cycleId":"2","speciesName":"Sato","status":"ACTIVE"}]
query { cycles(status: "HARVESTED") { … } }                  → []
```

Filter is a derived query on `unit.farm.farmId + status` (`CycleRepository`). Note the status string is passed through unvalidated — a typo returns `[]` rather than an error (minor).

### `Cycle.speciesName` resolves — **PASS**

Returned `"Sato"` and `"Kambale"` above, via `@SchemaMapping(typeName="Cycle", field="speciesName")` (`CycleResolver:35`).

### ❌ DEFECT D-1 — `createCycle` does not scope `unitId` to the caller's farm

`CycleService.create` loads the unit by id and never calls `permissionChecker.requireSameFarm(...)` — unlike `FeedService.requireCycleInCallersFarm`, which does. Principal **A** is OWNER of farm **14**; unit **1** belongs to farm **2**:

```
$ # token = A (farmId 14)
$ mutation { createCycle(input: {unitId: 1, speciesId: 2, stockingDate: "2026-08-23",
                                 fingerlingsCount: 10}) { cycleId speciesName unit { unitId code } } }

{"data":{"createCycle":{"cycleId":"3","speciesName":"Kambale","expectedHarvestDate":"2027-02-23",
 "unit":{"unitId":"1","code":"T1"}}}}
```

A cycle was written **inside another tenant's tank**. Confirmed side effects in that farm: unit 1 flipped `IDLE → ACTIVE`, its `updated_by` was stamped with A's user id, and 3 `daily_tasks` rows were generated for farm 2. Any account with `edit_cycle` on any farm can do this against any `unit_id` in the database. (All of it was reverted — see *Housekeeping*.)

---

## B2 — Feed · **PASS**

### Inventory (code vs. the "complete" claim) — matches

| Layer | Artefacts |
|---|---|
| Entities | `FeedPurchase`, `FeedingLog`, `FeedStockMovement` (all extend `BaseEntity`, all `@SQLRestriction("is_deleted = false")`) |
| Repositories | `FeedPurchaseRepository`, `FeedingLogRepository`, `FeedStockMovementRepository` (incl. `sumBalanceByFarmId` with `COALESCE(…, 0)`) |
| Resolver | `FeedResolver` — 4 queries, 2 mutations, 2 field resolvers |
| Service | `FeedService` — permission checks, farm scoping, positive-value validation, automatic ledger writes |
| Migration | `V8__feed_module.sql` — audit/soft-delete columns, 3 indexes, 2 permissions, role wiring |

Queries: `feedPurchases`, `feedingLogs(cycleId)`, `feedStockMovements`, `feedStockBalance`. Mutations: `recordFeedPurchase`, `logFeeding`. **No update, delete or reversal operation exists** — a mistyped purchase or feeding cannot be corrected through the API.

### Happy path — **PASS**

```
$ # A (OWNER, manage_feed_stock)
$ mutation { recordFeedPurchase(input: {purchaseDate:"2026-08-23", feedType:"Pellet 3mm",
                                        quantityKg:100, unitCost:2500, supplier:"AUDIT Supplier"}) {…} }
{"data":{"recordFeedPurchase":{"purchaseId":"2","purchaseDate":"2026-08-23","feedType":"Pellet 3mm",
 "quantityKg":100.0,"unitCost":2500.0,"totalCost":250000.0,"supplier":"AUDIT Supplier"}}}
```
`totalCost` 250 000 is the DB `GENERATED ALWAYS` column read back after insert (`@Generated(event=INSERT)`) — the client never sends it. ✔

```
$ query { feedStockBalance }        → {"data":{"feedStockBalance":100.0}}

$ mutation { logFeeding(input: {cycleId: 2, feedType:"Pellet 3mm", quantityKg: 12.5}) {…} }
{"data":{"logFeeding":{"logId":"3","logDate":"2026-08-23","feedType":"Pellet 3mm","quantityKg":12.5,
 "recordedByName":"Audit Tester","cycle":{"cycleId":"2","speciesName":"Sato"}}}}
```
`logDate` defaulted to today because the input omitted it ✔; `recordedByName` resolved from `recorded_by_user_id → users` ✔.

Full read surface after one purchase + two feedings (12.5 kg by A, 1.5 kg by B):

```
{"data":{
  "feedPurchases":[{"purchaseId":"2",…,"totalCost":250000.0,"supplier":"AUDIT Supplier"}],
  "feedingLogs":[{"logId":"3","quantityKg":12.5,"recordedByName":"Audit Tester"}],
  "feedStockMovements":[
    {"movementId":"5","direction":"OUT","quantityKg":12.5,"referencePurchaseId":null,"referenceFeedingLogId":3,…},
    {"movementId":"4","direction":"IN","quantityKg":100.0,"referencePurchaseId":2,"referenceFeedingLogId":null,…}],
  "feedStockBalance":87.5}}
```

The ledger is system-written only, correctly referenced back to its source row, and the balance is exact: `100 − 12.5 = 87.5` (later `− 1.5 = 86.0` after B's feeding) ✔

### Permission gating — **PASS**

```
$ # B (WORKER: view_dashboard, mark_task_done, log_feeding — NO manage_feed_stock)
$ mutation { recordFeedPurchase(…) }
{"errors":[{"message":"Huna ruhusa ya 'manage_feed_stock'.","path":["recordFeedPurchase"],
 "extensions":{"errorCode":"FORBIDDEN","classification":"FORBIDDEN"}}],"data":null}

$ # same principal, an operation WORKER does hold
$ mutation { logFeeding(input: {cycleId: 2, quantityKg: 1.5}) {…} }
{"data":{"logFeeding":{"logId":"4","quantityKg":1.5,"recordedByName":"Audit Worker"}}}
```

`errorCode: FORBIDDEN` is present in `extensions` and matches what REST sends — the single-branch contract holds ✔

Cross-farm scoping (this is the check `createCycle` is missing):

```
$ # A (farm 14) logging against cycle 3, whose unit belongs to farm 2
{"errors":[{"message":"Huruhusiwi kufikia shamba hili.","path":["logFeeding"],
 "extensions":{"errorCode":"FORBIDDEN","classification":"FORBIDDEN"}}],"data":null}
```
✔ `FeedService.requireCycleInCallersFarm` works.

### Negative / invalid input — **PASS** (with a contract nit)

```
quantityKg: -5   (purchase) → classification BAD_REQUEST · "Thamani ya 'Kiasi cha chakula' lazima iwe zaidi ya sifuri."
unitCost:  -100  (purchase) → classification BAD_REQUEST · "Thamani ya 'Bei ya kilo' lazima iwe zaidi ya sifuri."
quantityKg: -3   (feeding)  → classification BAD_REQUEST · "Thamani ya 'Kiasi cha chakula' lazima iwe zaidi ya sifuri."
```

BAD_REQUEST confirmed as the brief expected. **But none of these carry an `extensions.errorCode`** — `GraphQlExceptionResolver` passes `null` for `IllegalArgumentException`. The frontend's stated rule ("branch on errorCode, never on the message") has nothing to branch on for validation failures (**D-6**).

### FK targets post un-merge — **PASS**

```sql
      table_name      |       column_name        | references_table | references_column
----------------------+--------------------------+------------------+-------------------
 feed_purchases       | farm_id                  | farms            | farm_id
 feed_purchases       | updated_by               | users            | user_id
 feed_purchases       | deleted_by               | users            | user_id
 feed_stock_movements | farm_id                  | farms            | farm_id
 feed_stock_movements | reference_purchase_id    | feed_purchases   | purchase_id
 feed_stock_movements | reference_feeding_log_id | feeding_logs     | log_id
 feed_stock_movements | updated_by / deleted_by  | users            | user_id
 feeding_logs         | cycle_id                 | cycles           | cycle_id
 feeding_logs         | recorded_by_user_id      | users            | user_id
 feeding_logs         | updated_by / deleted_by  | users            | user_id
```

Every person-reference points at `users` (the person), every farm-scoped column at `farms`. Nothing points at `farm_users`. ✔ Matches `V5`'s intent and the `FeedingLog.recordedBy → User` mapping.

---

## B3 — Production Units · **PARTIAL** (constraints enforced; one is not reportable to a client)

### Create + list — **PASS**

```
$ mutation { createProductionUnit(input: {code:"AUD-T1", type:"TANK", sizeM3:12.5, waterSource:"Kisima"}) {…} }
{"data":{"createProductionUnit":{"unitId":"22","code":"AUD-T1","type":"TANK",
 "sizeM3":12.5,"waterSource":"Kisima","status":"IDLE"}}}

$ query { productionUnits { unitId code type sizeM3 waterSource status } }
{"data":{"productionUnits":[{"unitId":"22","code":"AUD-T1","type":"TANK","sizeM3":12.5,
 "waterSource":"Kisima","status":"IDLE"}]}}
```
Farm scoping is correct — only farm 14's unit is returned, not the other 20 in the database ✔

### `type` CHECK — **PASS (enforced), message leaks internals**

```
$ mutation { createProductionUnit(input: {code:"AUD-X9", type:"LAKE"}) {…} }
{"errors":[{"message":"No enum constant com.samaki.farm.productionunit.entity.ProductionUnit.UnitType.LAKE",
 "extensions":{"classification":"BAD_REQUEST"}}],"data":null}
```

Rejected before the DB by `UnitType.valueOf(...)`, so the CHECK never fires — the DB constraint is still in place as a backstop:

```sql
 production_units_type_check | CHECK ((type)::text = ANY (ARRAY['TANK','POND','BWAWA']))
```

The message exposes a fully-qualified Java class name to the client (**D-8**).

### ❌ DEFECT D-2 — `(farm_id, code)` uniqueness is enforced but surfaces as `INTERNAL_ERROR`

The constraint exists:

```sql
 production_units_farm_id_code_key | UNIQUE (farm_id, code)
```

and it does reject the duplicate — but the client gets nothing usable:

```
$ mutation { createProductionUnit(input: {code:"AUD-T1", type:"POND", sizeM3:5}) {…} }
{"errors":[{"message":"INTERNAL_ERROR for e3b0ac8e-5354-d836-39f5-ffbd1b135ed2",
 "path":["createProductionUnit"],"extensions":{"classification":"INTERNAL_ERROR"}}],"data":null}
```

`GlobalExceptionHandler` maps `DataIntegrityViolationException → 409 CONFLICT` for REST, but `GraphQlExceptionResolver` has no branch for it, so it falls through to `return null` and Spring GraphQL masks the message. "Code T1 already exists on this farm" is unreportable to the UI — the create-unit form (backlog item 7) cannot show a field error.

---

## B4 — Farms · **PASS**

Farm creation independent of signup, confirmed:

```
$ curl -s -X POST http://localhost:8082/api/farms -H "Authorization: Bearer <root>" \
       -d '{"name":"AUDIT Shamba la Ukaguzi","location":"Audit-Land"}'
{"success":true,"message":"Shamba limeundwa.",
 "data":{"farmId":14,"name":"AUDIT Shamba la Ukaguzi","location":"Audit-Land","ownerName":null}}
```

`ownerName: null` is by design (`FarmService:36` — ownership comes from membership, not creation). The farm was then usable as a real tenant for all of B1–B3.

```
$ curl -s http://localhost:8082/api/farms -H "Authorization: Bearer <root>"
{"success":true,"data":[{"farmId":1,"name":"Test Farm E2E","location":"Dar","ownerName":"Test Owner"}, …]}
```
Returns **all** farms, not just the caller's — deliberate (`FarmService:44`), since `manage_farms` is the "place people into farms" capability.

`manage_farms` gating — **PASS**:

```
$ # B (WORKER)
GET  /api/farms → HTTP 403 {"success":false,"message":"Huna ruhusa ya kufikia rasilimali hii.","errorCode":"FORBIDDEN"}
POST /api/farms → HTTP 403 {"success":false,"message":"Huna ruhusa ya kufikia rasilimali hii.","errorCode":"FORBIDDEN"}
$ # no token
GET  /api/farms → HTTP 401 {"success":false,"message":"Hujaingia (login) - token haipo au si sahihi.","errorCode":"UNAUTHENTICATED"}
POST /graphql   → HTTP 401 {"success":false,…,"errorCode":"UNAUTHENTICATED"}
```

Only create + list exist; no rename, no relocate, no delete (documented as out of scope in `FarmService`).

---

## B5 — Species · **DEFECT** (rows exist and are readable *in the database*; there is no read path in the API)

Seeded rows are present and correct:

```sql
 species_id |  name   | growth_months_avg | avg_harvest_weight_kg
------------+---------+-------------------+-----------------------
          1 | Sato    |               7.0 |                  0.35
          2 | Kambale |               6.0 |                  1.00
```

They are reachable through JPA (`SpeciesRepository.findById` inside `CycleService`) and readable in one derived form — `Cycle.speciesName`.

**No create/update API — expected.** But there is also **no read API**, which is not:

- no `Query.species` (verified live above — `FieldUndefined`)
- no `SpeciesController` (`grep` over all `@RestController`/`@Controller` classes returns only Auth, User, Role, Farm, Cycle, ProductionUnit, Feed)
- `SpeciesRepository` declares no methods beyond `JpaRepository`

`CreateCycleInput` requires `speciesId: ID!`. **A create-cycle screen cannot be built** — the frontend has no way to list species, and hard-coding ids 1 and 2 would break as soon as a species is added. This is the single hard blocker in the frontend backlog (item 9).

---

## B6 — Daily Tasks · **PARTIAL** (write-only side effect; no module around it)

| Aspect | Status | Evidence |
|---|---|---|
| Auto-created by cycle creation | ✅ works | 3 rows per cycle, verified in B1 |
| Read API | ❌ none | `Query.dailyTasks` → `FieldUndefined`; no controller; `DailyTaskRepository` declares **zero** methods |
| Edit API | ❌ none | no mutation, no endpoint |
| Assign API | ❌ none | `assigned_role_id` is never written by any code path — always NULL |
| Complete a task | ❌ none | `mark_task_done` permission is seeded and assigned to OWNER/FARM_MANAGER/WORKER but **checked nowhere** |
| Scheduler | ❌ none | `grep -rn "@Scheduled\|EnableScheduling\|TaskScheduler" src/main/java` → *(none)* |
| `task_completions` | table only | in `V1`, no `@Entity`, no repository |
| `reminders` | table only | in `V1`, no `@Entity`, no repository |

**Real status:** daily tasks are a write-only side effect of `createCycle`. Rows accumulate in a table nothing can read, edit, assign, complete, or act on. The frontend's dashboard "week strip" that looks like a task view is pure client-side date arithmetic with no data behind it.

Entity coverage across the whole schema, for reference — 13 of 22 tables have entities. Without: `assets`, `water_quality_logs`, `task_completions`, `reminders`, `costs`, `customers`, `sales` (+ `flyway_schema_history`, the `role_permissions` join, and `species`/`daily_tasks` which have entities but no API).

---

# Defects found

| # | Severity | Module | Defect |
|---|---|---|---|
| **D-1** | **High (security / multi-tenant)** | Cycles | `CycleService.create` never validates that `input.unitId` belongs to the caller's farm. Any principal with `edit_cycle` can create a cycle in **any** farm's unit, flipping that unit to ACTIVE, stamping its `updated_by`, and generating `daily_tasks` there. Reproduced live: OWNER of farm 14 wrote cycle 3 into farm 2's tank T1. `FeedService` does this check correctly (`requireCycleInCallersFarm`); `CycleService` does not. |
| **D-2** | Medium | Production Units | `DataIntegrityViolationException` has no branch in `GraphQlExceptionResolver`, so a duplicate `(farm_id, code)` returns `INTERNAL_ERROR for <uuid>` with the message masked and no `errorCode`. REST maps the same exception to 409 CONFLICT. The UI cannot report "this code is already used". |
| **D-3** | Medium (blocker) | Species | No read API of any kind — no GraphQL query, no REST controller. `createCycle` requires `speciesId`, so a create-cycle UI is impossible to build. Blocks backlog item 9. |
| **D-4** | Medium | Frontend | `GraphqlService.query` collapses `errors[]` into `new Error(messages.join('; '))`, discarding `extensions.errorCode`. GraphQL errors arrive as HTTP 200, so `authInterceptor` never inspects them either. A resolver-level `FORBIDDEN` or a session failure inside a GraphQL call is invisible to the app's error handling — the dashboard just shows "Failed to load data." |
| **D-5** | Low | Config | `SecurityConfig` permits `/actuator/health`, but `spring-boot-starter-actuator` is not in `pom.xml`. `GET /actuator/health` → **HTTP 500** `{"success":false,"message":"Hitilafu ya ndani ya mfumo. Jaribu tena baadaye."}`. Any deployment health probe pointed at it will report the service permanently unhealthy. |
| **D-6** | Low | GraphQL contract | Business-validation errors (`IllegalArgumentException`) get `classification: BAD_REQUEST` but **no** `extensions.errorCode` (resolver passes `null`). The documented client rule is to branch on `errorCode`, never on the Swahili message — for validation there is nothing to branch on. |
| **D-7** | Low (latent) | Cycles | `species.growth_months_avg` is `NUMERIC(4,1)` but `CycleService:71` uses `.longValue()`, truncating fractional months (6.5 → 6). Harmless with today's seed data (7.0, 6.0); wrong the moment a fractional species is added. |
| **D-8** | Low | Production Units | An invalid `type` returns `No enum constant com.samaki.farm.productionunit.entity.ProductionUnit.UnitType.LAKE` — an internal class name in a client-facing message. |
| **D-9** | Low | ROOT + farm scoping | ROOT has `farmId = null`. Farm-scoped **queries** return empty/zero silently (`cycles` → `[]`, `feedStockBalance` → `0.0`, `feedPurchases` → `[]`) rather than saying "ROOT has no farm context"; farm-scoped **mutations** fail opaquely — `createProductionUnit` as ROOT → `INTERNAL_ERROR for <uuid>`. ROOT can administer users, roles and farms but cannot use, or meaningfully inspect, any production module. |
| **D-10** | Low (hygiene) | Backend repo | An empty directory literally named `src/main/java/com/samaki/farm/{config,domain,repository,rest,graphql,security,dto}` exists — leftover from an unexpanded shell brace. |
| **D-11** | Low (prod risk) | Config | `spring.graphql.graphiql.enabled: true` and `schema.printer.enabled: true` are on with no profile guard; the inline comment says to disable for production but nothing enforces it. |
| **D-12** | Informational | Cycles | `cycles(status:)` passes the string straight to the query — an unknown status silently returns `[]` instead of rejecting the argument. |

**Not defects, confirmed working:** feed ledger arithmetic and referencing; `total_cost` generated-column read-back; all permission gates that exist (`manage_feed_stock`, `log_feeding`, `manage_units`, `edit_cycle`, `manage_farms`, `approve_users`, `manage_users`); farm scoping on every *read* path; `FeedService` cross-farm write scoping; feed FK targets after the V4/V5 un-merge; filter-chain 401/403 envelopes; `expected_harvest_date` computation; daily-task auto-generation.

---

# Decisions needed

1. **D-1 fix shape.** Add `permissionChecker.requireSameFarm(unit.getFarm().getFarmId())` in `CycleService.create` — or scope the lookup itself (`findByUnitIdAndFarm_FarmId`) so a foreign unit reads as "not found" and leaks nothing. Same question for `speciesId` (global catalogue, so probably fine as-is). **Blocking for any multi-farm deployment.**

2. **Species read API — shape and owner.** `Query.species` in GraphQL (consistent with the other production modules) or `GET /api/species` in REST? Whichever, it needs `speciesId`, `name`, `growthMonthsAvg`, `avgHarvestWeightKg`, and a permission (`view_dashboard`, or token-only as a reference list). **Blocks backlog item 9.**

3. **GraphQL error contract.** Should `GraphQlExceptionResolver` gain a `DataIntegrityViolationException → BAD_REQUEST/CONFLICT` branch, and should validation errors carry an explicit `errorCode` (e.g. `VALIDATION_ERROR`, `CONFLICT`)? The frontend's stated design ("branch on errorCode for both APIs") only half-works today. Fixing D-2 and D-6 together is one change.

4. **How does the frontend learn a user's permissions?** Login returns `role` as a *name* string only. RBAC is permission-based (roles are editable at runtime via `PUT /api/roles/{id}/permissions`), so any UI that hides buttons by role name will drift from the backend the first time a role is edited. Options: add `permissions[]` to `LoginResponse`, or add a `GET /api/auth/me`. **Needed before backlog items 7–13 can hide/show controls correctly.**

5. **Multi-farm / farm switching.** `V5` deliberately re-enabled multiple memberships per person, but `JwtAuthFilter:264` carries a `TODO: farm switching` and uses `memberships.get(0)` ordered by `farmId`. A person in two farms silently only ever sees the lower-numbered one. Decide whether farm switching is in scope now (it changes the JWT/principal shape and every farm-scoped query) or whether multi-membership stays a data-model-only capability for the moment.

6. **Is the Daily Tasks module in scope this phase?** Right now it generates rows nothing can read. Either build the read/complete/assign surface plus the reminders scheduler, or stop generating the rows until it is scheduled — and decide what `mark_task_done` and `view_finance` (both seeded, both gating nothing) are waiting for.

7. **Correction paths for immutable records.** Feed has no update/delete/reversal; cycles have no harvest/close mutation; production units cannot be edited or retired. Operationally a mistyped 1000 kg purchase is permanent. Decide whether corrections are soft-delete + re-entry, compensating ledger movements, or true edits — this shapes the Feed and Cycles UI before it is built.

8. **ROOT's role in the product.** Should ROOT be able to act inside a chosen farm (an explicit `farmId` argument or an "act as farm X" switch), or is ROOT strictly an administrative account that never touches production data? Today the answer is accidental rather than designed (D-9).

9. **Where does the frontend backlog start?** Items 1–2 (Farms, Approvals) are what make the system usable end-to-end by a real admin; items 7–9 (Units, Cycles) are what make the dashboard show real data. Both are defensible first sprints and they do not overlap.

---

# Housekeeping — test data created and removed

Everything below was created **through the real API** during Part B and then removed. The database was verified back to its pre-audit state.

| Created | Removed |
|---|---|
| Farm 14 "AUDIT Shamba la Ukaguzi" | ✅ deleted |
| Users `bfd691d6-…` (Audit Tester, 0799000111) and `f9cec038-…` (Audit Worker, 0799000222) | ✅ deleted |
| Their two `farm_users` memberships (farm 14, OWNER + WORKER) | ✅ deleted |
| Production unit 22 `AUD-T1` (farm 14) | ✅ deleted |
| Cycles 2 (farm 14) and 3 (**farm 2** — created by defect D-1) | ✅ deleted |
| Daily tasks 4–9 (3 per cycle) | ✅ deleted |
| Feed purchase 2, feeding logs 3 & 4, stock movements 4–6 | ✅ deleted |
| **Collateral from D-1 on farm 2's unit 1:** `status IDLE→ACTIVE`, `updated_at`/`updated_by` stamped | ✅ restored — `status='IDLE'`, `updated_at=created_at`, `updated_by=NULL`, matching its sibling units 2–4 |

Post-cleanup verification:

```sql
  c |          t
----+----------------------
  7 | users                  -- pre-audit count
  6 | farms                  -- pre-audit count
  6 | farm_users             -- pre-audit count
 20 | production_units       -- pre-audit count
  0 | cycles
  0 | daily_tasks
  0 | feed_purchases
  0 | feeding_logs
  0 | feed_stock_movements

 unit_id | farm_id | code | status |          updated_at           | updated_by
---------+---------+------+--------+-------------------------------+------------
       1 |       2 | T1   | IDLE   | 2026-08-21 11:27:45.060424+03 |
```

Not reverted (harmless, not removable): PostgreSQL sequence values for `farms`, `production_units`, `cycles`, `daily_tasks`, `feed_purchases`, `feeding_logs`, `feed_stock_movements` advanced past the deleted rows. Login attempts also consumed rate-limiter budget, which is in-memory and expires on its own.

No application code, migration, configuration or UI file was modified by this audit. This report is the only file added.
