# Plan

Create one reviewable `plan.md` before `checks.md` or code. For analysis without an edit request, stay read-only and report the impact and open decisions.

## Ground the plan

Read accepted requirements, relevant historical artifacts, the records the [constraints](constraints.md) `list` prints for the areas and paths you expect to touch, confirmed [lessons](lessons.md), current code, callers, tests, repository instructions, and CI. Name every consumer you did not inspect. In a monolith, find the modules that call each changed module through code-intelligence references, when the session has them, and a text search. Code and conventions show current behavior, while accepted requirements determine intended behavior. When they conflict, name both and ask for the product decision.

Resolve findable facts in this order: code and conventions, project docs, library docs, web, then `[GAP]` or `[INFERRED]` with uncertainty stated. Keep proprietary code and data out of external services. Ask the user for product choices, scope, and genuine tradeoffs. Record safe unanswered defaults under Assumptions; a blocking decision stays marked as a blocker.

Run baseline build, tests, and lint. Put one concise baseline row under Impact with the commands and their source, HEAD, exit codes, and test run, failed, and skipped counts. A failing build or test is a stop unless the user accepts the named baseline failure. An unavailable runtime is BLOCKED, never a passing baseline, except in a [greenfield first feature](#greenfield-first-feature). More than 50 affected files calls for a proposed sub-feature split and user confirmation.

A bet that is still open does not get placed here. When the architecture is genuinely undecided, settle it first with whatever the project uses - an ADR, an RFC, a spike - and link it. The plan records the shape that won.

## Greenfield first feature

A project is greenfield while the always-on instructions' `## Checks` has no command. Its first feature also builds the walking skeleton, so the commands every later feature needs exist when it ends. When `docs/roadmap/ROADMAP.md` exists, this feature is its milestone 0.

- Before the plan, the folder needs a Git repository: run `git init` if it has none. The review fingerprint needs a HEAD, so commit each green slice locally before review.
- Landing records the stack, the persistence, and the module layout as rows, each with its rejected alternative. Propose a record under `.specs/constraints/` for each one by [constraints](constraints.md), because those records outlive the git-ignored feature folder.
- The baseline row reads `None - greenfield`, because no build or test runner exists yet.
- The first slice is a thin end-to-end path through every layer the stack names. The feature creates the build and a test runner with at least one passing test, and its proofs run on that runner.
- The last slice records the new commands. Write them to `checks` in `docs/harness/setup-selection.json`, preview with workflow-setup's `setup.py`, show the team the preview, and rerun it with `--apply` after they approve. Greenfield ends there.

## Write it

The file order below is for reading, not writing. Write the problem, walk the surfaces, write the criteria, then fill the shape. Writing the shape first is how a criterion gets invented to justify a component.

- **Problem without a solution.** Write what is true today that should not be, who pays for it, and what it costs them, in the present tense. "We have no Stripe integration" is the absence of this feature's answer; "anyone evaluating the product has to enter a card first" is a sentence someone can disagree with.
- **Asking.** Lead with your recommendation and one line of why. Ask at most two independent questions per turn, exactly one when they are dependent. State a safe default as an assumption instead of asking.
- **One run must settle it.** A percentile, an average, an uptime or an error rate is a service target, not a criterion: no single execution can satisfy or fail it. Split the line - the behaviour becomes the criterion, and the target lands on the observability dimension of the sweep.
- **A guarantee that something will not happen needs a mechanism.** Point at the code that enforces it, or make it a one-way door in Landing. Where no mechanism exists it is a door or a question, never a criterion standing alone.
- **Never borrow another line's number.** A landing must observe that decision or dimension. A duplicate rejected because a row already exists says nothing about two requests arriving at once; the honest answers are `n/a` with the reason, or a question.
- **What is not a one-way door.** Scope ("V1 does not charge") reverses by doing the next slice and lives in Out of scope. A rule with no mechanism reverses by changing a condition; it becomes a door only once something persisted enforces it. A column or a type is a door when its width is an identifier, its uniqueness decides product behaviour, its nullability over a populated table needs a data migration, or a consumer binds to its name. Other names, indexes, and ordinary types are settled while building.

## File order

Use these headings in order, with concise content. The plan validator reads this numbered list, so a heading renamed here is the one it requires. Keep Criteria and Observable, which it reads by name; the rules for Flow, Impact, Relations, Surface, Landing, and Assumptions run only while those names stay:

1. `## Problem`: present behavior, who it affects, source evidence or its absence, and the changed user outcome.
2. `## Flow`: one sentence on reuse, then ordered hops from input to output or persistence. Name existing modules and modules created by a Landing decision. Use a flowchart only for a fork, fan-out, or asynchronous handoff. Keep this map current as implementation changes.
3. `## Impact`: affected existing behavior, callers and consumers, the calling modules of each changed module interface, domain terms and their current users, stored data, and compatibility. State `None` with a reason when appropriate. A breaking change needs approval before implementation.
4. `## Relations`: only changed stored entities, cardinality, and one-way constraints. Use `None - no stored-data shape change` when applicable. Ordinary columns, types, and a class catalogue belong in code.
5. `## Surface`: only new externally consumed routes or changed signatures, with input, output, and statuses. Use `None - nothing consumed outside` when applicable. Existing unchanged routes belong in Impact or Criteria.
6. `## Landing`: each hard-to-reverse choice, its literal shape, and a rejected alternative with a concrete reason or the forcing constraint. Include persisted constraints, consumer contracts, module public interfaces other modules call, dependencies, backfills, and new patterns others will copy. Use `None - <reason>` when there is no such choice. Propose a [constraint](constraints.md) record for each choice a future feature has to conform to; the user's plan approval approves it. By [memory](memory.md), stop for agreement when a choice changes something the roadmap records.
7. `## Criteria`: numbered across the feature, grouped by vertical slices with a demonstrable outcome. Write every criterion in EARS: `WHEN <trigger> THEN the <system> SHALL <response>`, `WHILE <state> the <system> SHALL`, `WHERE <feature>`, `IF <unwanted condition> THEN`, or `The <system> SHALL` for an invariant. Rewrite accepted wording into EARS without changing its meaning, and keep its upstream ID beside it when one exists; PoC work may have none. Each line states one observable behavior with concrete values. Give UI screens separate empty, loading, error, and unauthorized outcomes where applicable. Under each criterion, write one `Lands in:` line naming the Flow hop, Relations, or Surface where it lands.
8. `## Out of scope`: excluded product capabilities and reasons.
9. `## Assumptions`: a table of assumption, chosen default, rationale, and whether a human confirmed it, then an `Open questions:` line that reads `none` or lists each one marked `blocks`, `blocks go-live`, or `open`.
10. `## Observable`: for each changed screen, API, command, document, or collection, land its exposed decisions on a criterion, current behavior, or `n/a - <reason>`. For UI work, begin with `Screens: <name>, <name>` listing every changed screen by its review name. Screens include state, density, ordering, and destructive confirmation; APIs include response and error shapes, access, versioning, and rate limits; commands include flags, output, exit codes, and partial failure; documents include structure, tone, depth, and what the reader does next; collections include the grouping criterion, naming, ordering, duplicates, and the exception that does not fit. State `None - no user-facing surface` where applicable.
11. `## Sources`: two or three binding sources and what each settles, not a research log.

The five shape sections, Flow through Landing, are bounded maps of decisions, not per-class designs. For each surface decision, record a criterion, existing behavior, or reasoned `n/a`; unresolved requirements remain visible as gaps. Build `checks.md` from the accepted plan, including the nine-dimension sweep in [execution files](execution-files.md).

Once the user approves the plan, its Landing, Relations, and Surface rows are append-only. A changed decision adds a row that supersedes the old one and says why; it never edits the approved row.

## Closure gate

Before presenting the plan, confirm that every criterion has somewhere to land. A criterion whose behaviour crosses no hop in Flow, touches nothing in Relations, and appears on no route in Surface is either out of scope or a gap in the shape. Its `Lands in:` line is the record of that check, and the validator fails a criterion without one or one that lands in a section stated as `None`.

Run `python3 .opencode/skills/feature-workflow/scripts/validate_execution.py .specs/features/<feature> --stage plan`. Present the plan's impact, one-way decisions, assumptions, and blockers for review. If the user already authorized implementation, continue to checks. Otherwise get the plan decision before making behavior changes.
