import type { Driver } from "./types.ts";
import { attributeSpecifierDriver } from "./drivers/attribute-specifier.ts";
import { directiveLineDriver } from "./drivers/directive-line.ts";
import { documentDriver } from "./drivers/document.ts";

/**
 * Section name -> driver. A section listed in tests/ but absent here is
 * reported as skipped, so the suite can hold cases for constructs that are
 * specified but not yet implemented.
 */
export const drivers: Record<string, Driver> = {
  "attribute-specifier": attributeSpecifierDriver,
  "block-directive": directiveLineDriver,
  "separator-directive": directiveLineDriver,
  "bracketed-span": documentDriver,
  callout: documentDriver,
  card: documentDriver,
  grid: documentDriver,
  columns: documentDriver,
  tabs: documentDriver,
  steps: documentDriver,
  metrics: documentDriver,
  figure: documentDriver,
};
