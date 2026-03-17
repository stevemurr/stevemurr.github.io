---
title: "One Decision, Five Documents"
date: 2026-03-16
draft: true
weight: 4
ShowPostNavLinks: true
tags: ["legal-tech", "systems", "documents", "california", "architecture"]
summary: "How one choice about ownership can cascade across titles, directives, wills, and exit terms."
projects: ["stevemurr/marriage-composer"]
series: ["Composable Marriage"]
params:
  pullquote: "The hard part is not generating forms. It is keeping the whole graph internally consistent."
  cardGradient: "135deg, #31243d, #6a4b7b, #d4bddf"
  cardIcon: "search"
---

<!--
BLOG POST 4: One Decision, Five Documents
Series: Composable Marriage
Audience: builders and product-minded readers
Tone: systems-heavy, concrete, architecture-forward
-->

## Outline

### Opening Case: The House, The Hospital, and the Missing System of Record
- Open with a married California couple who buy a house under one ownership assumption and then face a medical emergency.
- Suddenly several questions collide: who is on title, who can make healthcare decisions, who can act financially during incapacity, and what happens if one spouse dies.
- The failure mode is not that forms do not exist. The failure mode is that the forms do not agree with each other.
- Make the systems claim explicit: a marriage product that cannot keep these outputs synchronized is just a document vending machine.

### The Bad Default
- Explain that today's legal workflows are siloed by profession and transaction type.
- Real estate title, healthcare directives, wills, powers of attorney, and dissolution terms are often drafted or updated in different moments by different actors.
- That fragmentation means one upstream decision can be expressed five different ways or never propagated at all.
- California-specific: this post uses California to keep the title/transmutation/community-property examples grounded, but the underlying systems problem is broader than one state.

### The Composable Alternative
- Introduce the idea of a dependency graph instead of a pile of independent forms.
- One upstream choice should flow into every downstream artifact it controls.
- Use a concrete example for the case:
- If `home_ownership = proportional_equity`, that should influence title-holding language, related property schedules, estate assumptions, and dissolution logic.
- If `medical_poa = spouse_with_backup`, that should align across healthcare directives and related powers of attorney.
- Stress the engineering point: the product should own the canonical data model, then compile consistent documents from it.

### Repo Artifact: The Configuration Cascade
- Anchor this post to the dependency graph section in [`marriage-architecture.jsx`](https://github.com/stevemurr/marriage-composer/blob/main/marriage-architecture.jsx).
- Use the named cascade examples already in the repo:
- `prenup.income_model -> property_titles.title_holding`
- `prenup.asset_division -> estate.will_provisions -> dissolution.settlement_terms`
- `healthcare.medical_poa -> poa.healthcare_agent`
- `property_titles.home_ownership -> dissolution.property_division`
- Tie the architecture view back to the prototype UI in [`marriage-composer.jsx`](https://github.com/stevemurr/marriage-composer/blob/main/marriage-composer.jsx), which already models the upstream toggles that would feed the graph.
- Make the builder argument clear: the repository's most interesting idea is not the UI polish. It is the insistence on a canonical relationship configuration.

### What This Still Cannot Solve
- It cannot force banks, hospitals, counties, and title companies to accept one standard output without institution-specific handling.
- It cannot eliminate re-execution requirements, recording steps, or wet-signature edge cases.
- It cannot prevent reality from drifting if couples change one real-world document outside the system of record.
- It cannot simplify every downstream dependency into a deterministic rule because some constraints remain jurisdictional and discretionary.
- Keep the line sharp: coherence is the goal, not fantasy-level automation.

### Closing
- Tee up the final post with the hardest downstream dependency of all: what happens when the relationship terminates.
- Frame the question as a systems test: can a product designed at formation time reduce extraction and ambiguity during separation?

Next: [Can You Design a Better Divorce Before the Wedding?](/posts/composable-marriage-graceful-exit/)

## Research Notes (Remove Before Publishing)
- Verify how far to go on California transmutation and title examples without dragging the post into doctrine.
- Pull one concrete example of institutional mismatch, such as provider forms or title/recording practices, to make the cascade problem feel real.
- Re-check whether "system of record" should stay as the dominant metaphor or be swapped for "compiler" in the final draft.
