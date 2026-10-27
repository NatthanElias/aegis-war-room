---
name: generate-roadmap
description: "Roadmap a PoC, an MVP, or the next phase of an existing project, with a fixed deadline, into parallel developer fronts before any feature planning. Use to scope an MVP or PoC, plan a project's next phase or version, split work between developers, or update or close the roadmap at a milestone."
---

# Generate a roadmap

Turn a closed-scope project, or the next phase of an existing one, into `docs/roadmap/ROADMAP.md`, `docs/roadmap/STORIES.md`, and `docs/roadmap/DECISIONS.md`. The roadmap splits the work into fronts, one per developer, so AI-assisted developers build in parallel and preferably never edit the same file. Each developer then plans and builds the features of their front, using the stories as accepted input.

The roadmap decides only what crosses fronts: the goal, the deadline, the team, who owns what, the shared contracts, the order, and the cut line. Acceptance criteria, checks, and code-level design belong to each feature's plan.

A roadmap needs a goal and a fixed date. Ongoing work with neither, such as a stream of bugs and small improvements, is not a phase: plan each item with feature-workflow instead.

## Words used here

- **Phase.** One roadmap, from its kickoff to its deadline. A new project's first roadmap is phase 1. Each later phase plans the next stretch of an existing product, and a finished phase is archived under `docs/roadmap/phases/`.
- **Front.** A part of the project that one developer, or one pair, owns until the deadline. It owns modules, folders, or repositories that no other front edits.
- **Demo story.** The one end-to-end thing the team shows at the deadline. It decides what is Must.
- **Cut line.** The boundary between what ships and what waits. The date stays fixed, and the cut line moves up when time runs short.
- **User story.** A Must or Should feature told from the view of a person who uses the product or is affected by it, such as a customer, an operator, or a presenter. Never the developer, an AI agent, or the system.
- **Enabler.** A Must or Should feature that only the team would notice, such as a bare walking skeleton, groundwork, a test suite, or a deployment pipeline. It gets an `EN-NN` ID instead of a user story.
- **Contract.** Anything one front provides and another uses, such as an API, an event, a shared type, or a table.
- **Walking skeleton.** Milestone 0 of a new project. A thin path through every layer, with the repository, build, and test runner working.
- **Groundwork.** Milestone 0 of a later phase: the changes to existing shared files and existing contracts that more than one front needs, made once before the fronts split. A phase that needs none has no milestone 0.

## Ask the team

Ask through the Codex question tool (`request_user_input_async` or `request_user_input`, whichever the current mode exposes), one decision per question, each with a recommended option. The team may never have planned a project, so explain each option in plain words with its consequence.

At the start of every run, including a checkpoint or a phase close, ask which language the team wants for the generated documents. Confirm the choice even when the input or existing documents specify a language. Recommend that language when available, or the language of the user's request otherwise.

Use the confirmed language for all prose in `ROADMAP.md`, `STORIES.md`, and `DECISIONS.md`, including headings, table text, story scenarios, and diagram labels. Preserve filenames, link targets, identifiers, code references, machine-readable syntax, and decision tags. When the team selects a different language at a checkpoint, update the roadmap's recorded language and translate existing prose.

Done when the team has confirmed the output language for this run, before any document is drafted or updated.

## Steps

If `docs/roadmap/ROADMAP.md` already exists, choose the run with [Existing roadmap](#existing-roadmap) instead.

### 1. Read the input

Accept any input: a brief, a PRD, a discovery package, a phase goal, or a chat description.

Propose the mode, and ask the team to confirm it. The mode is **next phase** when the project already has application code or an archived phase under `docs/roadmap/phases/`, and **new project** otherwise. An existing project with no archived phase starts at phase 1 in next-phase mode.

In a next phase, also read the module and repository layout, starting from `docs/workspace/overview.md` where present, and the most recent archived phase. List that phase's unfinished, cut, and Won't features as candidates. A candidate keeps its slug and its story or enabler ID but no priority, so step 4 sorts it again against the new demo story.

Done when the team has confirmed the mode, every feature the input names and every candidate is listed, and you know which of goal, deadline, and team the input leaves open.

### 2. Fill the gaps

Ask how many developers are enrolled every time, with their names or labels. When the input states a number, ask the team to confirm it. Ask for the demo goal and the deadline when the input lacks them. Ask about other gaps only when a later step needs the answer.

Done when the team has confirmed the developer count, the deadline, and the demo goal.

### 3. Agree the demo story

Propose one demo story: who uses the product, what they do, and what they see at the end. Fit it to the deadline. In a next phase, the demo story shows what works at the deadline that does not work today.

Done when the team has confirmed one demo story.

### 4. Sort and size the scope

Sort every feature, candidates included, into Must, Should, Could, and Won't. A Must is a feature the demo story breaks without. Size each Must, Should, and Could as S, M, or L relative to the others, never in hours. Order the Should and Could items by which to cut first. Give each new feature a short lowercase slug that names it in both documents. A candidate keeps its slug.

Ask the team whether the Must items fit in about 60% of the time budget. The rest absorbs review, integration, and surprises, which stay at human pace with AI help. If the Musts look bigger, propose a smaller demo story or a thinner version of a Must, and let the team choose. Plan against the date the team gave and move the cut line, never the date.

Done when every feature has a priority, every Must, Should, and Could has a size, the team has confirmed each Won't and the cut order, and the 60% question has an answer.

### 5. Plan milestone 0

In a new project, make milestone 0 a walking skeleton through the demo story. It also creates the shared structure the fronts will add to, such as module folders, route registration, and the migration layout, so later fronts add files instead of editing shared ones. The build and test commands come from this milestone, and it is the first feature planned with feature-workflow, which carries the walking-skeleton obligations. Fronts split after it.

In a next phase, make milestone 0 the groundwork: the changes to existing shared files and existing contracts that more than one front needs, such as a new module folder, a route registration change, or a changed shared type. One developer builds it as a feature planned with feature-workflow, and fronts split after it. New contracts follow step 7 instead. When the phase changes no shared file or existing contract, propose skipping milestone 0, and the fronts split at the kickoff.

Done when milestone 0's path or changes, the shared structure it creates, and the developer who builds it are named, or the team has confirmed that this phase has no milestone 0.

### 6. Cut the fronts

Cut fronts along the code's ownership boundaries: modules, packages, folders, or repositories. Prefer a front that delivers a working part of the demo story through each layer it needs over a front that builds one layer for others, so every front can show progress at a milestone.

List the files several fronts would touch, such as route tables, dependency configuration, the build file, migrations, and shared types. Give each one an owner front and a rule for the other fronts, or turn it into a contract.

Create a front only where the work supports one: its own owned code and enough Must and Should work to last to the deadline. Use no more fronts than developers. When developers outnumber safe fronts, pair the extras on the largest front or give them a support front for integration, tests, or the demo environment. Every front exists because the work has it, never to keep a developer busy. With one developer, write one sequential front. The roadmap still holds the demo story, the cut line, and the milestones.

Done when every Must and Should feature belongs to exactly one front, every owned path and shared file has exactly one owner front, and the team has confirmed each front's owner.

### 7. Name the contracts and set the milestones

For each contract between fronts, name it, its owner front, and the fronts that use it. The owner front defines and stubs the contract as its first feature, so the fronts that use it can start right away. A later change needs the agreement of every front that uses it.

A front that needs an unbuilt contract builds against the stub. The roadmap shows the blocker in that front's status until the next checkpoint.

After milestone 0, write each milestone as a demoable outcome, something the team can show working, with its target date in a separate field. The last milestone is the demo story on the deadline.

Done when every contract has one owner and named users, every front dependency points at a contract or a milestone, and every milestone has an outcome and a date.

### 8. Write the stories

Write one user story per Must and Should feature that a person who uses the product would notice, with an ID such as `US-01`. The role names that person, as the demo story or the input names them, and the benefit is what that person gains. Never write a story as the developer, an AI agent, or the system. When a feature reaches a user through an agent, the story names the user, such as "As an operator, I want failed payments summarized by category, so that I see the pattern first."

Write an enabler, with an ID such as `EN-01`, for a Must or Should feature that only the team would notice, and name the stories it enables. Use an enabler only when no user role fits without bending the story. A one-command startup the input asks for is a user story for whoever runs the product, not an enabler.

Give each story and enabler one to three Given-When-Then scenarios: the happy path and the main failure. Check each user story against INVEST:

- **Independent.** It depends on other stories only through a contract or a milestone.
- **Negotiable.** It states the need, not the design. The feature plan decides how.
- **Valuable.** The benefit reaches the role, not the team.
- **Estimable.** The team could give it a size.
- **Small.** It fits its front before its milestone. Split an L that does not.
- **Testable.** Every Then is a result someone can observe.

Check an enabler against the same list except Valuable.

Keep any story IDs the input already has exactly as given. IDs stay fixed for the life of the project, so a cut story or enabler keeps its ID and moves to Won't. In a next phase, a candidate keeps its ID, and a new story or enabler takes the next ID in its series after the highest one in any phase.

Done when every Must and Should feature has one user story or one enabler with a happy-path scenario, every user story passes INVEST, and every ID sits under exactly one front.

### 9. Build the schedule

Ask the team how sizes become working days, with S as 1 or 2 days, M as 3, and L as 5 as the recommended option. The day counts live only in the chart and its assumptions, and the Scope table keeps S, M, and L. Ask for the holidays between the start and the deadline.

Draft the Gantt chart for the Schedule section by the [schedule rules](references/templates.md#schedule-rules). Then walk the chart day by day for each developer, and reorder tasks until nobody holds two on the same day. When the dates work only with a staffing change, such as splitting a pair, ask the team, then update the front's owner and log the decision in `DECISIONS.md`.

Done when the team has confirmed the size mapping, every Must, Should, and Could slug appears in the chart exactly once, no developer holds two tasks on one day, and the tasks each milestone needs end on or before its date.

### 10. Write the documents

Fill the [templates](references/templates.md) into `docs/roadmap/ROADMAP.md`, `docs/roadmap/STORIES.md`, and `docs/roadmap/DECISIONS.md`. In a next phase, add to the existing `DECISIONS.md`, and list every archived phase in the roadmap's Previous phases line. Log in `DECISIONS.md` each choice the team made during the interview that changes something the roadmap records, such as the output language, the demo story, the cut order, a thinned Must, the size mapping, or a staffing change, by the [decision log rules](references/templates.md#decision-log-rules). Those rules also add a `team D-NN` constraint record for each choice that binds code. All three are reference pages for people, so apply `technical-writing` and `unslop` to them, keeping the decision markers those rules protect. Keep the files in version control so every developer reads the same plan, and ask before committing.

Done when every template section is filled, or states `None` with a reason, and every choice from the interview that the roadmap records has a line in `DECISIONS.md`.

### 11. Check and present

Check the three documents against this list:

1. The team confirmed one demo story.
2. The demo story needs every Must.
3. The team confirmed every Won't and the cut order.
4. The roadmap records whether the Musts fit in about 60% of the time budget.
5. Milestone 0 is a walking skeleton in a new project, and groundwork or absent in a next phase. Every milestone is a demoable outcome with a date, and the last one is the demo story on the deadline.
6. The fronts number no more than the developers, and every developer owns a front, pairs on one, or runs a support front.
7. Every owned path and shared file has one owner front.
8. Every contract has one owner front and named users.
9. Every Must and Should feature has one user story or one enabler whose ID sits under one front. Every user story's role is a person who uses the product or is affected by it, and the story passes INVEST. Every enabler names the stories it enables.
10. The roadmap holds no acceptance criteria, checks, or code-level design.
11. The schedule chart lists every Must, Should, and Could slug exactly once, no developer holds two tasks on one day, and the tasks each milestone needs end by its date.
12. The schedule assumptions state the size-to-days mapping the team confirmed.
13. Every `DECISIONS.md` line changes something the roadmap records, has a unique `D-<NN>` ID and one tag, is one sentence in the decision formula, and sits under its date and occasion. Active holds only decisions in force. Each `[CHANGED]` line ends with `(replaces D-<NN>)`, and the line it names sits in Replaced ending with `(replaced by D-<NN>)`. When feature-workflow is installed, every active decision that binds code has a record under `.specs/constraints/` whose origin names its `D-<NN>`.
14. The team confirmed the output language for this run, the roadmap records it, and all three documents use it.
15. In a next phase, every candidate has a priority, every candidate keeps its story or enabler ID, every new ID is higher than any earlier one in its series, and the Previous phases line links every archived phase.

Present the fronts, contracts, cut line, milestones, and schedule to the team.

Done when every item passes and the team has the documents.

## Existing roadmap

Read `docs/roadmap/ROADMAP.md`. When its deadline has passed or its last milestone is done, propose [Close the phase](#close-the-phase). Otherwise, propose [Checkpoint](#checkpoint). Ask the team to confirm.

Done when the team has confirmed which run to do.

## Close the phase

1. Read `docs/roadmap/ROADMAP.md`, `docs/roadmap/STORIES.md`, and `docs/roadmap/DECISIONS.md`. Ask each front owner for final status, and record in the Scope and Milestones tables what shipped and what did not.
2. Number the phase one higher than the last folder under `docs/roadmap/phases/`, or `01` when there is none, and give it a short lowercase slug from its demo story. Move `ROADMAP.md` and `STORIES.md` into `docs/roadmap/phases/<NN>-<slug>/` with `git mv`. In the moved roadmap, point the Decisions section at both the phase's own `DECISIONS.md` and `../../DECISIONS.md`.
3. Create `docs/roadmap/phases/<NN>-<slug>/DECISIONS.md` from the DECISIONS.md template, and move every Replaced line into it.
4. For each Active decision, ask the team whether it still applies after this phase. Recommend archiving decisions that concerned only this phase, such as its demo story, deadline, cut order, thinned Musts, size mapping, and staffing. Recommend keeping decisions that still apply, such as the output language or the stack. A decision with a `team D-<NN>` constraint record under `.specs/constraints/` stays Active while that record exists. Move each archived line into the phase's `DECISIONS.md`, under its original date and occasion.
5. Move every line unchanged, ID and pointers included. IDs are never reused, so a pointer such as `(replaces D-<NN>)` still names one decision after its target moves.
6. Plan the next phase with [Steps](#steps) from step 1, in next-phase mode, with the archived phase as input.

Done when the phase folder holds its `ROADMAP.md`, `STORIES.md`, and `DECISIONS.md`, the top-level `DECISIONS.md` has an empty Replaced section and holds in Active only the decisions the team kept, and the next phase's documents pass [Check and present](#11-check-and-present).

## Checkpoint

Run at each milestone, or when the team asks.

1. Read `docs/roadmap/ROADMAP.md`, `docs/roadmap/STORIES.md`, and `docs/roadmap/DECISIONS.md`. Ask each front owner for status.
2. If `ROADMAP.md` still holds its decisions inline, in a section such as `## Decision log` in any language, migrate them to `DECISIONS.md` by the [decision log rules](references/templates.md#decision-log-rules). Keep each date and occasion group, rewrite each bullet as one decision line, and assign IDs oldest first. Move each replaced decision to Replaced with two-way links. An old bullet cut down to `<Topic>: replaced on <YYYY-MM-DD>` gets its full sentence back from the git history of `ROADMAP.md`. Then replace the inline section with the Decisions pointer from the ROADMAP.md template. In any decision line whose connecting words are not in capitals, capitalize them and change nothing else.
3. Check `STORIES.md` against [step 8](#8-write-the-stories). Rewrite a story whose role is the developer, an AI agent, or the system for the person who uses the result, and keep its ID. When only the team would notice the feature, propose turning the story into an enabler with the next `EN` ID. Its `US` ID is retired and never reused, and the enabler records it as `Formerly US-<NN>.` Update the IDs in the Scope table, the front, and the schedule chart. Ask the team to confirm each change.
4. Update the status of each front and milestone, with every open blocker.
5. Compare the remaining work with the remaining time. If it does not fit, propose moving the cut line up: cut in the agreed order first, then thin a Must. Keep the date. Ask the team to confirm each new cut.
6. If developers joined or left, cut the fronts again with step 6.
7. Re-plan the schedule with step 9 from the current status: tag finished tasks `done`, start open tasks no earlier than today, and remove cut features.
8. Log each decision in `DECISIONS.md`, including each cut and each staffing change, by the [decision log rules](references/templates.md#decision-log-rules), which also cover a decision that replaces an older one and the `team D-NN` constraint record for a decision that binds code. `DECISIONS.md` stays for people. Update the checkpoint date.

Done when every front and milestone has a current status, every story and enabler follows step 8, the team has confirmed each new cut, the schedule reflects the current status, no decision remains inline in `ROADMAP.md`, and `DECISIONS.md` has today's entries.
