# D-4 Audit — GraphQL Error Handling (Frontend, Angular 21)

**Verification pass. No application source was modified.** No test file was written either —
the D-4 commits already ship the Mode-B tests this audit calls for, so Phase 2 was satisfied by
**running** them rather than adding one. The only file created is this report.

- **Audited tree:** working tree of `feat/approvals-screen` @ `53cec56` (uncommitted changes present, see Phase 0)
- **Date:** 2026-08-31
- **Environment:** Windows 11, Node/npm 10.9.2, Angular 21.2, Vitest 4.1.11, backend live on `localhost:8082`
- **Audited against:** the D-4 criteria in this prompt, `FRONTEND_BACKEND_AUDIT.md` (item 16 / defect D-4),
  and `docs/FIX_D4_REPORT.md`. `Kumbukumbu_ya_Maendeleo.md` is **not present in this repo** — searched:
  the only Markdown files anywhere outside `node_modules` are `FRONTEND_BACKEND_AUDIT.md`, `README.md`,
  `docs/FARMS_SCREEN_REPORT.md`, `docs/FIX_D4_REPORT.md`.

---

## Headline

**`D-4 COMPLETE`**

All six Phase-1 criteria PASS. Phase 2 was run in **Mode B (full)** — 38 tests across the four D-4
spec files, all passing — plus **partial Mode A** corroboration against the live backend for the
session-level wire contract. Full Mode A for the `FORBIDDEN`-inside-HTTP-200 path could not be
re-run (no valid credentials; the D-4 harness principals were deliberately deleted after the
original fix — see Phase 2). Two non-blocking observations are recorded at the end; neither is a
D-4 defect.

---

# Phase 0 — Does D-4 exist at all?

### `git branch -a`

```
* feat/approvals-screen
  feat/auth-reconcile
  feat/farms-admin-screen
  fix/d4-graphql-error-handling
  main
  remotes/origin/main
```

### `git log --oneline -20`

```
53cec56 feat(approvals): approve a pending user, and place them on a farm
be4414d docs: Farms screen report — evidence per acceptance item, plus two backend findings
c4fefa7 feat(farms): the Farms admin screen, gated on manage_farms
2a2cece refactor(layout): lift the dashboard chrome into a shared AppShell
11c751b feat(rbac): reusable permission gating — permissionGuard + *appHasPermission
f9ec04b feat(auth): learn what the user may do from GET /api/auth/me
e20615c docs: D-4 report — branch, commits, and evidence per acceptance item
88aad6b feat(dashboard): say why the screen is empty instead of "Failed to load data"
4b16dc0 fix(graphql): stop discarding extensions.errorCode (D-4)
d548e94 feat(errors): one session-failure handler, shared by both APIs (D-4)
5495a1d continue with auth
359ff92 feat(auth): reconcile auth surface to the verified backend contract
847e4c2 first commit
d2ddf86 initial commit
```

### `git status`

```
On branch feat/approvals-screen
Changes not staged for commit:
	modified:   src/app/auth/change-password/change-password.ts
	modified:   src/app/auth/login/login.ts
	modified:   src/app/core/guards/auth-guard.ts
	modified:   src/app/core/interceptors/auth-interceptor.spec.ts
	modified:   src/app/core/interceptors/auth-interceptor.ts
	modified:   src/app/core/models/auth.ts
	modified:   src/app/core/services/auth.ts
	modified:   src/app/dashboard/dashboard.html
	modified:   src/app/dashboard/dashboard.i18n.ts
	modified:   src/app/dashboard/dashboard.scss
	modified:   src/app/dashboard/dashboard.spec.ts
	modified:   src/app/dashboard/dashboard.ts
	modified:   src/app/shared/layout/app-shell/app-shell.html
	modified:   src/app/shared/layout/app-shell/app-shell.i18n.ts
	modified:   src/app/shared/layout/app-shell/app-shell.scss
	modified:   src/app/shared/layout/app-shell/app-shell.ts

Untracked files:
	src/app/core/services/auth.spec.ts
	src/app/core/services/farm-selection.ts
	src/app/shared/layout/app-shell/app-shell.spec.ts
```

### Which branch/commits implement D-4

Branch **`fix/d4-graphql-error-handling`**, four commits on top of `5495a1d`:

```
$ git log --oneline fix/d4-graphql-error-handling
e20615c docs: D-4 report — branch, commits, and evidence per acceptance item
88aad6b feat(dashboard): say why the screen is empty instead of "Failed to load data"
4b16dc0 fix(graphql): stop discarding extensions.errorCode (D-4)
d548e94 feat(errors): one session-failure handler, shared by both APIs (D-4)
5495a1d continue with auth          ← base
```

```
$ git diff --stat 5495a1d...e20615c
 docs/FIX_D4_REPORT.md                              | 301 +++++++++++++++++++
 src/app/core/i18n/error-messages.ts                |  74 +++++
 src/app/core/interceptors/auth-interceptor.spec.ts | 126 ++++++++
 src/app/core/interceptors/auth-interceptor.ts      |  40 +--
 src/app/core/models/api-error.ts                   | 105 +++++++
 src/app/core/models/auth.ts                        |   5 +-
 src/app/core/models/error-codes.ts                 |  18 +-
 src/app/core/services/auth-error-handler.spec.ts   | 123 ++++++++
 src/app/core/services/auth-error-handler.ts        |  96 ++++++
 src/app/core/services/auth.ts                      |   7 +-
 src/app/core/services/graphql.spec.ts              | 333 +++++++++++++++++++++
 src/app/core/services/graphql.ts                   |  92 +++++-
 src/app/dashboard/dashboard.spec.ts                | 124 ++++++++
 src/app/dashboard/dashboard.ts                     |  41 ++-
 14 files changed, 1436 insertions(+), 49 deletions(-)
```

**D-4 has landed and is merged forward.** `git merge-base --is-ancestor fix/d4-graphql-error-handling HEAD`
exits 0 — every D-4 commit is contained in the audited branch. `main` is at `be4414d`, also downstream of `e20615c`.

> **Note on scope:** three of the D-4 files (`auth-interceptor.ts`, `auth.ts`, `dashboard.ts`) have been
> modified again by later work and carry **uncommitted** changes right now. Everything below therefore
> audits the **working tree as it stands**, not the D-4 commits as merged. That is the state that ships.

---

# Phase 1 — Static verification

## 1.1 `GraphqlService` reads `errors[]` out of the HTTP-200 body itself — **PASS**

`src/app/core/services/graphql.ts:34-77`

```ts
34:  query<T>(query: string, variables?: Record<string, unknown>): Observable<T> {
35:    return this.http
36:      .post<GraphQlResponse<T>>(environment.graphqlUrl, { query, variables })
37:      .pipe(
38:        map((res) => {
39:          const failure = this.readFailure(res);
40:          if (failure) {
41:            throw failure;
42:          }
43:          return res.data as T;
44:        }),
45:        catchError((err: unknown) => throwError(() => this.toApiError(err))),
46:      );
47:  }
...
55:  private readFailure<T>(res: GraphQlResponse<T>): ApiError | null {
56:    const entries = res.errors ?? [];
57:    if (entries.length === 0) {
58:      return null;
59:    }
60:
61:    // Every code is offered to the session handler before anything is thrown:
62:    // if one entry says the session is gone, that outranks the rest.
63:    let sessionHandled = false;
64:    for (const entry of entries) {
65:      sessionHandled = this.authErrorHandler.handle(entry.extensions?.errorCode) || sessionHandled;
66:    }
67:
68:    // The entry the caller gets is the one it can act on: a session failure
69:    // first, then any entry carrying a code, then simply the first (a schema
70:    // or parse error, which has no errorCode).
71:    const primary =
72:      entries.find((e) => this.authErrorHandler.isSessionCode(e.extensions?.errorCode)) ??
73:      entries.find((e) => !!e.extensions?.errorCode) ??
74:      entries[0];
75:
76:    return ApiError.fromGraphQl(primary, sessionHandled);
77:  }
```

The inspection happens inside `map` on the **success** path of the HTTP call — i.e. on an HTTP 200 — which
is the only place it can happen. `res.errors` is typed (`graphql.ts:8-11`) and every entry is examined, not
just the first. A response carrying **both** `data` and `errors` is treated as a failure (`graphql.ts:49-54`
documents why), so partial data is never handed to a screen as if it were whole.

## 1.2 The three session-level codes are matched and trigger navigation — **PASS**

The map, `src/app/core/services/auth-error-handler.ts:16-20`:

```ts
16: const SESSION_ERROR_CODES: readonly string[] = [
17:   ERROR_CODE.UNAUTHENTICATED,
18:   ERROR_CODE.ACCOUNT_DISABLED,
19:   ERROR_CODE.MUST_CHANGE_PASSWORD,
20: ];
```

The behaviour, `src/app/core/services/auth-error-handler.ts:50-95`:

```ts
50:  isSessionCode(code: string | null | undefined): boolean {
51:    return !!code && SESSION_ERROR_CODES.includes(code);
52:  }
...
61:  handle(code: string | null | undefined): boolean {
62:    switch (code) {
63:      case ERROR_CODE.UNAUTHENTICATED:
64:      case ERROR_CODE.ACCOUNT_DISABLED:
67:        this.authService.logout();
68:        this.redirectTo('/login');
69:        return true;
70:
71:      case ERROR_CODE.MUST_CHANGE_PASSWORD:
75:        this.authService.raiseGate();
76:        this.redirectTo('/change-password');
77:        return true;
78:
79:      default:
80:        return false;
81:    }
82:  }
83:
84:  private redirectTo(url: string): void {
85:    const currentUrl = this.router.url.split(/[?#]/)[0];
86:    if (currentUrl === url || this.redirecting === url) {
87:      return;
88:    }
89:    this.redirecting = url;
90:    void this.router.navigateByUrl(url).finally(() => {
91:      if (this.redirecting === url) {
92:        this.redirecting = null;
93:      }
94:    });
95:  }
```

`GraphqlService` reaches it on **both** of its paths — the HTTP-200 `errors[]` path at `graphql.ts:65`, and
the non-200 path (a token refused in the backend's filter chain, before any resolver runs) at `graphql.ts:97`:

```ts
91:  private toApiError(err: unknown): unknown {
92:    if (err instanceof ApiError) {
93:      return err;
94:    }
95:    if (err instanceof HttpErrorResponse) {
96:      const code = (err.error as { errorCode?: string | null } | null | undefined)?.errorCode ?? null;
97:      return ApiError.fromHttp(err, this.authErrorHandler.handle(code));
98:    }
99:    return err;
100:   }
```

The actual navigation call is `router.navigateByUrl(url)` at `auth-error-handler.ts:90`. Keying is on
`errorCode` only, never on HTTP status — which is what lets the same rule serve a 200 and a 401
identically. `INVALID_CREDENTIALS` is deliberately **excluded** (`auth-error-handler.ts:11-14`): it is a
wrong password typed into a form, not a dead session.

Runtime proof that the redirect actually fires: Phase 2, tests
`treats a session code inside errors[] exactly like the REST 401`,
`401 UNAUTHENTICATED clears the session and routes to /login`,
`403 MUST_CHANGE_PASSWORD raises the gate and routes to /change-password`,
`403 ACCOUNT_DISABLED clears the session and routes to /login`.

## 1.3 Operation-level codes are thrown as a typed error exposing `errorCode` — **PASS**

The type, `src/app/core/models/api-error.ts:37-83`:

```ts
37: export class ApiError extends Error {
38:   /** The shared code, or null when the backend sent none (transport errors). */
39:   readonly errorCode: string | null;
40:   readonly classification: string | null;
41:   /** GraphQL field path, e.g. ['productionUnits']. Null for REST failures. */
42:   readonly path: readonly (string | number)[] | null;
43:   /** HTTP status. 200 for a GraphQL `errors[]` entry; 0 for a network failure. */
44:   readonly status: number;
45:   readonly source: ApiErrorSource;
51:   readonly sessionHandled: boolean;
...
72:   /** A GraphQL `errors[]` entry - always HTTP 200, never a thrown HttpErrorResponse. */
73:   static fromGraphQl(entry: GraphQlErrorEntry, sessionHandled: boolean): ApiError {
74:     return new ApiError({
75:       message: entry.message,
76:       errorCode: entry.extensions?.errorCode ?? null,
77:       classification: entry.extensions?.classification ?? null,
78:       path: entry.path ?? null,
79:       status: 200,
80:       source: 'graphql',
81:       sessionHandled,
82:     });
83:   }
```

The `throw`, `graphql.ts:39-42` (quoted in full under 1.1):

```ts
39:  const failure = this.readFailure(res);
40:  if (failure) {
41:    throw failure;        // ← an ApiError, not new Error(messages.join('; '))
42:  }
```

`ApiError` is a named class extending `Error`, so it survives `instanceof` across the RxJS boundary;
`isApiError()` (`api-error.ts:103-105`) is the guard screens use. Nothing is flattened: `errorCode`,
`classification`, `path`, `status` and `source` all reach the caller. The old
`new Error(messages.join('; '))` no longer exists anywhere in `src/` — the only occurrences of that
string are the comments recording its removal (`api-error.ts:33`, `graphql.ts:24`).

The four operation-level codes are all proven to arrive intact in Phase 2:
`FORBIDDEN`, `VALIDATION_ERROR`, `CONFLICT`, `NO_FARM_CONTEXT`.

## 1.4 Single shared map — **PASS**

There is **one** `errorCode → behaviour` definition: `SESSION_ERROR_CODES` + `handle()` in
`src/app/core/services/auth-error-handler.ts`. Full `rg` sweep of `src/` excluding specs:

```
$ rg -n 'AuthErrorHandler|authErrorHandler|restError' src --glob '!*.spec.ts'
src\app\core\services\auth-error-handler.ts:37:export class AuthErrorHandler {            ← the ONE definition

src\app\core\interceptors\auth-interceptor.ts:5:import { AuthErrorHandler } from '../services/auth-error-handler';
src\app\core\interceptors\auth-interceptor.ts:32:  const authErrorHandler = inject(AuthErrorHandler);
src\app\core\interceptors\auth-interceptor.ts:54:      authErrorHandler.handle(code);

src\app\core\services\graphql.ts:6:import { AuthErrorHandler } from './auth-error-handler';
src\app\core\services\graphql.ts:32:  private readonly authErrorHandler = inject(AuthErrorHandler);
src\app\core\services\graphql.ts:65:      sessionHandled = this.authErrorHandler.handle(entry.extensions?.errorCode) || sessionHandled;
src\app\core\services\graphql.ts:72:      entries.find((e) => this.authErrorHandler.isSessionCode(e.extensions?.errorCode)) ??
src\app\core\services\graphql.ts:97:      return ApiError.fromHttp(err, this.authErrorHandler.handle(code));

src\app\core\http\rest-error.ts:5:import { AuthErrorHandler } from '../services/auth-error-handler';
src\app\core\http\rest-error.ts:25:      return throwError(() => ApiError.fromHttp(err, authErrorHandler.isSessionCode(code)));

src\app\core\services\users.ts:9,27,47,67,88,112    ← restError(this.authErrorHandler)
src\app\core\services\roles.ts:8,22,28              ← restError(this.authErrorHandler)
src\app\core\services\farms.ts:8,19,30,38           ← restError(this.authErrorHandler)
```

The REST interceptor, `src/app/core/interceptors/auth-interceptor.ts:51-57`:

```ts
51:  return next(request).pipe(
52:    catchError((err: HttpErrorResponse) => {
53:      const code = (err.error as ApiResponse<unknown> | undefined)?.errorCode ?? null;
54:      authErrorHandler.handle(code);
55:      return throwError(() => err);
56:    }),
57:  );
```

Both sides call **the same injected singleton** (`@Injectable({ providedIn: 'root' })`,
`auth-error-handler.ts:36`). The session-redirect handler was genuinely extracted, not duplicated —
`auth-interceptor.ts:13-17` records that it used to be two inline `if` blocks here. **No second map exists.**

A third consumer, `src/app/core/http/rest-error.ts:21-29`, normalises REST failures into the *same*
`ApiError` shape so screens have one error type regardless of transport; it deliberately calls
`isSessionCode` (a query) rather than `handle` (an action), because the interceptor has already acted
by the time it runs.

The interceptor is registered, so the REST half is live in the real app —
`src/app/app.config.ts:15`: `provideHttpClient(withInterceptors([authInterceptor]))`.

## 1.5 No per-screen swallowing — **PASS** (one non-blocking observation)

**No screen re-implements the session redirect.** Full sweep for navigation outside the handler:

```
$ rg -n "navigateByUrl|router\.navigate" src --glob '!*.spec.ts'
src\app\core\services\auth-error-handler.ts:90:    void this.router.navigateByUrl(url).finally(...)   ← the handler itself
src\app\shared\layout\app-shell\app-shell.ts:187:    void this.router.navigateByUrl('/login');         ← the "Log out" button
src\app\auth\change-password\change-password.ts:99:    this.router.navigateByUrl('/login');             ← "sign out instead" on the gate screen
src\app\auth\change-password\change-password.ts:128:  .subscribe(() => this.router.navigateByUrl(this.authService.landingUrl()));  ← success
src\app\auth\login\login.ts:102:  this.router.navigateByUrl(this.authService.landingUrl());   ← login success
src\app\auth\login\login.ts:107:  this.router.navigateByUrl('/change-password');              ← login OUTCOME (mustChangePassword)
```

Every one of those is a deliberate user action or a success path. None is error handling.

**No screen discards `errorCode`.** All three GraphQL/REST-consuming screens keep the typed error and
resolve copy from it:

```
$ rg -n 'apiErrorMessage' src
src\app\dashboard\dashboard.ts:92:    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
src\app\farms\farms.ts:269:          return error ? apiErrorMessage(error, this.languageService.lang()) : null;
src\app\approvals\approvals.ts:450:          : apiErrorMessage(error, this.languageService.lang()),
src\app\approvals\approvals.ts:460:    return error ? apiErrorMessage(error, this.languageService.lang()) : null;
```

`dashboard.ts:88-93,111,183-191` is the model case — the error is stored **as an `ApiError`**, and the
screen branches on the code rather than on prose:

```ts
 88:  readonly error = signal<ApiError | null>(null);
...
111:  readonly noFarm = computed(() => this.error()?.errorCode === ERROR_CODE.NO_FARM_CONTEXT);
...
183:      error: (err: unknown) => {
184:        // Session-level codes (expired token, disabled account, forced
185:        // password change) have already been acted on by AuthErrorHandler
186:        // before this runs - this screen is on its way out, and only needs
187:        // to stop showing the spinner.
188:        this.error.set(isApiError(err) ? err : UNKNOWN_FAILURE);
189:        this.loading.set(false);
190:      },
```

**No session code is matched anywhere outside the handler.** Sweep excluding the handler, the code
vocabulary and the i18n table:

```
$ rg -n 'UNAUTHENTICATED|MUST_CHANGE_PASSWORD|ACCOUNT_DISABLED' src \
    --glob '!*.spec.ts' --glob '!**/error-codes.ts' --glob '!**/error-messages.ts' \
    --glob '!**/auth-error-handler.ts'
(no matches)
```

The pre-session auth forms do branch on `errorCode`, but only on codes the handler deliberately leaves
to the caller, and they read the code rather than the message — `auth.ts:205` (`PENDING_APPROVAL`,
`ACCOUNT_DISABLED` **as a login outcome**, not a redirect), `auth.ts:237` (`TOO_MANY_REQUESTS`),
`auth.ts:279` (`INVALID_CREDENTIALS` = wrong current password, a field error). All correct per
`auth-error-handler.ts:11-14`.

**Observation (not a D-4 defect) — `AuthService.ensurePermissions` swallows its failure entirely:**

```ts
src/app/core/services/auth.ts:136-145
136:  ensurePermissions(): Observable<readonly string[]> {
137:    if (!this.mePermissions$) {
138:      this.mePermissions$ = this.loadMe().pipe(
139:        map((me) => me.permissions as readonly string[]),
140:        catchError(() => of(this.permissions())),      ← errorCode discarded here
```

This is a REST call (`GET /api/auth/me`, `auth.ts:117`), so the **session half is unaffected**: the
interceptor has already handed the code to `AuthErrorHandler` before this `catchError` runs, and the
redirect fires. What is dropped is an *operation-level* code — a `FORBIDDEN` from `/me` degrades
silently to the cached permission set. `auth.ts:130-134` states this as the intent (a guard must not
bounce a permitted user on a cache miss), so it is a documented trade-off, not a leak of the D-4
contract. Recorded for the record; **no fix proposed here.**

## 1.6 i18n — **PASS**

`src/app/core/i18n/error-messages.ts:18-57` — one entry per shared code, in both languages:

```ts
18: const ERROR_CODE_MESSAGES: Record<string, Record<Lang, string>> = {
19:   [ERROR_CODE.FORBIDDEN]: {
20:     sw: 'Huna ruhusa ya kuona taarifa hizi. Wasiliana na msimamizi wa shamba.',
21:     en: 'You do not have permission to view this. Ask your farm administrator.',
22:   },
23:   [ERROR_CODE.NO_FARM_CONTEXT]: {
24:     sw: 'Akaunti yako haijawekwa kwenye shamba lolote bado.',
25:     en: 'Your account is not assigned to a farm yet.',
26:   },
27:   [ERROR_CODE.UNAUTHENTICATED]: { sw: 'Kikao chako kimeisha. Ingia tena.', en: '…' },
31:   [ERROR_CODE.ACCOUNT_DISABLED]:  { … }
35:   [ERROR_CODE.MUST_CHANGE_PASSWORD]: { … }
39:   [ERROR_CODE.CONFLICT]: { … }
43:   [ERROR_CODE.VALIDATION_ERROR]: { … }
47:   [ERROR_CODE.TOO_MANY_REQUESTS]: { … }
51: };
...
54: const FALLBACK_MESSAGE: Record<Lang, string> = {
55:   sw: 'Imeshindikana kupata data. Angalia mtandao kisha ujaribu tena.',
56:   en: 'Could not load data. Check your connection and try again.',
57: };
...
67: export function apiErrorMessage(error: ApiError, lang: Lang, preferBackendMessage = false): string {
68:   if (preferBackendMessage && error.errorCode && error.message) {
69:     return error.message;
70:   }
72:   const mapped = error.errorCode ? ERROR_CODE_MESSAGES[error.errorCode] : undefined;
73:   return mapped ? mapped[lang] : FALLBACK_MESSAGE[lang];
74: }
```

**It is the existing structure, not a parallel one.** It imports the same `Lang` type from the same
`LanguageService` (`language.ts:3: export type Lang = 'sw' | 'en'`) that every screen dictionary uses
(`dashboard.i18n.ts`, `farms.i18n.ts`, `approvals.i18n.ts`, `login.i18n.ts`,
`change-password.i18n.ts`, `signup.i18n.ts`, `app-shell.i18n.ts` — all `{ sw: {...}, en: {...} }`),
and callers resolve it with `this.languageService.lang()` exactly as they resolve screen copy. It sits
in `core/i18n/` rather than beside one screen because the codes are an app-wide contract
(`error-messages.ts:7-11`).

**One error surfaced end-to-end via the key, in both languages** — from the FORBIDDEN test in Phase 2:

```
✓ src/app/dashboard/dashboard.spec.ts > shows the mapped FORBIDDEN message, not a generic failure line
✓ src/app/dashboard/dashboard.spec.ts > shows the mapped message in Swahili too
```

No hardcoded error string exists on the error path of any screen: `dashboard.ts:92`,
`farms.ts:269`, `approvals.ts:450,460` all go through `apiErrorMessage`.

---

# Phase 2 — Write-path / runtime proof

## Mode used

**Mode B (full), with partial Mode A corroboration.**

### Why not full Mode A

The backend **is** running and reachable on `:8082`, and it does emit the errorCode contract — proven
below. What is missing is a **principal**. The credentials recorded in the source documents no longer
authenticate:

```
$ curl -X POST http://localhost:8082/api/auth/login -d '{"phone":"0799000222","password":"Audit@1234"}'
HTTP 401
{"success":false,"message":"Simu/barua pepe au password si sahihi.","errorCode":"INVALID_CREDENTIALS"}
```

`docs/FIX_D4_REPORT.md:85-94` explains why: the D-4 harness principals (`D4 Owner` `0788100111`,
`D4 Norole` `0788100222`) were **created for that fix and removed afterwards** — and `D4 Norole`, a
member with *no* role, was the only way to make a read query answer `FORBIDDEN`, since all four seeded
roles hold `view_dashboard`. Re-creating one needs an admin token, which requires a principal — the same
gap. No password was guessed, and no user was registered, since this is a verification pass that must
not write to the system under audit.

So Mode A here proves the **wire contract**, and Mode B proves the **client behaviour** on it.

### Mode A (partial) — live backend, session-level condition

Absent token → `/graphql`. Captured verbatim, headers included:

```
$ curl -s -i -X POST http://localhost:8082/graphql \
       -H "Content-Type: application/json" \
       -d '{"query":"query { productionUnits { unitId } }"}'
HTTP/1.1 401
Vary: Origin
Vary: Access-Control-Request-Method
Vary: Access-Control-Request-Headers
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Pragma: no-cache
Expires: 0
X-Frame-Options: DENY
Content-Type: application/json;charset=ISO-8859-1
Content-Length: 105
Date: Mon, 31 Aug 2026 13:34:59 GMT

{"success":false,"message":"Hujaingia (login) - token haipo au si sahihi.","errorCode":"UNAUTHENTICATED"}
```

An expired/garbage bearer token gives the same 401 envelope; `GET /api/farms` with no token likewise.
This payload is **byte-identical** to the `REAL.unauthenticated` fixture at `graphql.spec.ts:67-72`,
which is what the Mode-B redirect tests are driven with. The fixtures are not invented.

**Not verified live:** `FORBIDDEN` inside an HTTP 200 (needs a no-role principal — see above).

### Mode B (full) — tests fed simulated HTTP-200 GraphQL bodies

**No test file was written for this audit.** The D-4 commits already ship exactly the tests the prompt
specifies, at `src/app/core/services/graphql.spec.ts` (333 lines, commit `4b16dc0`). The two cases the
prompt names are `graphql.spec.ts:158-177` and `graphql.spec.ts:208-227`:

```ts
158:    it('surfaces FORBIDDEN as a typed error carrying the code', async () => {
159:      const { service, httpMock, router } = setup();
160:
161:      const { data, error } = await run(service, httpMock, REAL.forbidden);
162:
163:      expect(data).toBeUndefined();
164:      expect(isApiError(error)).toBe(true);
165:
166:      const apiError = error as ApiError;
167:      expect(apiError.errorCode).toBe(ERROR_CODE.FORBIDDEN);
168:      expect(apiError.classification).toBe('FORBIDDEN');
169:      expect(apiError.path).toEqual(['productionUnits']);
170:      expect(apiError.message).toBe("Huna ruhusa ya 'view_dashboard'.");
171:      expect(apiError.status).toBe(200);            ← the HTTP-200 point
172:      expect(apiError.source).toBe('graphql');
173:
174:      // Not a session failure: the user stays exactly where they are.
175:      expect(apiError.sessionHandled).toBe(false);
176:      expect(router.navigateByUrl).not.toHaveBeenCalled();
177:    });
...
208:    it('treats a session code inside errors[] exactly like the REST 401', async () => {
209:      const { service, httpMock, router, authService } = setup();
210:      localStorage.setItem(TOKEN_KEY, 'expired-token');
211:
212:      const { error } = await run(service, httpMock, {
213:        errors: [
214:          {
215:            message: 'Hujaingia (login) - token haipo au si sahihi.',
216:            path: ['productionUnits'],
217:            extensions: { errorCode: 'UNAUTHENTICATED', classification: 'UNAUTHORIZED' },
218:          },
219:        ],
220:        data: null,
221:      });
222:
223:      expect((error as ApiError).errorCode).toBe(ERROR_CODE.UNAUTHENTICATED);
224:      expect((error as ApiError).sessionHandled).toBe(true);
225:      expect(authService.isLoggedIn()).toBe(false);
226:      expect(router.navigateByUrl).toHaveBeenCalledWith('/login');   ← the redirect
227:    });
```

`run()` (`graphql.spec.ts:116-131`) flushes the body through `HttpTestingController` with **no status
argument**, i.e. HTTP 200 — so `REAL.forbidden` (`graphql.spec.ts:20-30`) really is a 200 carrying
`{ errors: [{ extensions: { errorCode: 'FORBIDDEN' } }] }`, and the error the subscriber receives is the
one asserted on. `authInterceptor` is deliberately **not** registered in that TestBed
(`graphql.spec.ts:93-97`), so the service is proven correct on its own rather than by leaning on an
interceptor that happens to be wired up.

### Passing run — the four D-4 spec files

```
$ npx ng test --no-watch --reporters=verbose \
    --include "src/app/core/services/graphql.spec.ts" \
    --include "src/app/core/services/auth-error-handler.spec.ts" \
    --include "src/app/core/interceptors/auth-interceptor.spec.ts" \
    --include "src/app/dashboard/dashboard.spec.ts"

 RUN  v4.1.11 D:/KAMPUNI PROJECT/samakiFarmFront

 ✓ src/app/core/interceptors/auth-interceptor.spec.ts > authInterceptor > attaches the bearer token when there is one 20ms
 ✓ src/app/core/interceptors/auth-interceptor.spec.ts > authInterceptor > sends the chosen farm as X-Farm-Id 4ms
 ✓ src/app/core/interceptors/auth-interceptor.spec.ts > authInterceptor > sends no X-Farm-Id when no farm has been chosen 2ms
 ✓ src/app/core/interceptors/auth-interceptor.spec.ts > authInterceptor > routes a 401 UNAUTHENTICATED to /login through the shared handler 4ms
 ✓ src/app/core/interceptors/auth-interceptor.spec.ts > authInterceptor > routes a 403 MUST_CHANGE_PASSWORD to /change-password 2ms
 ✓ src/app/core/interceptors/auth-interceptor.spec.ts > authInterceptor > leaves a 401 INVALID_CREDENTIALS to the form 2ms
 ✓ src/app/core/interceptors/auth-interceptor.spec.ts > authInterceptor > leaves a 403 FORBIDDEN to the calling screen 2ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > session-level codes > UNAUTHENTICATED signs out and routes to /login 19ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > session-level codes > ACCOUNT_DISABLED signs out and routes to /login 5ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > session-level codes > MUST_CHANGE_PASSWORD raises the gate and routes to /change-password 2ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > leaves INVALID_CREDENTIALS alone - it is a wrong password, not a dead session 2ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > leaves FORBIDDEN to the calling screen 2ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > leaves VALIDATION_ERROR to the calling screen 1ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > leaves CONFLICT to the calling screen 1ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > leaves NO_FARM_CONTEXT to the calling screen 2ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > leaves PENDING_APPROVAL to the calling screen 3ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > leaves TOO_MANY_REQUESTS to the calling screen 2ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > codes that belong to the caller > does nothing for a missing code 1ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > idempotence > redirects once when handled twice in the same tick 1ms
 ✓ src/app/core/services/auth-error-handler.spec.ts > idempotence > does not redirect to the page it is already on 1ms
 ✓ src/app/core/services/graphql.spec.ts > GraphqlService > returns data unchanged on success 21ms
 ✓ src/app/core/services/graphql.spec.ts > failures inside an HTTP 200 (errors[]) > surfaces FORBIDDEN as a typed error carrying the code 4ms
 ✓ src/app/core/services/graphql.spec.ts > failures inside an HTTP 200 (errors[]) > surfaces VALIDATION_ERROR with the backend message a form can show on a field 2ms
 ✓ src/app/core/services/graphql.spec.ts > failures inside an HTTP 200 (errors[]) > surfaces CONFLICT with the code, not just a message 3ms
 ✓ src/app/core/services/graphql.spec.ts > failures inside an HTTP 200 (errors[]) > surfaces NO_FARM_CONTEXT without touching the session 2ms
 ✓ src/app/core/services/graphql.spec.ts > failures inside an HTTP 200 (errors[]) > treats a session code inside errors[] exactly like the REST 401 4ms
 ✓ src/app/core/services/graphql.spec.ts > failures inside an HTTP 200 (errors[]) > does not return partial data when a response carries both data and errors 2ms
 ✓ src/app/core/services/graphql.spec.ts > failures inside an HTTP 200 (errors[]) > picks the session failure when several errors come back together 2ms
 ✓ src/app/core/services/graphql.spec.ts > HTTP-level failures on the GraphQL endpoint > 401 UNAUTHENTICATED clears the session and routes to /login 6ms
 ✓ src/app/core/services/graphql.spec.ts > HTTP-level failures on the GraphQL endpoint > 403 MUST_CHANGE_PASSWORD raises the gate and routes to /change-password 5ms
 ✓ src/app/core/services/graphql.spec.ts > HTTP-level failures on the GraphQL endpoint > 403 ACCOUNT_DISABLED clears the session and routes to /login 3ms
 ✓ src/app/core/services/graphql.spec.ts > HTTP-level failures on the GraphQL endpoint > reports a dead connection as an ApiError with no code 2ms
 ✓ src/app/dashboard/dashboard.spec.ts > Dashboard error surface > shows the mapped FORBIDDEN message, not a generic failure line 174ms
 ✓ src/app/dashboard/dashboard.spec.ts > Dashboard error surface > shows the mapped message in Swahili too 33ms
 ✓ src/app/dashboard/dashboard.spec.ts > Dashboard error surface > offers a farm administrator the way to /farms, not a failure line 38ms
 ✓ src/app/dashboard/dashboard.spec.ts > Dashboard error surface > tells a farmless member to ask an administrator, and offers no way out 25ms
 ✓ src/app/dashboard/dashboard.spec.ts > Dashboard error surface > reloads when the selected farm changes 50ms
 ✓ src/app/dashboard/dashboard.spec.ts > Dashboard error surface > renders data and no error on success 21ms

 Test Files  4 passed (4)
      Tests  38 passed (38)
   Start at  16:33:38
   Duration  2.12s
```

### Whole suite, for regression cover

```
$ npx ng test --no-watch
Application bundle generation complete. [4.463 seconds] - 2026-08-31T13:32:55.362Z

 RUN  v4.1.11 D:/KAMPUNI PROJECT/samakiFarmFront

 Test Files  11 passed (11)
      Tests  87 passed (87)
   Start at  16:32:57
   Duration  21.08s
```

The build step that precedes the run is the type-check, and it completed — so the audited working tree
compiles as well as passes.

### What Phase 2 does and does not establish

| Claim | Established by | Verdict |
|---|---|---|
| A `FORBIDDEN` in an HTTP-200 `errors[]` reaches the caller as a typed error with `errorCode` | Mode B, `graphql.spec.ts:158-177` | **PASS (runtime)** |
| `VALIDATION_ERROR` / `CONFLICT` / `NO_FARM_CONTEXT` likewise | Mode B, `graphql.spec.ts:179-206` | **PASS (runtime)** |
| An `UNAUTHENTICATED` in an HTTP-200 `errors[]` causes sign-out + redirect to `/login` | Mode B, `graphql.spec.ts:208-227` | **PASS (runtime)** |
| Non-200 answers from `/graphql` (401/403) redirect identically, with no interceptor registered | Mode B, `graphql.spec.ts:269-317` | **PASS (runtime)** |
| The REST interceptor routes the same codes through the same handler | Mode B, `auth-interceptor.spec.ts` (7 tests) | **PASS (runtime)** |
| A screen renders the code as bilingual copy rather than "Failed to load data" | Mode B, `dashboard.spec.ts` (6 tests) | **PASS (runtime)** |
| The backend really emits this contract for session failures | Mode A, live `curl` above | **PASS (live)** |
| The backend really emits `errorCode` inside an HTTP-200 `errors[]` **today** | — no principal available | **UNVERIFIED this pass** (verified live on 2026-08-24 per `FIX_D4_REPORT.md:96-107`; fixtures match that capture byte-for-byte) |

---

# Verdict summary

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 0 | D-4 exists in git | **PASS** | `fix/d4-graphql-error-handling`, 3 code commits + 1 doc, merged forward into `main` and HEAD |
| 1.1 | `GraphqlService` reads `errors[]` from the 200 body | **PASS** | `graphql.ts:34-77` |
| 1.2 | Session codes matched → navigation, in one place | **PASS** | `auth-error-handler.ts:16-20, 61-95`; reached from `graphql.ts:65` and `:97`; runtime: 4 tests |
| 1.3 | Operation codes re-thrown as a typed error with `errorCode` | **PASS** | `api-error.ts:37-83`; `throw` at `graphql.ts:41`; runtime: 4 tests |
| 1.4 | Exactly one shared map, used by interceptor **and** GraphqlService | **PASS** | one `AuthErrorHandler`; `auth-interceptor.ts:32,54` + `graphql.ts:32,65,72,97`; no second map found |
| 1.5 | No per-screen swallowing / no re-implemented redirect | **PASS** | three `rg` sweeps, all clean; one documented non-D-4 observation at `auth.ts:140` |
| 1.6 | i18n through the existing bilingual structure | **PASS** | `error-messages.ts:18-74`, same `Lang` as all `*.i18n.ts`; runtime: SW + EN dashboard tests |
| 2 | Runtime proof | **PASS (Mode B full; Mode A partial)** | 38/38 D-4 tests, 87/87 suite; live 401 envelope matches the fixture |

## Observations (reported, not fixed — and neither blocks D-4)

1. **`AuthService.ensurePermissions` discards operation-level codes** — `auth.ts:140`
   `catchError(() => of(this.permissions()))`. The session path is unaffected (the interceptor acts
   first), but a `FORBIDDEN` from `GET /api/auth/me` degrades silently to the cached permission set.
   Documented as deliberate at `auth.ts:130-134`.

2. **Two ways of reading a code off a REST failure coexist** — `ApiError.fromHttp` /
   `restError()` for the data services, and the local `errorCodeOf(err)` helper at `auth.ts:31-33`
   for the pre-session auth forms. Both read `ApiResponse.errorCode` and neither loses it, so this is
   duplication of a two-line accessor, not a second behaviour map. It does not affect 1.4.

3. **Live re-verification of the HTTP-200 `FORBIDDEN` path is blocked on test principals.** The D-4
   harness accounts were removed by design after the fix. If Mode A is wanted on demand in future, a
   permanently seeded no-role member on a dev farm would make it a one-command check.

---

**`D-4 COMPLETE`**
