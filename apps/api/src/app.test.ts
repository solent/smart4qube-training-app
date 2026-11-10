import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createApp } from './app.js';

const app = createApp();
const request = supertest(app);

describe('GET /issues/:projectId', () => {
  it('returns every seeded issue for acme-payments', async () => {
    const res = await request.get('/issues/acme-payments');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(9);
    expect(res.body[0]).toEqual({
      id: 'iss-001',
      projectId: 'acme-payments',
      filePath: 'src/auth/login.ts',
      line: 3,
      type: 'VULNERABILITY',
      severity: 'BLOCKER',
      status: 'OPEN',
      rule: 'S6418',
      message: 'Hard-coded credential: a live API token is committed to source.',
      author: null,
      createdAt: '2026-08-14T09:12:00.000Z',
      updatedAt: '2026-08-14T09:12:00.000Z',
    });
  });

  it('filters by file', async () => {
    const res = await request.get('/issues/legacy-billing?file=billing/db.py');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((i: { id: string }) => i.id)).toEqual(['iss-015', 'iss-016', 'iss-017']);
  });

  it('filters by type=COMMENT', async () => {
    const res = await request.get('/issues/acme-payments?type=COMMENT');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    for (const issue of res.body) {
      expect(issue.severity).toBeNull();
      expect(issue.rule).toBeNull();
      expect(issue.author).not.toBeNull();
    }
  });

  it('filters by repeated severity parameter with OR semantics', async () => {
    const res = await request.get('/issues/acme-payments?severity=BLOCKER&severity=CRITICAL');
    expect(res.status).toBe(200);
    expect(res.body.map((i: { id: string }) => i.id)).toEqual(['iss-001', 'iss-002', 'iss-006']);
  });

  it('rejects an invalid enum value with 400 INVALID_QUERY', async () => {
    const res = await request.get('/issues/acme-payments?type=NOPE');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    const res = await request.get('/issues/unknown-project');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('GET /issues/:projectId?author=', () => {
  it('filters issues by author', async () => {
    const res = await request.get('/issues/acme-payments?author=marie');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('GET /issues/:projectId/:issueId', () => {
  it('returns a single issue by id', async () => {
    const res = await request.get('/issues/acme-payments/iss-003');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('QUALITY_GATE_VIOLATION');
  });

  it('returns 404 ISSUE_NOT_FOUND when the id belongs to a different project', async () => {
    const res = await request.get('/issues/acme-payments/iss-015');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ISSUE_NOT_FOUND');
  });
});


describe('GET /issues/:projectId (status filter and rocketnouilles project)', () => {
  it('filters by repeated status parameter with OR semantics', async () => {
    const res = await request.get('/issues/acme-payments?status=CONFIRMED&status=RESOLVED');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const issue of res.body) expect(['CONFIRMED', 'RESOLVED']).toContain(issue.status);
  });

  it('rejects an invalid status value with 400 INVALID_QUERY', async () => {
    const res = await request.get('/issues/acme-payments?status=CLOSED');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
    expect(res.body.details).toEqual(["status: 'CLOSED' is not a valid IssueStatus"]);
  });

  it('knows the rocketnouilles project and seeds it with zero issues', async () => {
    const res = await request.get('/issues/rocketnouilles');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// Write tests each use a fresh app so the in-memory store starts from the seed.
function freshRequest() {
  return supertest(createApp());
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const NEW_VULNERABILITY = {
  filePath: 'src/payments/charge.ts',
  line: 4,
  type: 'VULNERABILITY',
  severity: 'MAJOR',
  rule: 'S2068',
  message: 'Secret logged to stdout.',
};

const NEW_COMMENT = {
  filePath: 'src/auth/login.ts',
  line: 1,
  type: 'COMMENT',
  author: 'luca',
  message: 'Why is this import here?',
};

describe('POST /issues/:projectId', () => {
  it('creates a non-COMMENT issue with server-assigned fields and default status OPEN', async () => {
    const res = await freshRequest().post('/issues/acme-payments').send(NEW_VULNERABILITY);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ...NEW_VULNERABILITY,
      projectId: 'acme-payments',
      status: 'OPEN',
      author: null,
    });
    expect(res.body.id).toMatch(/^iss-\d+$/);
    expect(res.body.createdAt).toMatch(ISO_UTC);
    expect(res.body.updatedAt).toBe(res.body.createdAt);
    expect(res.headers.location).toBe(`/issues/acme-payments/${res.body.id}`);
  });

  it('assigns ids that do not collide with seeded ids', async () => {
    const req = freshRequest();
    const first = await req.post('/issues/acme-payments').send(NEW_VULNERABILITY);
    const second = await req.post('/issues/legacy-billing').send(NEW_VULNERABILITY);
    expect(first.body.id).toBe('iss-020');
    expect(second.body.id).toBe('iss-021');
  });

  it('creates a COMMENT with null severity and rule', async () => {
    const res = await freshRequest().post('/issues/acme-payments').send(NEW_COMMENT);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...NEW_COMMENT, severity: null, rule: null, status: 'OPEN' });
  });

  it('accepts explicit nulls for fields that must be null, and an explicit status', async () => {
    const comment = await freshRequest()
      .post('/issues/acme-payments')
      .send({ ...NEW_COMMENT, severity: null, rule: null });
    expect(comment.status).toBe(201);
    const vulnerability = await freshRequest()
      .post('/issues/acme-payments')
      .send({ ...NEW_VULNERABILITY, author: null, status: 'CONFIRMED' });
    expect(vulnerability.status).toBe(201);
    expect(vulnerability.body.status).toBe('CONFIRMED');
  });

  it('makes the created issue visible to list (with filters) and get', async () => {
    const req = freshRequest();
    const created = await req.post('/issues/rocketnouilles').send(NEW_VULNERABILITY);
    const list = await req.get('/issues/rocketnouilles');
    expect(list.body).toEqual([created.body]);
    const filtered = await req.get('/issues/rocketnouilles?type=VULNERABILITY&severity=MAJOR&status=OPEN');
    expect(filtered.body).toEqual([created.body]);
    const get = await req.get(`/issues/rocketnouilles/${created.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body).toEqual(created.body);
  });

  it('does not leak writes into another app instance', async () => {
    await freshRequest().post('/issues/rocketnouilles').send(NEW_VULNERABILITY);
    const res = await freshRequest().get('/issues/rocketnouilles');
    expect(res.body).toEqual([]);
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    const res = await freshRequest().post('/issues/nope').send(NEW_VULNERABILITY);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it.each(['filePath', 'line', 'type', 'message'])('rejects a body missing required field %s', async (field) => {
    const body: Record<string, unknown> = { ...NEW_VULNERABILITY };
    delete body[field];
    const res = await freshRequest().post('/issues/acme-payments').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.message).toEqual(expect.any(String));
    expect(res.body.details).toContain(`${field}: is required`);
  });

  it.each([
    ['id', 'iss-999'],
    ['projectId', 'acme-payments'],
    ['createdAt', '2026-01-01T00:00:00.000Z'],
    ['updatedAt', '2026-01-01T00:00:00.000Z'],
  ])('rejects the server-assigned field %s', async (field, value) => {
    const res = await freshRequest()
      .post('/issues/acme-payments')
      .send({ ...NEW_VULNERABILITY, [field]: value });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details).toContain(`${field}: is server-assigned and must not be supplied`);
  });

  it.each([
    ['line 0', { line: 0 }, 'line'],
    ['a non-integer line', { line: 1.5 }, 'line'],
    ['a string line', { line: '3' }, 'line'],
    ['an invalid type', { type: 'BUG' }, 'type'],
    ['an invalid severity', { severity: 'HIGH' }, 'severity'],
    ['an invalid status', { status: 'CLOSED' }, 'status'],
    ['a malformed rule', { rule: 'java:S100' }, 'rule'],
    ['an empty message', { message: '' }, 'message'],
    ['an absolute filePath', { filePath: '/etc/passwd' }, 'filePath'],
    ['an empty filePath', { filePath: '' }, 'filePath'],
  ])('rejects %s', async (_label, override, field) => {
    const res = await freshRequest()
      .post('/issues/acme-payments')
      .send({ ...NEW_VULNERABILITY, ...override });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details.some((d: string) => d.startsWith(`${field}:`))).toBe(true);
  });

  it.each([
    ['severity', { severity: 'MAJOR' }],
    ['rule', { rule: 'S100' }],
  ])('rejects a COMMENT with non-null %s', async (field, override) => {
    const res = await freshRequest()
      .post('/issues/acme-payments')
      .send({ ...NEW_COMMENT, ...override });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain(`${field}: must be null or omitted when type is COMMENT`);
  });

  it('rejects a COMMENT without author', async () => {
    const { author: _author, ...body } = NEW_COMMENT;
    const res = await freshRequest().post('/issues/acme-payments').send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('author: is required when type is COMMENT');
  });

  it.each(['severity', 'rule'])('rejects a non-COMMENT without %s', async (field) => {
    const body: Record<string, unknown> = { ...NEW_VULNERABILITY };
    delete body[field];
    const res = await freshRequest().post('/issues/acme-payments').send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toContain(`${field}: is required when type is VULNERABILITY`);
  });

  it('rejects a non-COMMENT with an author', async () => {
    const res = await freshRequest()
      .post('/issues/acme-payments')
      .send({ ...NEW_VULNERABILITY, type: 'QUALITY_GATE_VIOLATION', author: 'marie' });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('author: must be null or omitted when type is QUALITY_GATE_VIOLATION');
  });

  it('rejects a non-object body', async () => {
    const res = await freshRequest().post('/issues/acme-payments').send([NEW_VULNERABILITY]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
  });

  it('rejects malformed JSON with INVALID_BODY', async () => {
    const res = await freshRequest()
      .post('/issues/acme-payments')
      .set('Content-Type', 'application/json')
      .send('{"filePath": ');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
  });

  it('rejects a missing body', async () => {
    const res = await freshRequest().post('/issues/acme-payments');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
  });
});

describe('PUT /issues/:projectId/:issueId', () => {
  it('partially updates an issue, keeps other fields and refreshes updatedAt', async () => {
    const req = freshRequest();
    const before = (await req.get('/issues/acme-payments/iss-001')).body;
    const res = await req.put('/issues/acme-payments/iss-001').send({ status: 'RESOLVED' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...before, status: 'RESOLVED', updatedAt: res.body.updatedAt });
    expect(res.body.updatedAt).toMatch(ISO_UTC);
    expect(res.body.updatedAt > before.updatedAt).toBe(true);
    expect(res.body.createdAt).toBe(before.createdAt);
  });

  it('makes the update visible to get and list', async () => {
    const req = freshRequest();
    await req.put('/issues/acme-payments/iss-003').send({ severity: 'BLOCKER', line: 13, message: 'Edited.' });
    const get = await req.get('/issues/acme-payments/iss-003');
    expect(get.body).toMatchObject({ severity: 'BLOCKER', line: 13, message: 'Edited.' });
    const list = await req.get('/issues/acme-payments?severity=BLOCKER');
    expect(list.body.map((i: { id: string }) => i.id)).toContain('iss-003');
  });

  it('refreshes updatedAt on every successful update', async () => {
    const req = freshRequest();
    const first = await req.put('/issues/acme-payments/iss-001').send({ status: 'CONFIRMED' });
    const second = await req.put('/issues/acme-payments/iss-001').send({ status: 'RESOLVED' });
    expect(second.body.updatedAt > first.body.updatedAt).toBe(true);
  });

  it('allows switching between non-COMMENT types', async () => {
    const res = await freshRequest().put('/issues/acme-payments/iss-001').send({ type: 'QUALITY_GATE_VIOLATION' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('QUALITY_GATE_VIOLATION');
  });

  it('allows updating a COMMENT and sending null severity/rule', async () => {
    const res = await freshRequest()
      .put('/issues/acme-payments/iss-004')
      .send({ message: 'Resolved offline.', severity: null, rule: null, status: 'RESOLVED' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'COMMENT', author: 'marie', severity: null, rule: null, status: 'RESOLVED' });
  });

  it('rejects an empty body', async () => {
    const res = await freshRequest().put('/issues/acme-payments/iss-001').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
  });

  it.each([
    ['author', 'someone'],
    ['id', 'iss-999'],
    ['projectId', 'legacy-billing'],
    ['createdAt', '2026-01-01T00:00:00.000Z'],
  ])('rejects the immutable field %s and leaves the issue unchanged', async (field, value) => {
    const req = freshRequest();
    const res = await req.put('/issues/acme-payments/iss-004').send({ status: 'RESOLVED', [field]: value });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details).toContain(`${field}: is immutable and must not be supplied`);
    const unchanged = await req.get('/issues/acme-payments/iss-004');
    expect(unchanged.body.status).toBe('OPEN');
  });

  it('rejects a non-null severity on a COMMENT', async () => {
    const res = await freshRequest().put('/issues/acme-payments/iss-004').send({ severity: 'MAJOR' });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('severity: must be null or omitted when type is COMMENT');
  });

  it('rejects nulling severity or rule on a non-COMMENT', async () => {
    const res = await freshRequest().put('/issues/acme-payments/iss-001').send({ severity: null, rule: null });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        'severity: is required when type is VULNERABILITY',
        'rule: is required when type is VULNERABILITY',
      ]),
    );
  });

  it.each([
    ['iss-001', 'COMMENT'],
    ['iss-004', 'VULNERABILITY'],
  ])('rejects moving %s across the COMMENT boundary (to %s)', async (issueId, type) => {
    const res = await freshRequest()
      .put(`/issues/acme-payments/${issueId}`)
      .send({ type, severity: null, rule: null });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BODY');
    expect(res.body.details[0]).toMatch(/^type: cannot change/);
  });

  it('rejects invalid field values', async () => {
    const res = await freshRequest().put('/issues/acme-payments/iss-001').send({ line: 0, status: 'DONE' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining(['line: must be an integer >= 1', expect.stringMatching(/^status:/)]),
    );
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    const res = await freshRequest().put('/issues/nope/iss-001').send({ status: 'RESOLVED' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('returns 404 ISSUE_NOT_FOUND for an issue of another project', async () => {
    const res = await freshRequest().put('/issues/acme-payments/iss-015').send({ status: 'RESOLVED' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ISSUE_NOT_FOUND');
  });
});

describe('DELETE /issues/:projectId/:issueId', () => {
  it('deletes an issue with 204 and no body, then it is gone from get and list', async () => {
    const req = freshRequest();
    const res = await req.delete('/issues/acme-payments/iss-001');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const get = await req.get('/issues/acme-payments/iss-001');
    expect(get.status).toBe(404);
    expect(get.body.code).toBe('ISSUE_NOT_FOUND');
    const list = await req.get('/issues/acme-payments');
    expect(list.body).toHaveLength(8);
  });

  it('returns 404 ISSUE_NOT_FOUND when deleting twice', async () => {
    const req = freshRequest();
    await req.delete('/issues/acme-payments/iss-001');
    const res = await req.delete('/issues/acme-payments/iss-001');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ISSUE_NOT_FOUND');
  });

  it('returns 404 ISSUE_NOT_FOUND for an issue of another project', async () => {
    const res = await freshRequest().delete('/issues/acme-payments/iss-015');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ISSUE_NOT_FOUND');
  });

  it('returns 404 PROJECT_NOT_FOUND for an unknown project', async () => {
    const res = await freshRequest().delete('/issues/nope/iss-001');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('deletes a freshly created issue', async () => {
    const req = freshRequest();
    const created = await req.post('/issues/rocketnouilles').send(NEW_COMMENT);
    const res = await req.delete(`/issues/rocketnouilles/${created.body.id}`);
    expect(res.status).toBe(204);
    expect((await req.get('/issues/rocketnouilles')).body).toEqual([]);
  });
});
