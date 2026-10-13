# Response format

- Start every answer with a 1–2 sentence summary that directly answers the question.
- Put details, steps, and explanations after it.

# Unit tests

After any change under `game/`, run the tests before reporting done:

- Working directory: `game/`
- Command (PowerShell): `godot --headless -s unit_tests/test_runner.gd`
- Report the result. If tests fail, show the failing test classes.

# Replay regression

- Recorded battles in `game/unit_tests/fixtures/replay_regression/` re-simulate and must match their `.expected.json`.
- After any change under `game/`, also run from `game/`: `godot --headless -s unit_tests/replay_regression_runner.gd`
- Add a case: copy a replay from `game/mock_server/battle_replay/`, then run `godot --headless -s scripts/tools/write_replay_regression.gd`.
- Intended simulation change: rewrite with `-- --all`, review the diff, and say why in the PR.

# Battle data validation

After any change to battle JSON (`game/data/`), `tool/`, or the manifest, run these from the repo root (same as `.github/workflows/validate-battles.yaml`):

- Validator: `python tool/validate_battles.py`
- Manifest up to date: `python tool/generate_rules_manifest.py rules_v1 --check`
- Manifest and validator tests: `python -m unittest discover -s tool/tests -t tool/tests`
- If the change also touches `game/`, run the unit tests too.
- Report each result; show the errors if any check fails.

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
- Re-run the tests after the rebase.

# Branch naming

- Use a type prefix: `feature/`, `bug/`, `refactor/`.
- Then the issue number (if any) and a short kebab-case description, e.g. `feature/65-account-level-exp-curve`.
- Never use auto-generated names like `claude/modest-fayman-ahuz4`.

# Building visuals in Godot

- Build the node tree and default properties in a scene (`.tscn`), so it is visible and editable in the editor.
- Use the script only to find those nodes and set values at runtime (text, colors, visibility, data-driven values).
- Create nodes in code only when truly dynamic (e.g. a variable number of items), and prefer instancing a small `.tscn`.

# Code structure

- If understanding or changing something means digging through many layers of files, treat it as a sign the code needs refactoring.
- Point it out and suggest a refactor (e.g. a `refactor/` branch) rather than adding another layer on top.

# Writing this file

- Keep CLAUDE.md short, simple, and concise.
- Use point form; no long paragraphs.
