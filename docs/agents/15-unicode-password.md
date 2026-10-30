# Issue 15: consistent Unicode password length

## Goal and base

[Issue 15](https://github.com/Metallic-Club/plateform/issues/15) was filed before production edits. Signup counts
Unicode code points while login counts UTF-8 bytes, so valid multibyte signup credentials can fail at later login.
Use the existing 128-code-point maximum consistently; preserve original password bytes without normalization,
trimming or truncation. No new password/minor policy, UI, handoff or deployment.

Independent branch `platform/15-unicode-password` uses updated canonical `platform/p1-backend` at
`2cd5418b91511279ea38a35a04b31a49ac8f0e6b`. The base advanced externally with readiness routing and its own Clippy
solution. Preserve that solution; do not copy the older PR 11/13 Problem representation over it. Main is absent
and is not created. The rules and canonical signup/login/OpenAPI predicates were read; no duplicate claim existed.

## Prepared / tests first

- OpenAPI descriptions first clarify code-point length and byte-exact verification; schemas keep their existing
  limits. Existing login validation 400 is now explicitly documented: initial regressions exposed that missing
  response entry before reaching their credential assertions. No new response behavior was introduced.
- Six API tests are prepared: exact ASCII/BMP/supplementary maxima, existing Unicode signup minimum, overlength and
  empty rejection without account creation, and byte-exact normalization/truncation distinctions. Round trips
  create an invented adult example.com account, revoke the initial session and authenticate the same identity.
- Source-only fixture probe confirmed 128 code points / 320 UTF-8 bytes pass signup's length predicate but fail
  login's predicate. Actual HTTP signup/logout/login then confirmed 400 instead of 200 for the BMP/supplementary
  maximum. After documenting existing validation 400, the unchanged runtime had three passing and three failing
  regressions, including 400 instead of credential 401 for long byte-distinct wrong passwords.
- Runtime fix is one expression: login now uses `password.chars().count() <= 128`, retaining its nonempty check.
  All six focused HTTP cases passed afterward. Password hashing/verification bytes are untouched.
- Repeat only the reviewed [#8 safe test cleanup](https://github.com/Metallic-Club/plateform/issues/8) needed to avoid
  the unsafe canonical sweep: canonical current-PID names, no FORCE, skip connected databases, no other-PID or
  template cleanup, and its classifier. The patch preserves the new base's removal of the unused Resp::id helper.
- [NIST password verifier guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver) supports code points
  as the length unit for Unicode. This is supporting rationale for the existing policy, not adoption of unrelated
  NIST policy requirements or Unicode normalization.

## Validation / next

Targeted red/green runs used lane116's guard after its worktree ownership cleanup; output confirms this new server
source path. Only local workspace artifacts were removed. Existing PostgreSQL was used without setup/download or
credential printing. The unsafe baseline sweep was never run. Full guarded backend checks passed: **67 tests**,
32 unit + 35 API, including all 61 operations on that earlier base and all six new cases. Fmt, licenses, OpenAPI lint,
whitespace and strict Clippy checks passed. Existing unused-license allowances and the health-route
lint ignore remain. Independent read-only review found no blocking issue. No web directory or CI workflow exists
on this base, so no web build or CI result is claimed. No dependency, Cargo.lock or migration changed.

Pre-publication fetch then found canonical `c12b8c044ebd86f95b73ce810075066db425e91c`, adding the lead's web-session
handoff. It was brought into this unpublished branch with normal merge `e39c3a1`; no rebase or force push. The
handoff code/policy is unchanged by this task, and the PR diff still contains only this fix/docs/tests/safe cleanup.
The 67-test results above apply to the earlier base. Fresh checks on the merged final base passed **68 tests**
(32 unit + 36 API), including all **63** current operations and the new canonical handoff walkthrough. Fresh
strict all-targets Clippy, fmt, licenses, Redocly and whitespace checks also passed. Independent review of this
task's source/tests found no blocking issue. This verifies the stated inputs, not repository lead acceptance.

Logs in `%TEMP%`: `metallic-platform15-red.log`, `metallic-platform15-red-contract-aligned.log`,
`metallic-platform15-green.log`, `metallic-platform15-full.log`, `metallic-platform15-clippy.log`,
`metallic-platform15-final-base-full.log`, `metallic-platform15-final-base-clippy.log`.

The prior [integration issue 14](https://github.com/Metallic-Club/plateform/issues/14) remains historical evidence
for exact old base `7b0f69b`, PR 11 `11d402c` and PR 13 `3637db2`; it is not acceptance of the updated canonical base.
Do not rewrite that evidence or update the earlier published branches in this task. Lead integration needs a fresh
composition audit against the new base. No production edit or acceptance is claimed here yet.

## Handoff

[PR 16](https://github.com/Metallic-Club/plateform/pull/16) is open against `platform/p1-backend`, with all final-base
local gates passed. The implemented production diff is the one login length expression described above;
repository review remains required. No merge, deployment or acceptance is claimed. The existing PostgreSQL
cluster remains running for other development sessions, and no Cargo process remains active.
