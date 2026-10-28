import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SPECIALISTS } from "@warroom/contracts";
import { describe, expect, test } from "vitest";

const agentDir = fileURLToPath(new URL("../agent", import.meta.url));

/** The `name:` value inside a leading `---` frontmatter block, or undefined when there is no such block. */
function frontmatterName(text: string): string | undefined {
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return undefined;
  return text
    .slice(4, end)
    .split("\n")
    .find((line) => line.startsWith("name:"))
    ?.slice("name:".length)
    .trim();
}

describe("agent files", () => {
  test("agent files layout", async () => {
    const entries = await readdir(`${agentDir}/skills`, { withFileTypes: true });
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    expect(entries).toHaveLength(4);
    expect(folders.sort()).toEqual(["acquirer", "db", "deploy", "logs"]);
    expect(folders).toEqual([...SPECIALISTS].sort());
    for (const folder of folders) {
      const file = `${agentDir}/skills/${folder}/SKILL.md`;
      expect(existsSync(file), file).toBe(true);
      expect(frontmatterName(await readFile(file, "utf8")), file).toBe(folder);
    }
    const rules = (await readFile(`${agentDir}/AGENTS.md`, "utf8")).split("\n");
    expect(rules).toContain("## Evidence rules");
    expect(rules).toContain("## Citation rules");
  });
});
