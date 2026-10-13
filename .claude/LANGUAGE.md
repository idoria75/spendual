# LANGUAGE — writing and talking rules

Single source for how Claude talks to the user, how git text is written, and how docs are written.
Loaded on demand by `CLAUDE.md` (repo root). Read only the section the current task needs.

Collected 2026-10-13 from: `~/.claude/CLAUDE.md`, `pr-reviews/config.md`, the `short`, `design` and
`grill-with-docs` skills, and the `b1a-devc` memory files. Git-text rules were calibrated on
2026-08-07 against 630 real commits and 14 reference PRs.

## Section index

| § | Section | Read when |
|---|---|---|
| 1 | Talking to the user | Every terminal reply (core rules also sit in `CLAUDE.md`) |
| 2 | Git text: common rules | Writing any text that goes to git or GitHub |
| 3 | Commit messages | Committing |
| 4 | PR titles | Opening or renaming a PR |
| 5 | PR descriptions | Writing a PR body |
| 6 | Review comments | Reviewing code, inline or summary |
| 7 | Thread replies | Answering review comments |
| 8 | Attribution | Publishing anything to GitHub |
| 9 | Code comments | Writing a comment in code |
| 10 | Docs | Writing or editing README, knowledge base, glossary, ADR, handover, one-pager |

---

## 1. Talking to the user

Applies to replies in the terminal. Git text is §2–§8.

### Rules

- English is not the user's first language. Use simple words and common verbs. Short sentences,
  one idea each. No idioms.
- Bullets over paragraphs. Keep a paragraph only for a thought that does not split.
- No preamble, no closing recap. Start with the answer. If the answer is long or has several
  parts, put a two-line summary first.
- The user reads code. Do not walk through a diff line by line or restate what a function plainly
  does. Point at `file:line` and say what matters there.
- The user knows Linux. Use the normal terms (pipe, symlink, PID, mount, systemd) without
  explaining them.
- Match the depth asked for. Go deeper only on request, and keep the same simple language when you
  do.
- Say what you do not know. Mark a guess as a guess. Separate what you checked from what you
  assumed. Do not fill a gap with a plausible answer.

### Why these rules exist

- Idioms break first for a non-native reader and carry no information.
- "Separate checked from assumed" is what makes "mark a guess" useful.
- Rules in conversation context decay over a long session. Technical depth pulls the style back
  to long, hedging, idiom-heavy text. That drift is the main failure mode.

### Short mode (when the user says "short", "shorter", "too long", "be brief", "you drifted", "back to style")

Active on every response until the user says "normal mode" or "stop short". Do not revert after
many turns.

- Answer in 10 lines or fewer. Code, file lists and command output do not count.
- Treat every rule above as a hard rule again.
- One answer. No survey of options, no "you could also".
- Do not restate the question. Do not recap. Do not narrate the work. The result is the answer.
- Bullets of about 12 words. Cut any word that carries no information.
- Point at `file:line`. Do not quote the code around it.
- Still flag uncertainty, in one short line. Never drop it to save space.
- Code blocks, commands and error text stay exact and complete.
- Keep full grammar: articles, verbs, plurals. Compress by saying fewer things, not by breaking
  sentences. Telegraphic fragments are harder for a non-native reader. Do not mix with a
  "caveman" style.
- Drop the length cap for: security warnings, confirmation of a destructive or irreversible
  action, and multi-step instructions where the wrong order causes damage. Resume right after.

### Interview and grilling sessions

Apply §1 to every question and every recommendation for the whole session.

- One question at a time. Give the recommended answer first and the concrete reason.
- No preamble, no recap of earlier answers.
- If a question can be answered from the codebase, read the codebase instead of asking.

### Terminal glyphs

The user's terminal font is Ubuntu Mono. No emoji. No Dingbats (`✚ ✔`). No Misc-Symbols (`⬢`).
Use only: ASCII, block elements (`█ ░ ▒ ▓`), basic geometric shapes (`◆ ● ○ ■`), box-drawing
(`│ ─`), arrows (`↑ ↓ ← →`). Missing glyphs fall back to another font and collide with the
characters next to them.

---

## 2. Git text: common rules

Applies to commit messages, PR titles and descriptions, review comments, and thread replies, in
every project.

- US English, not UK. "meter" not "metre", "color" not "colour", "organize" not "organise".
- Focused and concise. State what changed and why, in behavior or technical terms. Cut any word
  that carries no information.
- Imperative, present tense. Concrete nouns over adjectives.
- No marketing or flowery tone. Drop hype words ("comprehensive", "robust", "seamless", "powerful",
  "significantly") and filler ("basically", "simply", "in order to").
- Short sentences, one idea each.
- Name real symbols: `Default-construct current_state_ directly`, not `fix constructor`.
- The house voice is much terser than feels natural. Default long-form output (long bullets, bold,
  parenthetical asides) does not match it. When in doubt, cut.
- Never add an attribution line (§8).

---

## 3. Commit messages

- One line. Subject only. No body unless the user explicitly asks.
- Aim for 50 characters or fewer. Hard cap 72. If it does not fit, the commit does two things.
- Capitalized, imperative present tense, no trailing period.
- No scope prefix. Inside a submodule the repo is already the scope.
- No trailers: no `Co-Authored-By`, no `Signed-off-by`.
- No Jira id in the subject. It belongs in the branch name and the PR.
- One topic per commit. Never comma-join unrelated changes.
- Put the why in parentheses when it is not self-evident and still fits.

Good:

```
Guard GPS fields in Feedback with a mutex
Default-construct current_state_ directly (mutex member is non-movable)
Return after ros::shutdown() in loadParams for fail-fast
```

Bad:

- `updated with brush submodule pointing to master` — lowercase, past tense.
- `Minor fixes, bump b1a_integration version` — two unrelated things.
- `update timer message` — says nothing.

Submodule pointer bumps in the integration repo use a fixed form, one submodule per commit:

```
Bump <submodule> to <short-sha> (<why>)
Bump server_comm to 2f6a69d (parking feedback)
```

---

## 4. PR titles

- A short imperative phrase. Never the raw branch name.
  - Good: `Add condition before updating sensor timestamp`.
  - Bad: `Feat/as 1831/request data db` (the `gh` default; always replace it).
- Imperative, not gerund: `Add wind sensor message type`, not `Adding ...`.
- No Jira id.
- Epic members (one change across several repos) share a prefix: `<Epic name> - <what this repo does>`.

```
Safe navigation when GPS impaired - Error handling
Safe navigation when GPS impaired - Base Repo
```

---

## 5. PR descriptions

Reference length: 21–33 lines, 70–170 words. Match it.

- Open with `This pull request ...`. One to three sentences. If the change corrects a wrong
  assumption, say what the old behavior was and why it was wrong.
- `### Changes Made`: 1–3 terse bullets naming what changed. Not an inventory of the diff. One
  bullet is normal.
- No bold, no nested bullets, no parenthetical asides in the body.
- `### Test conducted` is concrete: name the site or robot and who ran it
  (`Tested in SB_24_002 and SB_24_003`, `<name> tested it in SB24003`). If something was not run
  on hardware, say so plainly.
- Keep every template heading, even when empty. Do not delete a section. Do not invent content to
  fill it.
- Exception for scale: release PRs and new-subsystem PRs may run longer, one bullet per affected
  area (the reference release PR is 69 lines).
- Open as a draft by default. Open ready-for-review only if the user asks.

Template:

```markdown
### Description

This pull request addresses ...

### Changes Made

- ...

### Test conducted

- Passed ... tests.

### Related Issues & Jira tasks

- [AS-XYZ](https://solarcleano.atlassian.net/browse/AS-XYZ)

### Additional Notes

- ...

### Merge Request Checklists

- [ ] Code follows Solarcleano's coding guidelines.
- [ ] Updated documentation.
- [ ] Linked Jira task.
- [ ] I have reviewed my own code.
- [ ] Tests have been done.
```

- Jira id is parsed from the branch name (`feat/AS-2097/report-generator` gives `AS-2097`). Omit the
  Jira section content if the branch has none.
- Integration-repo PRs replace `### Changes Made` with `### Associated PRs`, one link per
  submodule PR in the release window.
- The checklist is the user's claim, not Claude's. Tick only what the diff proves (guidelines,
  documentation updated, Jira linked). Never tick `Tests have been done`. Confirm the set with the
  user before opening. An honestly unticked box is normal.
- Before writing, read a few recent PRs of the repo and match their length and shape. Never pad a
  small change into a long body.

---

## 6. Review comments

### Findings

- Comment only on what you can confirm from the code, or ask for one specific check to be run.
- Preferences are the user's to express, not yours.
  - Not yours: "I think 8 decimals would be better."
  - Yours: "`find_package(... REQUIRED)` only resolves on Noetic; this breaks the Melodic build."
  - Yours: "Has this been compiled on a robot? This environment is C++11 only."
- One finding per comment, as short as it can be while still identifying the problem. A fragment is
  fine: `No includes inside cpp file, apart from matching hpp`.
- State a rule flatly when it is a rule (style guide, config invariant). Cite the consistency
  argument when that is the real reason.
- No preamble, no praise, no summary of what the code does.
- Findings go inline, on the line they concern.
- Verify every finding against the actual code before writing it. Few high-confidence findings
  beat a long speculative list. Say plainly what you could not check.

### Severities (three only)

| Severity | Meaning |
|---|---|
| Blocking | Merging breaks something: a build, a robot, a contract, an invariant. |
| Should fix | Real problem, does not gate the merge. |
| Nit | Style or naming. Take it or leave it. |

Tag a comment only when the severity is not obvious:

```
Blocking: find_package(nlohmann_json REQUIRED) only resolves on Noetic — breaks the
Melodic build. Guard it.

No includes inside cpp file, apart from matching hpp

Has this been compiled on a robot? This environment is C++11 only.
```

### Summary comment

One short comment, marked with `<!-- sc-review -->` as its first line. It carries the verdict and
the blocking items only, and points at the inline comments. It is not a copy of every finding.

```markdown
<!-- sc-review -->
**Request changes** — 2 blocking, 3 should-fix, 1 nit. Details inline.

Blocking: Melodic build (`CMakeLists.txt:14`), missing `docking_timeout` in `SB_25_004.yaml`.
```

- Verdict is one of: request changes / approve with comments / approve.
- On re-review, edit the existing marked comment in place. Do not post a duplicate. Offer a fresh
  comment only if the user prefers one.
- Show drafted comments first. Never post without an explicit yes.

---

## 7. Thread replies

- Two or three sentences.
- Say what changed and why, so the reviewer does not have to open the diff. Link the fixing commit
  sha.
- For won't-fix, give the reason and the authority for it (an invariant, a house convention, a
  decision already recorded).
- One commit per review topic.

---

## 8. Attribution

Never add an attribution line or note to anything published to GitHub.

- No `Generated by Claude Code`, no model name, no date, no other self-identifying text.
- Applies to: summary comments, inline comments, thread replies, suggested-change comments, PR
  titles, PR descriptions, commit messages.
- Commits also take no trailers (`Co-Authored-By`, `Signed-off-by`).
- Before posting, grep every body for `Generated`, `Claude`, `Co-Authored`, and any footer line.
  Remove them.
- History: an earlier rule required a trailing generated-by line. The user had it removed from a
  live PR and asked that it never fire again. Treat the old rule as gone.

---

## 9. Code comments

One line where possible. Two lines maximum. Match the density, naming and idiom of the surrounding
code.

---

## 10. Docs

### General

- Same voice as §2: plain, technical, terse. State facts. No marketing words.
- Prefer one-liners with file references over prose.
- Tables and bullets over paragraphs. Package READMEs are terse, table-driven references.
- Flag misleading names and dangling contracts explicitly with `⚠`. Those are the highest-value
  entries.
- Match the existing style of the file being edited.
- Link with plain markdown links, never `@path` imports. `@`-imports load automatically and defeat
  on-demand loading.
- Verify against the source before writing. If a claim cannot be confirmed, mark it unverified or
  leave it out. If a claim is only true of an older branch, say so instead of deleting it.
- Merge, do not clobber. Extend existing sections. Never delete an entry unless clearly outdated;
  mark it `<!-- stale? -->` instead.

### Where docs go (project rule, b1a-devc)

- Package documentation goes only in the package's own `README.md`.
- `doc/` and `docs/` directories inside a package are deprecated. Do not create or edit files
  there, even if they look more detailed. If both exist, touch only the root `README.md` and leave
  the old copy alone.
- Before writing to any doc file, check it is the root `README.md`, not something under `doc/`.

### Knowledge base (`CLAUDE.md` + detail files)

- `CLAUDE.md` is an index. It holds only what applies to every task: what the project is, layout,
  invariants, routing table.
- Subsystem detail goes in the detail file that owns the subsystem (`claude-context/*.md`), read on
  demand. Do not collapse detail back into `CLAUDE.md`.
- `CLAUDE.md` grows only when a fact changes how every task is approached.
- Adding a detail file means adding an index row. Write the row as a routing hint ("read when you
  touch X"), not a title.
- Bump the `Last updated` date when the base file changes.
- At the end of an update, report a short summary per file and list what could not be verified.

### Glossary (`CONTEXT.md`)

- Terms only. No implementation details. Not a spec, not a scratch pad.
- Be opinionated: pick one word per concept, list the others under `_Avoid_`.
- Definition: one or two sentences. Define what it is, not what it does.
- Only terms unique to the project. General programming concepts do not belong.

```markdown
**Mission**:
An operator-authored, named sequence of tasks that the robot executes in order.
_Avoid_: job, run, route
```

### ADRs (`docs/adr/NNNN-slug.md`)

- Write one only when all three are true: hard to reverse, surprising without context, the result
  of a real trade-off. Otherwise skip it.
- Sequential numbering: scan for the highest number and add one.
- Template: a title, then 1–3 sentences (context, decision, why). A single paragraph is fine.
- Optional, only when they add value: Status, Considered Options, Consequences.

### Design handover (`claude-handovers/<kebab-slug>/HANDOVER.md`)

Audience: an engineer, or a future Claude session, who continues the work without the chat.
Complete, not bloated.

```markdown
# HANDOVER — <topic>

**Date:** YYYY-MM-DD
**Scope:** one or two lines: what was designed, and that this is a decision record.

## 1. Problem
Short situation, then requirements as bullets.

## 2. Decisions
### 2.1 <area>   (one per decision, in dependency order)
Decision first, plainly. Then why this over the alternatives. Then "Rejected:" / "Deferred:" /
"Parked:" only when it prevents relitigating.

## 3. Work items (implementation order)
Numbered, in execution order. Mark the milestone with the first live result.

## 4. Risks / open points
Known unknowns, accepted failure modes, and what would trigger resolving each.
```

- Every decision made in the interview appears. The reader must not need the transcript.
- State verified facts with their source, e.g. "(verified: no -march=native in the workspace)".
- Record choices that went against the recommendation without editorializing.
- Do not commit or stage handover files unless the user asks.

### One-pager (`ONEPAGER.md`)

Audience: a non-technical manager. Hard limit: one page. Bullets and numbered steps over prose.

```markdown
# <Topic> — plan summary

**YYYY-MM-DD — <author>**

2–3 lines: the problem in business terms.

## Options considered
One bullet per option: **name** — what it means, then the consequence. End with a verdict:
**Chosen.** / Rejected. / Deferred (+ why).

## How the chosen workflow operates
About 5 numbered steps, in outcome language.

## Implementation sequence
- **Step N — <name>.** One line of what it delivers. Mark milestones inline.

Closing line: which steps are the core project, effort class, what is deferred and until when.
```

- Outcome, not tool. Say what a tool buys; name it only when it carries an argument the manager
  cares about.
- No jargon, no unknown acronyms. Spell out consequences in money, time and risk.
- Effort in classes (days / weeks), never dates, unless the user gives dates.
- Deviate from the template only if the design has no implementation-sequence shape. Then tell the
  user the summary deviates and why.
