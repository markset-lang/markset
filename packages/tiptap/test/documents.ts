import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const LINE_SECTIONS = new Set(["attribute-specifier", "block-directive", "separator-directive"]);

/** Every full document in the suite, every example and the corpus. Line-grammar fragments are not documents. */
export function documents(): Array<{ name: string; source: string }> {
  const docs: Array<{ name: string; source: string }> = [];
  for (const file of readdirSync(`${repo}tests`).sort()) {
    const cases = JSON.parse(readFileSync(`${repo}tests/${file}`, "utf8")) as Array<{
      section: string;
      name?: string;
      markset: string;
    }>;
    cases.forEach((c, i) => {
      if (LINE_SECTIONS.has(c.section) && !c.markset.includes("\n")) return;
      docs.push({ name: `${file} #${i}${c.name ? ` ${c.name}` : ""}`, source: c.markset });
    });
  }
  // test/corpus holds documents retired from the site's gallery, which are still real documents worth checking.
  for (const dir of ["examples", "test/corpus"]) {
    for (const file of readdirSync(`${repo}${dir}`).sort()) {
      if (file.endsWith(".md")) docs.push({ name: file, source: readFileSync(`${repo}${dir}/${file}`, "utf8") });
    }
  }
  return docs;
}
