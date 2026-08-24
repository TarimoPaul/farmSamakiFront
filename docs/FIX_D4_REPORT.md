# Fix D-4 — GraphQL error handling (frontend)

**Date:** 2026-08-24
**Repo:** `D:\KAMPUNI PROJECT\samakiFarmFront` — Angular 21
**Branch:** `fix/d4-graphql-error-handling` (from `main` @ `5495a1d`)
**Verified against:** the real backend on `http://localhost:8082` (branch `main` @ `87a1fcf`), PostgreSQL `samakiFarm`, and the app itself in a real headless Chrome on `http://localhost:4200`

Frontend only. No backend change, no new screen.

---

## Commits

| # | Commit | What |
|---|---|---|
| 1 | `d548e94` | `feat(errors): one session-failure handler, shared by both APIs (D-4)` |
| 2 | `4b16dc0` | `fix(graphql): stop discarding extensions.errorCode (D-4)` |
| 3 | `88aad6b` | `feat(dashboard): say why the screen is empty instead of "Failed to load data"` |

### Files

| File | |
|---|---|
| `core/services/auth-error-handler.ts` | **new** — the single `errorCode → session action` map |
| `core/models/api-error.ts` | **new** — `ApiError`, the typed error that keeps the code |
| `core/i18n/error-messages.ts` | **new** — `errorCode → user-facing copy`, app-wide |
| `core/services/graphql.ts` | reworked — parses `errors[]`, throws `ApiError`, calls the handler |
| `core/interceptors/auth-interceptor.ts` | session logic removed; delegates to the handler |
| `core/models/error-codes.ts` | added `NO_FARM_CONTEXT`, `CONFLICT`, `VALIDATION_ERROR` |
| `dashboard/dashboard.ts` | holds the `ApiError`, renders the mapped message |
| 4 × `*.spec.ts` | **new** — 36 tests, all payloads captured from the running backend |

---

## What changed, in one picture

```
                     REST failure                GraphQL failure
                  (401/403 + envelope)        (HTTP 200 + errors[])
                          │                           │
                   authInterceptor              GraphqlService
                          │                           │
                          └──────────┬────────────────┘
                                     ▼
                            AuthErrorHandler.handle(errorCode)
                       ┌─────────────┴──────────────┐
              session-level                    everything else
       UNAUTHENTICATED  → logout + /login           │
       ACCOUNT_DISABLED → logout + /login           ▼
       MUST_CHANGE_PWD  → gate  + /change-password  ApiError { errorCode,
                                                      message, classification,
                                                      path, status, source }
                                                          │
                                                          ▼
                                                   the calling screen
```

Three design points worth stating, because they are the reasons this is not a
two-line patch:

1. **A GraphQL failure is an HTTP 200.** No interceptor can see it. That is why
   the session rules had to leave the interceptor and become a service both
   transports call — not because sharing code is tidy.
2. **`handle()` is idempotent.** Both transports can report the same dead
   session in one tick, and `navigateByUrl` is async, so the in-flight redirect
   is tracked rather than re-issued. A redirect to the page we are already on is
   skipped — which is what stops a disabled-account *login attempt* from tearing
   down the login form that is about to explain why.
3. **`INVALID_CREDENTIALS` is deliberately not session-level.** It means "the
   password you just typed is wrong" — a field error on a form. Signing the user
   out for it would be wrong, and it is the reason the whole mechanism keys on
   `errorCode` and never on the status code.

---

## Acceptance

Two independent bodies of evidence:

- **Live browser runs** — headless Chrome driven over CDP against the real dev
  server and the real backend. Real session in `localStorage`, real network.
- **36 unit tests** (`npx ng test`) whose fixtures are the byte-for-byte
  payloads captured from that same backend with `curl`.

Test principals, created through the real API (`register` → `approve` →
`memberships`) and removed afterwards — see *Housekeeping*:

| Principal | Phone | Farm | Role |
|---|---|---|---|
| **D4 Owner** | `0788100111` | 16 | OWNER |
| **D4 Norole** | `0788100222` | 16 | *membership with no role* |

`D4 Norole` exists because all four seeded roles hold `view_dashboard`; a member
with **no** role is the only way to make a read query answer `FORBIDDEN`.

### 1. `FORBIDDEN` in `errors[]` (HTTP 200) reaches the caller typed · **PASS**

The backend, as captured:

```
$ curl -X POST /graphql -H "Authorization: Bearer <D4 Norole>" \
       -d '{"query":"query { productionUnits { unitId code } }"}'
{"errors":[{"message":"Huna ruhusa ya 'view_dashboard'.","locations":[{"line":1,"column":9}],
 "path":["productionUnits"],
 "extensions":{"errorCode":"FORBIDDEN","classification":"FORBIDDEN"}}],"data":null}
<<HTTP 200>>
```

The app, in the browser, signed in as that member:

```
--- 1. no-role member on /dashboard (GraphQL FORBIDDEN inside HTTP 200)
    url      : /dashboard
    banner   : You do not have permission to view this. Ask your farm administrator.
    token    : present
    gateFlag : (unset)
```

The mapped message, not "Failed to load data." The session is untouched and the
user stays on the page. The unit test asserts the object the caller receives:

```
errorCode      = 'FORBIDDEN'        (not a bare Error, not swallowed)
classification = 'FORBIDDEN'
path           = ['productionUnits']
status         = 200
source         = 'graphql'
sessionHandled = false
```

### 2. `VALIDATION_ERROR` / `CONFLICT` reach the calling code · **PASS**

Run in the browser through the **app's own** `GraphqlService` instance (reached
via `ng.getComponent(...)`), so this is exactly what a form component gets:

```
--- 5. duplicate code -> CONFLICT (what a form component receives)
    { "constructor": "_ApiError", "isError": true,
      "errorCode": "CONFLICT", "classification": "BAD_REQUEST",
      "path": ["createProductionUnit"], "status": 200, "source": "graphql",
      "sessionHandled": false,
      "message": "Operesheni imekiuka vikwazo vya database (mfano: rudufu au uhusiano usiopo)." }
    url after: /dashboard

--- 5. bad type -> VALIDATION_ERROR (what a form component receives)
    { "constructor": "_ApiError", "isError": true,
      "errorCode": "VALIDATION_ERROR", "classification": "BAD_REQUEST",
      "path": ["createProductionUnit"], "status": 200, "source": "graphql",
      "sessionHandled": false,
      "message": "Aina ya kitengo si sahihi. Chagua: TANK, POND, BWAWA." }
    url after: /dashboard
```

A form can branch on `errorCode === VALIDATION_ERROR`, attach the error to the
field named by `path`, and show the backend's own text — which names the
offending value where our generic copy could not. `apiErrorMessage(err, lang,
true)` exists for exactly that.

### 3. Missing/expired token on a GraphQL call ends the session · **PASS**

Backend, no token at all — note this is **not** a GraphQL `errors[]` but the
REST envelope with a real status, because the filter chain refuses it before any
resolver runs:

```
$ curl -X POST /graphql -d '{"query":"query { productionUnits { unitId } }"}'
{"success":false,"message":"Hujaingia (login) - token haipo au si sahihi.",
 "errorCode":"UNAUTHENTICATED"}
<<HTTP 401>>
```

The app, with a tampered token in `localStorage`:

```
--- 3. tampered/expired token on /dashboard (HTTP 401 UNAUTHENTICATED)
    url      : /login          ← redirected
    banner   : (none)
    token    : CLEARED         ← session wiped
    gateFlag : (unset)
```

The GraphqlService spec covers this path **without the interceptor registered**,
so the service is correct on its own rather than by depending on one being wired
up in `app.config.ts`.

### 4. `MUST_CHANGE_PASSWORD` on a GraphQL path · **PASS**

Gate raised server-side (`must_change_password = true`) while the browser held a
valid session and a **false** local gate flag — so the redirect can only come
from the GraphQL call, not from the route guard:

```
$ curl -X POST /graphql -H "Authorization: Bearer <gated>" …
{"success":false,"message":"Lazima ubadilishe password kabla ya kuendelea kutumia mfumo.",
 "errorCode":"MUST_CHANGE_PASSWORD"}
<<HTTP 403>>
```

```
--- 4. gated account on /dashboard (HTTP 403 MUST_CHANGE_PASSWORD)
    url      : /change-password   ← redirected
    token    : present            ← kept: it is what change-password authenticates with
    gateFlag : true               ← raised locally, so a refresh stays gated
```

### 5. A successful query still returns data unchanged · **PASS**

```
--- 2. OWNER on /dashboard (successful query)
    url      : /dashboard
    banner   : Total Units=1, Active=0, Active Cycles=0, Fish Stocked=0
    token    : present
```

### 6. The session-redirect logic exists in exactly one place · **PASS**

```
$ git grep -n "ERROR_CODE.UNAUTHENTICATED\|ERROR_CODE.MUST_CHANGE_PASSWORD\|ERROR_CODE.ACCOUNT_DISABLED" \
      -- 'src/app/**/*.ts' ':(exclude)src/app/**/*.spec.ts' \
         ':(exclude)src/app/core/models/error-codes.ts' ':(exclude)src/app/core/i18n/*'

src/app/core/services/auth-error-handler.ts:17:  ERROR_CODE.UNAUTHENTICATED,
src/app/core/services/auth-error-handler.ts:18:  ERROR_CODE.ACCOUNT_DISABLED,
src/app/core/services/auth-error-handler.ts:19:  ERROR_CODE.MUST_CHANGE_PASSWORD,
src/app/core/services/auth-error-handler.ts:63:      case ERROR_CODE.UNAUTHENTICATED:
src/app/core/services/auth-error-handler.ts:64:      case ERROR_CODE.ACCOUNT_DISABLED:
src/app/core/services/auth-error-handler.ts:71:      case ERROR_CODE.MUST_CHANGE_PASSWORD:
src/app/core/services/auth.ts:91:          case ERROR_CODE.ACCOUNT_DISABLED:      ← login OUTCOME, not a redirect
```

Two callers, no third:

```
src/app/core/interceptors/auth-interceptor.ts:41:      authErrorHandler.handle(code);
src/app/core/services/graphql.ts:65:  sessionHandled = this.authErrorHandler.handle(entry.extensions?.errorCode) || sessionHandled;
src/app/core/services/graphql.ts:97:  return ApiError.fromHttp(err, this.authErrorHandler.handle(code));
```

The only other `navigateByUrl('/login')` left in the app is `Dashboard.logout()`
— the log-out **button**, a deliberate user action, not failure handling.

### Test suite

```
$ npx ng test --watch=false
 Test Files  5 passed (5)
      Tests  36 passed (36)

$ npx ng build
 Application bundle generation complete. [4.374 seconds]
```

---

## Also fixed on the way

`NO_FARM_CONTEXT` had no name in the frontend at all. ROOT — or any approved
user not yet put on a farm — used to see the same "Failed to load data." as a
network outage. It now says *"Your account is not assigned to a farm yet."*

---

## Housekeeping — test data created and removed

Everything went through the real API and was removed afterwards.

| Created | Removed |
|---|---|
| Farm 16 "D4 Shamba" | ✅ deleted |
| Users `10b4b342…` (D4 Owner), `462f708b…` (D4 Norole) | ✅ deleted |
| Their 2 `farm_users` memberships on farm 16 | ✅ deleted |
| Production unit 27 `D4-A` | ✅ deleted |
| `must_change_password` raised twice on D4 Owner (acceptance 4) | ✅ cleared |
| D4 Owner disabled/enabled (to flush the principal cache) | ✅ ACTIVE |

Row counts back to the pre-batch baseline:

```sql
  c |        t
----+------------------
  7 | users
  6 | farms
  6 | farm_users
 20 | production_units
 21 | role_permissions
  0 | cycles
```

Not reverted (harmless, not removable): the `farms` and `production_units`
sequences advanced past the deleted rows.

---

## Open

1. **Not merged.** `fix/d4-graphql-error-handling` is 3 commits ahead of `main`, unpushed.
2. **`preferBackendMessage` has no caller yet.** It exists for the first form
   screen that posts a mutation (units, cycles, feeding). Until then, backend
   messages are shown only where they are the whole point — which is nowhere on
   the dashboard, a read-only screen.
3. **Untouched, as scoped:** every admin/module screen, and the backend.
