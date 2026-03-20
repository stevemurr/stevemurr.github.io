---
title: "IPC: Fifty Years of Apps Trying to Talk to Each Other"
date: 2026-03-18
draft: false
tags: ["ipc", "history", "macos", "fabric", "architecture"]
summary: "From Unix pipes to gRPC — and the semantic context gap that still remains."
projects: ["stevemurr/fabric"]
series: ["history-of-app-communication"]
params:
  pullquote: "Every generation solved the plumbing problem but not the semantic problem."
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
  cardIcon: "history"
---

# The Eternal Problem

Every generation of computing has had to answer the same question: how do programs share information with each other?

The answers have gotten more sophisticated. We went from byte streams to binary interfaces to HTTP APIs to streaming RPCs. But a fundamental gap has remained the entire time. Every IPC system in history solves the transport problem --- how do I get bytes from process A to process B? None of them solve the semantic problem --- what is the user actually working on across all these processes, and how do they relate to each other?

This is the history of that gap.

---

# Act I: The Unix Foundation (1970s--1983)

In 1964, Doug McIlroy wrote a memo proposing that programs should be connected like garden hoses --- screw in another segment when you need to massage data in another way. In 1973, Ken Thompson implemented pipes in Unix V3. Legend has it he did it in a single night.

The Unix philosophy was born: small programs that do one thing well, composed via byte streams.

```bash
cat access.log | grep 404 | awk '{print $7}' | sort | uniq -c | sort -rn | head
```

This is beautiful. It's also extremely dumb. The pipe doesn't know what's flowing through it. It doesn't know that `$7` is a URL path. It doesn't know that `404` is an HTTP status code. It's just bytes. The semantics live entirely in the programmer's head and in the conventions of each tool's text output.

**Signals** came next --- async notifications between processes. A tap on the shoulder with zero payload. You could tell a process to die (`SIGKILL`), to pause (`SIGSTOP`), or to re-read its config (`SIGHUP`). But you couldn't tell it *why*.

**System V IPC (1983)** tried to add structure: message queues, shared memory, semaphores. For the first time you could pass typed messages between processes. But the API was legendarily awful. `ftok`, `shmget`, `shmat`, `shmctl` --- names only a kernel developer could love. The cleanup semantics were broken. Resources leaked. Developers avoided it when they could.

**Unix domain sockets (4.2BSD, 1983)** gave you the same socket API you'd use for network communication, but over a local file path. Fast, reliable, bidirectional. Still the workhorse of local IPC today --- Docker uses them, PostgreSQL uses them, your window manager probably uses them.

By 1983, the plumbing problem was solved. Processes could send bytes to each other in every direction, synchronously or asynchronously, with or without structure. What none of these systems could express was *meaning*. The data flowing through a pipe or a socket or a message queue was just bytes. What those bytes represented --- and how they related to what the user was doing --- was somebody else's problem.

---

# Act II: The RPC Dream (1980s)

The obvious next step was to make inter-process communication feel like a function call. If `add(2, 3)` works locally, why shouldn't it work across a network?

In 1984, Andrew Birrell and Bruce Nelson published "Implementing Remote Procedure Calls" at Xerox PARC. The paper laid out the architecture that every RPC system would follow: define an interface, generate stubs for client and server, marshal arguments into bytes, send them across, unmarshal on the other side, execute, and return the result. The programmer writes what looks like a normal function call. The infrastructure handles the rest.

Sun RPC shipped the same year and powered NFS --- the first widely deployed network filesystem. DCE/RPC followed from the Open Software Foundation and became the foundation of Windows networking. (It's still there. Every time you use SMB file sharing on Windows, DCE/RPC is underneath.)

The seduction of RPC was *transparency*. Pretend the network isn't there. Make remote calls look exactly like local calls. Ship it.

The critique came ten years later. In 1994, Jim Waldo and a team at Sun published "A Note on Distributed Computing" --- one of the most important papers in systems engineering that nobody outside academia read. Their argument was devastating: remote calls are *fundamentally* different from local calls. Latency is non-zero and unpredictable. Partial failure is possible --- the server might crash mid-call, the network might drop, the response might arrive but the client might have already timed out. Concurrency introduces races that don't exist locally. Memory references don't work across address spaces.

Transparency, they argued, was a lie. And building systems on that lie would produce systems that were fragile in ways that were extremely hard to debug.

They were right. Every developer who's ever stared at a 30-second timeout on what was supposed to be a "transparent" remote call knows they were right.

RPC didn't die --- it evolved. But the dream of making remote calls indistinguishable from local calls died with that paper, or should have.

---

# Act III: The Distributed Object Era (Late 1980s--1990s)

The 1990s believed the future was distributed objects. Take RPC, add object orientation, and you'd have a universal architecture for software components that could live anywhere and talk to anything.

**CORBA (1991)** was the industry's collective attempt to make this real. The Object Management Group --- a consortium of hundreds of companies --- set out to build a universal object broker. Language-neutral. Vendor-neutral. Platform-neutral. You'd define interfaces in IDL, generate bindings for C++, Java, Smalltalk, whatever, and any object on any machine could call methods on any other object through the Object Request Broker.

The ambition was staggering. The spec was thousands of pages long. The implementations were expensive, complex, and subtly incompatible with each other. CORBA collapsed under its own weight. The spec committees kept adding features (transactions, security, real-time, fault tolerance) faster than any implementation could absorb them. By the late 90s, it was a punchline.

**COM/DCOM on Windows** was Microsoft's pragmatic answer to the same question. Where CORBA tried to solve everything through specification, COM solved it through a binary ABI: a vtable pointer and the `IUnknown` interface. If your component implemented `IUnknown` --- `QueryInterface`, `AddRef`, `Release` --- it could be used by any other component, regardless of what language it was written in. No IDL compiler required at runtime. No broker.

COM was arguably the most successful component model ever built. OLE Automation let you embed a live Excel spreadsheet inside a Word document. ActiveX put COM components in web browsers (security disaster, but technically impressive). Visual Basic's entire control ecosystem ran on COM.

DCOM tried to extend COM across the network and hit the same wall everyone else did: firewalls, latency, partial failure, the everything-looks-like-a-local-call illusion. It worked on corporate LANs. It did not work across the internet.

The distributed object era died, but its ideas didn't. Interface-based programming, IDL, binary component models, code generation from interface definitions --- all of these survived and reappeared in later systems. gRPC's protobuf is a direct descendant of CORBA's IDL. Swift's protocol-oriented programming echoes COM's `QueryInterface`. The specific implementations failed. The patterns endured.

---

# Act IV: Apple's Own Path (1991--2011)

Apple's IPC story deserves its own post --- [and it has one](/posts/history-ipc-apple-path/). But the short version is one of the most dramatic arcs in this entire history.

In 1991, Apple shipped the Apple Event Object Model with System 7. It was remarkably ahead of its time --- a queryable, relational model for application state where you could ask for `word 3 of paragraph 2 of document "Chapter One"`. This wasn't RPC. It was closer to REST, a decade before Fielding's dissertation. Applications exposed their internal state as a graph of objects that other applications could query, filter, and manipulate.

AppleScript (1993) put a natural-language syntax on top of Apple Events. The idea was that end users could wire applications together through English-like scripts. It was easy to read and deceptively hard to write --- each application implemented its own scripting dictionary, and the terminology conflicts between apps were maddening. But nothing else could do what it did: reach across application boundaries and manipulate state through a unified protocol.

Then the world changed. The Mac went from a single-user offline computer to a networked machine processing untrusted data from every direction. Security became existential. In 2001, Mac OS X shipped on a Mach microkernel with capability-based port rights. In 2011, Apple introduced XPC --- a framework whose entire purpose was to make sure that the components of a *single* application could barely talk to each other. Privilege separation, not inter-app communication. Security won.

Apple went from the most ambitious inter-app communication model any mainstream OS had ever attempted to the most restrictive. [The full story is worth reading.](/posts/history-ipc-apple-path/)

---

# Act V: The Desktop Bus (2000s)

Before two programs can talk, they need to find each other.

**D-Bus (2002--2006)** solved this for the Linux desktop. Before D-Bus, GNOME used CORBA (through a framework called Bonobo --- yes, really) and KDE used its own protocol called DCOP. Both worked, neither talked to the other, and neither was suitable as a system-wide communication bus.

D-Bus unified them. It provided two buses: a system bus for system-level services (NetworkManager, UPower, systemd) and a session bus for user-level applications. Every Linux system service now speaks D-Bus. When your laptop detects a WiFi network, when your battery level changes, when a USB device is plugged in --- D-Bus carries those notifications.

The design was pragmatic. Messages had types and headers. Services registered well-known names on the bus. Introspection was built in --- you could query any service to discover what interfaces it offered. It wasn't elegant, but it worked, and it replaced a mess of incompatible protocols with a single standard.

**Bonjour / mDNS / DNS-SD (2002)** was Apple's take on a different piece of the discovery problem: how do devices on a local network find each other without a central server? The answer was multicast DNS --- reuse the DNS protocol, but broadcast queries to the local network instead of sending them to a name server. Add DNS Service Discovery on top to advertise what services are available.

Bonjour is why AirPrint, AirPlay, AirDrop, and Chromecast work without configuration. You don't need to type an IP address to print to a network printer or cast to a TV. The printer announces itself: "I'm a printer, I speak IPP, here's my name." Your computer hears the announcement and offers it as an option.

Discovery is half the battle. The most sophisticated IPC protocol in the world is useless if you can't find the other end.

---

# Act VI: The Web Eats Everything (1998--2015)

The internet solved the firewall problem by tunneling everything over HTTP. IPC became "APIs" and never looked back.

**XML-RPC (1998)** was the first pass: RPC over HTTP with XML payloads. Simple, but verbose. It grew into **SOAP (2000)**, which grew into the WS-\* specification jungle --- WS-Security, WS-Addressing, WS-ReliableMessaging, WS-Transaction, WS-BusinessProcess, WS-Choreography. Enterprise Java and C# developers consumed it because their toolchains generated the boilerplate. Everyone else despised it.

> *"I need to call one method and get back one number. The WSDL is 400 lines."*

**REST (Fielding, 2000)** was the antidote. Roy Fielding's doctoral dissertation didn't invent REST so much as name what the web was already doing: resources identified by URIs, manipulated through a uniform interface (GET, PUT, POST, DELETE), with representations flowing between client and server. Stop fighting the web's architecture and embrace it.

REST was simple. Maybe too simple --- "RESTful" came to mean different things to everyone. Some people meant "uses HTTP verbs correctly." Others meant "returns JSON." Others meant the full HATEOAS constraint that almost nobody actually implements. But the core idea --- resources with URIs, stateless interactions, standard verbs --- was powerful enough to dominate the next fifteen years of API design.

**gRPC (2015)** was Google open-sourcing their internal RPC framework (Stubby). IDL-driven code generation was back, this time with Protocol Buffers instead of CORBA IDL. HTTP/2 provided multiplexing and streaming. And unlike the original RPC dream, gRPC was explicit about the fact that remote calls are different from local calls --- it had first-class support for deadlines, cancellation, streaming, and error codes that acknowledged the reality of distributed systems.

gRPC is essentially what CORBA wanted to be: interface-defined, polyglot, code-generated RPC --- but pragmatic, fast, and designed by people who had actually built and operated distributed systems at scale.

**GraphQL (2015)** took a different angle entirely. Instead of the server deciding what data to return, the client specifies exactly what it needs. This solved the over-fetching problem that plagued REST APIs (you want one field but the endpoint returns forty) and the under-fetching problem (you need data from three endpoints to render one screen). Facebook built it to serve their mobile apps, and it turned out lots of other people had the same problem.

The web turned IPC into APIs. It solved cross-organization communication --- your app can talk to Stripe, Twilio, and GitHub through well-documented HTTP endpoints. But it lost something in the translation: the local, low-latency, tightly-integrated feel. An HTTP call to localhost is still an HTTP call. Serialization, deserialization, connection overhead, timeout handling --- all of it, even when both processes are on the same machine.

---

# Act VII: Modern App Silos (2008--Present)

Mobile platforms reinvented IPC and then immediately locked it down.

**Android** got the most interesting design. Binder is a kernel-level IPC mechanism inherited from BeOS (via Palm's OpenBinder). But the real insight was **Intents** --- a late-binding message routing system. When your app says "I want to share an image," it doesn't name a target application. The system resolves the intent at runtime, presenting the user with every app that has registered to handle image sharing. This is the most open model on any mobile platform.

**iOS** went the opposite direction. Inter-app communication was locked down from day one. URL schemes were the only escape hatch for years --- register `myapp://` and hope another app opens it. App Extensions (iOS 8, 2014) added limited integration points: share sheets, today widgets, keyboard extensions. App Groups let apps from the same developer share a container. But the default is isolation. Your app cannot see what other apps are running, cannot read their data, cannot send them messages. This is deliberate.

**Electron** --- the framework that puts Chromium in a desktop app --- has IPC between the main process and renderer processes. `ipcMain` and `ipcRenderer` pass messages back and forth within a single application. But there's no inter-app story at all. Your Electron app is an island. VS Code can't talk to Slack can't talk to Notion, even though they're all Electron apps running on the same machine. Three instances of Chromium, three V8 engines, three complete application silos, zero shared context.

The theme across all of these: platforms solved *intra-app* IPC but made *inter-app* communication harder than ever. And they did it on purpose. Security, privacy, and platform control all point in the same direction --- away from the open, anything-can-talk-to-anything vision that Apple Events embodied in 1991.

---

# The Gap: Context, Not Just Bytes

After fifty years, we can send any data between any two processes. Locally, over a network, across the internet, synchronously, asynchronously, streaming, batched. The plumbing is solved.

What's not solved is **semantic context sharing**.

No IPC system, past or present, can answer:

- "What is the user working on right now?"
- "What is the user looking at in this other application?"
- "How do these five open apps relate to each other?"
- "What context from App A would be useful to App B right now?"

Every IPC system assumes the developer knows at compile time (or at least deploy time) what data to send and where to send it. You write the serialization. You write the deserialization. You define the protocol. The *programmer* decides what flows between processes, not the *user*.

Nobody models the user's live, cross-app working context. Nobody provides a way for an application to say "here is what I currently have open and what state it's in" in a way that other applications can discover and consume.

And sandboxing moved in the opposite direction. Apps can see less of each other than ever. iOS apps can't even enumerate what other apps are installed. macOS apps in the App Store can't access files outside their sandbox without explicit user permission. The security model --- correctly --- treats every other process as untrusted.

So we have a paradox: the transport layer is more capable than ever, and the semantic layer is more impoverished than ever. We can send anything anywhere. We just don't know what to send.

---

# Where Fabric Fits

Fabric isn't replacing IPC at the transport layer. Mach ports, Unix sockets, HTTP --- those are fine. They work. The problem was never how to move bytes.

The problem is the semantic layer. Fabric is a **local context broker** --- a substrate that lets applications publish what they're working on and discover what other applications are working on, through a unified addressing scheme (`fabric://`) and a permission model that keeps the user in control.

The closest ancestor in this fifty-year lineage is Apple's AEOM --- a queryable model of application state. But the AEOM required each application to implement its own object model and scripting dictionary. Fabric inverts this: applications register resources, actions, and subscriptions with a central broker. Discovery is built in. The addressing is uniform. And because Fabric projects its resources through an MCP gateway, AI tools can consume cross-app context without custom integration.
