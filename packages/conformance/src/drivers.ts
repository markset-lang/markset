import type { Driver } from "./types.ts";
import { attributeSpecifierDriver } from "./drivers/attribute-specifier.ts";

/**
 * Section name -> driver. A section listed in tests/ but absent here is
 * reported as skipped, so the suite can hold cases for constructs that are
 * specified but not yet implemented.
 */
export const drivers: Record<string, Driver> = {
  "attribute-specifier": attributeSpecifierDriver,
};
