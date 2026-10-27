"""Claude Code locations and invocation policy for workflow-setup."""

import re
from pathlib import Path

NAME = "Claude Code"
SKILLS = ".claude/skills"
AGENTS = ".claude/agents"
ENTRY = "CLAUDE.md"
OWNERSHIP = "docs/harness/setup-ownership.claude.json"
GLOBAL_SKILLS = Path.home() / ".claude" / "skills"
EXPLICIT_HOW = "set disable-model-invocation: true in its frontmatter"


def explicit_only(folder, header):
    return bool(re.search(r"^disable-model-invocation:\s*true\s*$", header, re.I | re.M))
