"""Review sizing that matches the global orchestrate skill's delegation gate. Standard library only."""

from pathlib import Path

# Context: these equal FLOOR_TOKENS and CEILING_TOKENS in orchestrate's scripts/delegation_gate.py, so the
# validator routes a review the same way the gate does. Change both together.
FLOOR = 25_000
CEILING = 150_000


def total_bytes(paths):
    total = 0
    for path in map(Path, paths):
        if path.is_file():
            total += path.stat().st_size
        elif path.is_dir():
            total += sum(item.stat().st_size for item in path.rglob("*")
                         if item.is_file() and ".git" not in item.relative_to(path).parts)
        else:
            raise ValueError(f"Not found: {path}")
    return total
