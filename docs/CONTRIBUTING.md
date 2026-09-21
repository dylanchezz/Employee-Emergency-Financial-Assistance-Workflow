# Branching & Commit Convention

Solo capstone project — this convention exists mainly to produce a clean, defensible commit
history for Chapter 5's GitHub documentation (visible sprint progress, one feature per branch).

## Branches
- `main` — always stable and working. Merge into this only via pull request, after a sprint's
  work is complete and self-tested.
- `feature/<short-name>` — one branch per sprint/module. Examples matching the project's sprints:
  - `feature/data-generation`
  - `feature/rf-model-training`
  - `feature/ml-service-api`
  - `feature/workflow-backend`
  - `feature/frontend-employee-ui`
  - `feature/frontend-approver-ui`
  - `feature/notifications-escalation`
  - `feature/admin-module`

## Workflow
1. `git checkout main && git pull`
2. `git checkout -b feature/<short-name>`
3. Commit as you work (see message convention below).
4. Push the branch, open a pull request into `main`, review your own diff, merge.
5. Delete the feature branch after merge.

## Commit message convention
```
<type>(<scope>): <short description>

<optional longer description>
```
Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
Scopes: `frontend`, `backend`, `ml-service`, `docs`.

Examples:
```
feat(ml-service): add synthetic dataset generation script with fixed seed
feat(backend): implement rule-based validation with rejection reason
fix(frontend): correct priority badge colours on approver dashboard
docs(docs): update Chapter 4 diagrams after Employee entity resolution
```

## Why this matters for the documentation
Chapter 5's GitHub Documentation section references commit history and GitHub Insights as
evidence of development progress. A consistent branch-per-feature and typed-commit convention,
applied from Sprint 1 onward, gives that section real, presentable evidence rather than a
retrofit at the end.
