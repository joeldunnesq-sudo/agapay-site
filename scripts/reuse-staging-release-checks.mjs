import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function sameReleaseSources(commit, git) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid production commit');
  const [head, ...parents] = git('rev-list', '--parents', '-n', '1', commit).split(' ');
  if (head !== commit) throw new Error('Production checkout does not match GitHub');
  const tree = git('rev-parse', `${commit}^{tree}`);
  // The second parent of a merge commit is the merged branch. Require exact source trees.
  return [commit, ...(parents.length === 2 ? [parents[1]] : [])].filter(
    (sha) => git('rev-parse', `${sha}^{tree}`) === tree
  );
}

export async function findStagingEvidence({ commit, git, api, now = Date.now() }) {
  for (const sha of sameReleaseSources(commit, git)) {
    const { workflow_runs: runs } = await api(
      `actions/workflows/deploy-staging.yml/runs?head_sha=${sha}&status=success&per_page=10`
    );
    for (const run of runs) {
      const age = now - Date.parse(run.updated_at);
      if (
        run.head_sha !== sha ||
        run.status !== 'completed' ||
        run.conclusion !== 'success' ||
        !run.repository?.id ||
        run.head_repository?.id !== run.repository.id ||
        !['push', 'workflow_dispatch'].includes(run.event) ||
        (run.event === 'push' && run.head_branch !== 'staging') ||
        !Number.isSafeInteger(run.id) ||
        !Number.isSafeInteger(run.run_attempt) ||
        !Number.isFinite(age) ||
        age < 0 ||
        age > MAX_AGE_MS
      )
        continue;
      const { jobs } = await api(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
      const succeeded = (name) =>
        jobs.find((job) => job.name === name && job.status === 'completed' && job.conclusion === 'success');
      const stage = succeeded('Migrate and deploy staging');
      if (!succeeded('Quality') || !succeeded('Test') || !stage) continue;
      if (
        [
          'Verify the staging release candidate',
          'Verify Stripe Connect sandbox destination',
          'Verify Stripe reconciliation against sandbox',
        ].every((name) => stage.steps?.some((step) => step.name === name && step.conclusion === 'success'))
      ) {
        return { sha, runId: run.id };
      }
    }
  }
  return null;
}

async function main() {
  const { GITHUB_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT, GITHUB_API_URL } = process.env;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const api = async (path) => {
    const response = await fetch(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/${path}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Workflow evidence lookup returned HTTP ${response.status}`);
    return response.json();
  };
  let proof = null;
  try {
    if (GITHUB_SHA === git('rev-parse', 'HEAD')) proof = await findStagingEvidence({ commit: GITHUB_SHA, git, api });
  } catch (error) {
    console.warn(`Staging evidence unavailable. Running the full checks. ${error.message}`);
  }
  console.log(
    proof ? `Reusing Quality and Test from staging run ${proof.runId} for ${proof.sha}` : 'Running full checks.'
  );
  appendFileSync(GITHUB_OUTPUT, `verified=${Boolean(proof)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
