# Task Plan

- [completed] Inspect course viewer and abstraction map logic causing wrong module ordering and merged overview/module rendering
- [completed] Implement dedicated overview canvas and fix abstraction map serial labels/order in the course viewers
- [completed] Run targeted verification and document results

# Review

- Normalized V2 module order by each module's `index` before rendering or parsing stored course data.
- Added a dedicated overview canvas so the knowledge graph / abstraction map no longer render merged with the first module.
- Updated previous-navigation so Module 1 can go back to the overview canvas instead of being hard-stopped.
- Tightened abstraction map module resolution by matching graph nodes to modules via `module.index` first, then title fallback.
- Verification: `pnpm exec tsc --noEmit` still fails due to pre-existing Drizzle type conflicts in API routes; no new errors were surfaced in the edited UI files during patching.
