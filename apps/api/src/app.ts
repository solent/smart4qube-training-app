import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ISSUE_TYPES, ISSUE_SEVERITIES, ISSUE_STATUSES } from './types.js';
import type { Issue, IssueType, IssueSeverity, IssueStatus } from './types.js';
import { KNOWN_PROJECT_IDS } from './seed.js';
import { IssueStore } from './store.js';
import { validateIssueUpdate, validateNewIssue } from './validation.js';

interface ErrorBody {
  code: string;
  message: string;
  details?: string[];
}

function toArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

function sendError(res: Response, status: number, body: ErrorBody): void {
  res.status(status).json(body);
}

function isKnownProject(projectId: string): boolean {
  return (KNOWN_PROJECT_IDS as readonly string[]).includes(projectId);
}

function sendProjectNotFound(res: Response, projectId: string): void {
  sendError(res, 404, { code: 'PROJECT_NOT_FOUND', message: `Unknown project '${projectId}'.` });
}

function sendIssueNotFound(res: Response, projectId: string, issueId: string): void {
  sendError(res, 404, {
    code: 'ISSUE_NOT_FOUND',
    message: `Unknown issue '${issueId}' in project '${projectId}'.`,
  });
}

function sendInvalidBody(res: Response, details: string[]): void {
  sendError(res, 400, { code: 'INVALID_BODY', message: 'Invalid request body.', details });
}

/**
 * Builds the Express app. Each call gets its own in-memory store initialised
 * from the seed, so writes are visible to subsequent reads on the same app.
 */
export function createApp(store: IssueStore = new IssueStore()): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/issues/:projectId', (req, res) => {
    const { projectId } = req.params;
    if (!isKnownProject(projectId)) return sendProjectNotFound(res, projectId);

    const typeValues = toArray(req.query.type);
    const severityValues = toArray(req.query.severity);
    const statusValues = toArray(req.query.status);
    const fileValue = typeof req.query.file === 'string' ? req.query.file : undefined;
    const authorName = typeof req.query.author === 'string' ? req.query.author : undefined;

    const details: string[] = [];
    for (const v of typeValues) {
      if (!ISSUE_TYPES.includes(v as IssueType)) details.push(`type: '${v}' is not a valid IssueType`);
    }
    for (const v of severityValues) {
      if (!ISSUE_SEVERITIES.includes(v as IssueSeverity)) details.push(`severity: '${v}' is not a valid IssueSeverity`);
    }
    for (const v of statusValues) {
      if (!ISSUE_STATUSES.includes(v as IssueStatus)) details.push(`status: '${v}' is not a valid IssueStatus`);
    }
    if (details.length > 0) {
      return sendError(res, 400, { code: 'INVALID_QUERY', message: 'Invalid query parameter value.', details });
    }

    let results: Issue[] = store.list(projectId, authorName);
    if (fileValue !== undefined) {
      results = results.filter((issue) => issue.filePath === fileValue);
    }
    if (typeValues.length > 0) {
      results = results.filter((issue) => typeValues.includes(issue.type));
    }
    if (severityValues.length > 0) {
      results = results.filter((issue) => issue.severity !== null && severityValues.includes(issue.severity));
    }
    if (statusValues.length > 0) {
      results = results.filter((issue) => statusValues.includes(issue.status));
    }

    res.status(200).json(results);
  });

  app.post('/issues/:projectId', (req, res) => {
    const { projectId } = req.params;
    if (!isKnownProject(projectId)) return sendProjectNotFound(res, projectId);

    const result = validateNewIssue(req.body);
    if (!result.ok) return sendInvalidBody(res, result.details);

    const now = new Date().toISOString();
    const issue: Issue = { id: store.newId(), projectId, ...result.value, createdAt: now, updatedAt: now };
    store.add(issue);
    res
      .status(201)
      .location(`/issues/${encodeURIComponent(projectId)}/${encodeURIComponent(issue.id)}`)
      .json(issue);
  });

  app.get('/issues/:projectId/:issueId', (req, res) => {
    const { projectId, issueId } = req.params;
    if (!isKnownProject(projectId)) return sendProjectNotFound(res, projectId);
    const issue = store.get(projectId, issueId);
    if (!issue) return sendIssueNotFound(res, projectId, issueId);
    res.status(200).json(issue);
  });

  app.put('/issues/:projectId/:issueId', (req, res) => {
    const { projectId, issueId } = req.params;
    if (!isKnownProject(projectId)) return sendProjectNotFound(res, projectId);
    const current = store.get(projectId, issueId);
    if (!current) return sendIssueNotFound(res, projectId, issueId);

    const result = validateIssueUpdate(req.body, current);
    if (!result.ok) return sendInvalidBody(res, result.details);

    let updatedAt = new Date().toISOString();
    // Guarantee updatedAt visibly changes even for two updates in the same millisecond.
    if (updatedAt <= current.updatedAt) updatedAt = new Date(Date.parse(current.updatedAt) + 1).toISOString();

    const updated: Issue = { ...current, ...result.value, updatedAt };
    store.replace(updated);
    res.status(200).json(updated);
  });

  app.delete('/issues/:projectId/:issueId', (req, res) => {
    const { projectId, issueId } = req.params;
    if (!isKnownProject(projectId)) return sendProjectNotFound(res, projectId);
    if (!store.remove(projectId, issueId)) return sendIssueNotFound(res, projectId, issueId);
    res.status(204).end();
  });

  app.use((_req, res) => {
    sendError(res, 404, { code: 'ISSUE_NOT_FOUND', message: 'No such route.' });
  });

  // Malformed JSON bodies (and other body-parser failures) become contract-shaped errors.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status = (err as { status?: number })?.status;
    const type = (err as { type?: string })?.type;
    if (type === 'entity.parse.failed') {
      return sendInvalidBody(res, ['body: is not valid JSON']);
    }
    if (status !== undefined && status >= 400 && status < 500) {
      return sendError(res, status, { code: 'INVALID_BODY', message: (err as Error).message ?? 'Invalid request body.' });
    }
    next(err);
  });

  return app;
}
