---
title: "Fifty Years of Apps Trying to Talk to Each Other"
date: 2026-03-16
draft: true
tags: ["ipc", "history", "macos", "fabric", "architecture"]
summary: "From Unix pipes to gRPC — and the semantic context gap that still remains."
projects: ["stevemurr/fabric"]
params:
  pullquote: "Every generation solved the plumbing problem but not the semantic problem."
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
  cardIcon: "history"
---

<!--
BLOG POST 3: History of App-to-App Communication
Tone: Historical, high-level, narrative-driven. Not a tutorial — a "how did we get here?" essay.
Ends by framing Fabric as the next step in a long lineage.
Part of the Fabric post chain.
-->

## Outline

### Opening: The Eternal Problem
- Every generation of computing has had to answer the same question: how do programs share information?
- The answers have gotten more sophisticated, but a fundamental gap remains

### Act I: The Unix Foundation (1970s)
- **Pipes (1973)** — McIlroy's garden hose metaphor. Thompson implements them in a night. The Unix philosophy is born: small programs composed via byte streams.
- **Signals** — async notifications, zero payload. A tap on the shoulder, not a conversation.
- **System V IPC (1983)** — message queues, shared memory, semaphores. Finally: structured data between processes. But the API was infamously clunky (`ftok`, `shmget`, `shmat`).
- **Unix domain sockets (4.2BSD, 1983)** — the same socket API but local. Still the workhorse of local IPC today.
- **Theme:** solving the byte-level plumbing problem. Processes can now send data. But there's no notion of "what" the data means.

### Act II: The RPC Dream (1980s)
- **The idea:** make remote calls look like local calls. Birrell & Nelson's 1984 paper. Sun RPC powers NFS. DCE/RPC powers Windows networking (to this day).
- **The seduction of transparency** — pretend the network isn't there.
- **The critique:** Waldo et al.'s "A Note on Distributed Computing" (1994) — latency, partial failure, concurrency make remote calls fundamentally different from local ones. Transparency is a lie.
- **Theme:** the first attempt at making communication "just work" — and the first lesson that it never does.

### Act III: The Distributed Object Era (Late 80s–90s)
- **CORBA (1991)** — the OMG's attempt at a universal object broker. Language-neutral, vendor-neutral, platform-neutral. Thousands of pages of spec. Ambition that collapsed under its own weight.
- **COM/DCOM/OLE on Windows** — Microsoft's pragmatic answer. COM's binary ABI (vtable pointers + `IUnknown`) was arguably the most successful component model ever. OLE let you embed Excel in Word. DCOM tried to extend it over the network and hit the same firewall/complexity wall as everyone else.
- **Theme:** the 90s believed the future was distributed objects. It wasn't — but the ideas (IDL, interface-based programming, binary component models) live on.

### Act IV: Apple's Own Path (1991–2011)
- **Apple Events & AEOM (System 7, 1991)** — remarkably ahead of its time. A queryable object model for app state: `word 3 of paragraph 2 of document "My File"`. More REST-like than RPC-like, decades before REST.
- **AppleScript (1993)** — natural-language scripting over Apple Events. Ambitious end-user inter-app automation. Deceptively hard to write correctly.
- **Mach ports (inherited via NeXTSTEP, 2001)** — capability-based kernel IPC. The bedrock of macOS IPC to this day.
- **XPC (2011)** — Apple inverts the frame: IPC as privilege separation, not inter-app chat. Decompose your own app into least-privilege sandboxed services.
- **Theme:** Apple went from the most ambitious inter-app communication model (AEOM) to the most restrictive (sandboxed XPC). Security won.

### Act V: The Desktop Bus (2000s)
- **D-Bus (2002–2006)** — freedesktop.org unifies Linux desktop IPC. Replaces GNOME's CORBA-based Bonobo and KDE's DCOP. System bus + session bus. Every Linux system service now speaks D-Bus.
- **Bonjour / mDNS / DNS-SD (2002)** — Apple's zero-configuration service discovery. Not IPC per se, but solves the "how do I find the service?" problem. Reuses DNS protocols over multicast. Powers AirPrint, AirPlay, AirDrop, Chromecast.
- **Theme:** discovery is half the battle. Before two programs can talk, they need to find each other.

### Act VI: The Web Eats Everything (1998–2015)
- **XML-RPC (1998) → SOAP (2000)** — RPC tunneled over HTTP to dodge firewalls. SOAP grows into the WS-* specification jungle. Enterprise Java/C# consume it; developers despise it.
- **REST (Fielding, 2000)** — stop fighting the web's architecture, embrace it. Resources, URIs, HTTP verbs. Simple, but "RESTful" means different things to everyone.
- **gRPC (2015)** — Google open-sources their internal Stubby. IDL-driven code gen is back (protobuf), but with HTTP/2, streaming, and explicit acknowledgment that remote ≠ local. Essentially what CORBA wanted to be, but pragmatic.
- **GraphQL (2015)** — Facebook's answer to over-fetching. Client specifies exactly what it needs. Moves query power from server to client.
- **Theme:** the web turned IPC into "APIs." Solved cross-organization communication but lost the local, low-latency, tightly-integrated feel.

### Act VII: Modern App Silos (2008–Present)
- **Android Binder + Intents** — kernel-level IPC with late-binding message routing. "I want to share an image" resolves at runtime. The most open model on mobile.
- **iOS** — the most restricted: URL schemes, App Extensions, App Groups. Security and privacy over flexibility.
- **Electron** — IPC between main and renderer processes within one app. No inter-app story at all.
- **Theme:** mobile/desktop platforms solved intra-app IPC but made inter-app communication harder than ever, deliberately, for security.

### The Gap: Context, Not Just Bytes
- After 50 years, we can send any data between any two processes. The plumbing is solved.
- What's NOT solved: **semantic context sharing.** No protocol answers:
  - "What is the user working on right now?"
  - "What is the user looking at in this other app?"
  - "How do these five open apps relate to each other?"
- Every IPC system assumes the developer knows at compile/deploy time what to send and where. None model the user's live, cross-app working context.
- Sandboxing moved in the opposite direction — apps can see less of each other than ever.

### Closing: Where Fabric Fits
- Fabric isn't replacing IPC at the transport layer — it's a **semantic context layer** on top of it.
- Closest ancestor: Apple's AEOM (a queryable model of app state), but applied cross-app with the user's working context as the organizing principle.
- The `fabric://` URI scheme, resource/action/subscription model, and permission grants are the next step in this 50-year lineage.
- Link to the intro post and tutorial.

## Research Notes (remove before publishing)

Key dates to verify against primary sources:
- Unix pipes: commonly cited as V3 (1973), sometimes V4
- Sun RPC: 1984 vs 1985 first release
- DCE/RPC: spec vs implementation dates vary (1988–1992)
- AppleScript: shipped with System 7.1 or 7.1.1
- D-Bus 1.0: 2006

Key papers/sources to cite:
- Birrell & Nelson, "Implementing Remote Procedure Calls" (1984)
- Waldo et al., "A Note on Distributed Computing" (1994)
- Roy Fielding's dissertation (2000)
- McIlroy's memo on pipes (1964 proposal, 1973 implementation)
