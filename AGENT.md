# Sonder Coding Rules

These rules apply to Sonder implementation work in this repository.

## Operating Philosophy

- Slow is Fast.
- Prioritize reasoning quality, abstraction quality, architecture, and long-term maintainability over short-term speed.
- Aim to deliver high-quality solutions with minimal back-and-forth by planning before implementation.

## Uncertainty and Clarification

- If any feature behavior, scope, or expected UX is unclear, stop and ask for confirmation before implementing.
- Do not guess on ambiguous requirements.

## Version Control

- Use a dedicated feature branch for Sonder work.
- Keep changes scoped and organized by feature.
- Treat each feature as one logical commit.
- When a new feature is delivered, prepare a commit by default.
- Always ask for explicit user confirmation immediately before committing.
- Do not commit unless the user explicitly asks to commit.

## Testing

- Each feature must include tests (or relevant test updates).
- Run required checks/tests after each feature implementation cycle and fix issues before moving on.
- Before ending a feature turn, run project-required build/validation commands (for this repo, run `npm run build-dev` in addition to tests/type-checks).

## User Verification Handoff

- After implementing a feature, if it is an appropriate checkpoint for manual verification, provide the user with clear, actionable test steps.
- Include expected results so the user can quickly confirm whether the feature works as intended.

## Collaboration Mode

- Prefer complete implementation plans before coding.
- Surface key decisions early to reduce rework.

## Progress Tracking Discipline

- For every completed feature (especially command-surface features), always update:
  - `Sonder/todo.md`
- Do this in the same implementation cycle before proposing commit.
- For every new user-facing feature (especially new slash commands), always update usage/docs in:
  - `README.md`
