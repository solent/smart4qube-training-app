# Smart4Qube

A SonarQube-like code review viewer: browse sample repositories, and read
line-anchored vulnerabilities, quality gate violations, and comments.

Ajout d'un changement bis

## Quickstart

Run the API and web app in separate terminals:

```
npm install
npm run dev:api    # http://localhost:3001
npm run dev:web    # http://localhost:5173
```

Then open http://localhost:5173.

## Stub coverage

`apps/api` implements every operation of `contracts/openapi.yaml` against an
in-memory store initialised from `apps/api/src/seed.ts`. Writes are visible to
subsequent reads and are lost when the server restarts.

| Operation | Path | Stub behavior |
|---|---|---|
| `listIssues` | `GET /issues/{projectId}` | Implemented (`file`, `type`, `severity`, `status` filters) |
| `getIssue` | `GET /issues/{projectId}/{issueId}` | Implemented |
| `createIssue` | `POST /issues/{projectId}` | Implemented (`201` + `Location`) |
| `updateIssue` | `PUT /issues/{projectId}/{issueId}` | Implemented (partial update) |
| `deleteIssue` | `DELETE /issues/{projectId}/{issueId}` | Implemented (`204`) |

Known projects: `acme-payments`, `legacy-billing` (sample repositories in
`apps/web/fixtures/repos/`) and `rocketnouilles` (the standalone app in
`rocketnouilles/`, seeded with no issues).

## Managing issues from the command line

With the API running:

```
npm run issues:add -- rocketnouilles scripts/examples/vulnerability.json
npm run issues:list -- rocketnouilles "status=OPEN"
npm run issues:remove -- rocketnouilles iss-020
```

## Contract check

```
npm run contract:check
```

Compares the issue enums in `contracts/openapi.yaml`, `apps/api/src/types.ts`
and `apps/web/src/domain/entities/Issue.ts` (see
`.claude/skills/issue-contract-checker/`).
