# Baseline & Measurements: 005-devtools-mcp-swap

**Feature**: 005-devtools-mcp-swap

## Phase 1 — Pre-swap baseline (NOT YET CAPTURED)

**Status: outstanding. This is a hard gate before merge.**

T001–T003 require running real analyses on `main` against live targets, which needs `UXLINT_AI_API_KEY` and a decision to spend model budget. Neither was available to the implementing session, so no numbers are recorded here.

`main` is untouched by this branch, so the baseline remains capturable. It stops being capturable once the swap is merged — at which point SC-001 and SC-007 become unfalsifiable claims.

| Task | Requirement | Status |
| --- | --- | --- |
| T001 | Fixed target set defined | ⬜ Outstanding |
| T002 | Three runs on `main`, per-page status/snapshot/findings/wall-clock | ⬜ Outstanding |
| T003 | Median per-page wall-clock and the SC-007 threshold (× 1.2) | ⬜ Outstanding |

Dependent verification, also outstanding: T017–T022 (US1), T045–T047, T053, T058, T066.

---

## Implementation-time findings

### T005 — The pinned server states no numeric Chrome floor, and none is imposed

`chrome-devtools-mcp@1.7.0`'s README, under Requirements:

```text
- Chrome current stable version or newer.
```

That is a moving target, not a number. The only numbered Chrome versions the package documents are for features uxlint does not use:

| Version | Feature | Used by uxlint? |
| --- | --- | --- |
| 144+ | `--autoConnect` | No |
| 149+ | `--allowedUrlPattern` | No |
| 150+ | `--categoryExperimentalWebmcp` | No |

**Decision: no version floor.** An earlier draft set one at 144 — the oldest number the docs mention — and flagged in review that it would reject browsers that work. Two independent reviewers reached the same conclusion, and they were right: 144 is the requirement for a feature this project does not use, so gating on it fails runs that would have succeeded and contradicts US1's promise that nothing a user can see changes.

Whether a browser is usable is now settled by launching it, which is the same principle FR-009 applies to the sandbox: measure the property being relied on rather than infer it from a declared number. A browser too old to drive fails the launch probe and is reported as `browser-unstartable`, carrying the browser's own explanation.

The version is still read and recorded in the report's provenance. It is information, not a gate.

### T045 — SC-003: a missing browser fails fast and for free

Run on the implementing host, which has no Chrome:

```text
No usable Chrome was found. Searched: /opt/google/chrome/chrome. Install Google
Chrome (https://www.google.com/chrome/), or set the browser executable path if
Chrome lives elsewhere. In a container image, add google-chrome-stable or
Chrome for Testing.
exit=1 elapsed_ms=715
```

| SC-003 requirement | Result |
| --- | --- |
| Exits non-zero | ✅ 1 |
| Within 5 seconds | ✅ **715 ms** |
| Zero model tokens | ✅ the run used a dummy API key and never reached the provider |
| Message sufficient to fix the image | ✅ names the path searched and the package to install |

### T046 — SC-004: all three container cases

Run against the real CLI in the Chrome 151 container built for Phase 0.

| Container | Sandbox relaxation notice | Analysis proceeds |
| --- | --- | --- |
| root, default seccomp | ✅ emitted, cause = `Running as root without --no-sandbox is not supported.` | ✅ |
| **non-root, default seccomp** | ✅ emitted, cause = `Failed to move to new namespace … Operation not permitted` | ✅ |
| non-root, `seccomp=unconfined` | ✅ **absent**, as required — the sandbox starts, so nothing is relaxed | ✅ |

The middle row is the one a `getuid() === 0` implementation would have failed.

### Defect found by running it (not by testing it)

The first container run disclosed the wrong cause:

```text
The browser reported: [0815/…:WARNING:chrome/app/chrome_main_linux.cc:84]
Read channel stable from /opt/google/chrome/CHROME_VERSION_EXTRA
```

Chrome opens with a WARNING about its channel file before printing the sentence
that explains the failure, and the first-non-empty-line rule picked the warning.
The classification was still correct — it scans the whole stream — but the
*reported reason* was noise presented as a cause, which defeats the point of
disclosing it at all. Fixed to prefer the matched signature line, with a
regression test carrying the verbatim container output.

Every unit test passed both before and after that fix. Only running the binary
surfaced it.

### T067 — Coverage of the new files

Read from the text reporter, not from the exit status: `test:coverage` omits
`--check-coverage`, so the command reports and always exits 0 (D18, out of
scope here). Numbers below are the reported ones.

| File | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| `source/models/browser-preflight.ts` | 100 | 100 | 100 | 100 |
| `source/models/browser.ts` | 95.9 | 85.7 | 100 | 95.9 |
| `source/services/mcp-client.ts` | 95.98 | 84.2 | 100 | 95.98 |
| `source/services/browser-preflight.ts` | 94.1 | 96.3 | **75** | 94.1 |

**One metric is under the 80% threshold and is not being explained away**:
function coverage on `services/browser-preflight.ts`. The uncovered function is
the default process runner's success path (lines 101–113) — the thin wrapper
around `execFile` that only returns successfully when a real browser answers.
Its failure path is covered by a unit test, and its success path is covered by
`tests/integration/browser-preflight.spec.ts` on any machine that has Chrome;
that test skips here, where none is installed. Reaching 80% on this metric
without a browser would mean testing the wrapper's success by mocking the thing
it wraps, which measures nothing.

Everything else clears the threshold on every metric.

### T006 — Platform default Chrome locations

Read from the pinned server's bundled browser resolution (`build/src/third_party/index.js`), stable channel:

| Platform | Path |
| --- | --- |
| Linux | `/opt/google/chrome/chrome` |
| macOS | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Windows | `C:\Program Files\Google\Chrome\Application\chrome.exe` (also `Program Files (x86)`, and the `D:` equivalents) |

WSL paths are additionally probed by the server. Phase 0 evidence remains Linux-only; the macOS and Windows paths are read from source, not executed.

Confirmed by execution on Linux: with no browser present, the server reports
`Could not find Google Chrome executable for channel 'stable' at: - /opt/google/chrome/chrome.`
