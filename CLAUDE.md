# Response format

- Start every answer with a 1–2 sentence summary that directly answers the question.
- Put details, steps, and explanations after it.

# About this project

- Visual Deck: a lightweight browser image tool for making mobile-game art/assets (used alongside another game repo).
- Stack: TypeScript + Vite, no UI framework, plain DOM + Canvas 2D. Keep dependencies minimal.
- Run: `npm install`, `npm run dev`.

# Checks (run before reporting done)

- Typecheck: `npm run typecheck`
- Unit tests: `npm test`
- Production build: `npm run build`
- For UI changes, also drive the app in a browser (Playwright/Chromium) and look at a screenshot.
- Report each result; show the failures if any check fails.

# Architecture

- `src/types.ts`: item/layer/document types. `DocState` is **immutable**: never mutate it, build a new one.
- `src/model.ts`: `Workspace` (one tab): state, selection, history snapshots (with thumbnails), layer/item operations. No DOM here, so it is unit-testable.
- `src/geometry.ts`: arc/curve math, hit-testing, bounds. Pure functions.
- `src/view.ts`: pure zoom/pan/fit maths. `View` is readonly: replace it, never mutate it.
- `src/render.ts`: all canvas drawing (`drawScene`), thumbnails, selection overlay. No state, no status writes.
- `src/svg.ts`: SVG export (pure string output, shapes as paths).
- `src/io.ts`: file import (image decode), export and download helpers.
- `src/editor.ts`: main canvas input only (tools, select/move/copy/paste/delete, zoom/pan, shortcuts). Describes a `Scene`; `render.ts` draws it.
- `src/scripting.ts`: the `deck` API and script runner. Scripts are JavaScript, saved in `localStorage`.
- `src/ui.ts`: `App` owns the open workspaces and wires editor to panels.
- `src/panels/`: one class per DOM panel (menubar, tabbar, history, layers, toolbox, scripts). Each has `render()` and reads the workspace via `ActiveWorkspace`.
- Edits go through `Workspace.edit(label, fn)`: a label records a history step, `null` does not (scripts record one step per run).

# Working on a big story or epic

When a story/epic has several sub-issues:

1. Create a feature branch for the epic (see "Branch naming").
2. Make at least one commit per sub-issue.
3. Test the work and check the code.
4. QA carefully and fix the bugs found.
5. Create a PR for the user to review.

# Merge conflicts

- Before pushing or QA-ing a PR, check it against the latest main: `git fetch origin main`, then `git merge-tree --write-tree origin/main HEAD`.
- If it conflicts (or is behind main), rebase onto main: `git rebase origin/main`, resolve, then `git push --force-with-lease`.
- Re-run the checks after the rebase.

# Branch naming

- Use a type prefix: `feature/`, `bug/`, `refactor/`.
- Then the issue number (if any) and a short kebab-case description, e.g. `feature/12-arc-tool`.
- Never use auto-generated names like `claude/modest-fayman-ahuz4`.

# Code structure

- If understanding or changing something means digging through many layers of files, treat it as a sign the code needs refactoring.
- Point it out and suggest a refactor (e.g. a `refactor/` branch) rather than adding another layer on top.

# Writing this file

- Keep CLAUDE.md short, simple, and concise.
- Use point form; no long paragraphs.
