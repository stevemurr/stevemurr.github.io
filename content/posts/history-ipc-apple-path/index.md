---
title: "Act IV: Apple's Own Path (1991–2011)"
date: 2026-03-19
draft: false
tags: ["ipc", "history", "apple", "apple-events", "applescript", "mach", "xpc", "macos"]
summary: "From the most ambitious inter-app communication model to the most restrictive — Apple's twenty-year arc."
projects: ["stevemurr/fabric"]
series: ["history-of-app-communication"]
params:
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
---

In 1991, Apple shipped the most ambitious inter-application communication system any mainstream operating system had ever attempted. Applications could query each other's internal state using a hierarchical, relational object model --- a design that anticipated the philosophy of REST by nearly a decade. Twenty years later, in 2011, Apple shipped XPC, a framework whose entire purpose was to make sure that the components of a *single* application could barely talk to each other at all.

Between those two bookends lies one of the most fascinating arcs in the history of IPC: a journey from radical openness to radical restriction, from empowering the end user to protecting them, and from a bet that inter-app communication would define the future of personal computing to the hard-won realization that security had to come first.

## Apple Events and the Object Model Nobody Understood (1991)

On May 13, 1991, Apple released System 7, the most significant update to the Macintosh operating system since its debut. Among its headline features --- virtual memory, personal file sharing, TrueType fonts --- was a less glamorous but far more architecturally radical addition: Apple Events.

Apple Events were a message-based interprocess communication mechanism that allowed applications to send structured commands and queries to one another. On the surface, this sounds like any other IPC system. Underneath, it was something genuinely different.

The team behind Apple Events had to confront a brutal constraint: in 1990, the Macintosh OS could switch processes no more than 60 times per second. You could not afford chatty, fine-grained RPC calls between applications. Every round trip was expensive. This limitation forced an architectural decision that turned out to be visionary: rather than designing a system where you called methods on remote objects one at a time, Apple built a *query language*.

The result was the Apple Event Object Model, or AEOM. Where COM and CORBA would let you grab a pointer to a remote object and call methods on it, the AEOM let you describe the objects you wanted using nested specifiers:

```
word 3 of paragraph 2 of document "Chapter One"
```

This was not syntactic sugar. It was a fundamentally different addressing model. An object specifier in the AEOM was a query --- comparable to an XPath expression or a CSS selector --- not a pointer. When you sent an Apple Event containing an object specifier, the target application resolved it against its current state. The specifier described *what* you wanted, not *where* it lived in memory. You could ask for "every paragraph whose font is Helvetica" and the application would figure out the answer.

The AEOM organized objects through *relationships* rather than physical containment. Objects could be reached through multiple paths. The same file on the Finder's desktop could be addressed as an item in a folder or as a selection on the desktop --- two different relational paths to the same underlying object. Where a command returned objects, it returned new queries that could identify those objects in the future, not pointers to their in-memory representations.

This was, as many observers have noted, more REST-like than RPC-like --- a decade before Roy Fielding published his dissertation. The system dealt in representations and queries rather than remote method invocations. It was stateless in the sense that each query was self-describing. It was resource-oriented rather than procedure-oriented. Apple had stumbled into something architecturally prescient, born not from abstract philosophy but from the pragmatic constraint of a cooperative multitasking system that could not afford to context-switch its way through a chain of method calls.

The AEOM was the work of a small team at Apple, steered in large part by Kurt Piersol. Piersol had come to Apple from Xerox, where he had built systems in Smalltalk-80 and helped productize research from Xerox PARC. He was hired in 1989 to work on what would become the AppleScript project, originally tasked with building a development environment for the new scripting language. He ended up taking on a much larger role: steering the design of both the Apple Events infrastructure and the object model that made it powerful. The Apple Events team was originally part of the Developer Tools group under Larry Tesler --- another Xerox alumnus --- before Piersol took over its direction.

The ambition was staggering. Apple wanted every application on the Macintosh to expose its internal state through a standardized, queryable object model. They wanted end users to be able to reach into any application, pull out data, transform it, and push it into another application --- all through a unified protocol. System 7 required every application to support at least four "required" Apple Events: open application, open documents, print documents, and quit. But the real vision was much broader: a world where the boundaries between applications dissolved into a seamless, scriptable fabric.

It was a vision that very few application developers fully embraced.

## AppleScript: The Language That Read Better Than It Wrote (1993)

If Apple Events were the engine, AppleScript was the steering wheel meant to put that engine in the hands of ordinary users.

AppleScript shipped in October 1993 as part of System 7.1.1 (also known as System 7 Pro). The AppleScript 1.0 Developer's Toolkit had arrived earlier, in April 1993, but the first end-user release was AppleScript 1.1 in September of that year. The language grew out of Apple's experience with HyperCard and its HyperTalk scripting language. In the late 1980s, Apple had considered making HyperTalk the standard scripting language across the entire operating system. Engineers recognized that a similar but more object-oriented language could be designed to work with any application, not just HyperCard, and the AppleScript project was born.

AppleScript's defining gambit was natural-language syntax. Scripts were meant to read like English:

```applescript
tell application "Finder"
    get the name of every file of the desktop whose name extension is "pdf"
end tell
```

The Open Scripting Architecture (OSA) provided the low-level plumbing --- a consistent, system-wide mechanism for multiple applications to communicate and exchange data. AppleScript sat on top of this architecture as one possible "dialect," though it became the dominant one. At its core, AppleScript was a mechanism for constructing and dispatching Apple Events. The `tell` block identified the target application. The English-like statements inside it were compiled into Apple Event object specifiers and sent across process boundaries.

The trouble was that AppleScript's readability was a trap. The language was easy to *read* but deceptively hard to *write*.

The natural-language syntax created an illusion of simplicity that evaporated the moment you tried to do anything non-trivial. The grammar was ambiguous in ways that English speakers did not expect from a programming language. Terminology could conflict between different scripting dictionaries. A word like `name` might mean one thing in the Finder's dictionary and something subtly different in a text editor's dictionary, and when you used both applications in the same script, the conflicts were maddening.

Worse, each application implemented its own scripting dictionary --- its own mapping of English-like terms to Apple Event codes. There was no enforcement of consistency. The "every file whose..." query syntax worked beautifully in the Finder but might not exist at all in another application, or might use completely different terminology for the same concept. William Cook, in his history of AppleScript for HOPL III, observed that the naturalistic syntax made scripts *more* difficult to write, not less --- a paradox that plagued the language throughout its life. You almost had to understand everything before you could know anything. The dictionary was of little use without understanding the grammar, and the grammar was vague enough that even experienced scripters stumbled.

Despite all of this, AppleScript survived. It survived because nothing else could do what it did: reach across application boundaries and manipulate application state through a unified protocol. The AEOM and Apple Events were genuinely powerful, and AppleScript was the only human-facing language that spoke them fluently. Power users, system administrators, and workflow automators built elaborate AppleScript solutions that wired together applications that had never been designed to work together. The language persisted for decades, not because it was good, but because the underlying architecture --- the queryable, relational, cross-application object model --- was irreplaceable.

## Mach Ports: The Kernel Beneath Everything (1985--2001)

While Apple was building its inter-application communication utopia on the classic Mac OS, a completely different IPC tradition was developing at Carnegie Mellon University --- one that would eventually swallow the Macintosh whole.

In 1985, Richard Rashid and Avie Tevanian began work on the Mach kernel at CMU, funded by a DARPA grant. Mach was the logical successor to CMU's earlier Accent kernel, and its goals were ambitious: build an operating system kernel designed from the ground up for parallel and distributed computing. The project ran from 1985 to 1994, producing several major versions that would influence operating system design for decades.

Mach's central IPC abstraction was the *port*: an endpoint of a unidirectional communication channel between a client and a server. If you wanted bidirectional communication, you used two ports. Ports were not just communication endpoints --- they were the system's fundamental security mechanism. Mach implemented a *capability-based* security model: if you held the right to a port, you could use it. If you did not, you could not. There was no ambient authority, no file-path-based permission check. The capability *was* the right.

Port rights came in three flavors: send rights (allowing you to write messages to a port), receive rights (allowing you to read messages from it), and send-once rights (for reply messages). A task could only interact with ports for which it held rights in its port namespace. Rights could be transferred between tasks by including them in messages --- a capability could be delegated by sending it to someone else. This was elegant, composable, and deeply alien to programmers raised on Unix's user-ID-based permission model.

Messages carried through Mach ports could contain pure data, copies of memory ranges (optimized with copy-on-write), port rights themselves, and kernel-implicit attributes like the sender's security token. The system was asynchronous by default: messages were logically copied into the receiving task's address space. One thread could wait on multiple ports simultaneously using port sets.

Mach 1.0 shipped internally at CMU in 1985. By 1990, Mach 2.5 had become a practical system --- still a microkernel in theory, but with BSD kernel code co-located in kernel space for performance. The true microkernel, Mach 3.0, arrived between 1991 and 1994, moving services out of the kernel into user-space servers.

Meanwhile, Steve Jobs had left Apple in 1985 and founded NeXT. NeXTSTEP, released in 1989, was built on a Mach 2.5 kernel with a 4.3BSD Unix subsystem layered directly into kernel space --- a hybrid approach that prioritized performance over microkernel purity. Avie Tevanian, co-author of Mach itself, became head of software engineering at NeXT. He understood better than almost anyone the trade-offs between microkernel elegance and real-world performance, and NeXTSTEP's hybrid kernel reflected that understanding.

In December 1996, Apple acquired NeXT for $427 million. With that acquisition came not just Steve Jobs (who would become CEO within a year) but the entire NeXTSTEP technology stack --- including Tevanian, who became Apple's VP of Software. The decision to base the next-generation Mac OS on NeXTSTEP rather than BeOS or a clean-sheet design meant that Mach ports would become the bedrock IPC primitive of every Apple operating system going forward.

The new kernel, christened XNU ("X is Not Unix"), was a hybrid: Mach's microkernel abstractions --- ports, tasks, threads, virtual memory --- combined with a BSD subsystem running in the same address space for performance. Apple upgraded the Mach component with code from OSFMK 7.3 (the Open Software Foundation's Mach 3.0 kernel) and incorporated FreeBSD elements into the BSD layer. The result shipped as the kernel of Mac OS X 10.0 (Cheetah) on March 24, 2001.

From that point forward, Mach ports were everywhere in macOS, even if most developers never touched them directly. The bootstrap server (later absorbed into `launchd`) used Mach IPC for service management. The WindowServer received user input events via Mach messages. File descriptor passing was implemented as Mach port rights in messages. Notifications and system events flowed through port-based mechanisms. Mach ports were the substrate on which everything else was built --- including, eventually, the framework that would redefine what IPC meant on Apple's platforms.

## XPC: IPC as a Security Boundary (2011)

At WWDC 2011, Apple introduced XPC as part of OS X Lion, and with it completed a philosophical reversal twenty years in the making.

Where Apple Events had been designed to let applications talk to *each other* --- to dissolve the boundaries between programs and create a seamless, scriptable computing environment --- XPC was designed to erect boundaries *within* a single application. The unit of IPC was no longer the inter-app message but the intra-app security boundary. The goal was not communication but *isolation*.

The pitch was elegant. Damian Seresso, responsible for XPC and `launchd` at Apple, presented the core insight: a modern application should not be one monolithic process. It should be a collection of small, purpose-built services, each running with the minimum privileges it needed and nothing more. Decompress a JPEG? That happens in an XPC service with no network access and no access to the user's files. Parse an H.264 video? Another XPC service, another sandbox, another set of minimal entitlements. If one of these services crashed or was compromised, the damage was contained. The attacker had gained control of a process that could not do anything useful.

Apple's own QuickTime Player was the showcase example. Video decoding --- historically one of the richest attack surfaces in any media application --- happened in an isolated XPC service. The service was sandboxed and could not access the user's address book, could not read their email, could not escalate privileges. A buffer overflow in a malformed video file would give an attacker control of a process that was, by design, nearly powerless.

Each XPC service ran in its own sandbox, configured by default to be maximally restrictive: minimal filesystem access, no network access, no access to user data. Services were launched on demand by `launchd`, terminated when idle, and automatically restarted if they crashed. The lifecycle was entirely managed. The developer's job was to define the interface --- the protocol of messages the service could receive --- and trust the system to handle everything else.

Underneath, XPC was built on Mach ports. The high-level API --- `NSXPCConnection` in Objective-C, or the C-based `xpc_connection` API --- abstracted away the port-level details, but every XPC message was ultimately a Mach message flowing through the kernel's capability-based IPC infrastructure. The connection between an application and its XPC service was a pair of Mach ports, and the security guarantees were enforced by the kernel's port rights model. Apple explicitly made the encoding opaque and warned developers not to interact with the underlying transport directly.

The inversion from Apple Events to XPC was total. Apple Events asked: *how can we let applications share their state with the world?* XPC asked: *how can we prevent the components of a single application from accessing anything they don't absolutely need?* Apple Events treated IPC as a tool for empowerment. XPC treated IPC as a tool for containment.

## The Arc: From Ambition to Restriction

The twenty-year path from Apple Events to XPC is not a story of failure and correction. It is a story of the computing environment changing around a set of ideas.

In 1991, the Macintosh was a single-user, non-networked, cooperative-multitasking personal computer. There was no internet to speak of. There were no drive-by downloads, no malicious email attachments, no state-sponsored exploit chains. In that world, the vision of Apple Events made perfect sense: applications as open, queryable services that users could wire together to automate their work. The threat model was a user who might accidentally delete a file. The design optimized for power and flexibility.

By 2011, the Mac was a networked computer perpetually connected to a hostile internet. Applications routinely processed untrusted data: web pages, email, media files, documents from unknown sources. Every parser was an attack surface. Every media codec was a potential entry point. The threat model was a sophisticated attacker who could craft a malicious JPEG that exploited a buffer overflow in an image decoder. The design had to optimize for containment.

Apple Events and the AEOM represented the most ambitious vision of inter-application communication that any mainstream operating system ever shipped. The idea that every application would expose a queryable, relational object model --- that you could reach into any program and ask for "every paragraph whose font is Helvetica" --- was genuinely radical. It anticipated concepts that the rest of the industry would not articulate for another decade.

But the world moved toward security, and security demanded boundaries. Mach ports, inherited from a research kernel designed at CMU in the 1980s, provided the mechanism: capability-based access control, where possessing a port right was both necessary and sufficient for communication. XPC used those Mach ports to build something the Apple Events team would have found alien: an IPC framework whose primary purpose was to *limit* what processes could do.

AppleScript survives to this day, still wiring applications together through Apple Events, still using the AEOM's query-based addressing model. But the energy, the investment, the architectural attention at Apple has long since shifted. The future of IPC on Apple's platforms is not the open, queryable, relational model that Kurt Piersol and his team built in 1991. It is the sandboxed, minimal-privilege, security-first model that XPC embodies.

The most ambitious inter-application communication system became the most restrictive. Security won. And in a world of networked computers processing untrusted data from every direction, it was right to.

---

### Sources

- William R. Cook, ["AppleScript,"](https://www.cs.utexas.edu/~wcook/Drafts/2006/ashopl.pdf) *Proceedings of the Third ACM SIGPLAN Conference on History of Programming Languages* (HOPL III), 2007.
- ["Understanding Apple Events,"](https://hhas.bitbucket.io/understanding-apple-events.html) SwiftAutomation documentation.
- ["Mach Overview,"](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/KernelProgramming/Mach/Mach.html) Apple Kernel Programming Guide (archived).
- ["Creating XPC Services,"](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingXPCServices.html) Apple Developer Documentation (archived).
- ["Introducing XPC,"](https://nonstrict.eu/wwdcindex/wwdc2011/206/) WWDC 2011, Session 206.
- ["Apple's Darwin OS and XNU Kernel Deep Dive,"](https://tansanrao.com/blog/2025/04/xnu-kernel-and-darwin-evolution-and-architecture/) tansanrao.com, 2025.
- ["The Unlikely Persistence of AppleScript,"](https://macworld.com/article/2018607/the-unlikely-persistence-of-applescript.html) *Macworld*.
- ["System 7 Transformed the Mac on May 13, 1991,"](https://appleinsider.com/articles/21/05/13/system-7-transformed-the-mac-on-may-13-1991) *AppleInsider*.
