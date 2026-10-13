// Scans the organisation's repositories for those using @oaknational/oak-agent-skills, and reports
// their versions, settings and anything to look at. The coverage-matrix workflow runs it weekly.
import { appendFileSync, writeFileSync } from 'node:fs';
import { githubApi } from './coverage-matrix/api.ts';
import { collect } from './coverage-matrix/collect.ts';
import { renderJson, renderMarkdown } from './coverage-matrix/report.ts';

const token = process.env.GITHUB_TOKEN;
if (token === undefined || token === '') {
  console.error(
    "Set GITHUB_TOKEN to a token that can read the organisation's public repositories.",
  );
  process.exit(1);
}
const org = process.env.ORG ?? 'oaknational';
const now = new Date();
const rows = await collect(githubApi(token), {
  org,
  sandbox: process.env.SANDBOX ?? 'oak-agent-skills-sandbox',
  includeSandbox: process.env.INCLUDE_SANDBOX === 'true',
  now,
});

const markdown = renderMarkdown(rows, now);
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary === undefined || summary === '') process.stdout.write(markdown);
else appendFileSync(summary, markdown);
writeFileSync(process.env.OUTPUT ?? 'coverage-matrix.json', renderJson(rows, now, org));
console.log(`Scanned ${org}: ${String(rows.length)} repositories use the package.`);
