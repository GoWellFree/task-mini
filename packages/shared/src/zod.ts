// Re-exports zod's runtime class and types so every consumer of this package
// goes through the SAME zod module instance. npm workspaces can otherwise
// hoist/nest multiple copies of the same version (one per package that
// declares its own "zod" dependency); `err instanceof ZodError` then silently
// fails across that boundary because the two ZodError classes are distinct
// objects despite being the identical version. Import ZodError/ZodSchema
// from here, not from "zod" directly, anywhere outside this package.
export { ZodError } from "zod";
export type { ZodSchema, ZodTypeAny } from "zod";
