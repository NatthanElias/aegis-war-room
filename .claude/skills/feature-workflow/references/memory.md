# Memory

Three things outlive a session: constraints that bind future features, a handoff for picking work back up, and lessons distilled from real review failures. Constraints and lessons live under `.specs/` and are committed. The handoff lives in the git-ignored feature folder.

## Constraints

Coding constraints are one file per record under `.specs/constraints/`. [Constraints](constraints.md) owns the format, the admission test, and the commands. Run its `list` for the areas and paths a change touches before writing a plan or checks, and conform to each record or propose a superseding one. Propose a new record when a choice reaches past this feature; the developer approves it at plan Landing or at a build stop-and-ask. `Landing` keeps the literal shape this feature closes, and the record keeps the rule later features follow.

### A change the roadmap records

When `docs/roadmap/DECISIONS.md` exists, a plan decision that changes something the roadmap records is a blocker: the goal or demo story, the deadline or a milestone date, the team or a front's owner, the scope or cut line, or a contract between fronts. Name the item and the fronts it affects, and ask the user to agree it with them. Once agreed, append its line to `DECISIONS.md` by the decision log rules in `.claude/skills/generate-roadmap/references/templates.md`. When the change binds code, also add or supersede its `team D-NN` record by [constraints](constraints.md). `DECISIONS.md` is for people, never a coding constraint.

## Handoff

Each feature keeps its own handoff in `execution/handoff.md`, by the [pause handoff](execution-files.md#pause-handoff) format. Nothing committed holds a handoff, so developers on parallel fronts never overwrite one snapshot.

## Resuming work

Follow [Resume](../SKILL.md#resume), and run the constraints `list` for the feature's areas with its files. Evidence wins over a stale snapshot: a handoff written before a crash describes intent, the commits describe fact.

## Lessons

Review failures become reusable guidance through `scripts/lessons.py`, by [lessons](lessons.md). Record them after every saved round, and load the confirmed ones before planning and building.
