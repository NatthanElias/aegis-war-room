# Comments

The builder applies these rules to every comment it writes or changes. The verifier checks the comments in the changed code against them. A team standards skill or document named in Team additions may extend these rules; where the two conflict, the team's rule wins.

## Labels

Write inline comments in plain English, whatever language the project's other prose uses. Give each non-obvious decision, constraint, risk, or temporary workaround a label, in the language's comment syntax:

- `Why:` why this implementation or decision is necessary.
- `Hazard:` what could break, become unsafe, or behave unexpectedly if someone changes this code.
- `Context:` a business rule, technical constraint, assumption, or external dependency the code relies on.
- `TODO:` required future work. Write `TODO(<ref>):` when a ticket, issue, or decision ID exists.

```ts
// Why: Requests must be processed sequentially because the provider preserves account-level ordering.
// Hazard: Running these calls concurrently may result in duplicated or out-of-order transactions.
// Context: This is a limitation of the legacy payment provider, not a general application constraint.
// TODO(PROJ-482): Enable parallel processing after migration to the new provider.
await processRequestsSequentially(requests);
```

## Rules

1. Explain why. Leave what the code does to the code.
2. Comment only what clear code cannot say. When a better name or structure in code the slice already changes would carry the meaning, make that change instead of the comment.
3. Put a `Hazard:` before code that is dangerous, fragile, security-sensitive, or easy to misuse: authorization checks, secrets, path handling, ordering, concurrency, idempotency, and data deletion.
4. Use `Context:` for unusual business rules, compatibility requirements, performance constraints, and limits of external systems.
5. State the reason in every workaround, warning, and `TODO`. "Temporary fix" or "do not change" alone tells the reader nothing.
6. When you change code, update or delete the comments that describe it in the same edit.
7. Comment sparingly. One labeled line is usually enough; add a second label only when it says something new.

## Special cases

- Docstrings and API documentation comments are plain English and carry no labels.
- Tool directives stay byte for byte: `# noqa`, `# type: ignore`, `# pragma: no cover`, `// eslint-disable`, `// @ts-expect-error`, shebangs, and encoding lines. Only human text beside a directive may change.
- Product strings keep their locale. UI translations, error messages returned to users, and seed data are not comments.
- Section headings in long files and help lines that a tool prints, such as Makefile `##` lines, stay short headings without a label.
- When an existing comment disagrees with code the slice changes, make the comment match the code. When the code looks wrong instead, record it as an out-of-scope defect.
- Keep each file's line endings when a tool rewrites the whole file.
