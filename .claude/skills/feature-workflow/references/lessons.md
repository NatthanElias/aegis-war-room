# Lessons

Lessons are project-local, grounded in immutable review rounds. After every saved round, including FAIL, inspect its `signals`; a clean round adds nothing. A candidate becomes confirmed only after the same mechanism appears in two different features. Load confirmed lessons before planning and building, and check each against current criteria before applying it.

The round's `signals` list is the only source for ingestion. Use `ac_gap` for a failed or uncovered criterion, `spec_precision_gap` for one too vague to assert, `spec_deviation` for a recorded departure tied to a failed check, `surviving_mutant` for `detected: false`, and `gate_fail` for a nonzero gate. Write one imperative sentence about the reusable mechanism that a teammate on another feature can apply. `ingest` rejects a sentence holding the feature ID; a checkpoint, mutation, or signal ID; a commit hash or range; a `file:line` reference; a home, drive, or UNC path, or a path under a well-known system folder such as `/home`, `/Users`, or `/tmp`; a URL; or a `user@host`. Other leading-slash text, such as `/items`, reads as a route and passes, so keep checkout paths out of the sentence yourself.

Choose `--scope` at ingestion: the area where the mechanism applies, such as `apps/web`, a shared contract, or a project concern. It is independent of the round's `scope`, which describes one review. An area is letters, digits, `.`, `_`, and `-`, in segments joined by single `/`, at most 64 characters, and never the feature ID. Two features confirm a lesson when they give the same project, repository, area, and sentence.

Run from the workspace root. The script validates the signal against the cited report and its SHA256 revision, and the round's `feature_id`, `project`, and `repository` against the arguments:

```bash
python3 .claude/skills/feature-workflow/scripts/lessons.py ingest --root <project-root> --report .specs/features/<feature>/execution/reviews/round-<n>.json --revision <sha256> --signal-id <signal id> --signal <type> --feature <feature_id> --project <project> --repository <repo_id> --scope <area> --text "<lesson sentence>"
```

The script stores each lesson as one file, `.specs/lessons/<id>.json`, where the 12-character ID is a hash of the project, repository, area, and normalized text. The file is shared, so it holds only the sentence, the area, the status, and the feature and signal type of each sighting and penalty. Commands, paths, line numbers, report paths, and revision hashes stay in the round file in the git-ignored feature folder. Only the script writes lesson files and `.specs/LESSONS.md`. Commit lesson changes in their own `chore(specs): ...` commit, never inside a feature commit. The script reports `<id>: candidate` or `<id>: confirmed`. To list confirmed lessons, run:

```bash
python3 .claude/skills/feature-workflow/scripts/lessons.py list --root <project-root> --project <project> --repository <repo_id>
```

If a confirmed lesson was loaded and the reviewer finds the same failure, add its ID as `loaded_lesson` to the matching signal and run:

```bash
python3 .claude/skills/feature-workflow/scripts/lessons.py penalize --root <project-root> --lesson-id <id> --report .specs/features/<feature>/execution/reviews/round-<n>.json --revision <sha256> --signal-id <signal id> --signal <type> --feature <feature_id>
```

The round's `feature_id` must equal `--feature`, and its `project` and `repository` must match the lesson's. Penalties from two features quarantine the lesson. Candidates older than 45 days are pruned. `LESSONS.md` is generated: when a merge conflicts in it, resolve the lesson files, then run `lessons.py render --root <project-root>` instead of merging it by hand. If `.specs/lessons/settings.json` has `"enabled": false`, ingestion stops but history and saved rounds remain. Never delete lesson history to disable processing. Record any unprocessed signal and error in `verification.md` or the handoff, and keep its round file for later processing.

A store written by an earlier version copied review evidence into each lesson file, so `ingest`, `penalize`, and `prune` refuse it until it is migrated. `list` and `render` still read it. Migrate it, which strips each file to the fields above and prints `<id>: rescope with --scope AREA` for each lesson whose scope is not an area:

```bash
python3 .claude/skills/feature-workflow/scripts/lessons.py migrate --root <project-root>
```

Then move each flagged lesson to its area. `rescope` merges sightings with a lesson already at the new ID, which can confirm it, and prints `<old id> -> <new id>: <status>`:

```bash
python3 .claude/skills/feature-workflow/scripts/lessons.py rescope --root <project-root> --lesson-id <id> --scope <area>
```

Commit the migrated store in its own `chore(specs): ...` commit.
