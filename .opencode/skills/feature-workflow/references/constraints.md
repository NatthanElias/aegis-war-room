# Constraints

A constraint is a rule a coding agent must follow when it changes code. Each one is a file under `.specs/constraints/`, committed and shared. Coding agents read these records. `docs/roadmap/DECISIONS.md` is for people: it records team agreements, and agents never treat it as a coding constraint.

## Admission test

Write a record only when both hold:

- An agent must conform to it in later features.
- An agent could not infer it from the code.

A naming convention the code already shows fails the test. A choice that reaches past one feature, such as a datastore, a module boundary, or a banned library, passes it. A door this feature closes stays in the plan's `Landing`; when that door also binds later features, it gets a record too.

## Record

The file name is the slug, the record's ID: lowercase letters and digits joined by single dashes, such as `.specs/constraints/money-in-cents.md`. Cite a record by linking its file.

```markdown
# Money is stored in integer cents

- **origin**: feature billing
- **scope**: api, reports
- **paths**: src/api/**, src/reports/*.py
- **date**: 2026-10-20
- **replaces**: money-as-decimal

## Decision

Store every amount as an integer number of cents.

## Why

Float sums drift, and the payment provider sends cents.

## Trade-offs

Display code divides by 100.

## Not decided here

Currency conversion.
```

- The `#` title is a one-line summary that `list` and INDEX.md show.
- `origin` is required: `feature <slug>` for a feature that decided it, `team D-NN[, D-NN]` for a team decision in `docs/roadmap/DECISIONS.md`, or `adr <path>` for an architecture record.
- `scope` is required: one or more lowercase areas, comma-separated, or `global` alone. Use `global` only when no area or paths can express where the rule applies. `check` rejects `global` combined with other scopes and warns above 15 global records.
- `paths` is optional: relative globs, comma-separated, with forward slashes, no `..`, and no leading `/`. A glob `*` also matches `/`.
- `date` is required, as `YYYY-MM-DD`.
- `replaces` names the slug this record supersedes. `legacy-id` holds the `AD-NNN` ID of a migrated row.
- Sections, in this order: `## Decision` and a heading starting with `## Why` are required. `## Trade-offs` and `## Not decided here` are optional: fill them when the decision has a cost or leaves a question open, and delete an empty one. Any other `##` heading fails the check. Keep each section short.
- `[FILL]` marks an unfilled value. There is no status field: a record that exists is active.

## Write

The agent proposes a record and the developer approves it, at plan Landing when a choice reaches past the feature, or at a build stop-and-ask. The roadmap skill writes `team D-NN` records in the session that agrees them. Create the file with `new`, fill every `[FILL]` or delete an optional section that has nothing to say, and commit the record in the feature commit.

## Read

Before writing a plan or checks, run `list` with the areas and paths the change touches. Read every record it prints, global ones included. Conform to each, or propose a superseding record and say why. Ignoring a record silently is never an option.

## Supersede or drop

Delete the old file. A replacement names it with `new --replaces <old-slug>`, which deletes the old file for you. Recover history with `git log --all -- .specs/constraints/<slug>.md`, not by commit hash, since squash and rebase change hashes. There is no archive folder.

## INDEX.md

`render` regenerates `.specs/constraints/INDEX.md` as one table, one row per record, with columns Constraint, Scope, Paths, and Origin. `global` records come first, then the rest sorted by scope and title. On a merge conflict in INDEX.md, run `render`; never merge it by hand. Two records with the same slug conflict as an add/add; rename one.

## Migrate from STATE.md

Projects that kept the retired `.specs/STATE.md` decisions table migrate once:

1. Run `migrate`. Each `active` row becomes `ad-NNN-<words>.md` with its `legacy-id`, scope `global`, and only the Decision and Why sections. Its origin comes from the first match: a feature the row names, then the `D-NN` IDs it cites, then `adr [FILL]` when it mentions an ADR, else `[FILL]`. Superseded rows and IDs that already have a record are skipped. STATE.md stays.
2. With the developer, delete each record that fails the admission test. Set scope and paths, and fill every `[FILL]`.
3. Delete `.specs/STATE.md` and run `check`. `check` fails while STATE.md exists.

A branch that added rows to STATE.md after another branch migrated runs `migrate --since <ref>`, where `<ref>` is the commit before its own rows. Only rows absent at `<ref>` convert. An edited row is printed as refused; supersede its record by hand. A text that cites `AD-NNN` maps to the record holding that `legacy-id`.

## Commands

Run from the project root, or pass `--root <project-root>`:

- `python3 .opencode/skills/feature-workflow/scripts/constraints.py new --slug <slug> --title "<summary>" --origin "<origin>" --scope <areas> [--paths <glob> ...] [--replaces <old-slug>] [--date YYYY-MM-DD]`: write the scaffold with all four sections and re-render INDEX.md. Exits 2 without writing when the slug exists or the replaced record is missing.
- `python3 .opencode/skills/feature-workflow/scripts/constraints.py list [--scope <a,b>] [--paths <path> ...]`: print `<file> [<scopes>]: <title>` for matching records plus every global one; all records without filters.
- `python3 .opencode/skills/feature-workflow/scripts/constraints.py check`: validate every record and INDEX.md before each commit and at feature completion. Prints `<file>: <problem>` and exits 1 on any problem.
- `python3 .opencode/skills/feature-workflow/scripts/constraints.py render`: regenerate INDEX.md.
- `python3 .opencode/skills/feature-workflow/scripts/constraints.py migrate [--since <ref>]`: convert STATE.md rows as above.
