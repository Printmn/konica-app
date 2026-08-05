/**
 * Intentionally empty.
 *
 * `xlsx-js-style` ships its own type definitions (`types/index.d.ts`), so no
 * ambient declaration is needed here. An earlier hand-written `declare module`
 * in this file silently shadowed the real ones — which is worse than having no
 * types at all, because it type-checked against a fiction. Import `CellObject`,
 * `CellStyle`, `WorkSheet` and `WorkBook` straight from the package instead.
 *
 * This file is kept (rather than deleted) only so the reason is recorded.
 */

export {};
