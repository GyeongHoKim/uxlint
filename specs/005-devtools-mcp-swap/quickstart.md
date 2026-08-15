# Quickstart: Validating the Browser Server Swap

**Feature**: 005-devtools-mcp-swap

How to prove this feature works. Each scenario maps to acceptance criteria in [spec.md](./spec.md); the commands are the ones Phase 0 used, so they are known to run.

## Prerequisites

- Node >=22.22.2 (development on 24)
- Docker, for the container scenarios
- Model credentials, for the baseline and end-to-end scenarios only
- A `.uxlintrc.yml` pointing at a fixed, publicly reachable target set

## 0. Capture the baseline — do this FIRST, before any source change

Blocking prerequisite for SC-001 and SC-007. It cannot be reconstructed after the swap.

```bash
git switch main            # current release, pre-swap
npm run build
# three runs against the fixed target set, recording per page:
#   status, snapshot length, finding count, wall-clock ms
node dist/cli.js
```

Record the results in the feature directory. Without this, "within 20% of baseline" is unfalsifiable and the feature cannot honestly claim SC-007.

## 1. The analysis still works (US1, SC-001, SC-002)

```bash
npm run build
node dist/cli.js
```

Expected: every page that completed on the baseline completes now; each completed page carries a non-empty snapshot; the report contains every field it did before, plus run provenance.

## 2. Missing browser fails fast and usefully (US2, SC-003)

The Phase 0 probe host had no Chrome, so this is reproducible on any machine without one:

```bash
node dist/cli.js            # non-interactive
echo "exit=$?"
```

Expected: non-zero exit within 5 seconds, zero model tokens spent, message naming the missing browser and how to install it. **Not** expected: a page recorded as `partial`, or any model request.

Interactive mode must show the same guidance rendered in the UI rather than a stack trace or a hang.

## 3. Container scenarios (US2 scenario 4/7, SC-004)

Build the probe image:

```bash
cat > Dockerfile.chrometest <<'EOF'
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates \
 && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*
EOF
docker build -f Dockerfile.chrometest -t uxlint-chrometest .
```

Run all three cases — the second is the one a root-check implementation would fail:

```bash
# a) root, default seccomp        -> proceeds, emits relaxation notice
docker run --rm -v "$PWD":/work uxlint-chrometest node /work/dist/cli.js

# b) NON-root, default seccomp    -> proceeds, emits relaxation notice
docker run --rm --user 1000:1000 -e HOME=/tmp -v "$PWD":/work uxlint-chrometest node /work/dist/cli.js

# c) sandbox actually works       -> proceeds, NO relaxation notice
docker run --rm --user 1000:1000 -e HOME=/tmp --security-opt seccomp=unconfined \
  -v "$PWD":/work uxlint-chrometest node /work/dist/cli.js
```

Measured baseline for these cases is in [research.md](./research.md) R8.

## 4. Nothing leaks (US3, SC-005)

```bash
docker run --rm --network none -v "$PWD":/work uxlint-chrometest node /work/dist/cli.js
```

Against a local target with outbound observation, expect zero requests carrying the analysed URL to any host but the target. Specifically absent: the Google CrUX API, Google usage statistics, and `registry.npmjs.org`.

The registry request is the easy one to miss — it comes from inside the dependency, not from uxlint (see [research.md](./research.md) R2).

## 5. Offline and reproducible (US4, SC-006, SC-010)

```bash
npm ci
docker run --rm --network none -v "$PWD":/work uxlint-chrometest node /work/dist/cli.js
```

Expected: the run proceeds with no registry access, and two runs report the same server version in provenance.

## 6. No trace of the old server (SC-009)

```bash
grep -ri "playwright" source/ tests/ README.md package.json
```

Expected: no matches.

## 7. Quality gates

Per Constitution I, and per the 004 lesson that build-dependent lint rules only fire after a build:

```bash
npm run compile && npm run format && npm run lint
npm test          # full suite — run this before pushing, not just the three above
```

## Verifying against contracts

- Launch arguments and tool names: [contracts/mcp-launch.md](./contracts/mcp-launch.md)
- Preflight verdicts and messages: [contracts/browser-preflight.md](./contracts/browser-preflight.md)
- Report provenance shape: [data-model.md](./data-model.md)
