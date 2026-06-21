---
description: >-
  Use for visual bugs involving CSS layout, overflow, z-index, stacking
  contexts, responsive behavior, disappearing content, scroll containers,
  Tailwind classes, or grid/flex sizing.
---

# CSS And Layout Debugging

Treat layout bugs as constraints problems: container size, content size,
positioning, overflow, stacking, and responsive breakpoints.

## First Checks

- Capture screenshot evidence at the failing viewport.
- Identify the smallest DOM subtree where layout first becomes wrong.
- Check parent constraints before child styles: display, width, height,
  min/max, overflow, position, transform, and z-index.
- Compare desktop and mobile if the issue does not specify a viewport.

## Common Root Causes

- Missing `min-width: 0` or `min-height: 0` in flex/grid children.
- Scroll container has no bounded height.
- Absolute/fixed element is positioned relative to the wrong ancestor.
- Stacking context from transform, opacity, filter, isolation, or positioned
  parent changes z-index behavior.
- Content wraps or overflows because the container lacks stable dimensions.
- Filter/list state makes content disappear but layout still reserves or drops
  the wrong space.

## Fix Bias

- Fix the actual constraint, not just the symptom at one viewport.
- Prefer existing design-system utilities and local layout patterns.
- Avoid global CSS changes for one component bug.
- Verify with screenshot or Playwright when the bug is visual.
