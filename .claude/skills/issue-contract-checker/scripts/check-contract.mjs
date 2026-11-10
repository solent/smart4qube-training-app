#!/usr/bin/env node
// Issue contract checker: compares the IssueType, IssueSeverity and IssueStatus
// enums declared in the OpenAPI contract against the API and web TypeScript copies.
//
// Usage: node .claude/skills/issue-contract-checker/scripts/check-contract.mjs [--root <repoRoot>]
// Exit codes: 0 = all enums aligned, 1 = mismatch found, 2 = a file or enum could not be read.
//
// Deterministic, dependency-free (Node >= 22). Matching enums does NOT prove full API compliance.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENUMS = ['IssueType', 'IssueSeverity', 'IssueStatus'];
const CONTRACT = 'contracts/openapi.yaml';
const API_TYPES = 'apps/api/src/types.ts';
const WEB_TYPES = 'apps/web/src/domain/entities/Issue.ts';
// Runtime arrays in the API that drive request validation; they must match too.
const API_CONSTS = { IssueType: 'ISSUE_TYPES', IssueSeverity: 'ISSUE_SEVERITIES', IssueStatus: 'ISSUE_STATUSES' };

class ExtractionError extends Error {}

function parseArgs(argv) {
  const i = argv.indexOf('--root');
  if (i !== -1 && argv[i + 1]) return resolve(argv[i + 1]);
  // Default: the repository containing this script (.claude/skills/<name>/scripts/ -> repo root).
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
}

function read(root, file) {
  const path = resolve(root, file);
  if (!existsSync(path)) throw new ExtractionError(`${file}: file not found`);
  return readFileSync(path, 'utf8');
}

const unquote = (s) => s.trim().replace(/^['"]|['"]$/g, '');

/** Extracts `enum` values of components.schemas.<name> from the OpenAPI YAML (flow or block list). */
function yamlEnum(yaml, name, file) {
  const lines = yaml.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s{4}${name}:\\s*$`).test(l));
  if (start === -1) throw new ExtractionError(`${file}: schema ${name} not found under components.schemas`);
  const indent = lines[start].match(/^\s*/)[0].length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (line.match(/^\s*/)[0].length <= indent) break; // left the schema block
    const m = line.match(/^(\s*)enum:\s*(.*)$/);
    if (!m) continue;
    if (m[2].startsWith('[')) {
      const inner = m[2].slice(1, m[2].lastIndexOf(']'));
      return inner.split(',').map(unquote).filter(Boolean);
    }
    const values = [];
    for (let j = i + 1; j < lines.length; j++) {
      const item = lines[j].match(/^\s*-\s*(.+?)\s*$/);
      if (!item) break;
      values.push(unquote(item[1]));
    }
    return values;
  }
  throw new ExtractionError(`${file}: schema ${name} has no enum`);
}

/** Extracts the string literals of `export type <name> = 'A' | 'B' ...;`. */
function tsUnion(source, name, file) {
  const m = source.match(new RegExp(`export\\s+type\\s+${name}\\s*=([^;]*);`));
  if (!m) throw new ExtractionError(`${file}: type ${name} not found`);
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

/** Extracts the string literals of `export const <name>... = [ ... ];`. */
function tsArray(source, name, file) {
  const m = source.match(new RegExp(`export\\s+const\\s+${name}\\b[^=]*=\\s*\\[([^\\]]*)\\]`));
  if (!m) throw new ExtractionError(`${file}: const ${name} not found`);
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

function duplicates(values) {
  return values.filter((v, i) => values.indexOf(v) !== i);
}

function main() {
  const root = parseArgs(process.argv.slice(2));
  let contract, apiTypes, webTypes;
  try {
    contract = read(root, CONTRACT);
    apiTypes = read(root, API_TYPES);
    webTypes = read(root, WEB_TYPES);
  } catch (e) {
    if (e instanceof ExtractionError) {
      console.error(`ERROR ${e.message} (root: ${root})`);
      process.exit(2);
    }
    throw e;
  }

  const problems = [];
  const summary = [];
  try {
    for (const name of ENUMS) {
      const expected = yamlEnum(contract, name, CONTRACT);
      const copies = [
        { where: `${API_TYPES} (type ${name})`, values: tsUnion(apiTypes, name, API_TYPES) },
        { where: `${API_TYPES} (const ${API_CONSTS[name]})`, values: tsArray(apiTypes, API_CONSTS[name], API_TYPES) },
        { where: `${WEB_TYPES} (type ${name})`, values: tsUnion(webTypes, name, WEB_TYPES) },
      ];
      const dupContract = duplicates(expected);
      if (dupContract.length) problems.push({ name, where: CONTRACT, missing: [], extra: [], dups: dupContract });
      let aligned = true;
      for (const { where, values } of copies) {
        const missing = expected.filter((v) => !values.includes(v));
        const extra = values.filter((v) => !expected.includes(v));
        const dups = duplicates(values);
        if (missing.length || extra.length || dups.length) {
          aligned = false;
          problems.push({ name, where, missing, extra, dups, expected, actual: values });
        }
      }
      summary.push({ name, aligned: aligned && !dupContract.length, expected });
    }
  } catch (e) {
    if (e instanceof ExtractionError) {
      console.error(`ERROR ${e.message}`);
      process.exit(2);
    }
    throw e;
  }

  console.log(`Issue contract check (source of truth: ${CONTRACT})`);
  console.log(`Compared against: ${API_TYPES}, ${WEB_TYPES}`);
  console.log('');
  for (const s of summary) {
    console.log(`${s.aligned ? 'OK  ' : 'FAIL'}  ${s.name.padEnd(14)} [${s.expected.join(', ')}]`);
  }

  if (problems.length === 0) {
    console.log('');
    console.log(`All ${ENUMS.length} issue enums are aligned across ${CONTRACT} and both TypeScript copies.`);
    console.log('Note: matching enums does not prove full API compliance.');
    process.exit(0);
  }

  console.log('');
  console.log(`${problems.length} mismatch(es):`);
  for (const p of problems) {
    console.log(`- ${p.name} in ${p.where}`);
    if (p.missing.length) console.log(`    missing (in contract, not here): ${p.missing.join(', ')}`);
    if (p.extra.length) console.log(`    extra   (here, not in contract): ${p.extra.join(', ')}`);
    if (p.dups.length) console.log(`    duplicated values: ${p.dups.join(', ')}`);
    if (p.expected) {
      console.log(`    contract: [${p.expected.join(', ')}]`);
      console.log(`    found:    [${p.actual.join(', ')}]`);
    }
  }
  console.log('');
  console.log(`Fix the copies to match ${CONTRACT} (or change the contract first, then every copy).`);
  process.exit(1);
}

main();
