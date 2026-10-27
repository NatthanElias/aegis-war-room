#!/usr/bin/env python3
"""Fault injection against this skill's own gates, plus a run of every shipped script.

Adapted from tlc-spec-lean's selftest.py (CC-BY-4.0); see ../ATTRIBUTION.md. A validator that
exits 0 on everything is decoration, so each case mutates the worked example in fixtures/, runs
validate_execution.py as a user would, and requires the expected exit code and message. A case
whose mutation does not apply is VACUOUS and fails the run.

Run it after editing a validator, a script, or a format in references/. A format change that
drifts from what the validator parses shows up here as a broken baseline.

The fixtures double as the worked example of a passing plan, checks, round, and summary. The
round's hashes, HEAD, fingerprint, and review size are placeholders that this script fills from a
scratch Git repository, because they depend on the machine.

Usage: python3 .claude/skills/feature-workflow/scripts/selftest.py [-v]
Exit codes: 0 when the baseline passes, every mutant is killed, and every control and tool passes.
"""

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"
VALIDATOR = HERE / "validate_execution.py"
FEATURE = Path(".specs") / "features" / "billing-dunning"
FILE_BYTES = 24_000
sys.path.insert(0, str(HERE))
from validate_execution import CEILING, FLOOR, fingerprint, total_bytes  # noqa: E402


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


# ---------- edit helpers ----------

def sub(old, new):
    return lambda text: text.replace(old, new)


def resub(pattern, new):
    return lambda text: re.sub(pattern, new, text, count=1, flags=re.S)


def section(name, body):
    return resub(rf"## {re.escape(name)}\n.*?(?=\n## |\Z)", f"## {name}\n\n{body}\n")


def put(**values):
    return lambda report, head: report.update(values)


def point(index=0, **values):
    return lambda report, head: report["checkpoints"][index].update(values)


def proof(**values):
    return lambda report, head: report["checkpoints"][0]["proofs"][0].update(values)


def gate(**values):
    return lambda report, head: report["gates"][0].update(values)


def mutant(index=0, **values):
    return lambda report, head: report["mutations"][index].update(values)


def tautology(**values):
    return lambda report, head: report["test_policy"]["tautology_check"].update(values)


def dropped(*rows):
    return lambda report, head: report["test_policy"].update(dropped_tests=list(rows))


DROPPED = {"test": "test/billing/dunning_test.rb test_failed_charge_twice",
           "reason": "test_failed_charge_suspends catches the same fault."}


def every(*edits):
    def apply(report, head):
        for edit in edits:
            edit(report, head)
    return apply


def basis(first):
    """Mark checkpoints for a later round: C1 with `first(head)`, the rest carried from round 1."""
    def apply(report, head):
        for row in report["checkpoints"]:
            row["basis"] = "carried from 1234567"
        report["checkpoints"][0]["basis"] = first(head)
    return apply


def stray_file(repo):
    (repo / "app" / "late_edit.rb").write_text("# edited after review\n", encoding="utf-8")


# A single-repository feature: no Repositories line, no bindings, rows and citations without repo_id.
SINGLE = {"single": True, "checks.md": sub("Repositories: billing:main\n", "")}


INTENT = "## Intent\n\n" + "".join(
    f"{n}. WHEN case {n} occurs THEN the system SHALL apply rule {n}\n" for n in range(1, 7)) + "\n## Checks"
SMALL = {"plan.md": lambda text: None, "checks.md": sub("## Checks", INTENT)}
UI = {"plan.md": sub("## Observable\n\n", "## Observable\n\nScreens: Billing status\n\n"),
      "checks.md": sub("UI: no", "UI: yes"),
      "verification.md": sub("UI: no", "UI: yes")}
UI_EVIDENCE = [{"screen": "Billing status", "source": "BILL-01", "observed": "Suspended badge shown",
                "states": "empty, loading, error, unauthorized reviewed", "verdict": "PASS"}]


def with_ui(round_edit):
    return {**UI, "round": every(put(ui="yes"), round_edit)}


# (description, edits, expected exit, expected fragment; "!x" means x must be absent)
PLAN = [
    ("criterion with no SHALL", {"plan.md": sub("THEN the system SHALL set", "THEN we set")}, 1, "has no SHALL"),
    ("SHALL with no EARS pattern (warn)", {"plan.md": sub("4. The system SHALL", "4. Subscriptions SHALL")},
     0, "no EARS pattern"),
    ("leading upstream ID is not the sentence", {"plan.md": sub("4. The system", "4. BILL-01-AC4 The system")},
     0, "!WARN"),
    ("vague word in a criterion (warn)", {"plan.md": sub("SHALL deny access", "SHALL properly deny access")},
     0, "instead of a concrete value"),
    ("duplicate criterion number", {"plan.md": sub("4. The system SHALL", "3. The system SHALL")},
     1, "Duplicate criterion: 3"),
    ("criteria without numbers (warn)", {"plan.md": resub(r"(## Criteria\n).*?(?=\n## Out of scope)",
                                                          r"\1\nSuspend on a failed charge.\n")},
     0, "No numbered criteria found"),
    ("criterion without Lands in", {"plan.md": sub("   Lands in: Flow 3\n", "")},
     1, "Criterion 2 has no `Lands in:` line"),
    ("Lands in names no shape section", {"plan.md": sub("Lands in: Flow 3", "Lands in: the status map")},
     1, "lands in no shape section"),
    ("Lands in names a None section",
     {"plan.md": section("Relations", "None - no stored-data shape change")},
     1, "lands in Relations, which is None"),
    ("Lands in outside a criterion",
     {"plan.md": sub("### S2 - Webhook ingest\n", "### S2 - Webhook ingest\n\nLands in: Surface\n")},
     1, "sits outside a criterion"),
    ("two Lands in lines for one criterion",
     {"plan.md": sub("   Lands in: Flow 3\n", "   Lands in: Flow 3\n   Lands in: Flow 4\n")},
     1, "Duplicate `Lands in:` line for criterion 2"),
    ("renamed required heading", {"plan.md": sub("## Observable", "## User-facing notes")},
     1, "Plan headings must be"),
    ("duplicate heading", {"plan.md": lambda text: text + "\n## Sources\n\nagain\n"},
     1, "Duplicate section: Sources"),
    ("no Sources section (warn)", {"plan.md": resub(r"\n## Sources\n.*", "\n")}, 0, "No Sources section"),
    ("empty Flow", {"plan.md": resub(r"(## Flow\n).*?(?=\n## Impact)", r"\1")},
     1, "Empty or placeholder plan section: Flow"),
    ("None with no reason", {"plan.md": section("Out of scope", "None")}, 1, "None needs a reason in Out of scope"),
    ("assumption without a chosen default",
     {"plan.md": sub("| none - suspend on the first failed charge |", "|  |")}, 1, "empty Chosen default"),
    ("assumption without a rationale",
     {"plan.md": sub("| the provider already retried 3 times before it reports a failure |", "|  |")},
     1, "empty Rationale"),
    ("template assumption row (warn)",
     {"plan.md": sub("| absence of a charge is not a failure | y |\n",
                     "| absence of a charge is not a failure | y |\n| <assumption> | <default> | <why> | n |\n")},
     0, "template placeholder"),
    ("no Open questions line (warn)",
     {"plan.md": sub("**Open questions:** none - all resolved or logged above.\n", "")},
     0, "No 'Open questions:' line"),
    ("unresolved open question (warn)",
     {"plan.md": sub("none - all resolved or logged above.", "what happens on a chargeback?")},
     0, "do not read as resolved"),
    ("Observable row with a blank landing", {"plan.md": sub("| error shape and codes | AC 6 |",
                                                            "| error shape and codes |  |")},
     1, "landing is blank"),
    ("Observable n/a with no reason",
     {"plan.md": sub("| n/a - the provider pins the payload version in the envelope |", "| n/a |")},
     1, "`n/a` with no reason"),
    ("Observable existing with no reason",
     {"plan.md": sub("| existing - signature verification in `Webhooks::Verifier` |", "| existing |")},
     1, "`existing` with no reason"),
    ("Observable with no rows", {"plan.md": section("Observable", "The API changes as described elsewhere.")},
     1, "Observable has no rows"),
    ("repeated screen name", {"plan.md": sub("## Observable\n\n", "## Observable\n\nScreens: Status, Status\n\n")},
     1, "Invalid Screens inventory"),
    ("two Screens lines",
     {"plan.md": sub("## Observable\n\n", "## Observable\n\nScreens: Status\n\nScreens: History\n\n")},
     1, "Duplicate Screens inventory"),
    ("columns and types in Relations",
     {"plan.md": sub("    Subscription ||--o{ WebhookDelivery",
                     "    Subscription {\n        string status\n    }\n    Subscription ||--o{ WebhookDelivery")},
     1, "carries an attribute block"),
    ("Surface route with no status", {"plan.md": sub("| `200`, `409`, `422` |", "|  |")},
     1, "names no status code"),
    ("check IDs in Surface", {"plan.md": sub("| `200`, `409`, `422` |", "| `200`, `409`, `422` | C7, C8 |")},
     1, "does not exist yet"),
    ("Surface with no rows", {"plan.md": section("Surface", "The routes live in the API document.")},
     1, "Surface has no route rows"),
    ("Landing door with no literal shape",
     {"plan.md": sub("| enum value, not null, existing rows backfilled to `active` |", "|  |")},
     1, "no literal shape"),
    ("Landing door with no rejected alternative",
     {"plan.md": sub("| a boolean `is_suspended` - cannot express the next state |", "|  |")},
     1, "no rejected alternative"),
    ("Landing with no rows", {"plan.md": section("Landing", "We chose carefully.")}, 1, "Landing has no door rows"),
    ("Impact as prose (warn)", {"plan.md": section("Impact", "Several things change in billing.")},
     0, "Impact has neither rows nor bullets"),
    ("Flow hop neither existing nor a door (warn)",
     {"plan.md": sub("3. `Billing::StatusMap` (new, no door - placement per conventions) -",
                     "3. `Billing::StatusMapFactory` -")},
     0, "without marking it as existing or as a Landing door"),
    ("flowchart node neither existing nor a door (warn)",
     {"plan.md": sub("3. `Billing::StatusMap` (new, no door - placement per conventions) - provider status -> "
                     "local status",
                     "```mermaid\nflowchart TD\n    A[\"Billing::StatusMap\"] --> B[\"Billing::Ledger\"]\n```")},
     0, "belongs in the diff"),
    ("out hop naming a slug is not a module",
     {"plan.md": sub("5. out: `200` `{}`, and `AccessPolicy` (exists) reads `status` on the next request - "
                     "no call from here", "5. out: `200` `{}`; `completo` stays")},
     0, "!WARN"),
    ("small change validated as a plan", SMALL, 1, "validate it with --stage checks"),
]

CHECKS = [
    ("Profile line (warn)", {"checks.md": sub("UI: no\n", "Profile: Standard\nUI: no\n")},
     0, "Profiles are retired"),
    ("UI flag without Screens", {"checks.md": sub("UI: no", "UI: yes")},
     1, "UI flag must match the Screens inventory"),
    ("invalid UI value", {"checks.md": sub("UI: no", "UI: maybe")}, 1, "Invalid UI value"),
    ("no UI line", {"checks.md": sub("UI: no\n", "")}, 1, "Missing or duplicate UI"),
    ("repository without checkout", {"checks.md": sub("Repositories: billing:main", "Repositories: billing")},
     1, "Invalid selected repositories"),
    ("two Repositories lines", {"checks.md": sub("Repositories: billing:main\n",
                                                 "Repositories: billing:main\nRepositories: billing:main\n")},
     1, "Duplicate Repositories line"),
    ("duplicate check ID", {"checks.md": sub("**C6** - A `Suspended`", "**C5** - A `Suspended`")},
     1, "Duplicate check: C5"),
    ("claim too short to assert", {"checks.md": resub(r"\*\*C3\*\* - [^\n]+", "**C3** - Handles unknowns")},
     1, "Empty or vague claim: C3"),
    ("vague word in a claim (warn)",
     {"checks.md": sub("denies access to paid access groups", "handles access gracefully")},
     0, "instead of a concrete value"),
    ("check without Criteria", {"checks.md": sub("Criteria: 3\n", "")}, 1, "Missing Criteria in C4"),
    ("Criteria that are not numbers", {"checks.md": sub("Criteria: 3\n", "Criteria: AC 3\n")},
     1, "Invalid Criteria in C4"),
    ("unknown criterion", {"checks.md": sub("Criteria: 3\n", "Criteria: 3, 9\n")}, 1, "Unknown criterion in C4"),
    ("criterion no check covers", {"checks.md": sub("Criteria: 6\n", "Criteria: 5\n")},
     1, "Uncovered criteria: [6]"),
    ("check without Proof", {"checks.md": resub(r"\nProof: `bin/rails test test/billing/access_test\.rb[^\n]*", "")},
     1, "C4 has no `Proof:` line"),
    ("whole-suite proof", {"checks.md": resub(r"Proof: `bin/rails test test/billing/access_test\.rb[^\n]*",
                                              "Proof: `bin/rails test`")},
     1, "Unspecific proof in C4"),
    ("proof with no test selector (warn)",
     {"checks.md": sub('test/billing/access_test.rb -n "/suspended_denies_paid_groups/"', "test/billing")},
     0, "names no test selector"),
    ("unittest dotted selector counts as a selector",
     {"checks.md": sub('bin/rails test test/billing/access_test.rb -n "/suspended_denies_paid_groups/"',
                       "python -m unittest tests.test_access.AccessTests.test_suspended")},
     0, "!no test selector"),
    ("same proof twice", {"checks.md": resub(r"(Proof: `bin/rails test test/billing/access_test\.rb[^\n]*)",
                                             r"\1\n\1")},
     1, "Duplicate proof in C4"),
    ("set member dropped", {"checks.md": sub(" · `trial_will_end` C10 |", " |")},
     1, "declares 5, assigns 4"),
    ("set without size (warn)", {"checks.md": sub("| webhook event types (5) |", "| webhook event types |")},
     0, "declares no set size"),
    ("table-driven count matched only inside a check ID",
     {"checks.md": sub("| provider status -> local (9) |", "| provider status -> local (2) |")},
     1, "declares 2, assigns 1"),
    ("table-driven over an empty set",
     {"checks.md": sub("| provider status -> local (9) | C2, table-driven over all 9 |",
                       "| provider status -> local (0) | C2, table-driven over all 0 |")},
     1, "declares 0, assigns 1"),
    ("set member without a check", {"checks.md": sub("`deleted` C10", "`deleted`")},
     1, "Invalid coverage member or check"),
    ("unproven set member", {"checks.md": sub("| C2, table-driven over all 9 | - |",
                                              "| C2, table-driven over all 9 | `paused` |")},
     1, "Unproven coverage member"),
    ("empty member cell", {"checks.md": sub("| 200 C8 · 409 C7 · 422 C9 |", "| - |")}, 1, "empty member cell"),
    ("coverage row missing a column", {"checks.md": sub("| 200 C8 · 409 C7 · 422 C9 | - |",
                                                        "| 200 C8 · 409 C7 · 422 C9 |")},
     1, "needs three columns"),
    ("table-driven proof that does not state the size",
     {"checks.md": sub("C2, table-driven over all 9", "C2, table-driven over every status")},
     1, "declares 9, assigns 1"),
    ("Swept dimension missing", {"checks.md": sub("- concurrency: C7\n", "")},
     1, "Missing Swept dimension: concurrency"),
    ("Swept dimension twice", {"checks.md": sub("- concurrency: C7\n", "- concurrency: C7\n- ordering: C7\n")},
     1, "Duplicate Swept dimension: concurrency"),
    ("Swept alias accepted", {"checks.md": sub("- concurrency: C7", "- concurrency and ordering: C7")},
     0, "!Swept"),
    ("Swept n/a with no reason", {"checks.md": resub(r"- data lifecycle: n/a[^\n]*", "- data lifecycle: n/a")},
     1, "`n/a` with no reason"),
    ("Swept existing with no guard", {"checks.md": resub(r"- authorization: existing[^\n]*",
                                                         "- authorization: existing")},
     1, "`existing` with no named guard"),
    ("Swept landing blank", {"checks.md": sub("- observability: C3", "- observability:")},
     1, "landing is blank"),
    ("Swept unresolved (warn)", {"checks.md": sub("- observability: C3", "- observability: Unresolved - ask ops")},
     0, "still unresolved"),
    ("Swept landing of another kind (warn)", {"checks.md": sub("- observability: C3", "- observability: logs")},
     0, "is not a check"),
    ("undefined check referenced", {"checks.md": sub("into it C1 ·", "into it C99 ·")},
     1, "C99 is referenced in Coverage or Swept"),
    ("Surface route nothing mentions (warn)",
     {"plan.md": sub("`POST /webhooks/provider` | the provider", "`POST /webhooks/provider/v2` | the provider")},
     0, "nothing here mentions it"),
    ("question marked blocks (warn)",
     {"checks.md": lambda text: text + "\n| Question | Status |\n| --- | --- |\n| chargeback handling | blocks |\n"},
     0, "marked `blocks`"),
    ("no Test policy (warn)", {"checks.md": resub(r"## Test policy\n.*?(?=\n## Swept)", "")},
     0, "No ## Test policy section"),
    ("no Handoff", {"checks.md": resub(r"\n## Handoff\n.*", "\n")}, 1, "Missing or empty Handoff"),
    ("small change without Intent", {"plan.md": lambda text: None}, 1, "Missing or empty Intent"),
    ("small change Intent without SHALL",
     {**SMALL, "checks.md": sub("## Checks", INTENT.replace("SHALL apply rule 3", "applies rule 3"))},
     1, "Criterion 3 has no SHALL"),
]

COMPLETE = [
    ("plan edited after review", {"after:plan.md": sub("11 days", "12 days")},
     1, "Stale review: plan.md changed"),
    ("checks edited after review", {"after:checks.md": sub("C2, table", "C2,  table")},
     1, "Stale review: checks.md changed"),
    ("round number differs from filename", {"round": put(round=2, _file=1)},
     1, "Round number differs from filename"),
    ("round without feature_id", {"round": lambda report, head: report.pop("feature_id")}, 1, "Round feature_id"),
    ("round feature_id unlike the folder", {"round": put(feature_id="billing-refunds")}, 1, "Round feature_id"),
    ("round with empty project", {"round": put(project="")}, 1, "Round project"),
    ("round without repository", {"round": lambda report, head: report.pop("repository")}, 1, "Round repository"),
    ("report UI differs from checks", {"round": put(ui="yes")}, 1, "UI mismatch"),
    ("no review_files", {"round": lambda report, head: report.pop("review_files")}, 1, "Missing review_files"),
    ("review_tokens differs from review_files (warn)", {"round": put(review_tokens=FLOOR)},
     0, f"review_tokens {FLOOR:,} differs from the"),
    ("review file missing (warn)",
     {"round": lambda report, head: report["review_files"].append("billing:app/gone.rb")},
     0, "Cannot size missing review files: billing:app/gone.rb"),
    ("review file outside the checkout",
     {"round": lambda report, head: report["review_files"].append("billing:../outside.rb")},
     1, "Use a workspace-relative or repo_id:path review file"),
    ("no review_tokens", {"round": lambda report, head: report.pop("review_tokens")}, 1, "Missing review_tokens"),
    ("no author", {"round": lambda report, head: report.pop("author")}, 1, "Missing author or reviewer"),
    ("self review above the floor", {"round": put(review_type="self")}, 1, "Review type is not independent"),
    ("independent review below the floor", {"round": put(review_tokens=FLOOR - 1)},
     1, f"Review type must be self below {FLOOR:,}"),
    ("reviewer is the author", {"round": put(reviewer="builder:session-1")}, 1, "False independent review"),
    ("two reviewers for one piece", {"round": put(reviewer=["verifier-a", "verifier-b"])},
     1, "Review needs 1 reviewer"),
    ("one reviewer above the ceiling", {"round": put(review_tokens=CEILING + 1)}, 1, "Review needs 2 reviewer"),
    ("overall FAIL", {"round": put(verdict="FAIL")}, 1, "Overall review is not PASS"),
    ("UI without screen evidence", with_ui(put()), 1, "UI review needs passing screen evidence"),
    ("UI evidence for another screen",
     with_ui(put(ui_evidence=[{**UI_EVIDENCE[0], "screen": "History"}])),
     1, "UI screen evidence differs from the Screens inventory"),
    ("checkpoint missing", {"round": lambda report, head: report["checkpoints"].pop()},
     1, "Checkpoint IDs differ from checks"),
    ("checkpoint not PASS", {"round": point(verdict="GAP")}, 1, "Checkpoint is not PASS: C1"),
    ("inferred observation", {"round": point(observed="[INFERRED] probably suspended")},
     1, "Inferred evidence supports PASS: C1"),
    ("no observation", {"round": point(observed="")}, 1, "Unproven checkpoint C1: observed"),
    ("malformed basis", {"round": point(basis="fixed it")}, 1, "C1 needs basis"),
    ("later round without basis", {"round": put(round=2)}, 1, "C1 needs basis"),
    ("later round verified at a foreign SHA", {"round": every(put(round=2), basis(lambda head: "verified at 1234567"))},
     1, "not a reviewed HEAD"),
    ("implementation without line", {"round": point(implementation="status_map.rb")}, 1, "Unlocated proof in C1"),
    ("proof command differs", {"round": proof(command="echo ok")}, 1, "Proof commands differ from checks in C1"),
    ("proof failed", {"round": proof(exit_code=1)}, 1, "Failed proof in C1"),
    ("skipped proof without reason", {"round": proof(tests_skipped=1)}, 1, "Skipped proof needs explanation in C1"),
    ("proof ran no test", {"round": proof(tests_run=0)}, 1, "No test ran for C1"),
    ("no gates", {"round": put(gates=[])}, 1, "Missing gates"),
    ("failed gate", {"round": gate(exit_code=1)}, 1, "Failed gate"),
    ("skipped gate without reason", {"round": gate(tests_skipped=2)}, 1, "Skipped tests need an explanation"),
    ("required gate ran nothing", {"round": gate(tests_run=0)}, 1, "Empty required test gate"),
    ("unknown change kind", {"round": put(kind="refactor")}, 1, "Invalid change kind"),
    ("behavior change without mutation", {"round": put(mutations=[])}, 1, "Behavior change needs a mutation"),
    ("critical path without reason", {"round": put(critical_mutation_path=True)},
     1, "Critical mutation path needs a reason"),
    ("mutation budget exceeded",
     {"round": lambda report, head: report["mutations"].append({**report["mutations"][0], "id": "M4"})},
     1, "Mutation budget exceeded"),
    ("docs change without document checks", {"round": put(kind="docs")},
     1, "Docs change needs passing document checks"),
    ("surviving mutant", {"round": mutant(detected=False)}, 1, "Surviving mutation"),
    ("duplicate mutation ID", {"round": mutant(1, id="M1")}, 1, "Duplicate mutation ID"),
    ("mutation without change", {"round": mutant(change="")}, 1, "Incomplete mutation evidence"),
    ("mutation without line", {"round": mutant(location="status_map.rb")}, 1, "Unlocated mutation"),
    ("round without test_policy", {"round": lambda report, head: report.pop("test_policy")},
     1, "Round test_policy must be an object"),
    ("tautology check not PASS", {"round": tautology(verdict="FAIL")},
     1, "tautology_check verdict is not PASS"),
    ("placeholder tautology evidence", {"round": tautology(evidence="<reviewed tests>")},
     1, "tautology_check needs non-placeholder evidence"),
    ("inferred tautology evidence", {"round": tautology(evidence="[INFERRED] tests look meaningful")},
     1, "Inferred evidence supports test_policy.tautology_check"),
    ("no dropped_tests list", {"round": lambda report, head: report["test_policy"].pop("dropped_tests")},
     1, "dropped_tests must be a list"),
    ("dropped test without reason", {"round": dropped({**DROPPED, "reason": ""})},
     1, "dropped_tests row 1 needs a non-placeholder test and reason"),
    ("dropped test listed twice", {"round": dropped(DROPPED, {**DROPPED, "test": f" {DROPPED['test']} "})},
     1, "Duplicate test_policy.dropped_tests test"),
    ("no repository rows", {"round": put(repositories=[])}, 1, "Missing report repository rows"),
    ("unselected repository row",
     {"round": lambda report, head: report["repositories"][0].update(checkout_id="other")},
     1, "Unknown or duplicate report repository"),
    ("code edited after review", {"repo": stray_file}, 1, "Stale review: billing:main"),
    ("single repository: row keeps its identity",
     {**SINGLE, "round": lambda report, head: report["repositories"][0].update(repo_id="billing", checkout_id="main")},
     1, "omits repo_id and checkout_id"),
    ("single repository: two repository rows",
     {**SINGLE, "round": lambda report, head: report["repositories"].append(dict(report["repositories"][0]))},
     1, "has one repository row"),
    ("single repository: run with bindings", {**SINGLE, "bindings": True}, 1, "without --bindings"),
    ("single repository: citation without a line",
     {**SINGLE, "round": point(implementation="app/models/billing/subscription.rb fail_charge!")},
     1, "Unlocated proof in C1"),
    ("single repository: code edited after review", {**SINGLE, "repo": stray_file}, 1, "Stale review"),
    ("summary names another round", {"verification.md": sub("round-1.json", "round-9.json")},
     1, "names wrong round"),
    ("summary hash stale", {"verification.md": resub(r"SHA256: \w+", "SHA256: " + "0" * 64)},
     1, "stale round hash"),
    ("summary verdict differs", {"verification.md": sub("Verdict: PASS", "Verdict: FAIL")},
     1, "Verification summary verdict differs"),
    ("summary UI differs", {"verification.md": sub("UI: no", "UI: yes")}, 1, "Verification summary UI differs"),
    ("summary claims self-review", {"verification.md": sub("Review: independent", "Review: self-reviewed")},
     1, "Review must say independent"),
]

# Controls: legitimate variants that a gate must still pass. A gate that fires on these is the
# same bug as one that never fires; it just fails loudly instead of silently.
CONTROLS = [
    ("checks", "small change with numbered EARS Intent", SMALL, "!WARN"),
    ("complete", "small change completes without plan.md",
     {**SMALL, "round": lambda report, head: report["review_files"].remove(str((FEATURE / "plan.md").as_posix()))},
     "!WARN"),
    ("complete", "self-reviewed round below the floor",
     {"round": put(review_tokens=FLOOR - 1, review_type="self", reviewer="builder:session-1"),
      "verification.md": sub("Review: independent", "Review: self-reviewed")}, "differs from the"),
    ("complete", "split review above the ceiling", {"round": put(review_tokens=CEILING + 1,
                                                                 reviewer=["verifier-a", "verifier-b"])}, ""),
    ("complete", "later round with a basis per checkpoint",
     {"round": every(put(round=2), basis(lambda head: f"verified at {head[:7]}"))}, ""),
    ("complete", "critical path allows five mutations",
     {"round": every(put(critical_mutation_path=True, critical_mutation_reason="stored balance"),
                     lambda report, head: report["mutations"].extend(
                         {**report["mutations"][0], "id": f"M{n}"} for n in (4, 5)))}, ""),
    ("complete", "docs round with document checks",
     {"round": put(kind="docs", mutations=[], document_checks=[
         {"path": "README.md", "command": "link checker", "exit_code": 0, "verdict": "PASS"}])}, ""),
    ("complete", "UI round with evidence for every screen", with_ui(put(ui_evidence=UI_EVIDENCE)), ""),
    ("complete", "dropped test candidates with reasons",
     {"round": dropped(DROPPED, {"test": "test/billing/status_map_test.rb test_map_size",
                                 "reason": "every_provider_status already pins each mapping."})}, "!WARN"),
    ("checks", "single repository needs no Repositories line", SINGLE, "!WARN"),
    ("complete", "single repository completes without bindings", SINGLE, "!WARN"),
]


# ---------- scaffolding ----------

def git(repo, *arguments):
    subprocess.run(["git", "-C", str(repo), *arguments], check=True, capture_output=True)


def build_repo(root, single=False):
    """A scratch checkout holding every review file at a fixed size, so the review size is known.

    A single-repository feature lives inside its repository, so there the scratch root is the checkout.
    """
    repo = root if single else root / "billing"
    report = json.loads((FIXTURES / "round-1.json").read_text(encoding="utf-8"))
    for entry in report["review_files"]:
        if not entry.startswith("billing:"):
            continue
        path = repo / entry.split(":", 1)[1]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text((f"# stand-in for {entry}\n" + "#" * FILE_BYTES)[:FILE_BYTES], encoding="utf-8", newline="\n")
    git(repo, "init", "-q")
    git(repo, "config", "user.email", "selftest@example.test")
    git(repo, "config", "user.name", "selftest")
    git(repo, "config", "core.autocrlf", "false")
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "fixture")
    return repo


def scaffold(root, shared, edits):
    """Write the feature with `edits` applied. Return (feature folder, bindings, vacuous edit names).

    `shared` is the scratch repo and its (HEAD, fingerprint), computed once because Git calls are slow.
    """
    vacuous = []
    repo, state = shared
    single = edits.get("single", False)
    if "repo" in edits or single:
        repo, state = build_repo(root, single), None
    feature = root / FEATURE
    (feature / "execution" / "reviews").mkdir(parents=True)

    def edited(name, text):
        edit = edits.get(name)
        if not edit:
            return text
        changed = edit(text)
        if changed == text:
            vacuous.append(name)
        return changed

    for name in ("plan.md", "checks.md"):
        text = edited(name, (FIXTURES / name).read_text(encoding="utf-8"))
        if text is not None:
            (feature / name).write_text(text, encoding="utf-8")
    report = json.loads((FIXTURES / "round-1.json").read_text(encoding="utf-8"))
    if single:
        report = json.loads(json.dumps(report).replace('"billing:', '"'))
        report["repositories"] = [{}]
    for name in ("plan", "checks"):
        path = feature / f"{name}.md"
        if path.exists():
            report[f"{name}_sha256"] = sha(path)
        else:
            report.pop(f"{name}_sha256")
    head, digest = state or fingerprint(repo)
    report["repositories"][0].update(head=head, fingerprint=digest)
    sized = [repo / entry.split(":", 1)[1] if entry.startswith("billing:") else root / entry
             for entry in report["review_files"]]
    report["review_tokens"] = total_bytes([path for path in sized if path.exists()]) // 4
    if "round" in edits:
        before = json.dumps(report, sort_keys=True)
        edits["round"](report, head)
        if json.dumps(report, sort_keys=True) == before:
            vacuous.append("round")
    number = report.pop("_file", report.get("round", 1))
    round_path = feature / "execution" / "reviews" / f"round-{number}.json"
    round_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    summary = (FIXTURES / "verification.md").read_text(encoding="utf-8")
    summary = summary.replace("round-1.json", round_path.name).replace("<sha256 of the round file>", sha(round_path))
    (feature / "verification.md").write_text(edited("verification.md", summary), encoding="utf-8")
    for name in ("plan.md", "checks.md"):
        if f"after:{name}" in edits:
            path = feature / name
            path.write_text(edited(f"after:{name}", path.read_text(encoding="utf-8")), encoding="utf-8")
    if "repo" in edits:
        edits["repo"](repo)
    if single and "bindings" not in edits:
        return feature, None, vacuous
    # Under .specs a single repository's fingerprint ignores the file.
    bindings = (root / ".specs" if single else root) / "bindings.json"
    bindings.write_text(json.dumps({"billing:main": str(repo)}), encoding="utf-8")
    return feature, bindings, vacuous


def validate(feature, stage, bindings):
    # Workspace-relative review files resolve from the scratch root that holds .specs/.
    flags = ["--bindings", str(bindings)] if bindings else []
    result = subprocess.run([sys.executable, str(VALIDATOR), str(feature), "--stage", stage, *flags],
                            capture_output=True, text=True, cwd=feature.parents[len(FEATURE.parts) - 1])
    return result.returncode, result.stdout + result.stderr


def matches(output, fragment):
    if fragment.startswith("!"):
        return fragment[1:] not in output
    return fragment in output


def indent(text):
    return "           " + text.strip().replace("\n", "\n           ")


def run_case(shared, stage, description, edits, want_code, fragment, verbose):
    """Return (passed, report lines) so cases can run in parallel and still print in order."""
    root = Path(tempfile.mkdtemp(prefix="feature-selftest-"))
    try:
        feature, bindings, vacuous = scaffold(root, shared, edits)
        if vacuous:
            return False, [f"  VACUOUS  {stage}: {description} - the edit to {', '.join(vacuous)} did not apply"]
        code, output = validate(feature, stage, bindings)
        if code == want_code and matches(output, fragment):
            return True, [f"  ok       {stage}: {description}"] if verbose else []
        return False, [f"  FAILED   {stage}: {description}",
                       f"           expected exit={want_code} and {fragment!r}, got exit={code}", indent(output)]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def run_all(shared, cases, verbose):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda case: run_case(shared, *case, verbose), cases))
    for _, lines in results:
        for line in lines:
            print(line)
    return sum(passed for passed, _ in results)


# ---------- tooling ----------

def run_script(name, *arguments, cwd=None):
    result = subprocess.run([sys.executable, str(HERE / name), *map(str, arguments)],
                            capture_output=True, text=True, cwd=cwd)
    return result.returncode, result.stdout + result.stderr


TOOLING = [
    ("check_commit.py", "a conventional message passes",
     ["feat: suspend the subscription on a failed charge"], 0, "OK"),
    ("check_commit.py", "a non-conventional message fails", ["Updated stuff."], 1, "does not match"),
    ("check_commit.py", "a capitalized description fails", ["feat: Suspend the subscription"], 1, "start lowercase"),
    ("check_commit.py", "an unknown type fails", ["wip: suspend the subscription"], 1, "is not one of"),
    ("validate_execution.py", "a missing feature folder fails", ["missing-feature", "--stage", "plan"],
     1, "Missing feature folder"),
]


def lesson_round_trip():
    """Two features whose rounds carry different review scopes confirm one area-scoped lesson file
    that stores only the sentence and a {feature, signal} entry per feature."""
    root = Path(tempfile.mkdtemp(prefix="lessons-selftest-"))
    features = {"billing-dunning": "dunning: C1-C8", "billing-refunds": "refunds"}
    try:
        outputs = []
        for feature, review_scope in features.items():
            report = root / ".specs" / "features" / feature / "execution" / "reviews" / "round-1.json"
            report.parent.mkdir(parents=True)
            report.write_text(json.dumps({
                "feature_id": feature, "project": "acme", "repository": "billing", "scope": review_scope,
                "checkpoints": [{"id": "C8", "verdict": "FAIL"}],
                "signals": [{"id": "S1", "type": "ac_gap", "checkpoint": "C8"}]}), encoding="utf-8")
            outputs.append(run_script(
                "lessons.py", "ingest", "--root", root, "--report", report.relative_to(root).as_posix(),
                "--revision", sha(report), "--signal-id", "S1", "--signal", "ac_gap", "--feature", feature,
                "--project", "acme", "--repository", "billing", "--scope", "billing/webhooks",
                "--text", "Assert the stored row count after a replayed delivery"))
        listed = run_script("lessons.py", "list", "--root", root, "--project", "acme")
        wrong = run_script("lessons.py", "ingest", "--root", root, "--report", report.relative_to(root).as_posix(),
                           "--revision", "0" * 64, "--signal-id", "S1", "--signal", "ac_gap")
        files = list((root / ".specs" / "lessons").glob("*.json"))
        stored = json.loads(files[0].read_text(encoding="utf-8")) if len(files) == 1 else {}
        ok = (all(code == 0 for code, _ in outputs) and outputs[-1][1].strip().endswith("confirmed")
              and "replayed delivery" in listed[1] and len(files) == 1 and stored.get("schema") == 3
              and stored.get("observations") == [{"feature": feature, "signal": "ac_gap"} for feature in features]
              and (root / ".specs" / "LESSONS.md").is_file() and wrong[0] == 2 and "revision" in wrong[1])
        detail = "; ".join(out.strip() for _, out in outputs + [listed, wrong])
        return ok, detail
    finally:
        shutil.rmtree(root, ignore_errors=True)


def run_tooling(shared):
    """A shipped script nothing calls is where a crash hides, so run each one as a user would."""
    print("\ntooling - every shipped script must run, not just parse")
    ok = True
    for script, description, arguments, want_code, fragment in TOOLING:
        code, output = run_script(script, *arguments)
        if code == want_code and fragment.lower() in output.lower():
            print(f"  ok       {script}: {description}")
        else:
            ok = False
            print(f"  BROKEN   {script}: {description} - expected exit={want_code} and {fragment!r}, got exit={code}")
            print(indent(output))
    root = Path(tempfile.mkdtemp(prefix="feature-selftest-"))
    try:
        feature, _, _ = scaffold(root, shared, {})
        code, output = run_script("validate_execution.py", feature, "--stage", "complete")
        if code == 1 and "needs --bindings" in output:
            print("  ok       validate_execution.py: the complete stage refuses named repositories without bindings")
        else:
            ok = False
            print(f"  BROKEN   validate_execution.py: complete without bindings - got exit={code}")
            print(indent(output))
    finally:
        shutil.rmtree(root, ignore_errors=True)
    passed, detail = lesson_round_trip()
    if passed:
        print("  ok       lessons.py: ingest - confirm - list - render round-trip writes one lesson file")
    else:
        ok = False
        print(f"  BROKEN   lessons.py: round-trip - {detail}")
    return ok


def main(argv=None):
    verbose = "-v" in (argv if argv is not None else sys.argv[1:])
    if not FIXTURES.is_dir():
        print(f"selftest: fixtures directory missing: {FIXTURES}", file=sys.stderr)
        return 1
    work = Path(tempfile.mkdtemp(prefix="feature-selftest-repo-"))
    try:
        repo = build_repo(work)
        shared = (repo, fingerprint(repo))
        print("baseline - the worked example must pass every stage with no warning")
        baseline = True
        for stage in ("plan", "checks", "complete"):
            root = Path(tempfile.mkdtemp(prefix="feature-selftest-"))
            try:
                feature, bindings, _ = scaffold(root, shared, {})
                code, output = validate(feature, stage, bindings)
            finally:
                shutil.rmtree(root, ignore_errors=True)
            if code == 0 and "WARN" not in output:
                print(f"  ok       {stage}")
            else:
                baseline = False
                print(f"  BROKEN   {stage} exit={code}")
                print(indent(output))

        print("\nfault injection - every mutant must be killed")
        cases = ([("plan", *case) for case in PLAN] + [("checks", *case) for case in CHECKS]
                 + [("complete", *case) for case in COMPLETE])
        killed = run_all(shared, cases, verbose)
        survived = len(cases) - killed
        if not verbose and survived == 0:
            print(f"  all {killed} killed (-v to list them)")

        print("\ncontrols - a legitimate variant must still pass")
        control_cases = [(stage, description, edits, 0, fragment) for stage, description, edits, fragment in CONTROLS]
        controls = run_all(shared, control_cases, True) == len(control_cases)
        tooling = run_tooling(shared)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    print(f"\nselftest: {killed} killed, {survived} survived, controls {'ok' if controls else 'BROKEN'}, "
          f"tooling {'ok' if tooling else 'BROKEN'}, baseline {'clean' if baseline else 'BROKEN'}")
    return 0 if survived == 0 and baseline and controls and tooling else 1


if __name__ == "__main__":
    raise SystemExit(main())
