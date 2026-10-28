/** Runtime import specifiers in a source file; `import type` and `export type` are skipped. */
export function runtimeImports(source: string): string[] {
  return [
    ...source.matchAll(
      /(?:import|export)\s(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g
    ),
  ].map((match) => match[1] ?? match[2] ?? match[3]);
}
