# Contributing & Git Workflow

This project follows the GitHub workflow taught in the GitHub Crash Program: work is planned as
**Milestones → Issues**, developed on **feature branches created from issues**, and integrated
through **Pull Requests** with review. Although this is a solo capstone, the full workflow is used
deliberately: it produces the Milestones, Issues, Kanban board, branch history, and PR record that
Chapter 5's *GitHub Documentation* section presents as evidence of development progress.

---

## 1. Planning: Milestones, Issues, and the Kanban board

**Milestone** — a major goal with a deadline. Milestones map to this project's sprints.
Example: `Sprint 1: Data Preparation & Environment Setup`.

**Issue** — a single small task inside a milestone. Each issue is one clear unit of work.
Example: `Implement synthetic dataset generation`.

**Kanban board** (GitHub Projects) — columns tracking each issue:
- **To Do** — issues not yet started.
- **In Progress** — actively being worked on locally.
- **In Review** — a Pull Request is open and being reviewed.
- **Done** — merged into `main`.

Workflow: create the milestone → add its issues → place issues on the board → work them one at a
time, moving the card across the columns.

---

## 2. Branching

`main` is the live, stable branch. It must always work. Never commit directly to `main`;
all changes arrive through reviewed Pull Requests. (Enable branch protection on `main`.)

Every branch is created **from its issue** and named:

```
category/issue-number-short-description
```

- **lowercase, kebab-case** (hyphens, no spaces or special characters)
- includes the **GitHub issue number** it addresses
- description kept to **2–4 words**

**Category prefixes:**
| Prefix | Use for |
|---|---|
| `feature/` | new features or functionality |
| `bugfix/` | fixing bugs |
| `hotfix/` | urgent production patches |
| `design/` | UI / UX work |
| `refactor/` | restructuring without changing behaviour |
| `test/` | adding or improving tests |
| `doc/` | documentation |

**Examples for this project:**
```
feature/1-synthetic-dataset
feature/2-rf-model-training
feature/3-ml-service-api
feature/4-workflow-validation
design/5-approver-dashboard
```

Bad names (avoid): `john-branch`, `updates`, `feature/my new stuff`, or a whole sentence.

---

## 3. Daily workflow

```bash
# 1. Start from an up-to-date main
git checkout main
git pull origin main

# 2. Create the branch for your issue (from the issue on GitHub, or locally):
git checkout -b feature/1-synthetic-dataset

# 3. Work. Commit in small, logical steps (see commit convention below).
git add .
git commit -m "feat(ml-service): add synthetic dataset generation with fixed seed"

# 4. Push the branch
git push -u origin feature/1-synthetic-dataset

# 5. Open a Pull Request on GitHub, review the diff, then merge into main.
# 6. After merge, delete the branch and pull main locally again.
```

**The golden rule:** *pull before you edit.* Always `git pull origin main` before starting work
on a branch, to stay in sync and avoid merge conflicts.

---

## 4. Commit messages (Conventional Commits)

```
type(scope): short description in imperative mood

[optional body — what and why, wrapped at ~72 chars]

[optional footer — e.g. Closes #12]
```

Rules:
- **Imperative mood:** "add", "fix", "update" — completes *"If applied, this commit will …"*.
  (Not "added", not "adding".)
- **First line under 50 characters.** It's a summary, not an essay.
- Use the **body** only when a change needs explaining.
- Use the **footer** to link issues: `Closes #12` auto-closes that issue when the PR merges.

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
**Scopes:** `frontend`, `backend`, `ml-service`, `docs`.

Examples:
```
feat(ml-service): add synthetic dataset generation with fixed seed
fix(frontend): correct priority badge colours on approver dashboard
refactor(backend): extract validation rules into service class
docs(docs): update Chapter 4 diagrams after Employee entity resolution
```

Three-part example:
```
feat(ml-service): add Random Forest training script

Trains the classifier on the synthetic dataset, evaluates it with
accuracy, precision, recall, F1, and a confusion matrix, and saves
the fitted model with Joblib for reuse without retraining.

Closes #2
```

---

## 5. Pull Requests & review

1. Push your branch and open a PR into `main`.
2. In the PR description, summarise the change and reference the issue (`Closes #N`).
3. Review your own diff line by line before merging (solo self-review — still catches mistakes).
4. Merge, then delete the branch.

---

## 6. Merge conflicts

Conflicts happen when Git can't automatically reconcile two changes. Common causes: same-line
edits, delete-vs-modify, appended-list overlaps, file renames, and line-ending differences
(CRLF vs LF on Windows). Prevention: **pull early, pull often.** To resolve, pull `main` into your
branch, edit the conflicted sections (choosing between the current and incoming changes), then
commit the resolution.

---

## 7. Line endings (Windows note)

On Windows, Git may warn "LF will be replaced by CRLF". This is harmless. To standardise, this
repo can use a `.gitattributes` file (see repo root) so line endings stay consistent regardless of
the machine, which also prevents line-ending-based merge conflicts.
```
```
