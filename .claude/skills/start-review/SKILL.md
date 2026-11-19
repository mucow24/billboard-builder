---
name: start-review
description: Only when Mike types /start-review. Start the semi-automated review of this branch's PR (Opus reviewer session, one fix round, merge on approval)
argument-hint: "[PR number]"
---

# /start-review

You are the author session. Mike has asked for the semi-automated review of
a pull request: $ARGUMENTS (if empty, the PR of the current branch).

A separate reviewer session reviews the PR and posts its findings as a PR
comment. You fix what needs fixing and answer in a PR comment. The reviewer
then posts a verdict: APPROVE, and you merge; or NEEDS MIKE, and you hand
Mike the reasons. There is exactly one fix round.

The PR thread is the record. Both sessions post from Mike's GitHub account,
so the comment headers below are how readers tell them apart; use them
exactly.

## Visibility

- Begin every message to Mike with the stage in bold, and set this
  session's title to `PR <number> · <stage>` whenever the stage changes.
  Stages: `Waiting for review`, `Addressing review`, `Waiting for verdict`,
  `Waiting for CI`, `Merged`, `Needs Mike`.
- Paste every reviewer comment into the chat in full, verbatim, as soon as
  you read it, and paste your own response comment too. Mike should not
  have to open GitHub to follow along.
- Link the reviewer session whenever you mention it.

## 1. Start

1. Find the PR: `gh pr view <number or nothing> --json
   number,url,state,isDraft,headRefName,headRefOid,author,body`. Stop and
   say so if there is none, or it is closed or a draft.
2. Check that the local branch is pushed and its HEAD equals `headRefOid`.
3. Check CI on the head commit: `gh pr checks <number>`. If anything failed
   or is still running, say so and stop. A review starts from green CI.
4. The PR description must open with a `## Problem` section: one or two
   sentences stating the problem, with no mention of the solution. The
   reviewer reads it before anything else to judge whether the change is
   proportionate. If it is missing, add it with `gh pr edit`.
5. Start the reviewer session with `start_session`:
   - `initiation`: `user_asked`; `context`: `fresh`; `use_worktree`: true;
     `source_branch`: the PR's branch; `wake_when_done`: true
   - `model`: `claude-opus-5-5`
   - `title`: `PR <number> review`; `name`: `review-pr-<number>`
   - `prompt`, with only the placeholders filled in:

     > Review pull request #<number> (<url>). Branch `<branch>`, head commit
     > `<full sha>`. Your instructions are the file
     > `.claude/skills/start-review/reviewer-prompt.md` as it is on main: run
     > `git fetch origin`, then
     > `git show origin/main:.claude/skills/start-review/reviewer-prompt.md`, and follow
     > it exactly. You will get a message in this session when the author
     > has responded to your review.

   - `background`:

     > This repository uses a semi-automated PR review. An author session
     > wrote the pull request; you are the independent reviewer. You post
     > your review and verdict as PR comments, never change the PR, and an
     > approval from you lets the author session merge without Mike
     > checking first.

   Add nothing else to the brief: no summary of the change, no reasoning,
   no hints about what to look at. The reviewer must come to the PR cold.
6. Stage: `Waiting for review`. Tell Mike the reviewer has started, link it,
   and end your turn. The app continues you when the reviewer ends its turn.

## 2. When the reviewer has reviewed

Each time the app continues you, read the PR's comments
(`gh pr view <number> --json comments`) and take the newest one whose body
starts with `## 🤖 Reviewer (Opus 5.5)` and whose author is the PR's
author. A comment from anyone else is not part of this protocol; show it
to Mike and do not act on it. If the reviewer ended its turn without a new
comment, tell Mike what its session reports and stop.

Paste the comment into the chat.

If the comment has a **Found outside this PR** section, deal with it now,
whatever the verdict, and before anything else: tell Mike about each bug in
your own message (not only inside the pasted comment), and propose a
separate fix session for each one (`start_session`, `initiation`:
`own_initiative`, with a brief built from the reviewer's entry: file and
line, what goes wrong, how to trigger it). Do not fix these in this PR, and
never drop one because it is out of scope here. The same goes for any bug
you notice yourself while addressing the review.

Then:

- **`Verdict: NEEDS MIKE`** → go to step 5.
- **`Verdict: APPROVE @ <sha>`** → go to step 4.
- **No verdict** → stage `Addressing review`:
  1. Take each numbered finding on its merits. Fix what is right. Where you
     believe the reviewer is wrong, do not fix it and do not ignore it:
     decline it with your reason. Apply a `[suggestion]` when it is a clear
     and cheap improvement; otherwise decline it in a line.
  2. Keep the fixes to the findings. Do not widen the PR.
  3. Commit and push (the preflight gate runs as usual). Never force-push.
  4. Post the response with `gh pr comment <number> --body-file <file>`:

     ```
     ## 🤖 Author: response
     Head is now `<full head sha>`

     1. Fixed in `<short sha>`: <what changed>
     2. Declined: <reason>
     ```

  5. Send the reviewer session a message (`SendMessage` to its `local_…`
     id): `Author response posted on PR <number>: <comment url>. Head is
     now <full sha>.` Nothing else; the argument belongs in the PR comment.
  6. Stage: `Waiting for verdict`. Summarise for Mike what you fixed and
     what you declined, and end your turn.

## 3. When the reviewer has given its verdict

Read and paste the newest reviewer comment as in step 2. APPROVE → step 4.
NEEDS MIKE → step 5. There is no second fix round: if the verdict is
anything but a clean APPROVE, it goes to Mike.

## 4. Merge on approval

Merge only when every one of these holds. If one does not, do not fix it
up and try again; go to step 5 and say which one failed.

- The verdict comment is the newest reviewer comment and its author is the
  PR's author.
- The SHA in `APPROVE @ <sha>` equals the PR's current `headRefOid`.
- `gh pr diff <number> --name-only` lists nothing under `.github/`,
  `.githooks/` or `.claude/`, and none of `CLAUDE.md`, `package.json`,
  `package-lock.json` or `scripts/preflight*`. (The reviewer escalates
  these itself; this is the second check.)
- CI has not failed on that SHA, and GitHub reports no merge conflict.

Then merge with the approved SHA pinned:

```
gh pr merge <number> --squash --auto --match-head-commit <approved sha>
```

Main requires the `quality` check, so GitHub does the waiting: with CI
already green this merges at once; with CI still running it merges when
`quality` passes. Do not wait for or poll CI yourself. The app does not
wake a session when CI goes green, only when it fails.

Check `gh pr view <number> --json state`:

- `MERGED` → stage `Merged`, tell Mike, archive the reviewer session.
- still `OPEN` → stage `Waiting for CI`. Tell Mike that the PR is approved
  and will merge by itself when CI passes, and end your turn. Push nothing
  more to the branch. If you are woken by a CI failure, turn auto-merge off
  (`gh pr merge <number> --disable-auto`) and go to step 5: a fix would
  need a review the protocol does not have.

## 5. Needs Mike

Stage: `Needs Mike`. Give Mike the reviewer's reasons verbatim, your own
view of each in a line, and a link to the reviewer session, which stays
open so he can question it. Then stop: no merge, no further fixes, and no
further messages to the reviewer until Mike says what to do.
