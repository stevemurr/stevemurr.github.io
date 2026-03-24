---
title: "Cloudflare KV for simple hugo metrics"
date: 2026-03-16
draft: false
tags: ["cloudflare", "hugo", "analytics", "workers"]
projects: ["stevemurr/hugo-cf-worker-metrics"]
summary: "Track visitors with Cloudflare Workers + KV. No server, no third-party scripts, no bill."
params:
  pullquote: "All the counting lives inside your Cloudflare account. No external SaaS, no tracking scripts, no monthly bill."
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
  cardIcon: "terminal"
---

# The Problem

You want to know how many people are reading your blog. Reasonable enough. So you google "add analytics to Hugo site" and every tutorial points you at **Plausible**, **Fathom**, or **Google Analytics**.

Those are fine services. But they all push your data to someone else's server. You're handing your visitor data to a third party so they can... show it back to you in a dashboard.

## ***Cloudflare is OP***

What if the analytics lived entirely inside your own Cloudflare account? No external scripts, no cookies, no monthly fee, no new servers. Just a tiny Worker that increments a counter every time someone loads a page.

That's exactly what we're building.

---

# How It Works

The architecture here is almost embarrassingly simple:

| Piece | What It Does |
|-------|-------------|
| **Cloudflare Worker** | A tiny JavaScript function that runs at the edge. No server to manage. Free tier. |
| **KV Store** | A key-value database inside the Worker's environment. Perfect for counters. Free up to 100k reads/writes per day. |
| **Your Hugo Site** | Sends a single GET request per page load to the Worker. That's it. |

The flow:

```
Visitor opens /blog/my-post
  |
  +-> Hugo page loads, fires fetch("/track?page=/blog/my-post")
  |
  +-> Worker receives request, validates origin, increments counter in KV, returns 204
```

The Worker checks that the request is coming from your site (via the `Origin` header) and validates the page path before counting. It returns a 204 No Content -- no data leaks back to the browser.

That's the whole thing. All the counting lives inside your Cloudflare account.

---

# Step 1 -- The Worker

Log in to Cloudflare, go to **Workers**, and create one. Name it something like `site-metrics`. Paste this:

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

function isValidPage(page) {
  if (!page.startsWith('/')) return false;
  if (page.length > 256) return false;
  if (!/^[a-zA-Z0-9\/_\-\.%]+$/.test(page)) return false;
  return true;
}

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname !== '/track') {
    return new Response('Not found', { status: 404 });
  }

  // Only accept requests from your site
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  if (!origin.startsWith(env.ALLOWED_ORIGIN)) {
    return new Response('Forbidden', { status: 403 });
  }

  const page = url.searchParams.get('page') || '/';
  if (!isValidPage(page)) {
    return new Response('Bad request', { status: 400 });
  }

  const raw = await env.COUNTERS.get(page);
  const current = raw ? Number(raw) : 0;
  await env.COUNTERS.put(page, String(current + 1));

  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN }
  });
}
```

A couple things worth noting:

- `env.COUNTERS` is the KV namespace binding you'll create next.
- `env.ALLOWED_ORIGIN` is a Worker secret (set via `wrangler secret put ALLOWED_ORIGIN`). It should be your site's origin, like `https://stevemurr.com`.
- We're keying by **page path**, not a single global counter. So you get per-page view counts for free.
- The response is a 204 No Content -- we don't leak count data back to the browser.
- Page paths are validated to prevent garbage or malicious keys from being written to KV.

### Add the KV Namespace

Still in the Worker editor, click **Add binding** -> **KV**. Name the binding `COUNTERS`. Cloudflare will create a KV namespace for you. Done.

### Set Worker Secrets

The Worker needs two secrets. Set them with Wrangler:

```bash
# Your site's origin -- requests from other origins are rejected
npx wrangler secret put ALLOWED_ORIGIN
# Enter: https://stevemurr.com (or your domain)

# API key for the read endpoints (we'll add those next)
npx wrangler secret put API_KEY
# Enter any strong random string
```

---

# Step 2 -- Hook It Into Hugo

Create a partial called `analytics.html`:

```html
{{/* layouts/partials/analytics.html */}}
<script>
  (function() {
    fetch('https://site-metrics.YOUR_SUBDOMAIN.workers.dev/track?page=' +
      encodeURIComponent(window.location.pathname))
      .catch(function() {});  // fail silently
  })();
</script>
```

Replace `site-metrics.YOUR_SUBDOMAIN.workers.dev` with your actual Worker URL. If you've attached a custom domain, use that instead.

Then include it in your base layout (`layouts/_default/baseof.html`), right before `</head>`:

```html
{{ partial "analytics.html" . }}
</head>
```

That's it. Every page load fires a request to the Worker, which increments the counter for that path.

If your visitor has JavaScript disabled, nothing happens. The page still loads fine -- you just don't get a count for that visit.

---

# Step 3 -- Deploy and Test

1. Save the Worker, hit **Deploy**.
2. Open an incognito window and visit a page on your site.
3. Open DevTools -> Network. You should see a request to:

```
https://site-metrics.your-subdomain.workers.dev/track?page=%2Fabout
```

It should return a **204 No Content** response. Refresh and check KV in your Cloudflare dashboard -- the count goes up. You're live.

---

# Step 4 -- A Simple Dashboard (Optional)

If you want a page that shows your counts, create `static/stats.html`:

The Worker includes two read endpoints, both protected by an API key:

- **`GET /count`** -- Returns total views across all pages.
- **`GET /stats`** -- Returns all pages and their individual counts.

Both require the `X-API-Key` header matching your `API_KEY` secret. Without it, you get a 401.

```bash
curl -H "X-API-Key: your-key" \
  "https://site-metrics.your-subdomain.workers.dev/stats"
# {"pages":{"/":500,"/about":42,"/blog/my-post":100}}
```

There's a `static/stats.html` dashboard in the repo that calls these endpoints. It's meant for **local/private use only** -- don't deploy it publicly since it contains your API key in the source.

---

# Security

The original version of this Worker had no security at all -- anyone could inflate your counts, write arbitrary KV keys, and read your analytics data from the response. The current version fixes all of that:

- **Origin checking**: `/track` only accepts requests where the `Origin` or `Referer` header matches your site. Random curl requests or other sites embedding your endpoint get a 403.
- **Input validation**: Page paths must start with `/`, be at most 256 characters, and contain only URL-safe characters. No one is writing `../../etc/passwd` to your KV store.
- **No data leakage**: `/track` returns 204 No Content. View counts aren't exposed to the browser.
- **API key on reads**: The `/count` and `/stats` endpoints require an `X-API-Key` header, so your analytics aren't publicly accessible.

---

# Things Worth Knowing

**Do I need a paid Cloudflare plan?** No. Free tier gives you 100k KV reads/writes per day. Unless your blog is getting serious traffic, you're fine.

**Can I count unique visitors?** Not easily with KV alone. You'd need something like a Bloom filter or Durable Objects. For most blogs, page views are enough.

**Can I track more than just views?** Sure. The Worker is just code -- you can log referrers, user agents, whatever you want. Just be thoughtful about what you store and why.

**Will this break if Cloudflare changes their free tier?** Maybe. But the code is trivial to port to any other edge runtime (Deno Deploy, Vercel Edge Functions, etc). The pattern is the same everywhere.

**What about the race condition on concurrent writes?** KV is eventually consistent, so if two requests hit at the exact same moment you might lose a count. For a personal blog this literally does not matter. If it bothers you, use Durable Objects instead.

---

# Wrap Up

God bless cloudflare.
