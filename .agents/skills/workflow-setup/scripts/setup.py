"""Preview and apply selected team settings without overwriting local edits."""

import argparse
import hashlib
import json
import re
from pathlib import Path

import configuration
import harness

ROOT = Path(__file__).resolve().parents[4]
TEMPLATE = Path(__file__).resolve().parents[1] / "templates" / "instructions.template.md"
SELECTION = "docs/harness/setup-selection.json"
# Context: feature-workflow retired this decisions table; setup points a project holding it to constraints.py migrate.
LEGACY_STATE = ".specs/STATE.md"
COMMITS = "Local commits under an approved plan; push, force-push, deploy, and production data need explicit approval"
REPO_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
PART = re.compile(r"<!-- setup:([a-z]+) -->\n(.*?)<!-- /setup:\1 -->", re.S)
LIMIT = 120
CODE_CHANGES = "code, configuration, dependency, build, or test changes"


def digest(content):
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def single_line(value):
    # splitlines also breaks on \r, \x85,  , and other separators.
    return isinstance(value, str) and value.splitlines() == [value]


def portable(path):
    if (not single_line(path) or "\\" in path or ":" in path or "|" in path or "`" in path or "<!--" in path
            or "-->" in path or path.startswith("/") or ".." in path.split("/")):
        raise ValueError(f"Use a relative repository path: {path!r}")
    return path


def one_line(value, what, banned=()):
    if (not single_line(value) or not value.strip()
            or any(text in value for text in ("<!--", "-->") + banned)):
        raise ValueError(f"Invalid {what}: {value!r}")
    return value.strip()


def rows(items, first):
    for item in items:
        if not isinstance(item, dict) or set(item) != {first, "start"}:
            raise ValueError(f"Give each row only {first} and start: {item!r}")
        yield one_line(item[first], first, ("|",)), portable(one_line(item["start"], "start path"))


def check_length(text, name):
    count = len(text.splitlines())
    if count >= LIMIT:
        raise ValueError(f"{name} has {count} lines; keep it under {LIMIT}")


def missing_ignores(path, settings, skills):
    """Return the .gitignore entries setup still needs: `.local/`, and the feature folder root when selected."""
    entries = [".local/"]
    if "feature-workflow" in skills:
        root = portable(settings.get("feature_root", ".specs/features/<feature>/")).split("<feature>")[0]
        entries.append(root.rstrip("/") + "/")
    present = {line.strip().strip("/") for line in path.read_text(encoding="utf-8").splitlines()} \
        if path.exists() else set()
    return [entry for entry in entries if entry.strip("/") not in present]


def entry_text(settings, repository, skills, project, feature_root):
    """Render the always-on file. Context: the text names no harness, so every port renders the same file."""
    brief = settings.get("brief")
    if brief is None:
        brief = "No project brief yet. Run workflow-setup to read the repository."
    elif (not isinstance(brief, str) or not 1 <= len(brief.strip().splitlines()) <= 5
          or "<!--" in brief or "-->" in brief):
        raise ValueError("Write the brief in 1 to 5 lines without HTML comment markers")
    parts = {"brief": "\n".join(line.rstrip() for line in brief.strip().splitlines())}
    table = settings.get("repositories")
    if table is not None and (not isinstance(table, dict) or set(table) - {repository}):
        raise ValueError("Repository rows must name the selected repository")
    mode = "Repositories: single.\n\n"
    if table:
        role, start = next(rows(table.values(), "role"))
        parts["repositories"] = mode + "\n".join(["| Repository | Role | Start reading |", "| --- | --- | --- |",
                                                  f"| {repository} | {role} | `{start}` |"])
    else:
        parts["repositories"] = mode + "No repository row yet. Run workflow-setup to read the repository."
    routes = settings.get("routes")
    if routes is not None and not isinstance(routes, list):
        raise ValueError("List routes as task and start pairs")
    if routes:
        parts["routes"] = "\n".join(["| To | Start at |", "| --- | --- |"] +
                                    [f"| {task} | `{start}` |" for task, start in rows(routes, "task")])
    else:
        parts["routes"] = "No task routes yet. Run workflow-setup to read the repository."
    checks = settings.get("checks", {})
    parts["checks"] = (f"- {repository}: `{one_line(checks[repository], 'check command', ('`',))}`"
                       if repository in checks else f"- {repository}: No command established; validation gap")
    team = [f"- Project ID for lessons and review rounds: {project}.",
            f"- Commits: {one_line(settings.get('commits', COMMITS), 'commit policy').rstrip('.')}.",
            f"- Delegation: {one_line(settings.get('delegation', 'Helpers allowed; parallel writes not allowed'), 'delegation').rstrip('.')}. "
            f"Load the `orchestrate` skill before dispatch, research, or a review of {CODE_CHANGES}."]
    if "feature-workflow" in skills:
        team.append(f"- Feature documents: `{feature_root}`.")
        team.append("- Constraints: before changing code, run feature-workflow's `constraints.py list` for the areas "
                    "and paths you touch, and conform to each record or ask to supersede it. "
                    "`docs/roadmap/DECISIONS.md` is for people, never a coding constraint.")
    documents = settings.get("documents", {})
    for label in documents:
        one_line(label, "document label", (":", "|"))
    if documents:
        team += ["", "| Document | Path |", "| --- | --- |"]
        team += [f"| {label} | `{portable(path)}` |" for label, path in documents.items()]
    team += ["", "Keep personal choices in `.local/`. Ask before push, publication, deployment, or production data "
             "changes."]
    parts["team"] = "\n".join(team)
    entry = re.sub(r"\{\{(\w+)\}\}", lambda match: parts[match[1]], TEMPLATE.read_text(encoding="utf-8"))
    check_length(entry, "The always-on file")
    return entry


def marked(text):
    """Return the marked parts in order, or None when a marker is unpaired or nested."""
    found = PART.findall(text)
    if text.count("<!-- setup:") + text.count("<!-- /setup:") != 2 * len(found):
        return None
    return found


def merge(current, entry, adopted):
    """Put new bodies into the current file; return None without the same markers, plus edited part names."""
    new = dict(PART.findall(entry))
    found = marked(current)
    if found is None or [name for name, _ in found] != list(new):
        return None, []
    edited = [name for name, body in found if body != new[name] and digest(body) != adopted.get(name)]
    return PART.sub(lambda match: f"<!-- setup:{match[1]} -->\n{new[match[1]]}<!-- /setup:{match[1]} -->",
                    current), edited


def check_starts(root, settings):
    top = root.resolve()
    for item in list((settings.get("repositories") or {}).values()) + list(settings.get("routes") or []):
        path = (root / item["start"]).resolve()
        if not path.exists():
            raise ValueError(f"Start path not found under the repository root: {item['start']}")
        if path != top and top not in path.parents:
            raise ValueError(f"Start path leads outside the repository root: {item['start']}")


def proposed(settings, root):
    if settings.get("single_repository") is not True:
        raise ValueError("This port supports one Git repository: set single_repository to true. A multi-repository "
                         "workspace needs the VS Code package's workspace-analysis")
    selected = settings.get("selected_repositories")
    if not isinstance(selected, list) or len(selected) != 1 or not isinstance(selected[0], str):
        raise ValueError("Select exactly one repository ID")
    repository = selected[0]
    if not REPO_ID.fullmatch(repository):
        raise ValueError(f"Use a repository ID of letters, digits, dots, dashes, or underscores: {repository!r}")
    if settings.get("domains", []) != []:
        raise ValueError("The domains setting is retired. Move those rules into a team standards skill or document, "
                         "name it in Team additions, then remove domains from the selection")
    for key in ("package_source", "update_from"):
        if key in settings:
            raise ValueError(f"{key} belongs to the VS Code package sync; remove it from the selection")
    skills = configuration.selected(settings, root)
    if set(settings.get("checks", {})) - {repository}:
        raise ValueError("Checks reference an unselected repository")
    feature_root = portable(settings.get("feature_root", ".specs/features/<feature>/").rstrip("."))
    project = settings.get("project", "project")
    if not isinstance(project, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", project):
        raise ValueError(f"Use a lowercase project ID: {project!r}")
    return skills, entry_text(settings, repository, skills, project, feature_root)


def selection_hash(settings):
    """Fingerprint the accepted selection, which stays in setup-selection.json, so a change reruns setup."""
    return digest(json.dumps(settings, sort_keys=True, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("selection", type=Path, nargs="?", default=Path(SELECTION),
                        help="Reviewed JSON choices; never run untrusted commands from it")
    parser.add_argument("--root", type=Path, help="Repository root; defaults to the one this skill is installed in")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true", help="Apply the reviewed proposal")
    action.add_argument("--validate", action="store_true", help="Validate the installed configuration without writing")
    args = parser.parse_args()
    try:
        root = args.root.resolve() if args.root else ROOT
        entry_path = root / harness.ENTRY
        baseline_path = root / harness.OWNERSHIP
        gitignore_path = root / ".gitignore"
        selection_path = args.selection if args.selection.is_absolute() else root / args.selection
        settings = json.loads(selection_path.read_text(encoding="utf-8"))
        if not isinstance(settings, dict):
            raise ValueError("Give the selection as a JSON object")
        skills, entry = proposed(settings, root)
        for warning in configuration.missing_dependencies(root, skills):
            print(f"Warning: {warning}")
        if "feature-workflow" in skills and (root / LEGACY_STATE).is_file():
            print(f"Notice: {LEGACY_STATE} holds the retired decisions table. Coding agents now follow records under "
                  f".specs/constraints/. Run `python3 {harness.SKILLS}/feature-workflow/scripts/constraints.py "
                  f"migrate`, review the records with the team, then delete {LEGACY_STATE}.\n")
        check_starts(root, settings)
        previous = json.loads(baseline_path.read_text(encoding="utf-8")) if baseline_path.exists() else {}
        if not isinstance(previous, dict):
            raise ValueError(f"Invalid setup ownership file: {baseline_path}")
        count = configuration.validate(root, skills, entry)
        if args.validate:
            if not entry_path.exists():
                raise ValueError(f"{harness.ENTRY} is missing; run setup with --apply")
            current = entry_path.read_text(encoding="utf-8")
            if marked(current) != PART.findall(entry):
                raise ValueError(f"{harness.ENTRY} is out of date; run setup with --apply")
            check_length(current, "The always-on file")
            print(f"Configuration OK: {count} selected skills, {harness.ENTRY}")
            return
        conflicts = []
        merged = entry
        if entry_path.exists():
            current = entry_path.read_text(encoding="utf-8")
            merged, edited = merge(current, entry, previous.get("entry_parts", {}))
            if merged is None:
                merged = entry
                # A file without setup's markers belongs to someone; replace it only if setup wrote it.
                if digest(current) != previous.get("entry_hash"):
                    conflicts.append(current)
            elif edited:
                conflicts.append(current)
        unignored = missing_ignores(gitignore_path, settings, skills)
        unchanged = entry_path.exists() and entry_path.read_text(encoding="utf-8") == merged
        if (not conflicts and not unignored and unchanged and baseline_path.exists()
                and previous.get("selection_hash") == selection_hash(settings)):
            print("No changes")
            return
        print(f"Proposed {harness.ENTRY}:\n" + merged)
        if unignored:
            print("Proposed .gitignore addition: " + " ".join(unignored) + "\n")
        if conflicts:
            print(f"Conflict: {harness.ENTRY} has edits inside setup's marked parts, or has no markers and setup did "
                  "not write it. Setup kept the current file. Move those edits to Team additions or into the "
                  "selection, then rerun.")
            raise ValueError("Resolve the conflict before applying the proposed settings")
        check_length(merged, "The always-on file")
        if not args.apply:
            print("Preview only; pass --apply after approval")
            return
        entry_path.parent.mkdir(parents=True, exist_ok=True)
        entry_path.write_text(merged, encoding="utf-8")
        if unignored:
            existing = gitignore_path.read_text(encoding="utf-8") if gitignore_path.exists() else ""
            separator = "" if not existing or existing.endswith("\n") else "\n"
            gitignore_path.write_text(existing + separator + "".join(f"{line}\n" for line in unignored),
                                      encoding="utf-8")
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(json.dumps({"entry": harness.ENTRY, "entry_hash": digest(merged),
                                             "entry_parts": {name: digest(body) for name, body in PART.findall(entry)},
                                             "selection_hash": selection_hash(settings),
                                             "skills": list(skills)}, indent=2) + "\n", encoding="utf-8")
        print("Applied accepted team choices")
    except (ValueError, KeyError, FileNotFoundError, json.JSONDecodeError) as error:
        parser.exit(1, f"Setup failed: {error}\n")


if __name__ == "__main__":
    main()
