---
title: "Act VII: Modern App Silos (2008–Present)"
date: 2026-03-16
draft: true
tags: ["ipc", "history", "android", "ios", "electron", "mobile", "sandboxing"]
summary: "Mobile platforms solved intra-app IPC but made inter-app communication harder than ever — deliberately."
projects: ["stevemurr/fabric"]
series: ["history-of-app-communication"]
params:
  cardGradient: "135deg, #1e3a5f, #2563eb, #60a5fa"
---

For fifty years, the arc of inter-process communication bent toward openness. Unix gave us pipes, sockets, and shared memory. The web gave us REST and gRPC. Each generation made it easier for programs to talk to each other. Then the smartphone arrived, and the arc reversed.

The mobile era — and the desktop paradigms it infected — solved intra-app IPC with an elegance that would have impressed the CORBA committee. But inter-app communication? That got harder than it had been since the 1970s. And it got harder on purpose.

This is the story of how three platforms — Android, iOS, and Electron — each answered the IPC question in the age of app stores and sandboxes. Their answers reveal a fundamental tension between the Unix philosophy of composable, cooperating processes and the security demands of a world where users install software from strangers.

## Android: The Open Model That Almost Wasn't

The story of Android's IPC begins not at Google, but at Be, Inc. — the company Jean-Louis Gassee founded after leaving Apple, the company that almost became the next Macintosh operating system.

Around 2001, a team of engineers at Be began building what they called the "next generation BeOS." At the heart of this effort was a new IPC framework: the Binder. The engineer leading this work was Dianne Hackborn, already a legendary figure in the BeOS community for her work on the system's application framework. The Binder wasn't just another message-passing mechanism — it was a rich, object-oriented system that treated processes, shared memory regions, and services as first-class objects that could be referenced, counted, and passed across process boundaries.

When Palm acquired Be, Inc. in 2001, the technology followed. Hackborn and the team ported the Binder to PalmSource's Cobalt operating system, which ran on a microkernel. When Palm later pivoted to Linux, the Binder came along again, and the code was [open-sourced around 2005](https://www.angryredplanet.com/~hackbod/openbinder/) under the name OpenBinder. In a [2006 interview with OSnews](https://www.osnews.com/story/13674/Introduction-to-OpenBinder-and-Interview-with-Dianne-Hackborn/), Hackborn described OpenBinder as providing "a rich object-oriented operating system environment that is designed to be hosted by today's traditional kernels" — something that ran on top of fork() and exec() rather than replacing them. Over approximately five years, the Binder had run on BeOS, Windows, the Cobalt kernel, and Linux. It was optimized for 200 MHz ARM processors, making it remarkably lightweight.

In 2006, Google hired Hackborn. She brought the Binder with her. While the original OpenBinder code was used for Android's initial bring-up, Hackborn [completely rewrote the implementation](https://events.static.linuxfound.org/images/stories/slides/abs2013_gargentas.pdf) around 2008, producing the kernel-level Binder driver that ships in every Android device today.

### Why Not Just Use Unix IPC?

Android runs on Linux. Linux already has pipes, sockets, message queues, shared memory, and signals. Why build something new?

The answer is that traditional POSIX IPC mechanisms have [fundamental limitations](https://www.dre.vanderbilt.edu/~schmidt/cs282/PDFs/android-binder-ipc.pdf) that make them unsuitable for a mobile application platform. Named pipes require world-writable directories — a security nightmare Android eliminated as a matter of global policy. Message queues and standard pipes cannot pass file descriptors between processes. None of them support credential management between senders and recipients. None provide automatic resource cleanup through reference counting. And critically, none of them support the kind of object reference tracking needed for a system where hundreds of apps need to discover and bind to services at runtime.

Binder solved all of these problems. It operates through a kernel driver at `/dev/binder`, and its key innovation is [single-copy data transfer](https://medium.com/@python-javascript-php-html-css/understanding-binder-androids-optimized-ipc-mechanism-eb8f02dc4a68): when a message is sent from one process to another, the kernel allocates space in the destination process's address space and copies the data directly from the source, avoiding the double-copy overhead of pipe-style IPC. It provides built-in reference counting and death notifications, preventing the resource leaks that plague socket-based architectures. And it allows object references themselves to be passed between processes — a capability that sockets simply do not support without building an entire framework on top of them.

### Intents: Late-Binding at the Application Layer

If Binder is the transport, Intents are the routing layer — and they represent the most philosophically interesting IPC design decision of the mobile era.

An Intent is, at its core, a data container that describes something the user wants to do. When an app creates an implicit Intent — say, "I want to share an image" — it does not specify which app should handle that request. Instead, the Android system examines every installed app's [Intent Filters](https://developer.android.com/guide/components/intents-filters), which are declarations in their manifest files describing what kinds of actions and data types they can handle. The system presents the user with a list of matching apps, and the user chooses.

This is late binding in the most literal sense. The connection between "I want to share" and "Instagram can receive shares" is resolved at runtime, based on what happens to be installed on that particular device at that particular moment. No compile-time dependency. No hardcoded URLs. No service registry. Just a declarative expression of capability, matched against a declarative expression of need.

Explicit Intents, by contrast, specify exactly which component should handle the request — a direct address, like a function call. They are used for intra-app navigation and for calling specific known services.

The implicit Intent model made Android the most open mobile platform for inter-app communication. Any app could declare itself as a handler for any action. A user could install a third-party browser, email client, or camera app, and the system would route intents to it just as readily as to the built-in apps. This was, as Hackborn [described the philosophy](https://discuss.haiku-os.org/t/video-about-android-history-mentioning-be-and-dianne-hackborn/15127): making sure "all apps had equal standing and could seamlessly interact with each other."

But openness came with costs. Implicit intents became a [known attack surface](https://developer.android.com/privacy-and-security/risks/implicit-intent-hijacking) — a malicious app could register intent filters for sensitive actions and intercept data meant for legitimate handlers. Over the years, Android has progressively tightened the model, requiring explicit intents for more operations and restricting background receivers. The arc toward restriction, it turns out, is universal.

## iOS: Security as Architecture

If Android's IPC philosophy was "open by default, restrict when necessary," Apple's was precisely the inverse: "closed by default, open only when we control the seam."

From the very first iPhone in 2007, iOS apps have been sandboxed. Each app gets a unique home directory, randomly assigned at install time, and cannot access any other app's files, memory, or processes. There is no equivalent of Android's implicit Intents. There is no way for an app to declare itself as a general-purpose handler for a class of actions. The sandbox is not a suggestion — it is enforced by a mandatory access control mechanism historically called [Seatbelt](https://support.apple.com/guide/security/security-of-runtime-process-sec15bfe098e/web), baked into the kernel.

The IPC mechanisms Apple has permitted over the years reveal a company adding the minimum viable communication channels under maximum constraints.

### URL Schemes: The Narrowest Possible Door

The original inter-app communication mechanism on iOS was the URL scheme. An app could register a custom protocol — say, `myapp://` — in its Info.plist file. Another app could then call `UIApplication.shared.open(URL)` to launch that app with parameters encoded in the URL string. This is not IPC in any meaningful sense. It is one app asking the operating system to launch another app. There is no return channel. There is no way to pass structured data beyond what fits in a URL string. There is no way to know if the target app is even installed without trying to open the URL and seeing what happens.

URL schemes were the IPC equivalent of passing notes under a door — you could send a message, but you couldn't have a conversation.

### App Extensions: Controlled Interoperability (iOS 8, 2014)

At WWDC 2014, Apple introduced [App Extensions](https://www.macstories.net/stories/ios-8-extensions-apples-plan-for-a-powerful-app-ecosystem/) — and the framing was telling. Craig Federighi described them as extensions living "in app sandboxes," with apps reaching out to them through system-controlled channels. The architecture was deliberately indirect: a host app communicates with an extension, but the extension's containing app does not communicate with the host app. The system handles all interprocess communication through higher-level APIs; developers never touch the underlying IPC mechanism.

Apple provided specific, enumerated extension points: Today widgets, Share extensions, Action extensions, Photo Editing extensions, Document Providers. You could not invent your own extension type. You could not create a general-purpose communication channel. Each extension point had a defined protocol, a defined lifecycle, and defined limits on what data could flow through it.

This was the anti-Android approach. Where Android said "declare what you can do, and the system will route requests to you," Apple said "here are the six things we have decided apps should be able to do together, and you will do them through the interfaces we designed."

### App Groups: Shared Containers Under Shared Identity

For apps from the same developer that need to share data, Apple provided [App Groups](https://developer.apple.com/documentation/security/protecting-user-data-with-app-sandbox) — a shared container directory accessible to apps with matching entitlements and provisioning profiles. This was not inter-app communication in the general sense. It was intra-developer communication, gated by code signing and Apple's provisioning infrastructure. You could share UserDefaults and files between your own apps, but not with anyone else's.

### UIPasteboard: The Accidental IPC Channel

The system pasteboard — [UIPasteboard](https://developer.apple.com/documentation/uikit/uipasteboard/) — became, almost by accident, one of the most used inter-app data transfer mechanisms on iOS. Copy in one app, paste in another. It was general-purpose, worked across all apps, and required no special entitlements.

Naturally, Apple restricted it. Starting in iOS 9, pasteboard access was limited to foreground apps, preventing background clipboard monitoring. Named pasteboards were scoped to the creating app's lifecycle. And iOS 14 introduced the famous "paste notification" banner — alerting users every time an app read the clipboard, a passive-aggressive nudge that effectively shamed apps into not using the pasteboard as a covert data channel.

### Why Apple Chose Restriction

Apple's approach was not accidental, and it was not laziness. It was a [deliberate architectural philosophy](https://mas.owasp.org/MASTG/0x06a-Platform-Overview/) rooted in the constraints of the original iPhone: limited processing power, limited memory, limited battery. Sandboxing allowed Apple to make guarantees about performance, battery life, and security that would be impossible if apps could freely communicate, spawn background processes, and access each other's data.

But the deeper reason was trust — or rather, the absence of it. The App Store model introduced a new reality: users would install software from developers they had never heard of, running code they could not inspect, on a device that held their most personal data. In this world, the Unix philosophy of openness and composability was not a virtue. It was a liability. Every IPC channel is an attack surface. Every shared resource is a potential data leak. Apple decided that the cost of restricted inter-app communication — developer frustration, reduced composability, workarounds that sometimes pushed developers toward [riskier alternatives](https://redfoxsecurity.medium.com/locked-in-a-box-how-ios-sandboxing-challenges-pentesters-8207476da296) — was worth the benefit of a platform where one bad app could not compromise another.

## Electron: IPC as Internal Architecture

While Android and iOS were defining the mobile IPC landscape, a different kind of application was emerging on the desktop: the web app wrapped in a native shell.

In 2013, GitHub needed to build a text editor. Rather than write three separate native applications for Windows, macOS, and Linux, engineers created a framework that embedded Chromium (for rendering web content) and Node.js (for system access) in a single application. They called it [Atom Shell](https://www.electronjs.org/blog/10-years-of-electron), after the editor it was built to power. It launched in public beta in April 2014, was open-sourced in May 2014, and was eventually renamed Electron.

Electron's architecture splits every application into two kinds of processes: a single **main process** (Node.js) that controls the application lifecycle, creates windows, and has full access to the operating system; and one or more **renderer processes** (Chromium) that display the UI but, by default, have no access to Node.js APIs or the filesystem.

The IPC between these processes — [ipcMain and ipcRenderer](https://www.electronjs.org/docs/latest/tutorial/ipc) — is one of the most elegant internal IPC systems in modern software. Processes communicate by passing messages through named channels. The API is simple: `ipcRenderer.send('channel-name', data)` fires a message to the main process; `ipcMain.on('channel-name', handler)` receives it. Invoke patterns allow request-response semantics. The channels are arbitrary strings, the data is serialized automatically, and the whole thing feels like an in-process event emitter that happens to cross a process boundary.

### The Security Evolution

Electron's security story is a cautionary tale about the cost of convenience. In early versions, `nodeIntegration` was enabled by default in renderer processes, meaning any JavaScript running in the UI — including scripts loaded from remote URLs — had full access to Node.js and could read files, execute commands, and access the network. This was the equivalent of giving every webpage root access to your computer.

The fix came in stages. First, Electron introduced the **preload script** — a script that runs in the renderer process before any web content loads, with access to Node.js APIs. Then came [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge) (Electron 6+), which provides a safe way to expose specific APIs from the preload script to the renderer's JavaScript context without leaking the full Node.js environment. By Electron 12, `contextIsolation` was enabled by default and `nodeIntegration` was off by default.

The deprecated `remote` module — which allowed renderer processes to transparently call main process objects as if they were local — was perhaps the most instructive casualty. It embodied exactly the same "transparency" illusion that Waldo et al. warned about in their 1994 critique of RPC: pretending that a cross-process call is the same as a local call. The [remote module's deprecation](https://www.electronjs.org/docs/latest/tutorial/security) in favor of explicit IPC via contextBridge was Electron recapitulating, in miniature, thirty years of distributed systems wisdom.

### The Missing Dimension

But here is the thing about Electron IPC that matters most for this history: it is entirely intra-app. There is no mechanism for one Electron app to communicate with another. Each Electron app is its own island — its own Chromium instance, its own Node.js runtime, its own process tree. VS Code cannot talk to Slack. Notion cannot talk to Figma. If they need to exchange data, they fall back to the operating system's IPC mechanisms (which, on macOS, means XPC or Mach ports; on Linux, D-Bus or sockets; on Windows, COM or named pipes) or, more commonly, they route through a web API — out to the internet and back — even when both apps are running on the same machine.

Electron solved the internal IPC problem beautifully, then drew a hard boundary at the application's edge. Every Electron app is a silo.

## The Great Reversal

Zoom out, and the pattern is stark. In 1973, Ken Thompson could pipe the output of one program into another in a single shell command. In 1991, Apple Events let AppleScript query `word 3 of paragraph 2 of document "My File"` from any application that supported the protocol. In the 1990s, COM let you embed an Excel spreadsheet inside a Word document with full interactivity.

By 2024, two apps running on the same iPhone cannot share a file without going through a system-controlled extension point. Two Electron apps on the same laptop cannot exchange a message without routing through a cloud server. Android's Intent system — the most open model in the mobile era — has been progressively tightened to prevent the very inter-app communication it was designed to enable.

This is not a failure of engineering. It is a success of a different set of priorities. The Unix philosophy assumed a trusted environment — a shared machine administered by a knowledgeable operator, running software from known sources. The mobile era destroyed every one of those assumptions. Users are not administrators. They install software from strangers. Their devices hold the most sensitive data in their lives. In this context, every IPC channel is an attack surface, every shared resource is a potential exfiltration vector, and the [principle of least privilege](https://source.android.com/docs/security/app-sandbox) demands that apps see as little of each other as possible.

The app store model reinforced this. When a platform vendor controls software distribution, it has both the incentive and the mechanism to enforce strict isolation. Apple's revenue depends on user trust in the platform's safety. Google's depends on ensuring that one malicious app cannot compromise the ecosystem. Sandboxing is not just a security measure — it is a business model.

And so we arrive at a paradox. The plumbing has never been better. Binder performs single-copy IPC with reference counting and death notifications. Electron's ipcMain/ipcRenderer is a masterclass in simple, secure message passing. Even iOS's extension system, constrained as it is, provides a reliable and secure channel for specific interactions.

But the semantic layer — the ability for apps to understand each other's context, to know what the user is working on across application boundaries, to compose functionality as freely as Unix pipes once composed commands — that has regressed. We have better pipes than ever, and we have built walls around every app so that nothing can flow through them.

The plumbing works. The walls are higher than they have ever been. And users are still copying and pasting between apps, the same way they were in 1984 — except now the operating system shows them a banner about it.
