---
name: issue-contract-checker
description: Checks that the Smart4Qube issue enums (IssueType, IssueSeverity, IssueStatus) are identical in contracts/openapi.yaml, apps/api/src/types.ts and apps/web/src/domain/entities/Issue.ts, using a deterministic script that reports the file, enum and differing values. Use before and after any change to issue types, severities or statuses, when editing the OpenAPI contract or either TypeScript Issue model, when adding an issue field or filter, before committing API or web changes that touch issues, or when asked "is the contract in sync?", "check the enums", or "check contract drift".
---

# Issue Contract Checker

`contracts/openapi.yaml` is the source of truth. The API (`apps/api/src/types.ts`, both the union
types and the `ISSUE_TYPES` / `ISSUE_SEVERITIES` / `ISSUE_STATUSES` arrays used for validation) and
the web domain model (`apps/web/src/domain/entities/Issue.ts`) keep their own copies of the issue
enums. This skill detects drift between those copies.

## Run

From the repository root:

```bash
npm run contract:check
# or, equivalently
node .claude/skills/issue-contract-checker/scripts/check-contract.mjs [--root <repoRoot>]
```

No dependencies beyond Node 22. Exit codes: `0` aligned, `1` mismatch, `2` a file or enum could not be read.

Expected output when aligned (exit 0):

```text
Issue contract check (source of truth: contracts/openapi.yaml)
Compared against: apps/api/src/types.ts, apps/web/src/domain/entities/Issue.ts

OK    IssueType      [VULNERABILITY, QUALITY_GATE_VIOLATION, COMMENT]
OK    IssueSeverity  [BLOCKER, CRITICAL, MAJOR, MINOR, INFO]
OK    IssueStatus    [OPEN, CONFIRMED, RESOLVED, FALSE_POSITIVE]

All 3 issue enums are aligned across contracts/openapi.yaml and both TypeScript copies.
Note: matching enums does not prove full API compliance.
```

Expected output on drift (exit 1), e.g. after renaming `RESOLVED` to `CLOSED` in the web model:

```text
FAIL  IssueStatus    [OPEN, CONFIRMED, RESOLVED, FALSE_POSITIVE]

1 mismatch(es):
- IssueStatus in apps/web/src/domain/entities/Issue.ts (type IssueStatus)
    missing (in contract, not here): RESOLVED
    extra   (here, not in contract): CLOSED
    contract: [OPEN, CONFIRMED, RESOLVED, FALSE_POSITIVE]
    found:    [OPEN, CONFIRMED, CLOSED, FALSE_POSITIVE]
```

## How to use the result

1. Run the checker before editing anything that touches issue enums, and record the result.
2. After your change, run it again. On `FAIL`, fix the listed file so it matches the contract.
   If the contract itself must change, edit `contracts/openapi.yaml` first, then every copy.
3. Report the final checker output to the user. Do not claim success on exit code 1 or 2.

## Scope

This check covers the three issue enums only. Value order is not compared. Passing it does not
prove the API honours the contract (validation, status codes, nullability rules): run
`npm run test:api` for behaviour. Other hard-coded enum lists in the web presentation layer
(filter toggles, summaries) are not checked.
