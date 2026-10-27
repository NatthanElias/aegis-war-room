# Roadmap templates

Fill the three templates for the project. Replace every `<placeholder>`, and repeat table rows, sections, and list items as needed. A section with nothing to record states `None` and the reason. Follow the [schedule rules](#schedule-rules) below the ROADMAP.md template and the [decision log rules](#decision-log-rules) below the DECISIONS.md template.

## ROADMAP.md

````markdown
# <Project> roadmap

Last checkpoint: <YYYY-MM-DD>. Stories: <link to STORIES.md>.

Phase <NN>, <new project or next phase>. Previous phases: <a link to each `phases/<NN>-<slug>/ROADMAP.md`, oldest first>, or `None`.

## Goal and demo story

<The problem the project solves, in one or two sentences.>

Demo story: <who uses the product, what they do, and what they see at the end.>

## Constraints

- Output language: <the language confirmed by the team for all three documents>.
- Deadline: <YYYY-MM-DD>. The date is fixed, and the cut line moves when time runs short.
- Developers: <count>, <names or labels>.
- Must budget: <whether the team judged that the Must items fit in about 60% of the time, and what it changed if not>.

## Schedule

The chart spreads the scope features over the fronts in working days, up to the demo on <YYYY-MM-DD>. Only the milestone dates are fixed. The feature dates are a proposal, and the team revises them at each checkpoint.

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "textColor": "#7f7f7f", "titleColor": "#7f7f7f", "taskTextOutsideColor": "#7f7f7f",
    "taskTextColor": "#1f2328", "taskTextLightColor": "#1f2328", "taskTextDarkColor": "#1f2328", "taskTextClickableColor": "#1f2328",
    "taskBkgColor": "#56B4E9", "taskBorderColor": "#0072B2",
    "critBkgColor": "#E69F00", "critBorderColor": "#D55E00",
    "doneTaskBkgColor": "#A0A0A0", "doneTaskBorderColor": "#6E6E6E",
    "activeTaskBkgColor": "#009E73", "activeTaskBorderColor": "#006B4F",
    "todayLineColor": "#D55E00",
    "sectionBkgColor": "#56B4E9", "sectionBkgColor2": "#E69F00", "altSectionBkgColor": "#7f7f7f",
    "excludeBkgColor": "rgba(127, 127, 127, 0.18)", "gridColor": "#7f7f7f"
  },
  "themeCSS": ".grid .tick line{stroke:#7f7f7f;opacity:0.4} text.taskTextOutsideRight,text.taskTextOutsideLeft{fill:#7f7f7f !important} text.taskText{paint-order:stroke;stroke:#56B4E9;stroke-width:4px;stroke-linejoin:round} text.taskText[class*=critText]{stroke:#E69F00} text.taskText[class*=doneText]{stroke:#A0A0A0} text.taskText[class*=activeText]{stroke:#009E73}"
}}%%
gantt
    title <Project>, <MVP or phase NN> until <YYYY-MM-DD>
    dateFormat YYYY-MM-DD
    axisFormat %d/%m
    excludes weekends, <YYYY-MM-DD of each holiday>

    section Milestones
    M0 <Walking skeleton or Groundwork> :milestone, m0, <YYYY-MM-DD>, 0d
    M<n> <outcome>                     :milestone, m<n>, <YYYY-MM-DD>, 0d

    section Milestone 0, <owner>
    <Walking skeleton or Groundwork>   :crit, skel, <YYYY-MM-DD>, <n>d

    section <Front>, <owners>
    <slug> US-02                       :crit, <id>, after skel, <n>d
    <slug> US-05                       :<id>, after <id> <id>, <n>d
    <slug>, Could                      :<id>, after <id>, <n>d
    <derived task>                     :<id>, after <id>, <n>d
```

The schedule rests on these assumptions:

- Sizes become working days: S takes <1 or 2> days, M takes <3>, and L takes <5>.
- The chart skips weekends and <the holidays>.
- The orange bars are the critical path of the Musts. <How many days of slack the chain has before the demo.> Blue bars are the other tasks, green bars are running, and gray bars are done.
- The colors come from the Okabe-Ito palette, which color-blind readers can tell apart. Text outside the bars is mid-gray, readable on both light and dark backgrounds.
- <Each staffing change the dates forced>, or `None`.
- <Each derived task and the risk or milestone it comes from>, or `None`.
- If `<first Could in the cut order>` is cut, `<the Must it waits for>` can start on <YYYY-MM-DD>.
- <Who has slack, and on which dates.>

## Scope

| Priority | Feature | Slug | Size | Stories | Front |
| --- | --- | --- | --- | --- | --- |
| Must | <feature> | `<slug>` | S, M, or L | US-01 | <front> |
| Won't | <feature> | `<slug>` | - | - | - |

Cut order, first to go: <slug>, <slug>.

At a phase close, the Priority column keeps the phase's priorities, and each row records whether the feature shipped.

## Milestones

Leave out the milestone 0 row when the phase has no milestone 0.

| Milestone | Outcome | Target date | Status |
| --- | --- | --- | --- |
| 0 | <Walking skeleton: the thin path through every layer, with build and tests running. Or groundwork: the shared files and existing contracts it changes.> | <YYYY-MM-DD> | <status> |
| <n> | <what the team can show working> | <YYYY-MM-DD> | <status> |

## Fronts

### <Front name>

- Owner: <developer, or the pair>.
- Outcome: <the part of the demo story this front delivers>.
- Owns: <modules, folders, or repositories that only this front edits>.
- Provides: <contracts>, or `None`.
- Uses: <contracts>, or `None`.
- Depends on: <contract or milestone>, or `None`.
- Stories: <US-01, US-02>.
- Status: <on track, at risk, or blocked by what>.

## Shared files

| File | Owner front | Rule for other fronts |
| --- | --- | --- |
| `<path>` | <front> | <for example, add one line per module and ask the owner first> |

## Contracts

| Contract | Owner front | Used by | Status |
| --- | --- | --- | --- |
| <name> | <front> | <fronts> | <planned, stubbed, or built> |

The owner front defines and stubs each contract as its first feature. A change needs the agreement of every front that uses it.

## Risks and assumptions

- <a risk or assumption, and what the team does if it turns out wrong>

## Out of scope

- <what the project leaves out, and why>

## Decisions

Decisions that cross fronts live in <link to DECISIONS.md>.
````

### Schedule rules

- The Schedule section sits between Constraints and Scope in ROADMAP.md. No other file holds the chart.
- Write one `:milestone, m<n>, <date>, 0d` line per row of the Milestones table.
- Write one section per front, named `<front>, <owners>`. Milestone 0 gets its own section, under the developer who builds it. When the phase has no milestone 0, leave out its milestone line and section.
- Label each task with the feature slug and its story ID, such as `checkout-flow US-02`, and append `, Could` to a Could item. A task label never contains `:`, because Mermaid reads the first colon as the start of the task metadata.
- A derived task is work a milestone needs that no slug covers, such as a second batch. Give it a plain label, and name its source in the assumptions.
- Chain tasks with `after`. The first tasks after milestone 0 use `after skel`. With no milestone 0, they start on the kickoff date. `after a b` starts after the later of `a` and `b`. Take the order from the front dependencies, the contracts, and the milestone outcomes, because STORIES.md records no dependencies.
- Tag every task on the Must chain to the demo with `crit`, which renders it orange.
- Put Could items in a developer's waiting gaps, so a Could never delays a Must.
- At a checkpoint, tag finished tasks `done` and running tasks `active`.
- A task that starts after a Friday renders from Saturday and stretches across the excluded days. The working-day count stays right.
- Copy the `%%{init}%%` block from the template unchanged. Readers open the roadmap in both light and dark themes, and the block keeps every label legible on both:
  - Text on the page background is mid-gray `#7f7f7f`, about 4:1 contrast on white and on dark editor backgrounds. Text inside a bar is dark `#1f2328` on an opaque Okabe-Ito fill.
  - Mermaid draws `done` and `active` labels with an `!important` dark fill, so `themeCSS` forces every label outside a bar back to mid-gray.
  - A label wider than its bar spills onto the page. The bar-colored outline in `themeCSS` keeps the spilled part readable.
  - Section bands render at Mermaid's fixed 0.2 opacity, and the weekend bands are translucent gray, so both blend into either background.
- Write every color in the block as a hex value or `rgba()`. Mermaid drops a `themeVariables` value that holds other characters.
- Check that the chart renders, with `npx @mermaid-js/mermaid-cli` or with a local HTML page that loads `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs`. The page needs `<meta charset="utf-8">`, or accented labels render garbled. Render it twice, once with `theme: 'default'` on a white page and once with `theme: 'dark'` on a `#1f1f1f` page. Done when every axis date, section title, task label, and milestone label reads on both.

## STORIES.md

Order stories by ID. A cut story keeps its ID and changes its priority to Won't.

````markdown
# <Project> user stories

Roadmap: <link to ROADMAP.md>.

## US-01 <short title>

Front: <front>. Priority: <Must or Should>. Feature: `<slug>`.

As a <role>, I want <action>, so that <benefit>.

```gherkin
Scenario: <happy path>
  Given <starting state>
  When <action>
  Then <observable result>

Scenario: <main failure>
  Given <starting state>
  When <action>
  Then <observable result>
```
````

## DECISIONS.md

Translate the headings, the legend meanings, the formula's connecting words, and the `replaces` and `replaced by` pointers into the confirmed output language. Keep the IDs and the tags in English.

````markdown
# <Project> decisions

Roadmap: <link to ROADMAP.md>. Each line records one decision that changes something the roadmap records. Filter by tag, for example with `grep "\[BANNED\]" DECISIONS.md`.

| Tag | Meaning |
| --- | --- |
| 🟢 `[CHOICE]` | A voluntary decision between two or more viable alternatives. |
| 🔴 `[BANNED]` | A practice, library, or architecture the team bans because of risk. |
| 🔵 `[REQUIRED]` | Something mandatory by design, compliance, security, or core architecture. |
| 🟡 `[CHANGED]` | A decision that replaces an older one. |

## Active

### <YYYY-MM-DD>

<Occasion, such as the kickoff meeting or the checkpoint>, agreed by <names>:

- D-01 🟢 **[CHOICE]** In the context of *<challenge>*, we chose *<solution>* to achieve *<benefit>*, accepting *<trade-off>*.
- D-03 🟡 **[CHANGED]** In the context of *<challenge>*, we chose *<solution>* to achieve *<benefit>* (replaces D-02).

## Replaced

### <YYYY-MM-DD>

<Occasion>, agreed by <names>:

- D-02 🔵 **[REQUIRED]** In the context of *<challenge>*, we chose *<solution>* to achieve *<benefit>*, accepting *<trade-off>* (replaced by D-03).
````

### Decision log rules

- Log a decision only when it changes something the roadmap records: the output language, the goal or demo story, the deadline or a milestone date, the team or a front's owner, the scope or cut line, or a contract between fronts. Log a technical constraint only when the team agreed it in a roadmap session or checkpoint. A choice one developer makes inside a feature, such as a story's failure behavior or a library choice, goes in that feature's plan, and in a `.specs/constraints/` record when it reaches past the feature. `DECISIONS.md` is for people; coding agents follow the records under `.specs/constraints/`.
- Write each decision as one line of one sentence: `- D-<NN> <emoji> **[<TAG>]** In the context of *<challenge>*, we chose *<solution>* to achieve *<benefit>*, accepting *<trade-off>*.` End the sentence after the benefit when the decision has no real trade-off.
- Pick the one tag from the legend that fits. Write tags uppercase and in English in every project, so a `grep` for the tag finds them.
- Write the connecting words and the slot text in the confirmed output language. In Portuguese the formula reads: `No contexto de *<desafio>*, escolhemos *<solução>* para obter *<benefício>*, aceitando *<trade-off>*.`
- Write directly, in active voice, and start each slot with the action, such as "use Redis" or "encrypt passwords". The roadmap body holds the details, such as the fronts, the milestone dates, and the providers.
- Give each decision the next free ID, `D-01`, `D-02`, and so on, counting the archived phases too. An ID never changes and is never reused.
- In both Active and Replaced, add a `### <YYYY-MM-DD>` heading per date, oldest first. Under the date, add one group per occasion: a meeting, a checkpoint, or one person deciding. Name the occasion and who agreed once, in the group's lead line.
- When a decision replaces an older one, tag the new line `[CHANGED]` and end it with `(replaces D-<NN>)`. Move the older line unchanged to Replaced, under its original date and occasion, and end it with `(replaced by D-<NN>)`.
- When `.agents/skills/feature-workflow/` is installed and an agreed decision also binds code, such as a datastore, a module layout, or a banned library, write a `team D-<NN>` constraint record for it in the same session with feature-workflow's `constraints.py new --origin "team D-<NN>"`, by `.agents/skills/feature-workflow/references/constraints.md`. Give it the scopes and paths it applies to. A `[CHANGED]` line that replaces such a decision gets a new record created with `--replaces <old-slug>`, which deletes the old record. `DECISIONS.md` stays for people and is never a coding constraint.
- At a phase close, Replaced lines and the decisions the team archives move unchanged to `phases/<NN>-<slug>/DECISIONS.md`, as [Close the phase](../SKILL.md#close-the-phase) describes. That file follows this template, and its Roadmap link points at the archived `ROADMAP.md`.
- The tag emojis, the bold tag, and the italic slots are functional markers of this format. Keep them when you apply `unslop`, whose rules on decorative emojis and boldface do not apply to decision lines.
