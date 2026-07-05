const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const CACHE_SECONDS = 3600;

const STATS_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      createdAt
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        totalPullRequestContributions
        totalIssueContributions
        totalRepositoriesWithContributedCommits
        contributionCalendar {
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes {
          stargazerCount
        }
      }
    }
  }
`;

async function fetchGithubStats(login, token) {
  const response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-stats-svg",
    },
    body: JSON.stringify({ query: STATS_QUERY, variables: { login } }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API responded with ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors?.length) {
    throw new Error(errors[0].message);
  }
  if (!data?.user) {
    throw new Error("User not found");
  }
  return data.user;
}

function calculateStreaks(weeks) {
  const days = weeks.flatMap((w) => w.contributionDays);
  let longest = 0;
  let running = 0;

  for (const day of days) {
    if (day.contributionCount > 0) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let current = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].contributionCount > 0) {
      current += 1;
    } else if (current > 0 || i !== days.length - 1) {
      break;
    }
  }

  return { current, longest };
}

function totalStars(repositories) {
  return repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);
}

function memberSince(createdAt) {
  return new Date(createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCard({ commits, prs, issues, stars, streak, longest, since }) {
  const theme = {
    bg: "#0d1117",
    border: "#30363d",
    title: "#58a6ff",
    label: "#8b949e",
    value: "#c9d1d9",
  };

  const rows = [
    ["Commits", commits],
    ["Stars", stars],
    ["Pull Requests", prs],
    ["Issues", issues],
    ["Current Streak", `${streak} day${streak === 1 ? "" : "s"}`],
    ["Longest Streak", `${longest} day${longest === 1 ? "" : "s"}`],
  ];

  const rowHeight = 30;
  const startY = 70;
  const height = startY + rows.length * rowHeight + 20;

  const rowsMarkup = rows
    .map(
      ([label, value], i) => `
    <g transform="translate(25, ${startY + i * rowHeight})">
      <text class="label">${escapeXml(label)}</text>
      <text class="value" x="330" text-anchor="end">${escapeXml(value)}</text>
    </g>`
    )
    .join("");

  return `
<svg width="380" height="${height}" viewBox="0 0 380 ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub stats">
  <style>
    .title { font: 600 16px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.title}; }
    .subtitle { font: 400 11px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.label}; }
    .label { font: 400 13px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.label}; }
    .value { font: 600 13px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.value}; }
  </style>
  <rect x="0.5" y="0.5" width="379" height="${height - 1}" rx="8" fill="${theme.bg}" stroke="${theme.border}"/>
  <text x="25" y="35" class="title">Live GitHub Stats</text>
  <text x="25" y="52" class="subtitle">Member since ${escapeXml(since)}</text>
  <line x1="25" y1="60" x2="355" y2="60" stroke="${theme.border}"/>
  ${rowsMarkup}
</svg>`.trim();
}

module.exports = async function handler(req, res) {
  const login = (req.query.username || "hypomonal").toString();
  const token = process.env.GITHUB_TOKEN;

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader(
    "Cache-Control",
    `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`
  );
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!token) {
    res.status(500).send(renderErrorCard("Server misconfigured"));
    return;
  }

  try {
    const user = await fetchGithubStats(login, token);
    const cc = user.contributionsCollection;
    const { current, longest } = calculateStreaks(cc.contributionCalendar.weeks);

    const svg = renderCard({
      commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
      prs: cc.totalPullRequestContributions,
      issues: cc.totalIssueContributions,
      stars: totalStars(user.repositories),
      streak: current,
      longest,
      since: memberSince(user.createdAt),
    });

    res.status(200).send(svg);
  } catch (err) {
    res.status(200).send(renderErrorCard(err.message));
  }
};

function renderErrorCard(message) {
  return `
<svg width="380" height="80" viewBox="0 0 380 80" xmlns="http://www.w3.org/2000/svg">
  <style>
    .err-title { font: 600 14px 'Segoe UI', Ubuntu, sans-serif; fill: #f85149; }
    .err-msg { font: 400 11px 'Segoe UI', Ubuntu, sans-serif; fill: #8b949e; }
  </style>
  <rect x="0.5" y="0.5" width="379" height="79" rx="8" fill="#0d1117" stroke="#30363d"/>
  <text x="20" y="35" class="err-title">Failed to load stats</text>
  <text x="20" y="55" class="err-msg">${escapeXml(message)}</text>
</svg>`.trim();
    }
