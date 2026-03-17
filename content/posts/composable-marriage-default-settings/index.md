---
title: "Marriage Has Default Settings"
date: 2026-03-16
draft: true
weight: 1
ShowPostNavLinks: true
tags: ["legal-tech", "product", "architecture", "california", "relationships"]
summary: "A California founder case for treating marriage as configurable infrastructure instead of a moral referendum."
projects: ["stevemurr/marriage-composer"]
series: ["Composable Marriage"]
params:
  pullquote: "Marriage already has a settings panel. Most couples just never see it."
  cardGradient: "135deg, #3a2f28, #8c5e3c, #d2a679"
  cardIcon: "cpu"
---

<!--
BLOG POST 1: Marriage Has Default Settings
Series: Composable Marriage
Audience: builders and product-minded readers
Tone: provocative, concrete, systems-oriented
-->

## Outline

### Opening Case: The Founder Who Does Not Want a Prenup Fight
- Open with a California startup founder getting engaged to a non-founder partner.
- The founder is not trying to be cruel or evasive. They are trying to answer ordinary questions: does pre-marital equity stay separate, what happens to future appreciation, and how does IP created during the marriage get classified?
- Frame the emotional problem clearly: the couple is not arguing about love. They are being forced to talk about state defaults they did not choose and barely understand.
- Make the core claim early: marriage is already a configuration system. The only question is whether the configuration is explicit or hidden.

### The Bad Default
- Explain that marriage ships as a bundle of legal defaults, not a single vow.
- Show how people often think in folk language: "what's mine stays mine," "we'll be fair if anything happens," "my company is obviously separate."
- Contrast that with the system reality: ownership, income treatment, debt exposure, medical authority, inheritance, and dissolution are all preset somewhere.
- California-specific: this post uses California because the current repo artifacts are California-first and community-property assumptions make the "hidden default" idea especially legible.
- Emphasize the builder framing: this is a bad product because the user commits before they see the settings.

### The Composable Alternative
- Introduce the idea of a composable marriage as a set of explicit choices instead of a single adversarial prenup document.
- Reframe the conversation away from "do you trust me?" and toward "which defaults fit this partnership?"
- Use the founder case to make the choices tangible:
- `income_model = separate`
- `ip_ownership = creator`
- `home_ownership = proportional_equity`
- `dispute_resolution = arbitration` or `mediation_first`
- Point out that each of these is a product decision before it becomes a legal document.

### Repo Artifact: The Prototype Already Models the Founder Case
- Anchor this post to the prototype UI in [`marriage-composer.jsx`](https://github.com/stevemurr/marriage-composer/blob/main/marriage-composer.jsx).
- Call out the `MODULES` structure as the real insight: finances, property, decisions, children, health, and dissolution are modeled as independent but related domains.
- Use the `Independent Partnership` preset as the closest built-in approximation of the founder case.
- Note the specific preset choices that make the thesis concrete: separate income, creator-owned IP, proportional equity, originator-bears debt, arbitration.
- Explain why this matters for the series: the repo is not just a mockup of screens. It is a working argument that marriage can be represented as structured decisions.

### What This Still Cannot Solve
- It cannot make a bad or one-sided agreement magically enforceable.
- It cannot replace required attorney involvement where California or another state demands it.
- It cannot pre-negotiate child custody or support in a way that binds a future court.
- It cannot remove the need for full financial disclosure and actual informed consent.
- Make the boundary explicit: software can expose the settings, structure the conversation, and compile documents. It cannot abolish the legal system.

### Closing
- Land the first escalation: even if you make the founder's property and IP choices explicit, a prenup is still only one slice of the overall system.
- Tease the next post with the broader claim: the real product is not "better prenups." It is a full stack for relationship infrastructure.

Next: [A Prenup Is Only One Module](/posts/composable-marriage-prenup-isnt-enough/)

## Research Notes (Remove Before Publishing)
- Verify the California-specific description of community-property treatment for appreciation, labor, and post-marital income.
- Verify how aggressively to state the IP issue, especially when pre-marital companies continue growing during marriage.
- Pull one clean citation about how California treats spousal-support waivers and counsel requirements.
