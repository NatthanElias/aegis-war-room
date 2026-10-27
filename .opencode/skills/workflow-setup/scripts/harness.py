"""OpenCode locations and invocation policy for workflow-setup."""

import re
from pathlib import Path

NAME = "OpenCode"
SKILLS = ".opencode/skills"
AGENTS = ".opencode/agents"
# Context: Codex also reads AGENTS.md. Both ports render the same harness-neutral text, so they agree on it.
ENTRY = "AGENTS.md"
OWNERSHIP = "docs/harness/setup-ownership.opencode.json"
GLOBAL_SKILLS = Path.home() / ".config" / "opencode" / "skills"
EXPLICIT_HOW = "set disable-model-invocation: true in its frontmatter"


def explicit_only(folder, header):
    return bool(re.search(r"^disable-model-invocation:\s*true\s*$", header, re.I | re.M))
