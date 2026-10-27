"""Codex locations and invocation policy for workflow-setup."""

import re
from pathlib import Path

NAME = "Codex"
SKILLS = ".agents/skills"
AGENTS = ".codex/agents"
# Context: OpenCode also reads AGENTS.md. Both ports render the same harness-neutral text, so they agree on it.
ENTRY = "AGENTS.md"
OWNERSHIP = "docs/harness/setup-ownership.codex.json"
GLOBAL_SKILLS = Path.home() / ".agents" / "skills"
EXPLICIT_HOW = "set policy.allow_implicit_invocation: false in its agents/openai.yaml"


def explicit_only(folder, header):
    metadata = folder / "agents" / "openai.yaml"
    return metadata.is_file() and bool(
        re.search(r"^\s*allow_implicit_invocation:\s*false\s*$", metadata.read_text(encoding="utf-8"), re.M))
