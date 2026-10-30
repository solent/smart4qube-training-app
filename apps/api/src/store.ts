import type { Issue } from './types.js';
import { SEED_ISSUES } from './seed.js';

/**
 * In-memory issue store. Each store starts from a deep copy of the seed, so
 * mutations never leak into SEED_ISSUES or into another app instance.
 */
export class IssueStore {
  private readonly issues: Issue[];
  private nextId: number;

  constructor(seed: Issue[] = SEED_ISSUES) {
    this.issues = structuredClone(seed);
    const maxSeedId = this.issues.reduce((max, issue) => {
      const match = /^iss-(\d+)$/.exec(issue.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    this.nextId = maxSeedId + 1;
  }

  list(projectId: string, author?: string): Issue[] {
    if (author) {
      return this.issues.filter(
        (issue) => issue.author === author,
      );
    }
    return this.issues.filter((issue) => issue.projectId === projectId);
  }

  get(projectId: string, issueId: string): Issue | undefined {
    return this.issues.find((issue) => issue.projectId === projectId && issue.id === issueId);
  }

  newId(): string {
    const id = `iss-${String(this.nextId).padStart(3, '0')}`;
    this.nextId += 1;
    return id;
  }

  add(issue: Issue): void {
    this.issues.push(issue);
  }

  replace(updated: Issue): void {
    const index = this.issues.findIndex((i) => i.projectId === updated.projectId && i.id === updated.id);
    if (index !== -1) this.issues[index] = updated;
  }

  remove(projectId: string, issueId: string): boolean {
    const index = this.issues.findIndex((i) => i.projectId === projectId && i.id === issueId);
    if (index === -1) return false;
    this.issues.splice(index, 1);
    return true;
  }
}
