# Agent Rules

## Before Editing

- Do not work directly on `main`.
- If on `main`, stop and create a feature branch first.
- Before creating a branch, pull the latest `main`.
- Run `git status --short --branch` and check for existing local changes.
- If there are unrelated local changes, leave them alone.
- If the branch is behind `main`, warn before editing.
- If there are too many active branches, warn before creating another.

## While Editing

- Keep changes small and focused.
- Follow the existing code and design patterns.
- Do not silently refactor, rename, move, or delete things unless needed.
- Do not overwrite someone else's work.

## Branch Hygiene

- Keep branches short-lived.
- Keep branches close to `main`.
- If a branch has drifted far from `main`, sync with `main` before continuing.
- Delete merged branches when they are no longer needed.

## After Editing

- Run the relevant checks.
- Check the changed screen when frontend layout or behavior changes.
- Run `git status --short`.
- Summarize what changed and what was tested.
