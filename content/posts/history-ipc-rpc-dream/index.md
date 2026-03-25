---
title: 'IPC: The RPC Dream (1980s)'
date: '2026-03-24'
draft: false
tags:
  - ipc
  - history
  - rpc
  - sun-rpc
  - dce
  - distributed-systems
summary: >-
  The seductive promise of making remote calls look local — and the hard lesson
  that followed.
projects:
  - stevemurr/fabric
series:
  - history-of-app-communication
params:
  cardGradient: '135deg, #1e3a5f, #2563eb, #60a5fa'
---

By the early 1980s, computers were no longer solitary machines. The minicomputer revolution and the rise of networked workstations had created a new problem: how should programs talk to each other across a wire? The previous decade had given us pipes and sockets and shared memory — mechanisms that worked beautifully when processes lived on the same box. But the network changed everything. Suddenly your collaborator's data lived on a machine across the hall, and the old abstractions felt primitive.

Into this gap stepped one of the most elegant and dangerous ideas in the history of computing: the Remote Procedure Call. The premise was irresistible. What if calling a function on a remote machine looked exactly like calling one locally? What if the network could be made invisible?

It was a dream that would shape decades of systems design. And it was, in important ways, a lie.

## The Intellectual Origins

The idea of making remote operations look like local function calls did not arrive fully formed. Its roots stretch back to the mid-1970s, when the early ARPANET was forcing researchers to confront the problem of resource sharing across networked nodes.

In 1974, Jon Postel and Jim White published RFC 674, "Procedure Call Protocol Documents, Version 2," an attempt to define a general mechanism for inter-node communication as part of the National Software Works (NSW) project. The protocol was controversial — RFC 684, published the following year, offered a pointed commentary on its limitations — but the core instinct was significant: model network communication as procedure calls with arguments and return values.

Two years later, RFC 707 ("A High-Level Framework for Network-Based Resource Sharing," 1976) pushed the idea further. Its authors observed that protocols like TELNET and FTP both followed a call-and-response pattern. Rather than requiring programmers to learn the specific command vocabularies of each remote service, why not define a generic interface for executing remote procedures — one that accepted an argument list and returned a result? The idea was to "mechanize" the interaction patterns that humans were already performing manually at terminals.

These were sketches, not implementations. The concept needed someone to give it a name and a rigorous foundation. That person was Bruce Jay Nelson.

## Nelson's Thesis and the Xerox PARC Implementation

Bruce Nelson's 1981 PhD dissertation at Carnegie Mellon University did something rare in computer science: it crystallized a vague intuition into a precise research program. Nelson coined the term "remote procedure call" and argued, systematically, that RPC was a "satisfactory and efficient programming language primitive for constructing distributed systems." The procedure call — the most fundamental unit of program structure — could serve as the basis for all distributed communication.

It was an audacious claim. And Nelson set out to prove it.

After completing his doctorate, Nelson joined Xerox PARC, where he partnered with Andrew Birrell. Together, they built what became the definitive early RPC system: the Cedar RPC mechanism, described in their landmark 1984 paper "Implementing Remote Procedure Calls," published in ACM Transactions on Computer Systems.

Their stated goal was disarmingly simple: "to make distributed computation easy." At the time, building distributed applications required deep expertise in network protocols, data serialization, and failure handling. Birrell and Nelson wanted to democratize this work. If RPC could make a remote call look syntactically and semantically identical to a local one, then any programmer — not just a networking specialist — could write distributed software.

The architecture they designed was composed of five layers: the user program, a user-stub, the RPCRuntime, a server-stub, and the server program. The user and server were the application code — the parts a programmer would actually write. Everything in between was infrastructure, and the key innovation was that most of it could be generated automatically.

The stubs were produced by a tool called Lupine, which took Mesa interface definitions — essentially, lists of procedure names with their argument and return types — and emitted the marshalling and unmarshalling code needed to serialize parameters, ship them across the network, and deserialize them on the other side. The programmer declared an interface; Lupine did the plumbing.

For service discovery, they used Grapevine, Xerox's distributed database system. Interfaces were represented as tuples of (type, instance), stored across replicated Grapevine servers. When a client wanted to bind to a remote service, it looked up the service's type in Grapevine, received a network address, and established a connection. If the server restarted, the binding would break automatically — identifiers were assigned using real-time clock counters, so a restarted server would present a different identity.

The transport protocol was custom-built. Rather than layering RPC on top of existing byte-stream protocols, Birrell and Nelson designed a protocol optimized for the specific pattern of RPC: small request, small response, low latency. They aimed for "exactly-once" semantics — each procedure should execute precisely once, even if packets were retransmitted — using 32-bit call identifiers to detect duplicates. Authentication was handled via DES encryption, with keys managed through Grapevine.

The system assumed a lightly loaded local Ethernet — about 10% typical utilization — connecting powerful individual workstations. This was the world of Xerox PARC in the early 1980s: a cluster of Alto and Dorado machines in a building, not a global internet. The assumption mattered, because it made the performance characteristics of a remote call close enough to a local one that the illusion could hold.

And here was the critical design decision that revealed the philosophy behind the entire project: the Cedar RPC system excluded timeouts. A call that didn't return simply hung, just as a local procedure call would hang if it entered an infinite loop. This was not an oversight. It was a deliberate choice to preserve the semantic equivalence between local and remote calls. If you added timeouts, you introduced a failure mode that had no local analogue, and the abstraction would leak.

The paper was a triumph. Birrell and Nelson received the 1994 ACM Software System Award for this work. But embedded in their design — in the choice to exclude timeouts, in the assumption of a local network — were the seeds of every problem that would follow.

## Sun RPC and the Rise of NFS

While Birrell and Nelson were building the Cedar RPC system at Xerox PARC, a more commercially aggressive effort was underway thirty miles away in Mountain View. Sun Microsystems, founded in 1982, was building networked workstations for engineers and scientists, and they needed a way to share files across machines.

The result was NFS — the Network File System — and the RPC mechanism that powered it became one of the most widely deployed implementations of the remote procedure call idea.

The development timeline was remarkably compressed. In March 1984, engineers at Sun began porting their user-level RPC and XDR (External Data Representation) libraries into the kernel. By June, they had kernel-to-user and kernel-to-kernel RPC calls working. By mid-August, the first NFS kernel was running. The core team included Russel Sandberg, who ported RPC to the kernel and implemented the NFS virtual filesystem; Tom Lyon, who designed the NFS protocol; and Bill Joy, who contributed to the overall architecture. Bob Lyon, Steve Kleiman, David Goldberg, and Dan Walsh rounded out the group.

Sun's RPC — later formalized as ONC RPC (Open Network Computing RPC) — was pragmatic where Birrell and Nelson's system had been elegant. It came with two key tools. XDR provided a platform-independent data serialization format, solving the problem of how to represent integers, floating-point numbers, and strings consistently across machines with different byte orderings and word sizes. And rpcgen, Sun's stub compiler, played the same role as Lupine at Xerox PARC: given an interface definition, it automatically generated the client and server stubs that handled marshalling, unmarshalling, and network transport.

Tom Lyon published the "Sun Remote Procedure Call Specification" in 1984. Sandberg published the NFS protocol specification in 1985, and the team presented "Design and Implementation of the Sun Network File System" at the USENIX Annual Technical Conference that same year.

What made Sun RPC consequential was not its technical novelty — it was less sophisticated than the Cedar system in several ways — but its openness and its killer application. Sun published the RPC and XDR specifications freely. They encouraged other vendors to implement NFS. Starting in 1986, Sun organized "Connectathons" — multi-vendor interoperability events where different NFS implementations were tested against each other. At the UniForum conference in February 1986, all the completed NFS ports were demonstrated working together.

This was strategic brilliance. By making NFS the lingua franca of networked file access in the Unix world, Sun ensured that its workstations were indispensable. ONC RPC version 2 was formalized in RFC 1050 (April 1988) and updated by RFC 1057 (June 1988), cementing its place as an industry standard.

NFS was the proof that the RPC dream could work in production. Millions of Unix systems used it daily, and it genuinely felt transparent — you mounted a remote filesystem and used it as if it were local. Files appeared, reads and writes worked, and the network was invisible. Most of the time.

## DCE/RPC: The Enterprise Answer

By the late 1980s, the success of Sun RPC had demonstrated the commercial viability of the remote procedure call model. But Sun's solution was tightly bound to the Unix world, and the emerging enterprise computing landscape — with its mix of VAX, IBM mainframes, and PC networks — demanded something more ambitious.

The Open Software Foundation (OSF), founded in 1988 by a consortium that included IBM, Digital Equipment Corporation, Hewlett-Packard, and Apollo Computer, set out to build a comprehensive distributed computing platform. The result was the Distributed Computing Environment (DCE), and at its heart was DCE/RPC.

The technical lineage of DCE/RPC ran through Apollo Computer. Apollo's Network Computing System (NCS), designed by Paul Leach and his colleagues, had introduced a sophisticated RPC framework with its own interface definition language (NIDL) and a location broker service for discovering remote services. Leach had been part of Apollo's founding engineering team and had architected their Domain distributed operating system. When OSF solicited technology submissions for DCE, Apollo's NCS became the foundation for DCE/RPC. Leach and others published "The Network Computing Architecture and System" at COMPCON 1988, laying out the ideas that would flow into DCE.

DCE was a grab bag of the best distributed systems technology of the era. The naming service came from Digital Equipment Corporation. The distributed file system (DCE/DFS) was based on the Andrew File System (AFS) from Carnegie Mellon. The security system used Kerberos from MIT. DCE/RPC bound them all together.

The first vendor products shipped in 1992. The system was ambitious, well-engineered, and immediately important — but its most consequential legacy came through an unexpected channel.

Microsoft licensed the DCE 1.1 RPC codebase and rewrote it substantially, creating MSRPC. Paul Leach himself eventually joined Microsoft, bringing deep institutional knowledge of the RPC architecture he had helped create at Apollo. MSRPC became the invisible backbone of Windows NT networking. The Windows Server domain protocols were built entirely on MSRPC. Remote administration tools, the print spooler, service management — all of it ran on RPC calls.

The early Microsoft implementation had its own idiosyncrasies. Microsoft initially ran RPC over named pipes (ncacn_np) rather than TCP/IP, because, as one Microsoft engineer later recalled, "Microsoft did not embrace IP protocols till NT 4.0/Win95 (circa 1996)." Named pipe transport security relied on NTLM authentication, which drew industry criticism — and the security reputation of MSRPC suffered by association.

But the strategic impact was enormous. DCE/RPC, through its Microsoft incarnation, became the most widely deployed RPC system in the world, running on hundreds of millions of Windows machines. Most Windows users — and even most Windows administrators — had no idea it was there. The network was invisible, just as Birrell and Nelson had envisioned.

The transparency was complete. And that, it turned out, was exactly the problem.

## The Seduction of Transparency

The dream of transparency was seductive because it aligned with one of the deepest instincts in software engineering: abstraction. Good abstractions hide complexity. The file system abstracts away the geometry of disk platters. Virtual memory abstracts away the physical limits of RAM. The procedure call itself abstracts away the mechanics of stack frames and register allocation.

RPC proposed to add one more layer: abstract away the network. A remote call should look, feel, and behave like a local one. The programmer shouldn't need to know — or care — whether the procedure they're calling lives in the same process, on the same machine, or on a server across the building.

This vision had a name in the academic literature: "access transparency." And through the 1980s, it seemed to be winning. NFS made remote files feel local. DCE/RPC made remote services feel local. CORBA, which began taking shape in the early 1990s, promised to make remote objects feel local. Each system pushed the same thesis: the network is an implementation detail, and good software should hide implementation details.

But the network is not an implementation detail. It is a fundamental physical reality, and it differs from local computation in ways that no abstraction can fully conceal.

A local procedure call takes nanoseconds. A remote one takes milliseconds — a difference of six orders of magnitude. A local call either succeeds or the entire process crashes. A remote call can fail in a third way: the call might have been sent, the server might have processed it, but the response was lost. Did the operation happen or not? You cannot know. A local call executes in a single thread of control. A remote call introduces true concurrency — the client and server are separate processes, potentially on separate machines, with separate clocks and separate failure domains.

These are not edge cases. They are the normal operating conditions of any networked system. And the RPC abstraction, by design, hid them.

## The Critique: Waldo and the Death of the Dream

The most devastating intellectual critique of the RPC transparency model came in 1994, when Jim Waldo, Geoff Wyant, Ann Wollrath, and Sam Kendall — all at Sun Microsystems Laboratories — published "A Note on Distributed Computing."

The paper is one of those rare artifacts that is more cited than read, but its arguments are precise and its conclusions are severe. Waldo and his co-authors identified four fundamental differences between local and distributed computing:

**Latency.** Remote calls are orders of magnitude slower than local ones. An architecture that treats them identically will make catastrophically bad performance decisions — calling a remote service in a tight loop, for instance, because the code looks like a local function call and the programmer doesn't realize it crosses a network boundary.

**Memory access.** Local objects share an address space. Remote objects do not. Passing a pointer to a remote service is meaningless. Serialization is not free, and the choice of what to serialize — by value or by reference — changes the semantics of the interaction in ways that have no local analogue.

**Partial failure.** This was the paper's most important contribution. In a local system, failure is total: if the process crashes, everything in it fails together. In a distributed system, components fail independently. The server might crash while the client is still running. The network might partition. The call might time out. The programmer must handle all of these cases, and the RPC abstraction provides no vocabulary for doing so.

**Concurrency.** Remote calls introduce concurrent execution between client and server, with all the attendant complexity of synchronization, ordering, and race conditions.

The paper's central argument was blunt: "objects that interact in a distributed system need to be dealt with in ways that are intrinsically different from objects that interact in a single address space." Any system that attempts to paper over this distinction — that pretends a distributed call is the same as a local one — "is doomed to fail."

Waldo and his colleagues surveyed the history of systems that had tried the transparency approach and found a consistent pattern: they worked in demos, struggled in production, and eventually forced programmers to pierce the abstraction and deal with the network directly. The unified model was not a simplification. It was a trap.

The paper's publication coincided with another influential articulation of the same insight. L. Peter Deutsch, also at Sun Microsystems, had been assembling what would become known as the "Fallacies of Distributed Computing" — a list of false assumptions that programmers make about networks. The first four fallacies were originally formulated by Bill Joy and Dave Lyon at Sun in the early 1990s; Deutsch added three more around 1994; James Gosling contributed the eighth in 1997. The list became famous:

1. The network is reliable.
2. Latency is zero.
3. Bandwidth is infinite.
4. The network is secure.
5. Topology doesn't change.
6. There is one administrator.
7. Transport cost is zero.
8. The network is homogeneous.

Every single one of these fallacies is an assumption that the RPC transparency model implicitly encourages. If a remote call looks like a local one, the programmer has no reason to consider reliability, latency, bandwidth, security, or any of the other realities of networked communication. The abstraction doesn't just hide the network — it hides the need to think about the network.

## The Lesson

The RPC era left an ambiguous legacy. On one hand, the core mechanism — define an interface, generate stubs, serialize arguments, make a call — proved extraordinarily durable. Every subsequent generation of distributed communication technology, from CORBA to SOAP to gRPC, is recognizably descended from Birrell and Nelson's architecture. The five-layer model of user, user-stub, runtime, server-stub, server has been reinvented so many times it might as well be a law of nature.

On the other hand, the philosophical claim at the heart of the RPC dream — that the network could be made invisible, that remote calls could be treated as local — was decisively refuted. Not by theory alone, but by the accumulated weight of production failures, performance disasters, and debugging nightmares that followed every attempt to take the abstraction literally.

The 1980s gave us the first serious attempt to make inter-process communication "just work" — to hide the messy reality of networks behind a clean procedural interface. The systems that emerged were genuinely useful. Sun RPC powered NFS. DCE/RPC powered Windows. Millions of machines relied on them daily.

But the decade also delivered the first hard lesson: it never just works. The network is always there, lurking behind the abstraction, waiting to remind you that a millisecond is not a nanosecond, that a timeout is not a crash, and that the machine you are talking to might already be dead.

The next act would see the industry try again, with objects instead of procedures. The lesson, as it turned out, had not yet been learned.

---

*This is Part 2 of the [History of App Communication](/series/history-of-app-communication/) series. The story continues with Act III, where CORBA and distributed objects attempt to solve the same problem — and discover the same truths.*

---

**Primary Sources**

- A. D. Birrell and B. J. Nelson, ["Implementing Remote Procedure Calls,"](https://web.eecs.umich.edu/~mosharaf/Readings/RPC.pdf) ACM Transactions on Computer Systems, Vol. 2, No. 1, February 1984.
- B. J. Nelson, "Remote Procedure Call," PhD Dissertation, Carnegie Mellon University, 1981.
- J. Waldo, G. Wyant, A. Wollrath, and S. Kendall, ["A Note on Distributed Computing,"](https://scholar.harvard.edu/files/waldo/files/waldo-94.pdf) Sun Microsystems Laboratories, 1994.
- R. Sandberg, D. Goldberg, S. Kleiman, D. Walsh, and B. Lyon, ["Design and Implementation of the Sun Network File System,"](https://www.cs.ucf.edu/~eurip/papers/sandbergnfs.pdf) USENIX Annual Technical Conference, 1985.
- RFC 707, "A High-Level Framework for Network-Based Resource Sharing," 1976.
- RFC 1057, "RPC: Remote Procedure Call Protocol Specification Version 2," June 1988.
