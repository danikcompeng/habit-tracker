# Habit Tracker — Plan

## Overview

_TBD: product goal, target user, scope of v1._

## Stack

- Next.js 16.4 (App Router), React 19.3, Tailwind CSS 4.3, TypeScript
- _TBD: auth and data (e.g. Supabase with row-level security), testing (unit + Playwright)_

## Design direction

_TBD. The design-critic judges every screen against this section, so it should name: mood/personality, colour roles (light and dark), type scale, spacing scale, radii, motion principles, and 1–3 reference apps._

## Workflow (every feature)

1. **Plan**: write the feature's section under "Features" below.
2. **logic-checker** (`.claude/agents/logic-checker.md`) reviews the plan: edge cases, wrong assumptions, simpler approaches. Revise the plan.
3. **Build** the feature, with tests.
4. In parallel:
   - **code-reviewer** (`.claude/agents/code-reviewer.md`) reviews the diff: bugs, security (RLS, server actions, secrets), accessibility, missing tests.
   - **design-critic** (`.claude/agents/design-critic.md`) reviews Playwright screenshots at iPhone size (390×844 @3x), light and dark. _Only for features that add or change a screen._
5. **Fix what's real**: triage each finding as fixed, deferred (with reason) or rejected (with reason).
6. **Commit**, then log everything under "Reviews".

All three agents are read-only (Read, Grep, Glob). They report; they never edit.

## Features

_Each feature gets a subsection: goal, user flow, data model changes, server/client split, edge cases considered, test plan._

## Reviews

_One entry per feature. Every agent finding is logged with its severity and what was done about it, so the log shows what each reviewer caught and what changed as a result._

<!--
Template — copy for each feature:

### Feature N: <name> (YYYY-MM-DD) — commit <sha>

#### logic-checker (plan review)
Verdict: <Ready to build | Ready after fixes | Rethink before building>

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|
| 1 | High | ... | Fixed / Deferred / Rejected | Plan change + why |

#### code-reviewer (diff review)
Verdict: <Ship | Ship after fixes | Do not ship>

| # | Severity | Finding (file:line) | Outcome | What changed |
|---|----------|---------------------|---------|--------------|

#### design-critic (screens: <names>)
Verdict: <Ship | Ship after fixes | Rework>
Screenshots: `<paths>`

| # | Severity | Finding | Outcome | What changed |
|---|----------|---------|---------|--------------|

#### Takeaways
- What the reviewers caught that I would have missed, false positives, and anything to change in the agent prompts.
-->
