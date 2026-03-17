---
title: "A Prenup Is Only One Module"
date: 2026-03-16
draft: true
weight: 2
ShowPostNavLinks: true
tags: ["legal-tech", "product", "systems", "california", "estate-planning"]
summary: "Why prenup-only products miss the real surface area of a second marriage."
projects: ["stevemurr/marriage-composer"]
series: ["Composable Marriage"]
params:
  pullquote: "The product category is too small because the problem has been mislabeled."
  cardGradient: "135deg, #2d3a32, #56735f, #c7d6b5"
  cardIcon: "file"
---

<!--
BLOG POST 2: A Prenup Is Only One Module
Series: Composable Marriage
Audience: builders and product-minded readers
Tone: expansive, category-defining, less combative than post 1
-->

## Outline

### Opening Case: The Second Marriage With Existing Families
- Open on a couple entering a second marriage in California, both with assets and children from prior relationships.
- Their obvious question is "should we get a prenup?" but their real problem is larger: who inherits what, who gets medical authority, how do beneficiary designations line up, and what happens if one spouse dies first.
- Show why "prenup" is a misleading product label here. The pain is not one document. The pain is contradictory defaults across multiple documents and institutions.

### The Bad Default
- Explain how the market compresses a broad systems problem into a single-document workflow.
- A prenup-only tool can help with property and dissolution terms while leaving healthcare directives, wills, beneficiary updates, and powers of attorney untouched.
- That creates false confidence: the couple feels "handled" even though the underlying system is still fragmented.
- California-specific: the reason to stay concrete here is that death, title, and marital-property interactions are especially confusing in community-property contexts.
- Use the product lens: this is a category error. The interface boundary was drawn around what is easy to sell, not around the user's real job to be done.

### The Composable Alternative
- Define "full stack marriage" as the bundle of related agreements and records that together govern the relationship lifecycle.
- Introduce the idea that the product should cover formation, ongoing maintenance, incapacity, property alignment, and dissolution.
- Show how the second-marriage case makes the scope obvious:
- Prenup for ownership and exit terms
- Estate documents for children from prior relationships
- Beneficiary alignment for retirement accounts and insurance
- Healthcare directives and HIPAA authorizations
- Financial powers of attorney for incapacity
- Make the central argument: if the product cannot keep these modules coherent, it is not the system of record.

### Repo Artifact: The Seven-Bundle Architecture
- Anchor this post to the architecture demo in [`marriage-architecture.jsx`](https://github.com/stevemurr/marriage-composer/blob/main/marriage-architecture.jsx).
- Call out the seven document bundles and four lifecycle phases as the strongest repo-backed articulation of the thesis.
- Use the architecture view to explain why the category should be "relationship infrastructure" rather than "prenup software."
- Mention the document bundles that matter most to this couple: `prenuptial`, `estate`, `healthcare`, `poa`, and `property_titles`.
- Tie back to the brainstorm: the moat is not document generation in isolation. It is lifecycle coverage plus consistency across bundles.

### What This Still Cannot Solve
- It cannot fully automate estate complexity for every family structure or tax posture.
- It cannot guarantee that beneficiary records at banks and custodians are actually updated everywhere.
- It cannot eliminate the need for attorney review when trust structures, blended-family edge cases, or unusual assets are involved.
- It cannot collapse every state into one national workflow without jurisdiction-specific rules.
- Keep the boundary sharp: full stack does not mean total automation. It means the product owns the orchestration problem.

### Closing
- End with the product insight that unlocks the next post: the right starting point is not a shared couple workflow.
- The right starting point is individual clarity first, then comparison, then negotiation.

Next: [Start With One Person, Not the Couple](/posts/composable-marriage-profile-first/)

## Research Notes (Remove Before Publishing)
- Verify which California death-and-property interactions are worth simplifying for a general builder audience without overstating certainty.
- Pull one clean example of beneficiary designation overriding a will, framed carefully and not as universal advice.
- Re-check how far to go in claiming current market offerings are still "prenup-only" versus "prenup-first."
