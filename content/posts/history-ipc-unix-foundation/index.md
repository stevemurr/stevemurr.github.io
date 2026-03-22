---
title: "IPC: The Unix Foundation (1970s)"
date: 2026-03-22
draft: false
tags: ["ipc", "history", "unix", "pipes", "system-v", "bsd"]
summary: "Pipes, signals, shared memory, and sockets — how Unix laid the groundwork for everything that followed."
projects: ["stevemurr/fabric"]
series: ["history-of-app-communication"]
params:
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
---

Before there were microservices, before there was gRPC, before anyone had typed the word "REST" into a conference abstract, there was a hallway at Bell Labs in Murray Hill, New Jersey. And in that hallway, sometime around 1964, a mathematician named Doug McIlroy had an idea that would quietly shape fifty years of software architecture.

He wrote it down in a memo. It was not a long memo.

## The Garden Hose

On October 11, 1964, McIlroy -- then head of the Computing Sciences Research Center at Bell Labs -- circulated an internal document that opened with a deceptively simple proposal:

> "We should have some ways of coupling programs like garden hose -- screw in another segment when it becomes necessary to massage data in another way."

At the time, Bell Labs computing ran mostly on IBM 7090 and 7094 hardware, operating in batch mode. Programs were monoliths. You wrote one program that did everything, or you wrote intermediate results to temporary files and fed them into the next program by hand. McIlroy's memo imagined something different: a world where programs could be connected end-to-end, each one transforming data as it flowed through, like water through a series of coupled hoses.

It was a beautiful idea. And for nearly a decade, nobody implemented it.

The concept intrigued McIlroy's colleagues -- Dennis Ritchie later recalled that McIlroy "explained one afternoon on a blackboard" how programs might be connected together, and that it "intrigued us but failed to ignite any immediate action." Ritchie admitted this was a failure of imagination. There were practical objections: how would you synchronize the programs? How would you handle buffering? What would the syntax look like? The idea sat in a drawer, gathering conceptual dust.

Then Unix happened.

Ken Thompson and Dennis Ritchie built their operating system at Bell Labs starting in 1969, and McIlroy watched it develop with growing impatience. Here was a system built on small programs and a simple file abstraction -- the perfect host for his garden-hose idea. By 1972, McIlroy was, by his own account, lobbying aggressively. He "very nearly exercised managerial control" to get pipes installed. What finally broke the logjam was not authority but naming: when McIlroy suggested calling the mechanism a "pipe" and proposed a workable shell syntax, Thompson was sold.

What happened next has become one of computing's great origin stories. On the evening of January 15, 1973, Ken Thompson sat down and implemented pipes in the Unix kernel. The job was, as Ritchie put it, "relatively simple" -- the file abstraction that Unix already provided meant that a pipe was essentially a small in-kernel buffer with a file descriptor on each end. Thompson added the `pipe()` system call, modified the shell to support the `|` operator, and by the next morning, pipes were live.

The syntax itself went through a few iterations. An early proposal used an infix notation: `input sort paginate offprint`. The first working implementation repurposed the redirection characters: `sort input>pr>opr>`. But these were ambiguous and ugly. The vertical bar won out: `sort input | pr | opr`. That `|` character, a glyph that had sat mostly unused on teletype keyboards, became the symbol of a philosophy.

Dick Haight, who was present that day, remembered the aftermath: "Practically minutes after the system came up with pipes working... it was a wonderful thing. Nobody would ever go back." McIlroy's own recollection was more colorful: "The advent of software pipes precipitated a day-long orgy of one-liners." Programs that had previously required complex argument parsing were quickly refactored to read from standard input when given no filename. Within a week, even the secretaries at Bell Labs were using pipes as if the feature had always been there.

Pipes made the Version 3 Unix Manual, released in February 1973. But more importantly, they crystallized something that had been emerging in the Unix community's thinking: a philosophy. McIlroy later articulated it explicitly:

> "Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface."

McIlroy himself noted that "all of those ideas, which add up to the tool approach, might have been there in some unformed way prior to pipes, but they really came in afterwards." The pipe was the mechanism, but the philosophy was the revolution. Small, composable tools connected by streams of text -- this was Unix's answer to the complexity problem. Instead of building one program that does everything, build many programs that each do one thing, and let the user compose them.

It was also, quietly, the first successful inter-process communication mechanism in widespread use. Two processes, running concurrently, passing bytes from one to the other through a kernel buffer. No files on disk. No shared memory. Just a stream of bytes and a convention that the sender writes and the receiver reads.

But bytes are all you get. A pipe has no opinion about what the data means. It does not know if it is carrying English text, binary records, or garbage. That lack of structure was both a strength -- it kept the mechanism universal -- and a limitation that would echo through every IPC system that followed.

## Signals: The Tap on the Shoulder

While pipes gave Unix processes a way to talk to each other in a sustained, flowing conversation, there was also a need for something more abrupt: a way to poke a process and say "stop," or "wake up," or "something has gone wrong."

This is where signals come in, and their history is older than pipes.

Version 1 of the Unix Programmer's Manual, dated November 3, 1971, already described separate system calls for catching interrupts, quits, and machine traps. These were the ancestors of signals -- not yet unified into a single framework, but already expressing the idea that a process might need to respond to asynchronous events. The `kill` command, which despite its violent name is really just a way to send a signal to a process, appeared in Version 2 in 1972.

By Version 4 (1973) -- the first edition of Unix written in C rather than assembly -- the disparate trap-handling calls had been consolidated into a single `signal()` system call. The V4 manual page listed twelve signals, numbered 1 through 12. Among them were the signals that remain familiar today: hangup (1), interrupt (2), quit (3), and the infamous signal 9 -- SIGKILL, the uncatchable, unblockable termination signal. SIGBUS (10), SIGSEGV (11), and SIGSYS (12) rounded out the list, all related to hardware faults and programming errors.

Version 6 (1975) added SIGPIPE (13) -- a direct consequence of pipes, sent to a process when it tries to write to a pipe whose reader has exited. Version 7 (1979) was the release that gave signals their symbolic names (SIGKILL, SIGTERM, SIGALRM, and so on) and added SIGALRM (14) for timer-based notifications and SIGTERM (15) as the polite counterpart to SIGKILL. Where SIGKILL is the operating system reaching in and terminating your process with no appeal, SIGTERM is a request: "please shut down cleanly." A process can catch SIGTERM, tidy up its resources, and exit gracefully. It cannot catch SIGKILL.

Doug McIlroy himself characterized the original design intent with characteristic bluntness: "`signal()` was there first and foremost to support SIGKILL; it did not purport to provide a sound basis for asynchronous IPC."

And that is the key point about signals. They are not really a communication mechanism. They carry no data -- a signal is a number, nothing more. You cannot attach a message to a signal. You cannot send a payload. All you can say is "signal 15 happened." The receiving process can choose how to respond, but it has to figure out the context entirely on its own. Signals are the equivalent of someone tapping you on the shoulder in a noisy room. You know you have been tapped, but you do not know why until you look around.

The early signal implementation also had a notorious technical flaw: signals were "unreliable." When a signal handler was invoked in V7 Unix, the signal disposition was automatically reset to the default action before the handler ran. This meant that if a second signal arrived while the handler was executing, the process would be killed (or otherwise default-handled) instead of invoking the handler again. The window was small but real, and it led to subtle, hard-to-reproduce bugs. It would take until 4.2BSD in 1983 to introduce reliable signals via `sigaction()`, closing the race condition that had plagued signal handling for a decade.

Signals survive to this day, largely unchanged in their fundamental design. They remain the standard mechanism for process lifecycle management in Unix-like systems: SIGTERM to request shutdown, SIGKILL to force it, SIGHUP to reload configuration, SIGUSR1 and SIGUSR2 for application-defined purposes. They are crude, limited, and occasionally dangerous -- but they solve a specific problem that nothing else in the Unix toolkit addresses: asynchronous notification with zero overhead.

## System V IPC: The Corporate Answer

By the early 1980s, Unix had pipes and signals, but there were problems that neither could solve. Pipes are unidirectional and require a parent-child relationship between processes (or at least a common ancestor that set up the pipe). Signals carry no data. What if you needed two unrelated processes to exchange structured messages, or to share a region of memory, or to coordinate access to a shared resource?

AT&T's answer arrived with System V, which introduced a suite of three IPC mechanisms: message queues, semaphores, and shared memory. These features had actually originated slightly earlier, in a Bell Labs development variant known as "Columbus Unix" (developed at the Bell Labs facility in Columbus, Ohio), and had been folded into AT&T's System III before being refined for System V's 1983 release.

The System V IPC suite was designed around a common identification scheme. Each IPC resource -- whether a message queue, a shared memory segment, or a semaphore set -- was identified by a numeric key. The `ftok()` function provided a way to generate these keys from a filesystem path and a project identifier, giving unrelated processes a way to agree on which IPC resource to use without having to pass file descriptors around.

The API that wrapped these mechanisms was... functional. To create a shared memory segment, you called `shmget()` with a key, a size, and creation flags. This returned a numeric identifier. You then called `shmat()` to attach the segment to your process's address space, at which point you could read and write to it as ordinary memory. When you were done, `shmdt()` detached it, and `shmctl()` with `IPC_RMID` marked it for deletion. Message queues followed a parallel pattern: `msgget()` to create or open, `msgsnd()` to send, `msgrcv()` to receive, `msgctl()` to manage. Semaphores: `semget()`, `semop()`, `semctl()`.

If this is starting to sound mechanical and tedious, that was the common criticism. The System V IPC API required a remarkable amount of ceremony for simple operations. Creating and using a shared memory segment required at minimum four system calls (`ftok`, `shmget`, `shmat`, and eventually `shmdt` plus `shmctl`), each with its own set of flags and error conditions. The resources were kernel-persistent: if a process crashed without cleaning up, the IPC objects would linger in the kernel's tables until someone manually removed them with `ipcrm`. There was no automatic cleanup, no reference counting, no connection to the filesystem's normal permission model beyond the initial `ftok` call.

Eric Raymond, in *The Art of Unix Programming*, classified System V IPC among "problematic" IPC methods to avoid. The criticism was not that the mechanisms were useless -- shared memory, in particular, remains the fastest way for two processes on the same machine to exchange large amounts of data -- but that the API design violated the Unix principle of simplicity. It felt bolted on rather than integrated, a set of mechanisms designed by committee to solve enterprise problems rather than to compose elegantly with the rest of the system.

The BSD camp, developing in parallel at UC Berkeley, took a different approach entirely. Rather than creating a separate IPC namespace with its own identification scheme, Berkeley's engineers unified local and network communication under a single abstraction: the socket.

## Unix Domain Sockets: Berkeley's Unification

In August 1983, the University of California at Berkeley released 4.2BSD, and with it, one of the most consequential API designs in computing history: the Berkeley sockets interface.

The sockets work was driven by a DARPA-funded effort to integrate TCP/IP networking into Unix. The steering committee assembled by DARPA's Duane Adams included Bill Joy and Sam Leffler from Berkeley, Rob Gurwitz from BBN (the firm that had built the original ARPANET), Dennis Ritchie from Bell Labs, and researchers from Stanford, Carnegie Mellon, MIT, and UCLA. Joy, who had already established himself as the driving force behind BSD Unix, led the implementation effort alongside Leffler, who brought deeper networking experience. (Joy would leave Berkeley in 1982 to co-found Sun Microsystems, but his architectural vision was already embedded in the 4.2BSD design.)

The socket API introduced a clean abstraction: `socket()` to create an endpoint, `bind()` to give it a name, `listen()` and `accept()` for servers, `connect()` for clients, and the familiar `read()`/`write()` or `send()`/`recv()` for data transfer. The design was protocol-agnostic, parameterized by an "address family" that determined what kind of communication the socket would perform.

For TCP/IP networking, you used `AF_INET` -- and this is the socket usage that most programmers encounter first. But 4.2BSD also introduced `AF_UNIX` (later also called `AF_LOCAL`): Unix domain sockets, which used the same API for purely local, same-machine communication. Instead of an IP address and port number, a Unix domain socket was named by a filesystem path -- `/var/run/myapp.sock`, for instance -- visible in the directory tree, subject to normal Unix file permissions.

This was an elegant design decision. Rather than inventing a new API for local IPC (as System V had done), Berkeley said: use the same API you use for the network. The only difference is the address family. A program that communicates over Unix domain sockets can be trivially modified to communicate over TCP by changing a few lines of setup code. The mental model is the same. The error handling is the same. The lifecycle is the same.

Unix domain sockets also addressed the limitations that pipes had carried since 1973. Where pipes are unidirectional, Unix domain sockets support bidirectional communication. Where pipes require a common ancestor process to set them up, Unix domain sockets can connect unrelated processes -- any process that knows the socket path and has permission to access it can connect. Where pipes carry only byte streams, Unix domain sockets support both stream-oriented (`SOCK_STREAM`) and datagram-oriented (`SOCK_DGRAM`) communication. They can even pass file descriptors between processes using `SCM_RIGHTS` ancillary messages -- a capability that remains, to this day, one of the more powerful and underappreciated features in the Unix IPC toolkit.

Performance was another advantage. Because Unix domain sockets skip the entire TCP/IP protocol stack -- there is no need for checksumming, sequencing, or routing when both endpoints are on the same kernel -- they are significantly faster than TCP loopback connections. The kernel can optimize the data path, often performing a simple memory copy from one process's buffer to another's.

The 4.2BSD release was so influential that it effectively ended the debate about how Unix should handle IPC. Pipes remained for simple, linear data flow. Signals remained for asynchronous notification. But for any scenario involving bidirectional communication between unrelated processes, sockets became the standard answer -- and Unix domain sockets became the workhorse of local IPC. Today, they underpin everything from Docker daemon communication (`/var/run/docker.sock`) to PostgreSQL client connections to D-Bus message routing on Linux desktops. The X Window System has used them since the 1980s.

4.2BSD also quietly reimplemented Unix pipes themselves as pairs of connected Unix domain stream sockets, a change that gave pipes bidirectional capability on BSD-derived systems (though POSIX later specified pipes as unidirectional, and many implementations followed suit).

## The Byte-Level Plumbing Problem

By the mid-1980s, Unix had assembled a remarkably complete toolkit for inter-process communication. Pipes for linear composition. Signals for asynchronous pokes. Shared memory for high-speed data exchange. Sockets for bidirectional, connection-oriented communication between any two processes, local or remote.

Every one of these mechanisms operates at the level of raw bytes. A pipe does not know whether it carries ASCII text or a serialized data structure. A socket transmits octets with no opinion about their meaning. Shared memory is just a region of address space -- it is up to the programmer to decide what the bytes represent and to ensure that both processes agree on the layout.

This was by design. The Unix philosophy of building universal, composable tools demanded that the transport layer remain agnostic about content. It would have violated everything McIlroy articulated to build a pipe that only carried, say, fixed-width database records. The power of `sort | uniq | wc -l` comes precisely from the fact that none of these programs know or care about each other's internals. They agree on one thing only: text, delimited by newlines.

But this agnosticism comes at a cost. When two processes need to exchange structured data -- records with fields, messages with types, requests with parameters -- someone has to define a format, write a serializer, write a parser, handle versioning, and deal with the inevitable bugs that arise when one side updates its format and the other does not. Unix gave us the plumbing, but it said nothing about what should flow through the pipes.

That gap -- the space between "I can send you bytes" and "we agree on what the bytes mean" -- is where the next fifty years of inter-process communication would unfold. The story of IPC after Unix is fundamentally the story of trying to add meaning to the byte stream: Sun RPC and XDR in the 1980s. CORBA and its IDL in the 1990s. XML-RPC and SOAP at the turn of the millennium. Protocol Buffers and Thrift in the 2000s. REST and JSON as the lingua franca of the web. gRPC and GraphQL in the 2010s.

Every one of these systems sits on top of the foundations that Unix laid in the 1970s and early 1980s. They all, eventually, write bytes into a file descriptor. The revolution that McIlroy imagined in 1964, that Thompson built in a single evening in 1973, that Joy and Leffler generalized into the socket abstraction in 1983 -- that revolution solved the problem of moving data between processes. What it deliberately left unsolved was the problem of making that data meaningful.

That is the story of Act II.
