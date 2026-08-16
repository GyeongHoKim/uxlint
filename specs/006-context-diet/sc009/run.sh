#!/usr/bin/env bash
# SC-009 — does a smaller context make the analysis weaker?
#
# Measures median findings per page before and after the context diet, against
# the same real targets and the same model. Everything else this feature claims
# is checked by the test suite on every commit; this is the one question a mock
# cannot answer, because it is about what the model does with what it is given
# rather than about what it is given.
#
# Requires a provider account and a usable Chrome. Neither was available when
# the feature was implemented, which is why this is a runbook rather than a
# recorded result.
#
#   UXLINT_AI_PROVIDER=anthropic UXLINT_AI_API_KEY=sk-... ./run.sh
#
set -euo pipefail

BASELINE_REF="${BASELINE_REF:-d663ea8}"
FEATURE_REF="${FEATURE_REF:-006-context-diet}"
RUNS="${RUNS:-3}"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
OUT="$HERE/results"

if [[ -z "${UXLINT_AI_API_KEY:-}" && "${UXLINT_AI_PROVIDER:-}" != "ollama" ]]; then
	echo "SC-009 needs a real model: set UXLINT_AI_API_KEY (or use ollama)." >&2
	exit 1
fi

mkdir -p "$OUT"
# The target set is committed as targets.yml; .uxlintrc.* is gitignored, so it
# is copied into place rather than stored under the name the CLI looks for.
cp "$HERE/targets.yml" "$HERE/.uxlintrc.yml"

measure() {
	local label="$1" ref="$2"
	echo "=== $label ($ref) ==="
	git -C "$REPO" switch --detach --quiet "$ref"
	npm --prefix "$REPO" run build >/dev/null

	: > "$OUT/$label.jsonl"
	for run in $(seq 1 "$RUNS"); do
		# Delete first. The run below is allowed to fail, and measuring
		# unconditionally would then re-measure the previous run's report -- or
		# the other label's -- as a silent duplicate that moves the median with
		# nothing reporting an error.
		rm -f "$HERE/ux-report.md"
		( cd "$HERE" && node "$REPO/dist/source/cli.js" ) || true

		if [[ ! -f "$HERE/ux-report.md" ]]; then
			echo "  run $run: no report produced; skipped" >&2
			continue
		fi

		node "$HERE/measure.mjs" "$HERE/ux-report.md" >> "$OUT/$label.jsonl"
		echo "  run $run: $(tail -1 "$OUT/$label.jsonl")"
	done

	if [[ ! -s "$OUT/$label.jsonl" ]]; then
		echo "No runs produced a report for $label." >&2
		exit 1
	fi
}

measure before "$BASELINE_REF"
measure after "$FEATURE_REF"
git -C "$REPO" switch --quiet "$FEATURE_REF"

echo
node -e '
	const fs = require("node:fs");
	const read = f => fs.readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l).median);
	const median = xs => { const s=[...xs].sort((a,b)=>a-b); const m=Math.floor(s.length/2);
		return s.length % 2 === 0 ? (s[m-1]+s[m])/2 : s[m]; };
	const before = median(read(process.argv[1]));
	const after = median(read(process.argv[2]));
	const change = before === 0 ? 0 : Math.round(((after - before) / before) * 100);
	console.log(`before: ${before} findings/page`);
	console.log(`after:  ${after} findings/page`);
	console.log(`change: ${change}%`);
	console.log(change >= -20
		? "SC-009 HOLDS — the diet did not cost analysis quality."
		: "SC-009 FAILS — revisit the design, not the threshold.");
' "$OUT/before.jsonl" "$OUT/after.jsonl"
