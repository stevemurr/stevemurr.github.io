---
title: "Start With One Person, Not the Couple"
date: 2026-03-16
draft: true
weight: 3
ShowPostNavLinks: true
tags: ["legal-tech", "product", "ux", "comparison", "california"]
summary: "The product case for profile-first relationship design and diff-driven negotiation."
projects: ["stevemurr/marriage-composer"]
series: ["Composable Marriage"]
params:
  pullquote: "Before two people can negotiate a system, each person has to know what system they actually want."
  cardGradient: "135deg, #24364a, #4b6b88, #b8d0df"
  cardIcon: "brain"
---

<!--
BLOG POST 3: Start With One Person, Not the Couple
Series: Composable Marriage
Audience: builders and product-minded readers
Tone: product and UX focused, centered on workflow design
-->

## Outline

### Opening Case: Two Competent Adults, One Awkward Conversation
- Open with two California professionals before engagement.
- They are not fighting about whether to get married. They are discovering they have different intuitions about relocation, income pooling, and how disputes should be resolved.
- One wants flexible career mobility and mostly separate finances. The other wants stronger mutual-consent norms and a larger shared pool.
- Frame the product problem: if you put them into a joint workflow too early, the interface becomes a negotiation stage before either person has finished thinking.

### The Bad Default
- Explain why most relationship workflows start at the wrong layer: they ask the couple to collaborate before each individual has articulated a coherent position.
- That produces anchoring, performative agreement, and the feeling that one partner is "driving" the document.
- Compare it to bad software design: the system conflates modeling, diffing, and conflict resolution in one screen.
- California-specific: because the current repo is seeded for California, the point is not "this is universally correct." The point is that even one-state support benefits from a cleaner personal-to-joint workflow.

### The Composable Alternative
- Introduce the profile-first architecture as the core product differentiator.
- Each person creates a personal relationship configuration first.
- The product then generates a comparison view with agreements, soft conflicts, and hard conflicts.
- Negotiation becomes a distinct phase rather than an ambient social pressure inside the first form.
- Use the case to illustrate the diff:
- `income_model`: proportional pool vs. separate
- `relocation`: mutual consent vs. independent
- `dispute_resolution`: mediation first vs. collaborative law
- Make the claim that this is more honest, more legible, and likely better for enforceability because the process is documented.

### Repo Artifact: Personal Config -> Share Link -> Comparison
- Anchor the post to the product vision in [`v1-design-document.md`](https://github.com/stevemurr/marriage-composer/blob/main/v1-design-document.md).
- Quote the structure of the flow in paraphrase: personal config, share link, comparison view, merged configuration, legal pipeline.
- Use the API section as a concrete artifact rather than abstract product copy:
- `POST /api/v1/share`
- `GET /api/v1/share/:token/preview`
- `POST /api/v1/share/:token/accept`
- `GET /api/v1/marriages/:id/compare`
- Tie back to the prototype in [`marriage-composer.jsx`](https://github.com/stevemurr/marriage-composer/blob/main/marriage-composer.jsx), especially the preset and module model, as evidence that the workflow can be driven from structured decisions rather than hardcoded documents.

### What This Still Cannot Solve
- It cannot force honest financial disclosure or good-faith participation.
- It cannot turn deep value incompatibilities into product bugs that a better UI can solve.
- It cannot replace counseling, mediation, or legal advice when the disagreement is substantive rather than informational.
- It cannot guarantee that a documented process will matter equally in every jurisdiction.
- Keep the claim disciplined: the product can improve clarity, sequencing, and auditability. It cannot eliminate conflict.

### Closing
- Land the next escalation: once the relationship is modeled as structured data, documents stop being the center of the system.
- They become compiled outputs from a deeper configuration graph.

Next: [One Decision, Five Documents](/posts/composable-marriage-dependency-graph/)

## Research Notes (Remove Before Publishing)
- Re-check how strongly to connect documented independent entry to enforceability without implying a guaranteed legal effect.
- Pull one comparison to collaborative software or version-control workflows without making the analogy feel gimmicky.
- Verify whether the design doc's "personal clarity tool first" language should be quoted directly or paraphrased.
