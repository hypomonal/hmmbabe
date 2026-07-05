# github-stats-api

A self-hosted, live-updating GitHub stats badge. No third-party badge service,
no cached numbers — it hits the GitHub GraphQL API on every request and
renders a custom SVG.

## Deploy (Vercel)

npm i -g vercel
cd github-stats-api
vercel

Add environment variable in Vercel dashboard (Project → Settings → Environment Variables):

| Name | Value |
|---|---|
| GITHUB_TOKEN | a GitHub Personal Access Token with read:user scope |

## Use it in your README



![GitHub Stats](https://your-project.vercel.app/api/stats?username=hypomonal)
