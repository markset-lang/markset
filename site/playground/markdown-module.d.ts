/**
 * Sample documents are imported as text.
 *
 * esbuild's text loader turns each .md file into a string export, so the
 * starter documents in the playground are the same files `markset check` runs
 * over -- not a copy of them pasted into a TypeScript array, which is the copy
 * that would quietly stop being valid Markset.
 */
declare module "*.md" {
  const content: string;
  export default content;
}
