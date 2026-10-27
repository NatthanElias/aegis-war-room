"""Selected project skills and checks on the installed skill files."""

import re
from pathlib import Path

import harness

ORDER = ("workflow-setup", "generate-roadmap", "feature-workflow")
USER_ONLY = ("workflow-setup",)
# Context: these dependencies are global skills of the same harness, installed outside the repository.
GLOBAL_REQUIRES = {"workflow-setup": ("grill-me",), "feature-workflow": ("orchestrate",)}
LINK = re.compile(r"\[[^]]+\]\(([^)#]+)(?:#[^)]*)?\)")
NAME = re.compile(r"[a-z0-9][a-z0-9-]*")


def skills_dir(root):
    return root / harness.SKILLS


def catalog(root):
    names = {path.parent.name for path in skills_dir(root).glob("*/SKILL.md")}
    for name in sorted(names):
        if not NAME.fullmatch(name):
            raise ValueError(f"Use a lowercase skill name with digits or dashes: {name!r}")
    return names


def ordered(names):
    return tuple(name for name in ORDER if name in names) + tuple(sorted(set(names) - set(ORDER)))


def selected(settings, root):
    """Return the selected project skills; without a skills list, every installed project skill."""
    available = catalog(root)
    skills = settings.get("skills", sorted(available))
    if not isinstance(skills, list) or not skills or any(not isinstance(x, str) for x in skills):
        raise ValueError("Select at least one skill by name")
    if len(skills) != len(set(skills)):
        raise ValueError("Select unique skill names")
    global_names = {name for names in GLOBAL_REQUIRES.values() for name in names}
    missing = set(skills) - available - global_names
    if missing:
        raise ValueError(f"Selected skill is not installed in {harness.SKILLS}: {sorted(missing)[0]}")
    return ordered(set(skills) & available)


def missing_dependencies(root, skills):
    """Name each global dependency this machine lacks; another developer's machine may differ, so only warn."""
    found = catalog(root) | {path.parent.name for path in harness.GLOBAL_SKILLS.glob("*/SKILL.md")}
    return [f"{skill} needs the global {dependency} skill in {harness.GLOBAL_SKILLS}"
            for skill in skills for dependency in GLOBAL_REQUIRES.get(skill, ()) if dependency not in found]


def check_links(path):
    for target in LINK.findall(path.read_text(encoding="utf-8")):
        if "://" not in target and not (path.parent / target).resolve().is_file():
            raise ValueError(f"Broken link in {path}: {target}")


def check_scripts(content, root):
    pattern = re.compile(r"\b(python3?)\s+(" + re.escape(harness.SKILLS) + r"/[\w-]+/scripts/[\w.-]+\.py)(?=\s|`|$)")
    for interpreter, target in pattern.findall(content):
        if interpreter != "python3":
            raise ValueError(f"Unsupported script invocation: use python3 for {target}")
        if not (root / target).is_file():
            raise ValueError(f"Missing script: {target}")


def validate(root, skills, entry):
    for name in skills:
        folder = skills_dir(root) / name
        body = (folder / "SKILL.md").read_text(encoding="utf-8")
        header, marker, _ = body[4:].partition("\n---\n") if body.startswith("---\n") else ("", "", "")
        if (not marker or not re.search(rf"^name:[ \t]*{re.escape(name)}[ \t]*$", header, re.M)
                or not re.search(r"^description:[ \t]*\S.*$", header, re.M)):
            raise ValueError(f"Selected skill has invalid frontmatter: {name}")
        explicit = harness.explicit_only(folder, header)
        if name in USER_ONLY and not explicit:
            raise ValueError(f"{name} must be explicit-only: {harness.EXPLICIT_HOW}")
        if name not in USER_ONLY and explicit:
            raise ValueError(f"{name} must stay model-invocable")
        for path in folder.rglob("*.md"):
            if "templates" not in path.relative_to(folder).parts:
                check_links(path)
            check_scripts(path.read_text(encoding="utf-8"), root)
    for target in LINK.findall(entry):
        if "://" not in target and not (root / target).resolve().is_file():
            raise ValueError(f"Broken link in the always-on file: {target}")
    check_scripts(entry, root)
    return len(skills)
