# ChromaMatch — Local Uncertainty Log

> **Local working notes — gitignored. Do not commit this file.**
>
> This is the running list of decisions that are not fully specified by the design
> docs, assumptions made while implementing, and follow-ups that need a human
> decision. Design-level open items still live in `docs/ChromaMatch_Database_Design.md` §11.

Last updated: 2026-10-30

## How to use

- Add an entry when the docs are silent, ambiguous, or when an implementation
  choice could reasonably go another way.
- Record the **current handling** so the code is understandable without reading
  the implementation.
- Mark items **Resolved** once a decision is made; keep the history.
- Do not treat this file as a second design document. The docs remain normative.

## Open uncertainties

| ID | Area | Uncertainty | Current handling / impact | Decision needed |
|---|---|---|---|---|
| U-001 | Mongo trend buckets | Architecture §5.9.5 says group by day/week but does not define the start of a week. | `userTrend` uses UTC weeks starting **Monday** (`$dateTrunc` with `startOfWeek: "monday"`). A Sunday-start convention would shift weekly buckets. | Confirm Monday vs Sunday vs ISO week. |
| U-002 | History pagination | Architecture §5.9.4 / §5.10.2 define `limit` + `cursor` but give no default or maximum. | `listUserHistory` requires an explicit integer `limit` in `1..100`; no default is invented in the data layer. The future service must choose a default. | Choose the API default (e.g. 20 or 50). |
| U-003 | Daily challenge summary | §5.9.5's compact output lists `colorNumber`, `avgScore`, `rounds`, but the pipeline description says “distinct players”. | `dailyChallengeSummary` returns an extra `players` field (distinct users). This is useful but differs from the compact example. | Decide whether the API schema exposes `players`. |
| U-004 | Room `timed_out` validation | DB doc §7.6 does not list `rounds[].timed_out` as required for room mode, but §7.3 describes it as a room-attempt field. | The validator treats `timed_out` as optional; `buildHistoryDocument` always writes it for room rounds (default `false`). Raw room docs without the flag are therefore accepted. | Decide whether to make it required at the database level. |
| U-005 | Mode-specific extra fields | §7.6 specifies required fields per mode but does not explicitly forbid fields from another mode. | The validator enforces required fields/ranges but still allows, for example, `daily_challenge_id` on a global document or `room_id` on a daily document. The builder omits irrelevant fields. | Decide whether to reject cross-mode fields with a stricter schema. |
| U-006 | Total score consistency | DB doc §7.2 says `total_score` is the sum of the 3 round scores, but the MongoDB validator only checks the 0–30 range. | `buildHistoryDocument` still trusts the caller's `total`. `scoreGame` now computes the total from the already-rounded round scores in integer tenths (tested at `25.3`), so the future `gameService` must pass that value; the builder does not verify consistency itself. | Consider a tenths-based consistency check in the builder/service. |
| U-007 | Trend range boundaries | `userTrend(userId, from, to, bucket)` has no specified inclusive/exclusive semantics. | The pipeline uses `$gte: from` and `$lte: to` (inclusive on both ends). A caller passing an end timestamp at midnight includes that instant only. | Document the service-level contract or switch to half-open ranges. |
| U-008 | Hue 360 in region buckets | HSV allows hue `360`, which is equivalent to `0`. The hue-region aggregation does not specify how to bucket it. | `userHueRegionAccuracy` normalizes `360` to `0` before `$bucket`, so it lands in the `0–30` bin. `scoreRound` also applies the circular `360 ≡ 0` rule, but the display/bucket choice is unchanged. | Confirm this is the desired display behavior. |
| U-009 | History cursor compatibility | The cursor is opaque but not versioned. | Cursor payload is base64url JSON `{ p: playedAt ISO, i: ObjectId hex }`. Changing the shape later will invalidate outstanding cursors. | Add a version field if cursor stability across deployments matters. |
| U-010 | History read shape | The API contract uses ISO-8601 strings, but the data layer returns `Date` values. | `HistoryItem.playedAt` is a `Date`; the future service/handler must serialize it. This matches the existing Postgres readers. | Confirm service mapping before the API is implemented. |
| U-011 | CI coverage | The current GitHub Actions workflow runs lint → typecheck → unit → build, not integration tests. | Mongo/Postgres integration tests are run locally with Docker. A Mongo regression will not fail CI yet. | Add Mongo/Postgres service containers and `test:int` to CI. |
| U-012 | Test isolation | Integration tests use random numeric user ids and delete by `user_id` after each file. | Cleanup is scoped to generated ids, but tests share the configured `MONGODB_DB_NAME` and could theoretically collide with local data. | Consider a dedicated test database name or a reserved id range. |
| U-013 | Index changes over time | `initMongo` calls `createIndex` with stable names. | Re-running is idempotent for identical specs. If an index's keys/options change, MongoDB may raise an index-options conflict instead of replacing it. | Add explicit drop/recreate migration logic if index definitions evolve. |
| U-014 | Aggregation rounding | §5.9.5 says results are rounded to one decimal in the service layer, not in MongoDB. | Aggregations currently return raw averages (e.g. `31.333...`). The future `statsService` must round. | Ensure `statsService` applies the one-decimal rule consistently. |
| U-015 | Missing `timed_out` in room summaries | The room summary counts timeouts with `$eq: ["$rounds.timed_out", true]`. | Missing/false values are treated as not timed out. This is reasonable but not explicitly stated. | Confirm whether missing flags should be an error instead. |
| U-016 | Room code normalization | Architecture §5.7.4 says the service trims/upper-cases join codes; the SQL functions do not normalize and only `create_room` checks length. | `create_room` stores the exact code (non-empty, ≤ 8 chars); `join_room`, `start_room` and `leave_room` match exactly. The future service must trim, upper-case and validate against `ROOM_CODE_ALPHABET`. | Decide whether SQL should also defensively normalize/store uppercase. |
| U-017 | Room size upper bound | Database doc leaves the maximum open; Architecture §6 sets `ROOM_MAX_SIZE = 10` in the service. | `create_room` enforces only `room_size >= 2`; SQL accepts larger sizes. | Decide whether to enforce `10` in SQL too. |
| U-018 | Join idempotency after start | §5.8.3 orders the `status <> 'lobby'` check before the already-member check. | Re-joining a room you already belong to after it starts returns `ROOM_NOT_LOBBY`, not `already_member`. | Confirm this is intended for the room page/polling flow. |
| U-019 | Creator lobby leave membership | §5.8.3 says the creator leaving the lobby cancels the room but does not say whether to delete the creator's `room_players` row. | The row is kept (cancelled rooms retain total participation); a non-creator lobby leave deletes the row. | Decide whether cancelled lobby rooms should retain members. |
| U-020 | Leave on terminal room | §5.8.3 says finished/cancelled rooms return `noop`, but `leave_room` still looks up the member row first. | A caller whose lobby row was deleted gets `NOT_ROOM_MEMBER`; an existing member gets `noop`. | Confirm the desired response for ex-members. |
| U-021 | Admin PB patch pair | API §5.10.7 says “set both PB fields together”; SQL only checks that the resulting row satisfies the null-together CHECK. | Patching one PB field is allowed when the other already has a compatible value; patching from null with only one field fails `VALIDATION_ERROR`. | Decide whether the service must require both keys whenever either is present. |
| U-022 | Empty admin patch | The docs do not say whether an empty stats patch is valid. | `admin_update_user_stats` accepts `{}` as a no-op. | Confirm no-op vs `INVALID_PATCH`. |
| U-023 | Leaderboard pagination bounds | API §5.10.5 defines default/max (`50`/`100`), but the view readers accept raw `limit`/`offset`. | Readers do not clamp; the future `leaderboardService` must validate `limit`/`offset` and apply `LEADERBOARD_MAX_LIMIT`. | Confirm the service is the only clamping layer. |
| U-024 | View timestamp serialization | API responses use ISO-8601 strings; the view readers return `Date` values (matching existing Postgres readers). | `achievedAt`/`bestAchievedAt` are `Date`; services/handlers must serialize them. | Confirm before implementing the leaderboard/room APIs. |
| U-025 | `check_room_over` direct calls | §5.8.3 describes it as an internal helper whose caller holds the room lock. | It returns `void`, re-checks status without locking, and silently returns when the room is missing or not `in_progress`. A typed wrapper exists for completeness. | Confirm it should remain internal and not be called by services. |
| U-026 | Global leaderboard page/total snapshot | `listGlobalLeaderboard` reads the page and `count(*)` in two statements. | The total can differ from the page under concurrent PB updates; acceptable at course scale. | Use a single-query `count(*) over()` if exact consistency is required. |
| U-027 | Permutation base | §5.4.4 names `isPermutationOf123(arr)` but says `randomPermutation(n)` returns indices. | `randomPermutation` returns 0-based indices; `isPermutationOf123` validates 1-based colour numbers `[1,2,3]`. `gameService` must map `index + 1` when recording `color_number`. | Confirm the 0-based/1-based split or make both helpers use the same base. |
| U-028 | Random-colour options argument | §5.4.2 shows `generateRandomColor(rng)` but also says it takes an (unused) options argument. | Signature is `generateRandomColor(rng?, options?)`; `generateRandomColors(n, rng?, options?)` keeps the same order. `options` is currently empty/reserved. | Decide whether future colour constraints should take options first or a separate config object. |
| U-029 | `displayStreak` with no last date | §5.4.6 says “otherwise `current`” but does not special-case `null`. | `null` returns the stored `current` value (normally `0`). | Confirm whether inconsistent `current > 0` + `null` should display `0` instead. |
| U-030 | CSS colour format | §5.4.1 permits an `rgb()` or `hsl()` CSS string but does not specify the exact format. | `hsvToCssColor` returns `rgb(r, g, b)` with rounded byte channels. HSV cannot be passed directly to `hsl()` without conversion, so RGB is the accurate display form. | Confirm whether the UI requires a specific string format or a hex value. |
| U-031 | Daily date validation | §5.4.3 types `dateUtc` as `'YYYY-MM-DD'` but does not require `generateDailyColors` to validate it. | The function uses the string verbatim as part of the seed and does not validate the calendar date; callers are expected to pass `utcDateString`/DB dates. | Add strict format/real-date validation if this function can ever receive user input. |
| U-032 | PRNG helper visibility | §5.4.3 names xmur3 and mulberry32 but only requires the `generateDailyColors` API. | Both helpers are module-local; Daily determinism is tested through a fixed output snapshot of `generateDailyColors`. | Export them if direct reuse or separate PRNG tests are needed. |
| U-033 | Injected RNG validation | §5.4.2 says `generateRandomColor(rng)` takes an RNG but does not define the RNG contract. | The type is `(maxExclusive) => number`; the default is `crypto.randomInt`. The function trusts injected RNG output, so a bad test/injected RNG can produce out-of-range or non-integer tenths. | Add runtime checks if custom RNGs are used outside tests. |
| U-034 | `NOT_IMPLEMENTED` error representation | Architecture §8.1 has no `NOT_IMPLEMENTED` code, but Daily/Room `gameService` branches must signal that they are pending steps 15/17. | `gameService` throws `AppError("INTERNAL_ERROR", "NOT_IMPLEMENTED: <mode> mode is not available yet.")`. The HTTP status is 500 and the message is explicit. | Add a dedicated error code or keep the internal-error representation. |
| U-035 | Game-token `typ` location | §5.6.1 lists `typ: "game"` as a claim, while JWT also has a protected-header `typ` parameter. | `gameToken.ts` writes `typ: "game"` in the **payload** and leaves the protected header as the standard `JWT`. Verification checks the payload claim. | Confirm no intermediary expects a protected-header `typ`. |
| U-036 | Global `streak` response | §5.10.4 says Global has `streak` absent/`null`. | `gameService` always returns `streak: null` for Global so the response shape is stable; the Zod response schema allows `null` or absence. | Confirm clients prefer `null` over omitting the key. |
| U-037 | Request validation before auth | Architecture §4.7 and the existing auth routes validate the body before resolving the session. | An unauthenticated request with an invalid body receives 400 `VALIDATION_ERROR`, not 401 `UNAUTHENTICATED`. This is consistent with the existing route pattern. | Confirm whether auth should be checked first on game routes. |
| U-038 | Game-stage framing | The theme brief says the stage has "no borders"; the approved Direction 1 plan allowed flat neutral `#363636` structural rules and a neutral stage border. | `GameStage` keeps a 1px `--stage-border` frame, a flat header rule, and a flat countdown track outline. No coloured, gradient, glowing or decorative framing exists. | Confirm the strict zero-border reading versus the approved neutral instrument framing. |
| U-039 | Styleguide in the production route list | The dev-only page calls `notFound()` when `NODE_ENV=production`. | Verified `/styleguide` returns 404 under `next start`; the route still appears as a static route in the build output. | Confirm the build-output artifact is acceptable. |

## Resolved during implementation

| ID | Item | Resolution |
|---|---|---|
| R-001 | Mongo `$jsonSchema` conditional support | MongoDB rejects `if/then` in `$jsonSchema` (“Unknown $jsonSchema keyword: if”). Mode-specific requirements are expressed with `oneOf` branches for global/daily/room. |
| R-002 | Sparse vs partial indexes | Architecture §5.9.2 allows “sparse/partial”. The daily and room indexes use `partialFilterExpression: { mode: "daily" }` / `{ mode: "room" }`, which is more precise than `sparse`. |
| R-003 | BSON numeric types | Postgres ids are written as `Long`; `round_number`, `color_number`, and `attempt_number` are written as `Int32`. Read mappers normalize both back to JS numbers. |
| R-004 | Circular hue difference | `userChannelAccuracy` computes `d = |h_target − h_guess|`, then `d > 180 ? 360 − d : d` inside the aggregation pipeline. The 359 vs 1 test case yields 2. |
| R-005 | Room exclusion from user stats | `userModeSummary`, `userTrend`, `userChannelAccuracy`, and `userHueRegionAccuracy` all match `mode ∈ {global, daily}`. Room-specific functions match `mode: "room"`. |
| R-006 | History pagination tie-break | Equal `played_at` values are ordered by `_id` descending; the cursor encodes both fields so pages do not duplicate or skip documents. |
| R-007 | Auth rate-limit key | The hook reads `email` from `request.clone().json()` before the route consumes the original body; malformed bodies fall back to an IP-only bucket. The limiter is a fixed-window, in-process map accepted as best-effort for v1; a shared store is future hardening, not a blocker. |
| R-008 | Banned login when policy flips | If `BANNED_CAN_PLAY` is changed to `false`, a banned account with the correct password receives `FORBIDDEN` (403). The default remains `true`, so banned players can log in. |
| R-009 | Dummy argon2 hash parameters | `verifyDummyPassword` uses a fixed argon2id PHC hash generated with the library defaults (`m=19456,t=2,p=1`). If hashing parameters change, the dummy hash must be regenerated to keep unknown-email and real-password timings comparable. |
| R-010 | Browser API client location | The requested `src/lib/api-client.ts` is not listed in Architecture §5.1. It is the client-only counterpart to the `src/lib/api` server helpers; hooks and components use only this wrapper for HTTP. |
| R-011 | Middleware filename under Next 16 | `src/middleware.ts` is kept per Architecture §5.1. Next 16 emits a deprecation warning recommending `src/proxy.ts`; verification uses `jose` and never touches the database. |
| R-012 | Which page routes the middleware gates | Public: `/`, `/login`, `/register`, `/leaderboard/*`. Protected: `/home`, `/play/*`, `/rooms/*`, `/profile`, `/admin/*`, per Architecture §5.11.1. The root route redirects to `/home`, which then falls through to `/login` when unauthenticated. |
| R-013 | Frontend component tests without jsdom | `vitest.config.ts` now includes `.test.tsx`; `tests/unit/ui/themeComponents.test.tsx` renders components with `react-dom/server`'s `renderToStaticMarkup` and checks markup/state contracts. Interactive browser behaviour remains manually smoke-tested, not unit-tested. |
| R-014 | Logout 401 toast | The `/home` stale-session effect now skips the auto-logout once the explicit logout mutation has succeeded, so the expected `/api/me` 401 after clearing the cookie no longer raises "Could not log out". |
| R-015 | Text density and personality pass | The first Studio Console pass was too copy-heavy. Home/auth copy is now one line per card plus one hero line; removed the forced wordmark tagline, toast/error prefixes, per-card metadata and auth footer metadata; added the `<TestStrip>` film-strip flourish, illustrated arcade mode tokens, a coloured avatar chip and an icon-only “coming soon” lock. |
| R-016 | Mode pin second pass | Mode glyphs are now 64 px (home) / 48 px (styleguide) enamel pins: a 4 px anodised rim, dark instrument plate, bold filled mini-scene, a hairline top light and a 3 px bottom drop-shadow. The Profile station is a wide 2-column banner so the 5-card grid resolves cleanly at 2 and 3 columns. |

## Notes for the next layer

- `statsService` still needs to round aggregation averages to one decimal.
- If strict auth rate limits are required across serverless instances, replace the
  in-process limiter in `src/lib/api/rateLimit.ts` with a shared store (R-007).
- `gameService` must pass the **same** `now` used for the Postgres submission into
  `buildHistoryDocument` so `played_at` matches.
- Mongo insert failures must be logged, retried once, and swallowed; the Postgres
  result is already authoritative.
- `historyRepo.insertGame` is insert-only. Do not add update/delete paths.
- Run `npm run mongo:init` after changing the validator or index definitions.
- `roomService` must trim/upper-case room codes and validate `ROOM_MAX_SIZE` before calling the SQL wrappers (U-016, U-017).
- `leaderboardService` must validate/clamp `limit`/`offset`; the view readers do not (U-023).
- When setting or clearing a Global PB through the admin patch, send both
  `global_best_score` and `global_best_achieved_at` together (U-021).
- Leaderboard/room services must serialize the readers' `Date` values before
  returning API JSON (U-024).
- `gameService` must map `randomPermutation(3)`'s 0-based indices to 1-based
  `n` values (`index + 1`) and validate the result with `isPermutationOf123`
  (U-027).
- Daily colours come from the Postgres challenge row whenever it exists; use
  `generateDailyColors` only when creating a missing day.
- Domain helpers throw `RangeError` on invalid input. Services should validate
  with Zod first and map unexpected domain failures to `VALIDATION_ERROR`
  rather than exposing the exception.
- `hsvToCssColor` is display-only; never store RGB/hex or use it for scoring
  (U-030).
- Frontend markup/state tests use `react-dom/server` in `tests/unit/ui`; interactive
  jsdom/`@testing-library/react` tests remain deferred because those libraries are
  not in the approved stack. Ask before adding them. Browser smoke tests cover
  focus, forms, modals, toasts and the `/styleguide` states; reduced motion is
  handled in CSS and the count-up code, not browser-emulated.
