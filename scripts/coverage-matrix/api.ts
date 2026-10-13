// The GitHub calls the coverage matrix makes, so tests can replace them with fixtures.

export interface Repository {
  name: string;
  archived: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  state: 'open' | 'closed';
  createdAt: string;
  mergedAt: string | null;
}

export interface Api {
  listRepositories: (org: string) => Promise<Repository[]>;
  // A file at the repository root, or undefined if it doesn't exist.
  readFile: (org: string, repo: string, path: string) => Promise<string | undefined>;
  pullRequests: (org: string, repo: string) => Promise<PullRequest[]>;
}

type Fetch = typeof fetch;

export function githubApi(token: string, fetchImpl: Fetch = fetch): Api {
  const request = async (path: string, accept = 'application/vnd.github+json') => {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        'User-Agent': 'oak-agent-skills-coverage-matrix',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    return response;
  };
  const json = async <T>(path: string): Promise<T> => {
    const response = await request(path);
    if (!response.ok) throw new Error(`GitHub API ${path} returned ${String(response.status)}`);
    return (await response.json()) as T;
  };

  return {
    listRepositories: async (org) => {
      const repositories: Repository[] = [];
      for (let page = 1; ; page += 1) {
        const batch = await json<{ name: string; archived: boolean }[]>(
          `/orgs/${org}/repos?type=all&per_page=100&page=${String(page)}`,
        );
        repositories.push(...batch.map(({ name, archived }) => ({ name, archived })));
        if (batch.length < 100) return repositories;
      }
    },
    readFile: async (org, repo, path) => {
      const response = await request(
        `/repos/${org}/${repo}/contents/${path}`,
        'application/vnd.github.raw',
      );
      if (response.status === 404) return undefined;
      if (!response.ok) {
        throw new Error(
          `GitHub API /repos/${org}/${repo}/contents/${path} returned ${String(response.status)}`,
        );
      }
      return await response.text();
    },
    pullRequests: async (org, repo) => {
      const pulls = await json<
        {
          number: number;
          title: string;
          user: { login: string } | null;
          state: 'open' | 'closed';
          created_at: string;
          merged_at: string | null;
        }[]
      >(`/repos/${org}/${repo}/pulls?state=all&sort=created&direction=desc&per_page=100`);
      return pulls.map((pull) => ({
        number: pull.number,
        title: pull.title,
        author: pull.user?.login ?? '',
        state: pull.state,
        createdAt: pull.created_at,
        mergedAt: pull.merged_at,
      }));
    },
  };
}
