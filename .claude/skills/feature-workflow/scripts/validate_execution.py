"""Validate a feature's plan, checks, and review round.

The plan and checks rules adapt tlc-spec-lean's validate_plan.py and validate_checks.py
(CC-BY-4.0); see ../ATTRIBUTION.md. An error fails the stage. A warning prints and does not.
"""

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

# review_size.py mirrors the review limits and size method of the global orchestrate skill's delegation gate.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from review_size import CEILING, FLOOR, total_bytes  # noqa: E402


PLAN_FORMAT = Path(__file__).resolve().parents[1] / "references" / "plan.md"
STAGES = ("plan", "checks", "complete")
# Every plan needs these by name. The rules for the shape sections, Assumptions, and Impact
# run only while plan.md keeps those names, so a team may rename them.
PLAN_REQUIRED = ("Criteria", "Observable")
SHAPE = ("Flow", "Relations", "Surface")
SHAPE_HINTS = {
    "Flow": "state the hops in order",
    "Relations": "state the entities and cardinality, or `None - no stored-data shape change`",
    "Surface": "state the route signature, or `None - nothing consumed outside`",
    "Impact": "state what changes underneath, or `None - <why>`",
}
# Canonical Swept dimension -> accepted spellings.
SWEPT = {
    "validation": ("validation", "validation and bounds", "input validation"),
    "failure modes": ("failure modes", "failure", "failure and partial failure", "partial failure"),
    "idempotency": ("idempotency", "idempotency and retry", "idempotency, retry, duplicates", "retry"),
    "authorization": ("authorization", "authorisation", "auth", "authorization and rate limits"),
    "concurrency": ("concurrency", "concurrency and ordering", "ordering"),
    "data lifecycle": ("data lifecycle", "lifecycle", "data retention"),
    "dependency failure": ("dependency failure", "external-dependency failure",
                           "external dependency failure", "external dependency"),
    "state transitions": ("state transitions", "transitions", "state-transition integrity"),
    "observability": ("observability", "logging and metrics", "telemetry"),
}
SELECTOR_TOKENS = ("-n ", "-k ", "-t ", "-e ", "--name", "--only", "--example", "--filter",
                   "--testnamepattern", "--test-name", "--run", "-dtest=", "-run ", "::", "#",
                   "--grep", "-g ", "--spec")
# unittest names one test as module.Class.method.
DOTTED_TEST = re.compile(r"\bunittest\s+(?:\S+\s+)*[\w.]+\.\w+\.\w+\b")

CHECK = re.compile(r"^\*\*C([1-9]\d*)\*\*\s*[-–—]\s*(.+)$")
CHECK_ID = re.compile(r"\bC\d+\b")
IDENTITY = re.compile(r"^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$")
CRITERION = re.compile(r"^\s*(\d+)[.)]\s+(.+?)\s*$")
LANDS = re.compile(r"^\s*(?:[-*]\s*)?Lands in\s*:\s*(.*?)\s*$", re.I)
# A leading upstream ID such as US-12-AC1 is not part of the EARS sentence.
UPSTREAM_PREFIX = re.compile(r"^\s*(?:\(?[A-Z][A-Z0-9]*-[A-Za-z0-9.-]*[A-Za-z0-9]\)?\s*[:,-]?\s+)+")
PLACEHOLDER = re.compile(r"^\s*[\[<].+[\]>]\s*$")
STATUS = re.compile(r"\b[1-5]\d\d\b")
NONE = re.compile(r"\b(none|nothing|n/?a)\b", re.I)
PLAN_VAGUE = re.compile(r"\b(gracefully|properly|correctly|quickly|fast|slow|efficiently|reasonably|"
                        r"appropriately|as expected|user-friendly|robust)\b", re.I)
CHECK_VAGUE = re.compile(r"\b(gracefully|properly|correctly|quickly|fast|slow|efficiently|reasonably|"
                         r"appropriately|as expected|user-friendly|robust|works)\b", re.I)
# `Entity {` in an erDiagram opens the columns-and-types block that Relations keeps out.
ER_ATTRIBUTE = re.compile(r"^\s*\w+\s*\{\s*$")
HOP_RESOLVED = re.compile(r"\b(exists|existing|new\b|door\s*\d+)|out\s*:", re.I)
MODULE = re.compile(r"`([^`]+)`")
NODE_LABEL = re.compile(r"[\[(]\s*\"?([^\"\]()|]+?)\"?\s*[\])]")
EDGE_LINE = re.compile(r"--+>|--+\s")
SIZE = re.compile(r"\((\d+)(?:\s+[^)]*)?\)\s*$")
TABLE_DRIVEN = re.compile(r"table[- ]driven", re.I)
ROUTE = re.compile(r"(/[A-Za-z0-9_\-/:{}.]*)")
BASIS = re.compile(r"^(verified at|carried from) ([0-9a-f]{7,40})$")


class Findings:
    """Collect errors and warnings so one run reports every broken rule."""

    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, ok, message):
        if not ok:
            self.errors.append(message)
        return bool(ok)

    def warn(self, ok, message):
        if not ok:
            self.warnings.append(message)
        return bool(ok)

    def stop(self):
        if len(self.errors) == 1:
            raise ValueError(self.errors[0])
        if self.errors:
            raise ValueError(f"{len(self.errors)} errors\n  ERROR " + "\n  ERROR ".join(self.errors))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def meaningful(value):
    value = value.strip().strip(chr(96))
    return bool(value and not re.search(r"<[^>]+>|\b(?:TODO|TBD)\b", value, re.I))


def specific_proof(command):
    command = command.strip().strip(chr(96))
    if not meaningful(command):
        return False
    tokens = command.split()
    if len(tokens) < 3:
        return False
    if tokens[:3] == ["python", "-m", "unittest"] and len(tokens) == 3:
        return False
    if tokens[0] in ("pytest", "python", "python3") and tokens[-1] in ("pytest", "unittest"):
        return False
    if tokens[0] in ("mvn", "npm", "pnpm") and tokens[-1] in ("test", "verify"):
        return False
    return True


def strip_fences(lines, keep=("mermaid",)):
    """Blank fenced examples so a pasted template is not parsed; a mermaid block is content."""
    out, info = [], None
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            info = stripped.strip("`").strip().lower() if info is None else None
            out.append("")
            continue
        out.append(line if info is None or info in keep else "")
    return out


def sections(path):
    require(path.is_file(), f"Missing {path.name}")
    result = {}
    current = None
    for line in strip_fences(path.read_text(encoding="utf-8").splitlines()):
        if line.startswith("## "):
            current = line[3:].strip()
            require(current not in result, f"Duplicate section: {current}")
            result[current] = []
        elif current is not None:
            result[current].append(line)
    return result


def joined(lines):
    return "\n".join(lines).strip()


def split_row(line):
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_separator(line):
    return bool(re.match(r"^\s*\|?[\s:|-]+\|?\s*$", line)) and "-" in line


def first_table(lines):
    """Data rows of the first table in a section. A second table, such as open questions, is not read."""
    rows, started = [], False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("|"):
            started = True
            rows.append(stripped)
        elif started and stripped == "":
            continue
        elif started:
            break
    data = [row for row in rows if not is_separator(row)]
    return [split_row(row) for row in data[1:]]


def declares_none(lines):
    return any(NONE.search(line) for line in lines if line.strip())


def plan_sections():
    """Read the plan headings from plan.md's numbered list, so a team edit there changes what plans need."""
    found = tuple(re.findall(r"^\d+\.\s+`## ([^`]+)`", PLAN_FORMAT.read_text(encoding="utf-8"), re.M))
    missing = [name for name in PLAN_REQUIRED if name not in found]
    require(found and not missing, f"{PLAN_FORMAT} must list the plan headings as numbered `## Name` items, "
                                   f"including {', '.join(PLAN_REQUIRED)}")
    return found


def ears(sentence):
    """Return the EARS pattern, None when there is no SHALL, or '' for SHALL with no known pattern."""
    low = UPSTREAM_PREFIX.sub("", sentence).strip().lower()
    if not re.search(r"\bshall\b", low):
        return None
    keys = [name for name, pattern in (("WHILE", r"\bwhile\b"), ("WHEN", r"\bwhen\b"), ("WHERE", r"\bwhere\b"))
            if re.search(pattern, low)]
    if re.match(r"^\s*if\b", low) or re.search(r"\bif\b.*\bthen\b", low):
        keys.append("IF/THEN")
    if keys:
        return "+".join(keys)
    return "ubiquitous" if re.match(r"^\s*the\b", low) else ""


def criteria(lines, findings):
    """Numbered EARS criteria and the `Lands in:` line under each one."""
    found, landing, current = {}, {}, None
    for line in lines:
        if line.lstrip().startswith("#"):
            current = None
            continue
        match = CRITERION.match(line)
        if match:
            number, body = int(match.group(1)), match.group(2)
            findings.error(number not in found, f"Duplicate criterion: {number}")
            current = number
            found[number] = body
            if not findings.error(meaningful(body), f"Empty criterion: {number}"):
                continue
            pattern = ears(body)
            findings.error(pattern is not None, f"Criterion {number} has no SHALL, so it is not EARS: {body[:70]}")
            findings.warn(pattern != "", f"Criterion {number} has SHALL but no EARS pattern (WHEN, WHILE, WHERE, "
                                         f"IF/THEN, or a leading 'The ... SHALL'): {body[:60]}")
            vague = PLAN_VAGUE.search(body)
            findings.warn(not vague, f"Criterion {number} uses '{vague.group(0) if vague else ''}' "
                                     f"instead of a concrete value")
            continue
        lands = LANDS.match(line)
        if lands and findings.error(current is not None, "A `Lands in:` line sits outside a criterion"):
            findings.error(current not in landing, f"Duplicate `Lands in:` line for criterion {current}")
            landing[current] = lands.group(1)
    return found, landing


def screens(lines, findings):
    found = re.findall(r"^Screens:\s*(.*?)\s*$", "\n".join(lines), re.M)
    findings.error(len(found) <= 1, "Duplicate Screens inventory")
    names = [item.strip() for item in found[0].split(",")] if found else []
    findings.error(not found or (all(meaningful(item) for item in names) and len(names) == len(set(names))),
                   "Invalid Screens inventory")
    return set(names)


def unresolved(findings, names, landing_text, kind):
    if names and not any(name.lower() in landing_text for name in names):
        findings.warn(False, f"Flow {kind} names `{names[0]}` without marking it as existing or as a Landing door "
                             f"- if it is neither, it is placement and belongs in the diff")


def template_row(line):
    cells = split_row(line) if line.strip().startswith("|") else []
    return len(cells) >= 2 and PLACEHOLDER.match(cells[0]) and PLACEHOLDER.match(cells[1])


def plan(folder, findings):
    parts = sections(folder / "plan.md")
    expected = plan_sections()
    without_sources = tuple(name for name in expected if name != "Sources")
    if "Sources" in expected and tuple(parts) == without_sources:
        findings.warn(False, "No Sources section - 'nothing' is a valid answer, a missing section is not")
    else:
        require(tuple(parts) == expected, f"Plan headings must be, in order: {', '.join(expected)}")
    nones = set()
    for name, lines in parts.items():
        # Lean warns on template Assumptions rows; they must not also fail the section as a placeholder.
        content = joined([line for line in lines if not (name == "Assumptions" and template_row(line))])
        hint = f" - {SHAPE_HINTS[name]}" if name in SHAPE_HINTS else ""
        if not findings.error(meaningful(content), f"Empty or placeholder plan section: {name}{hint}"):
            continue
        if content.lower().startswith("none"):
            nones.add(name)
            findings.error(re.match(r"None\s*[-:]\s*\S.+", content, re.I), f"None needs a reason in {name}")

    numbered, landing = criteria(parts["Criteria"], findings)
    findings.warn(numbered, "No numbered criteria found - is the plan filled in?")
    shape = [name for name in SHAPE if name in parts]
    if shape:
        for number in numbered:
            value = landing.get(number)
            if not findings.error(value is not None, f"Criterion {number} has no `Lands in:` line naming "
                                                     f"{', '.join(shape)}"):
                continue
            names = {name for name in shape if re.search(rf"\b{name}\b", value, re.I)}
            if findings.error(names, f"Criterion {number} lands in no shape section: {value}"):
                for name in sorted(names & nones):
                    findings.error(False, f"Criterion {number} lands in {name}, which is None")

    lines = parts.get("Assumptions", [])
    if "Assumptions" in parts and "Assumptions" not in nones:
        template = False
        for cells in first_table(lines):
            if len(cells) < 3:
                continue
            assumption, chosen, rationale = cells[:3]
            if PLACEHOLDER.match(assumption) and PLACEHOLDER.match(chosen):
                template = True
                continue
            if not assumption:
                continue
            findings.error(chosen and not PLACEHOLDER.match(chosen),
                           f"Assumption '{assumption[:40]}' has an empty Chosen default")
            findings.error(rationale and not PLACEHOLDER.match(rationale),
                           f"Assumption '{assumption[:40]}' has an empty Rationale")
        findings.warn(not template, "Assumptions table still contains template placeholder rows")
        questions = [line for line in lines if "open questions" in line.lower()]
        if findings.warn(questions, "No 'Open questions:' line in Assumptions"):
            clean = re.sub(r"[*_]", "", " ".join(questions)).lower()
            findings.warn(re.search(r"open questions.*:\s*none", clean),
                          "Open questions do not read as resolved ('Open questions: none')")

    lines = parts["Observable"]
    rows = first_table(lines)
    findings.error(rows or declares_none(lines),
                   "Observable has no rows and does not state `None - no user-facing surface`")
    for cells in rows:
        if len(cells) < 3 or not cells[0] or PLACEHOLDER.match(cells[0]):
            continue
        label = f"{cells[0][:28]} / {cells[1][:28]}"
        landed = cells[2]
        if not findings.error(landed and not PLACEHOLDER.match(landed) and landed not in ("-", "\u2014"),
                              f"Observable '{label}': landing is blank - a criterion, `existing - <what>`, "
                              f"or `n/a - <reason>`"):
            continue
        low = landed.lower()
        for keyword in ("n/a", "na -", "existing"):
            if low.startswith(keyword):
                findings.error(len(landed[len(keyword):].strip(" -\u2013\u2014:")) >= 3,
                               f"Observable '{label}': `{keyword}` with no reason - say why it does not apply, "
                               f"or name what already behaves that way")
                break
    inventory = screens(lines, findings)

    for line in parts.get("Relations", []):
        if ER_ATTRIBUTE.match(line):
            findings.error(False, f"Relations carries an attribute block ('{line.strip()}') - columns and types "
                                  f"are reversible and go stale here")
            break

    routes = []
    if "Surface" in parts:
        lines = parts["Surface"]
        rows = first_table(lines)
        for cells in rows:
            if not cells or not cells[0] or PLACEHOLDER.match(cells[0]):
                continue
            findings.error(STATUS.search(cells[3] if len(cells) > 3 else ""),
                           f"Surface '{cells[0][:48]}': Status names no status code - those statuses become a "
                           f"Coverage set in checks.md")
            route = ROUTE.search(cells[0])
            if route:
                routes.append(route.group(1))
        findings.error(not any(CHECK_ID.search(line) for line in lines),
                       "Surface names a check id, but checks.md does not exist yet - each route's statuses "
                       "become a Coverage set there instead")
        findings.error(rows or declares_none(lines),
                       "Surface has no route rows and does not state `None - nothing consumed outside`")

    if "Landing" in parts:
        lines = parts["Landing"]
        rows = first_table(lines)
        findings.error(rows or declares_none(lines), "Landing has no door rows and does not state `None - <why>`")
        for cells in rows:
            if len(cells) >= 3 and cells[0] and not PLACEHOLDER.match(cells[0]):
                findings.error(cells[1] and not PLACEHOLDER.match(cells[1]),
                               f"Landing '{cells[0][:40]}': no literal shape - the next person copies this")
                findings.error(cells[2] and not PLACEHOLDER.match(cells[2]),
                               f"Landing '{cells[0][:40]}': no rejected alternative named")

    if "Impact" in parts:
        lines = parts["Impact"]
        findings.warn("Impact" in nones or first_table(lines)
                      or any(line.strip().startswith(("-", "*")) for line in lines),
                      "Impact has neither rows nor bullets - name the fronts, even to say nothing changes")

    landing_text = "\n".join(parts.get("Landing", [])).lower()
    for line in parts.get("Flow", []):
        stripped = line.strip()
        if re.match(r"^(\d+\.|[-*])\s", stripped) and not HOP_RESOLVED.search(stripped):
            unresolved(findings, MODULE.findall(stripped), landing_text, "hop")
        if EDGE_LINE.search(line) and not HOP_RESOLVED.search(line):
            unresolved(findings, [label.strip() for label in NODE_LABEL.findall(line) if label.strip()],
                       landing_text, "diagram node")
    return {"criteria": numbered, "screens": inventory, "routes": routes}


def field(content, label):
    matches = re.findall(rf"^{re.escape(label)}:\s*(.*?)\s*$", content, re.M)
    require(len(matches) == 1 and meaningful(matches[0]), f"Missing or duplicate {label}")
    return matches[0].strip().strip(chr(96))


def checks(folder, planned, findings):
    path = folder / "checks.md"
    parts = sections(path)
    content = "\n".join(strip_fences(path.read_text(encoding="utf-8").splitlines()))
    required = ("Checks", "Coverage", "Swept", "Handoff") + (() if planned else ("Intent",))
    for name in required:
        findings.error(name in parts and meaningful(joined(parts[name])), f"Missing or empty {name}")
    if planned is None:
        intent = parts.get("Intent", [])
        numbered, _ = criteria(intent, findings)
        findings.error(numbered, "Empty numbered criteria: a change without plan.md numbers its EARS criteria "
                                 "under ## Intent")
        planned = {"criteria": numbered, "screens": screens(intent, findings), "routes": []}
    findings.warn(not re.search(r"^\**Profile\**\s*:", content, re.M | re.I),
                  "Profiles are retired; delete the Profile line")
    ui = field(content, "UI")
    findings.error(ui in ("yes", "no"), "Invalid UI value")
    findings.error((ui == "yes") == bool(planned["screens"]), "UI flag must match the Screens inventory")
    listed = re.findall(r"^Repositories:\s*(.*?)\s*$", content, re.M)
    findings.error(len(listed) <= 1, "Duplicate Repositories line")
    # No Repositories line means a single-repository feature: the Git root the complete stage runs in.
    repositories = [item.strip() for item in listed[0].split(",")] if listed else []
    findings.error(not listed or (all(IDENTITY.fullmatch(item) for item in repositories)
                                  and len(repositories) == len(set(repositories))), "Invalid selected repositories")

    blocks = {}
    current = None
    for line in parts.get("Checks", []):
        match = CHECK.match(line.strip())
        if match:
            current = f"C{match.group(1)}"
            findings.error(current not in blocks, f"Duplicate check: {current}")
            claim = match.group(2).strip()
            findings.error(meaningful(claim) and len(claim.split()) >= 3, f"Empty or vague claim: {current}")
            vague = CHECK_VAGUE.search(claim)
            findings.warn(not vague, f"{current}: claim uses '{vague.group(0) if vague else ''}' "
                                     f"instead of a concrete value")
            blocks[current] = []
        elif current:
            blocks[current].append(line.strip())
    findings.error(blocks, "Empty checks: expected `**C1** - <claim>` lines")
    covered = set()
    proof_commands = {}
    for check_id, lines in blocks.items():
        refs = [line.split(":", 1)[1].strip() for line in lines if line.startswith("Criteria:")]
        if findings.error(len(refs) == 1 and refs[0], f"Missing Criteria in {check_id}"):
            tokens = [item.strip() for item in refs[0].split(",")]
            if findings.error(all(item.isdigit() for item in tokens), f"Invalid Criteria in {check_id}"):
                numbers = {int(item) for item in tokens}
                findings.error(numbers <= set(planned["criteria"]), f"Unknown criterion in {check_id}")
                covered.update(numbers)
        proofs = [line.split(":", 1)[1].strip().strip(chr(96)) for line in lines if line.startswith("Proof:")]
        findings.error(proofs, f"{check_id} has no `Proof:` line - no proof, no check")
        findings.error(all(specific_proof(item) for item in proofs), f"Unspecific proof in {check_id}")
        findings.error(len(proofs) == len(set(proofs)), f"Duplicate proof in {check_id}")
        for proof in proofs:
            findings.warn(any(token in proof.lower() for token in SELECTOR_TOKENS) or DOTTED_TEST.search(proof),
                          f"{check_id}: proof names no test selector, so it may be a whole suite: {proof[:60]}")
        proof_commands[check_id] = set(proofs)
    findings.error(covered >= set(planned["criteria"]),
                   f"Uncovered criteria: {sorted(set(planned['criteria']) - covered)}")

    referenced = set()
    rows = []
    for line in parts.get("Coverage", []):
        stripped = line.strip()
        if stripped.startswith("|"):
            cells = split_row(stripped)
            if cells[0].lower().startswith("set") or is_separator(stripped):
                continue
            if findings.error(len(cells) == 3, "Coverage row needs three columns"):
                rows.append(cells)
    findings.warn(rows, "Coverage has no rows - say so in the section when nothing enumerates")
    for name, assignments, unproven in rows:
        if not name or PLACEHOLDER.match(name):
            continue
        if not findings.error(meaningful(assignments) and assignments != "-",
                              f"Coverage '{name[:48]}': empty member cell - every member needs its own token "
                              f"and a check"):
            continue
        ids = set(CHECK_ID.findall(assignments))
        referenced |= ids
        size = SIZE.search(name)
        if not findings.warn(size, f"Coverage '{name[:48]}': declares no set size - write it as '(N)' so the "
                                   f"join is checkable"):
            findings.error(unproven in ("-", "\u2014"), f"Unproven coverage member: {name}: {unproven}")
            continue
        declared = int(size.group(1))
        # One table-driven proof can stand for the set: the enumeration lives in the test.
        if not (declared and TABLE_DRIVEN.search(assignments) and re.search(rf"(?<!\w){declared}(?!\w)", assignments) and ids):
            members = [member.strip() for member in re.split(r"\s*[·;]\s*", assignments)]
            findings.error(len(members) == declared and len(set(members)) == len(members),
                           f"Missing coverage member: {name} declares {declared}, assigns {len(members)}")
            for member in members:
                label = CHECK_ID.sub("", member).strip(" ,:-")
                findings.error(meaningful(label) and CHECK_ID.search(member),
                               f"Invalid coverage member or check: {name}: {member}")
        findings.error(unproven in ("-", "\u2014"), f"Unproven coverage member: {name}: {unproven}")

    swept = {}
    for line in parts.get("Swept", []):
        match = re.match(r"^\s*[-*]\s*\**([^:*]+?)\**\s*:\s*(.*)$", line)
        if not match:
            continue
        key = match.group(1).strip().lower()
        canon = next((name for name, aliases in SWEPT.items() if key in aliases), None)
        if canon:
            findings.error(canon not in swept, f"Duplicate Swept dimension: {canon}")
            swept[canon] = match.group(2).strip()
    for canon in SWEPT:
        if not findings.error(canon in swept, f"Missing Swept dimension: {canon} - all nine, every time"):
            continue
        landed = swept[canon]
        if not findings.error(landed and not PLACEHOLDER.match(landed),
                              f"Swept '{canon}': landing is blank - a check, `existing - <guard>`, "
                              f"or `n/a - <reason>`"):
            continue
        low = landed.lower()
        if CHECK_ID.search(landed):
            referenced |= set(CHECK_ID.findall(landed))
        elif low.startswith(("n/a", "not in scope")):
            findings.error(len(re.sub(r"^(n/a|not in scope)\b", "", low).strip(" -\u2013\u2014:")) >= 3,
                           f"Swept '{canon}': `n/a` with no reason - say why it does not apply")
        elif low.startswith("existing"):
            findings.error(len(landed[len("existing"):].strip(" -\u2013\u2014:")) >= 3,
                           f"Swept '{canon}': `existing` with no named guard or constraint")
        elif low.startswith(("unresolved", "open")):
            findings.warn(False, f"Swept '{canon}': still unresolved - confirm it does not block")
        else:
            findings.warn(False, f"Swept '{canon}': landing '{landed[:40]}' is not a check, `existing`, `n/a`, "
                                 f"or `Unresolved`")
    for check_id in sorted(referenced - set(blocks), key=lambda item: int(item[1:])):
        findings.error(False, f"{check_id} is referenced in Coverage or Swept but not defined in ## Checks")

    for route in planned["routes"]:
        findings.warn(route in content, f"plan.md's Surface names `{route}` but nothing here mentions it - its "
                                        f"statuses owe a Coverage row, or the route is dead")
    for line in content.splitlines():
        findings.warn(not (line.strip().startswith("|") and re.search(r"\|\s*blocks\s*\|", line, re.I)),
                      "An unresolved question is marked `blocks` - it cannot be settled while building")
    findings.warn("Test policy" in parts,
                  "No ## Test policy section - confirm that repository guidance already says which level proves "
                  "decision code and how much input space each proof asserts, or that no changed code decides")
    return {"ui": ui, "repositories": set(repositories), "checks": set(blocks), "proofs": proof_commands,
            "screens": planned["screens"]}


def git(root, *arguments, message=None):
    result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, check=False)
    require(result.returncode == 0, message or f"Git command failed at {root}: {' '.join(arguments)}")
    return result.stdout


def fingerprint(root):
    """Hash HEAD, tracked changes, and untracked content outside .specs."""
    root = root.resolve()
    require(Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() == root,
            f"Binding is not a Git root: {root}")
    head = git(root, "rev-parse", "HEAD", message=f"No commit at {root}; commit the work before review").strip().decode()
    diff = git(root, "diff", "HEAD", "--binary", "--", ".",
               ":(exclude).specs/**", ":(exclude)**/.specs/**")
    digest = hashlib.sha256()
    digest.update(head.encode() + b"\0" + diff + b"\0")
    names = git(root, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0")
    for raw in sorted(name for name in names if name):
        relative = Path(raw.decode("utf-8", "surrogateescape"))
        if ".specs" in relative.parts:
            continue
        content = (root / relative).read_bytes()
        digest.update(len(raw).to_bytes(8, "big") + raw)
        digest.update(len(content).to_bytes(8, "big") + content)
    return head, digest.hexdigest()


def review_size(report, bindings, findings):
    """Recompute the review estimate from review_files with the delegation gate's method, or None."""
    files = report.get("review_files")
    require(isinstance(files, list) and files and all(isinstance(item, str) and meaningful(item) for item in files),
            "Missing review_files: list every file the review read")
    checkouts = {}
    for row in report.get("repositories") or []:
        if isinstance(row, dict):
            checkouts.setdefault(row.get("repo_id"), []).append(f'{row.get("repo_id")}:{row.get("checkout_id")}')
    paths, missing = [], []
    for entry in files:
        parts = entry.split(":")
        root, relative = Path.cwd(), entry
        if len(parts) >= 3 and ":".join(parts[:2]) in bindings:
            root, relative = Path(bindings[":".join(parts[:2])]), ":".join(parts[2:])
        elif len(parts) >= 2 and len(checkouts.get(parts[0], [])) == 1 and checkouts[parts[0]][0] in bindings:
            root, relative = Path(bindings[checkouts[parts[0]][0]]), ":".join(parts[1:])
        require(not re.match(r"^[A-Za-z]:|[/\\]", relative) and ".." not in Path(relative).parts,
                f"Use a workspace-relative or repo_id:path review file: {entry}")
        path = root / relative
        if path.exists():
            paths.append(path)
        else:
            missing.append(entry)
    if not findings.warn(not missing, f"Cannot size missing review files: {', '.join(missing)}"):
        return None
    return total_bytes(paths) // 4


def review(report, bindings, findings):
    tokens = report.get("review_tokens")
    require(isinstance(tokens, int) and not isinstance(tokens, bool) and tokens >= 0,
            "Missing review_tokens")
    require(report.get("author") and report.get("reviewer"), "Missing author or reviewer")
    recomputed = review_size(report, bindings, findings)
    if recomputed is not None:
        findings.warn(recomputed == tokens, f"review_tokens {tokens:,} differs from the {recomputed:,} tokens "
                                            f"that review_files size to; the route uses the reported number")
    if tokens < FLOOR:
        require(report.get("review_type") == "self", f"Review type must be self below {FLOOR:,} tokens")
        return
    require(report.get("review_type") == "independent", "Review type is not independent")
    reviewers = report["reviewer"] if isinstance(report["reviewer"], list) else [report["reviewer"]]
    require(all(isinstance(name, str) and name and name != report["author"] for name in reviewers)
            and len(reviewers) == len(set(reviewers)), "False independent review")
    pieces = -(-tokens // CEILING)
    require(len(reviewers) == 1 if pieces == 1 else len(reviewers) >= pieces,
            f"Review needs {pieces} reviewer(s) of {CEILING:,} tokens or less")


def review_test_policy(report):
    """Check the shape of the reviewer's test-policy record, not whether its evidence is true."""
    policy = report.get("test_policy")
    require(isinstance(policy, dict), "Round test_policy must be an object")
    check = policy.get("tautology_check")
    require(isinstance(check, dict), "test_policy.tautology_check must be an object")
    require(check.get("verdict") == "PASS", "test_policy.tautology_check verdict is not PASS")
    evidence = check.get("evidence")
    require(isinstance(evidence, str) and meaningful(evidence),
            "test_policy.tautology_check needs non-placeholder evidence")
    require("[INFERRED]" not in evidence.upper(), "Inferred evidence supports test_policy.tautology_check")
    dropped = policy.get("dropped_tests")
    require(isinstance(dropped, list),
            "test_policy.dropped_tests must be a list, empty when no candidate was dropped")
    names = set()
    for number, row in enumerate(dropped, 1):
        require(isinstance(row, dict) and all(isinstance(row.get(key), str) and meaningful(row[key])
                                              for key in ("test", "reason")),
                f"test_policy.dropped_tests row {number} needs a non-placeholder test and reason")
        name = row["test"].strip()
        require(name not in names, f"Duplicate test_policy.dropped_tests test: {name}")
        names.add(name)


def located(text, repositories):
    """A `path:line` citation, prefixed with a selected repo_id when checks.md names repositories."""
    if not repositories:
        return bool(re.search(r"[^\s:]+:\d+\b", text))
    return any(re.search(rf"\b{re.escape(identity.split(':', 1)[0])}:[^\s:]+:\d+\b", text)
               for identity in repositories)


def complete(folder, checked, bindings_path, findings):
    multi = bool(checked["repositories"])
    if multi:
        require(bindings_path is not None, "Complete stage needs --bindings for the repositories checks.md names")
        bindings = json.loads(bindings_path.read_text(encoding="utf-8"))
        require(isinstance(bindings, dict), "Invalid bindings")
    else:
        require(bindings_path is None, "checks.md names no repositories, so run the complete stage without "
                                       "--bindings from the repository's Git root")
        bindings = {}
    review_dir = folder / "execution" / "reviews"
    rounds = [(int(match.group(1)), path) for path in review_dir.glob("round-*.json")
              if (match := re.fullmatch(r"round-([1-9]\d*)\.json", path.name))]
    require(rounds, "Missing review round")
    number, round_path = max(rounds)
    report = json.loads(round_path.read_text(encoding="utf-8"))
    require(report.get("round") == number, "Round number differs from filename")
    require(report.get("feature_id") == folder.resolve().name,
            f"Round feature_id must equal the feature folder name {folder.resolve().name}")
    for key in ("project", "repository"):
        require(isinstance(report.get(key), str) and report[key].strip(), f"Round {key} must be a non-empty string")
    for name in ("plan.md", "checks.md"):
        if (folder / name).exists():
            digest = hashlib.sha256((folder / name).read_bytes()).hexdigest()
            require(report.get(name[:-3] + "_sha256") == digest, f"Stale review: {name} changed")
    require(report.get("ui") == checked["ui"], "UI mismatch")
    review(report, bindings, findings)
    require(report.get("verdict") == "PASS", "Overall review is not PASS")
    if checked["ui"] == "yes":
        evidence = report.get("ui_evidence")
        require(isinstance(evidence, list) and evidence and all(
            isinstance(row, dict) and row.get("verdict") == "PASS"
            and "[INFERRED]" not in json.dumps(row, sort_keys=True).upper()
            and all(isinstance(row.get(key), str) and meaningful(row[key])
                    for key in ("screen", "source", "observed", "states"))
            for row in evidence), "UI review needs passing screen evidence")
        screen_names = [row["screen"] for row in evidence]
        require(len(screen_names) == len(set(screen_names)) and set(screen_names) == checked["screens"],
                "UI screen evidence differs from the Screens inventory")
    checkpoints = report.get("checkpoints")
    require(isinstance(checkpoints, list) and checkpoints, "Empty checkpoints")
    ids = [row.get("id") for row in checkpoints if isinstance(row, dict)]
    require(len(ids) == len(checkpoints) and len(set(ids)) == len(ids)
            and set(ids) == checked["checks"], "Checkpoint IDs differ from checks")
    heads = [row.get("head") for row in report.get("repositories") or [] if isinstance(row, dict)]
    for row in checkpoints:
        require(row.get("verdict") == "PASS", f"Checkpoint is not PASS: {row.get('id')}")
        require("[INFERRED]" not in json.dumps(row, sort_keys=True).upper(),
                f"Inferred evidence supports PASS: {row['id']}")
        for key in ("expected", "observed", "implementation", "assertion"):
            require(isinstance(row.get(key), str) and meaningful(row[key]),
                    f"Unproven checkpoint {row['id']}: {key}")
        basis = row.get("basis")
        if number > 1 or basis is not None:
            match = BASIS.match(basis) if isinstance(basis, str) else None
            require(match, f"Checkpoint {row['id']} needs basis `verified at <sha>` or `carried from <sha>` "
                           f"after a fix")
            require(match.group(1) == "carried from" or any(
                isinstance(head, str) and head.startswith(match.group(2)) for head in heads),
                f"Checkpoint {row['id']} is verified at a SHA that is not a reviewed HEAD")
        if report.get("kind", "behavior") == "behavior":
            for citation in (row["implementation"], row["assertion"]):
                require(located(citation, checked["repositories"]), f"Unlocated proof in {row['id']}")
        proofs = row.get("proofs")
        require(isinstance(proofs, list) and proofs, f"Missing proof results in {row['id']}")
        commands = [proof.get("command") for proof in proofs if isinstance(proof, dict)]
        require(len(commands) == len(proofs) and len(commands) == len(set(commands))
                and set(commands) == checked["proofs"][row["id"]],
                f"Proof commands differ from checks in {row['id']}")
        for proof in proofs:
            require(proof.get("exit_code") == 0 and proof.get("tests_failed") == 0
                    and isinstance(proof.get("tests_run"), int) and proof["tests_run"] >= 0,
                    f"Failed proof in {row['id']}")
            skipped = proof.get("tests_skipped", 0)
            require(isinstance(skipped, int) and skipped >= 0
                    and (skipped == 0 or meaningful(str(proof.get("skipped_reason", "")))),
                    f"Skipped proof needs explanation in {row['id']}")
        if report.get("kind", "behavior") == "behavior":
            require(any(proof["tests_run"] > proof.get("tests_skipped", 0) for proof in proofs),
                    f"No test ran for {row['id']}")
    gates = report.get("gates")
    require(isinstance(gates, list) and gates, "Missing gates")
    for gate in gates:
        require(isinstance(gate, dict) and meaningful(str(gate.get("command", "")))
                and gate.get("exit_code") == 0
                and isinstance(gate.get("tests_run", 0), int) and gate.get("tests_run", 0) >= 0
                and gate.get("tests_failed") == 0, "Failed gate")
        skipped = gate.get("tests_skipped", 0)
        require(isinstance(skipped, int) and skipped >= 0, "Invalid skipped test count")
        require(skipped == 0 or meaningful(str(gate.get("skipped_reason", ""))),
                "Skipped tests need an explanation")
        require(not gate.get("test_required") or gate.get("tests_run", 0) > skipped,
                "Empty required test gate")
    kind = report.get("kind", "behavior")
    require(kind in ("behavior", "docs"), "Invalid change kind")
    mutations = report.get("mutations", [])
    require(isinstance(mutations, list), "Invalid mutations")
    if kind == "behavior":
        require(mutations, "Behavior change needs a mutation")
        critical = report.get("critical_mutation_path") is True
        if critical:
            reason = report.get("critical_mutation_reason")
            require(isinstance(reason, str) and meaningful(reason),
                    "Critical mutation path needs a reason")
        require(len(mutations) <= (5 if critical else 3), "Mutation budget exceeded")
    else:
        document_checks = report.get("document_checks")
        require(isinstance(document_checks, list) and document_checks and all(
            isinstance(row, dict) and meaningful(str(row.get("path", "")))
            and meaningful(str(row.get("command", ""))) and row.get("exit_code") == 0
            and row.get("verdict") == "PASS"
            for row in document_checks), "Docs change needs passing document checks")
    require(all(isinstance(row, dict) and row.get("detected") is True
                and row.get("survived") is not True for row in mutations), "Surviving mutation")
    mutation_ids = [row.get("id") for row in mutations]
    require(len(mutation_ids) == len(set(mutation_ids)), "Duplicate mutation ID")
    for row in mutations:
        require(all(isinstance(row.get(key), str) and meaningful(row[key])
                    for key in ("id", "location", "change", "tests"))
                and "[INFERRED]" not in json.dumps(row, sort_keys=True).upper(),
                "Incomplete mutation evidence")
        require(located(row["location"], checked["repositories"]), "Unlocated mutation")
    review_test_policy(report)

    repositories = report.get("repositories")
    require(isinstance(repositories, list) and repositories, "Missing report repository rows")
    if not multi:
        row = repositories[0]
        require(len(repositories) == 1 and isinstance(row, dict), "A single-repository round has one repository row")
        require("repo_id" not in row and "checkout_id" not in row,
                "checks.md names no repositories, so the round's repository row omits repo_id and checkout_id")
        root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel",
                        message="Run the complete stage from inside the feature's Git repository").decode().strip())
        head, digest = fingerprint(root)
        require(row.get("head") == head and row.get("fingerprint") == digest, f"Stale review: {root}")
        return finish(folder, round_path, report, checked, number)
    identities = []
    for row in repositories:
        require(isinstance(row, dict), "Invalid report repository row")
        identity = f'{row.get("repo_id", "")}:{row.get("checkout_id", "")}'
        require(identity in checked["repositories"] and identity not in identities,
                f"Unknown or duplicate report repository: {identity}")
        identities.append(identity)
        require(identity in bindings, f"Missing local binding: {identity}")
        root = Path(bindings[identity]).resolve()
        require(root.is_dir(), f"Missing selected repository: {identity}")
        head, digest = fingerprint(root)
        require(row.get("head") == head and row.get("fingerprint") == digest,
                f"Stale review: {identity}")
    require(set(identities) == checked["repositories"], "Missing report repository row")
    return finish(folder, round_path, report, checked, number)


def finish(folder, round_path, report, checked, number):
    """Check that verification.md summarizes the saved round."""
    summary = (folder / "verification.md").read_text(encoding="utf-8")
    expected_round = f"execution/reviews/{round_path.name}"
    require(field(summary, "Round") == expected_round, "Verification summary names wrong round")
    require(field(summary, "SHA256") == hashlib.sha256(round_path.read_bytes()).hexdigest(),
            "Verification summary has stale round hash")
    require(field(summary, "Verdict") == "PASS", "Verification summary verdict differs")
    require(field(summary, "UI") == checked["ui"], "Verification summary UI differs")
    expected_review = "self-reviewed" if report.get("review_type") == "self" else "independent"
    require(field(summary, "Review") == expected_review, f"Verification summary Review must say {expected_review}")
    return number


def run(folder, stage, bindings_path, findings):
    folder = Path(folder)
    require(folder.is_dir(), f"Missing feature folder: {folder}")
    require(stage in STAGES, f"Unknown stage: {stage}")
    has_plan = (folder / "plan.md").exists()
    require(has_plan or stage != "plan",
            "Missing plan.md; a small change has only checks.md, so validate it with --stage checks")
    planned = plan(folder, findings) if has_plan else None
    findings.stop()
    if stage == "plan":
        return f"Plan OK: {len(planned['criteria'])} criteria"
    checked = checks(folder, planned, findings)
    findings.stop()
    if stage == "checks":
        return f"Checks OK: {len(checked['checks'])} checks"
    number = complete(folder, checked, Path(bindings_path) if bindings_path else None, findings)
    findings.stop()
    return f"Feature OK: {len(checked['checks'])} checks, round {number}"


def execution(folder, stage="complete", bindings_path=None):
    """Validate one stage, print its warnings and result, and return the warnings."""
    findings = Findings()
    try:
        message = run(folder, stage, bindings_path, findings)
    finally:
        for warning in findings.warnings:
            print(f"  WARN  {warning}")
    print(message)
    return findings.warnings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("folder", type=Path, help="Feature root containing checks.md and, unless small, plan.md")
    parser.add_argument("--stage", choices=STAGES, required=True)
    parser.add_argument("--bindings", type=Path, help="Local repo_id:checkout_id to path JSON")
    args = parser.parse_args()
    try:
        execution(args.folder, args.stage, args.bindings)
    except (ValueError, KeyError, TypeError, FileNotFoundError, json.JSONDecodeError, OSError) as error:
        parser.exit(1, f"Validation failed: {error}\n")


if __name__ == "__main__":
    main()
