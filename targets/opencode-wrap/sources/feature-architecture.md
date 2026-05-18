# Feature Design Protocol (State-First Modular Flow)

## Phase 0 — Intent Framing (what is the user/system change?)

Before any architecture thinking:

> What *new behaviour* exists that didn’t exist before?

Write this in one sentence.

Then answer:

* What triggers it?
* What outcome does it produce?
* Is it synchronous or asynchronous?

If you can’t answer this cleanly, stop.

---

## Phase 1 — Identify State Boundaries (most important step)

Ask:

> What state is created, mutated, or read?

Classify every piece of state into one of three buckets:

### 1. Durable state

* DB records
* persisted entities
* agent runs, sessions, auth state

### 2. Ephemeral runtime state

* in-memory orchestration
* retries
* task execution
* streaming state

### 3. Derived state

* context windows
* prompts
* tool payloads
* computed views

Now assign ownership:

> “Which system owns this state?”

It must map to exactly one system boundary:

```text
agents | auth | sessions | analytics | entities | workflows | infra
```

If ownership is unclear → your design is already over-abstracted.

---

## Phase 2 — Draw the Flow (no code yet)

Write a linear execution trace:

```text
input → runtime → logic → state mutation → output
```

Example:

```text
POST /agent-run
  → AgentRuntime.start_run
  → Context assembly (logic)
  → LLM call (infra)
  → Tool execution (runtime orchestration)
  → Persist AgentTurn (state)
  → Emit events (infra/observability)
  → return stream/response
```

If you cannot draw this as a straight line:

* your boundaries are unclear
* or you are mixing logic and orchestration

---

## Phase 3 — Separate Logic vs Runtime

Now split everything into:

### A. Runtime (stateful orchestration)

Responsible for:

* sequencing
* retries
* persistence calls
* transaction boundaries
* approvals
* scheduling

Question:

> “Does this step *decide when/what happens next*?”

If yes → runtime.

---

### B. Logic (pure functions)

Responsible for:

* transformations
* mappings
* building payloads
* formatting
* selecting subsets
* generating derived structures

Question:

> “If I gave this function perfect inputs, would it need no database, no services, no hidden context?”

If yes → logic.

---

### C. Infra (external boundaries)

Responsible for:

* LLM calls
* DB access
* HTTP calls
* queues
* observability sinks

---

## Phase 4 — Decide the Module Location (ownership test)

Now place each piece into a system:

Ask:

> “If this feature disappeared, which subsystem breaks?”

That subsystem owns it.

Not:

* “what layer does it belong to?”

but:

* “what domain would behave incorrectly without it?”

This prevents accidental layering.

---

## Phase 5 — Minimal Abstraction Rule (anti-port check)

Before introducing any interface / protocol / abstraction:

Ask all 3:

### 1. Do we have 2+ implementations *today*?

If no → don’t create abstraction.

### 2. Is there real volatility at the boundary?

(e.g. external system, provider swap, runtime variation)

If no → don’t abstract.

### 3. Will this abstraction simplify future reasoning?

If it increases navigation cost → don’t do it.

If you can’t answer “yes” to at least 2 → remove the abstraction.

---

## Phase 6 — Write the Runtime First (not the abstractions)

This is the biggest behavioural change.

Start with:

```text
system/<feature>/runtime/
```

Write the orchestration first:

* what happens step by step
* what state is read/written
* what logic functions are called

Only after this stabilises do you extract:

```text
logic/
infra/
persistence/
```

This enforces **accretion over speculation**.

---

## Phase 7 — Validate the Flow Shape

Now check:

### 1. Is there a single “owner” of execution?

There should be exactly one runtime entrypoint per feature flow.

### 2. Are logic modules stateless?

They should not know about:

* DB
* services
* runtime classes

### 3. Are state transitions explicit?

No hidden mutations inside helpers.

If not → refactor toward explicitness.

---

## Phase 8 — Collapse Check (anti-over-modularisation step)

Ask:

> “Did we create files without increasing comprehension?”

If yes, collapse.

Specifically look for:

* single-function modules
* single-implementation interfaces
* pass-through services
* empty “ports”
* re-export files

These should be aggressively removed.

---

# The Mental Model You’re Enforcing

This protocol enforces a very specific structure:

```text
SYSTEM
  ├── runtime (state + orchestration)
  ├── logic (pure transformations)
  ├── infra (external world)
  └── api (entrypoints)
```

Everything else is optional and must justify itself.

---

# A Simple Checklist (usable in PRs)

Before merging any feature:

### State clarity

* [ ] Do we know exactly what state is created/changed?
* [ ] Is it obvious which subsystem owns it?

### Flow clarity

* [ ] Can the execution be written as a single linear trace?

### Logic purity

* [ ] Are transformations free of side effects?

### Runtime containment

* [ ] Is orchestration in one place, not scattered?

### Abstraction discipline

* [ ] No new interface without real multi-impl or volatility

### File necessity

* [ ] Every file has at least 2 meaningful responsibilities or is justified by complexity

---

# Why This Works Well for Your Architecture

This directly fixes the issues you identified:

### 1. Over-distributed understanding

→ runtime-first design forces a single “read path”

### 2. Speculative ports and abstractions

→ anti-interface rule removes most single-impl Protocols

### 3. Layer confusion (platform/application/modules)

→ replaced with ownership-based grouping

### 4. Hidden orchestration logic

→ forced into explicit runtime flows

---

# The Core Principle

If you compress everything down, the philosophy becomes:

> “Design systems by making execution obvious, state ownership explicit, and abstractions earned rather than assumed.”
