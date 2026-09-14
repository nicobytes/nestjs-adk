# Feature Specification: Durable Queue Proof for Agent Conversations

**Feature Branch**: `001-durable-queue-poc`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "Prove, at demo fidelity, whether an in-process conversational agent can sit behind a durable work queue for a customer-messaging product: the channel is acknowledged immediately, rapid texts become one agent turn, retries and process restarts do not lose or duplicate work, a choice can pause and resume from a click, conversation identity is separate from the channel identity, human takeover silences the agent, an operator reply is visible on the next agent turn, and the operator inbox shows what was sent on the channel while agent memory keeps only a short gist. Produce a written go / no-go. Do not clone the production CRM, its database, or a live messaging integration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Channel is acknowledged before the agent finishes (Priority: P1)

A customer message arrives on the messaging channel. The channel partner must receive a success acknowledgement immediately, before the agent has finished composing a reply. The turn itself runs as background work. If that work fails, it is tried again. If the application process stops and starts again before a scheduled turn runs, the turn still runs, as long as the durable queue and the conversation stores are still available.

**Why this priority**: This is the reason to put a durable queue in front of the agent. If acknowledgement still waits for the agent, or scheduled work dies with the process, the queue does not earn its place and the proof stops.

**Independent Test**: Send one customer message whose agent turn takes about 1.5 seconds, force one failed attempt, and restart the process while a short-delay turn is waiting. Confirm acknowledgement time, a later successful attempt, and survival of the delayed turn.

**Acceptance Scenarios**:

1. **Given** an agent turn that takes about 1.5 seconds, **When** a customer message is accepted, **Then** success is returned within 100 milliseconds, and the customer receives the agent reply only after that acknowledgement.
2. **Given** a customer message is accepted, **When** success is returned, **Then** the inbound acceptance did not wait for the background turn to finish before responding.
3. **Given** the first attempt of a turn fails, **When** the work is tried again, **Then** a later attempt runs the agent and the customer receives the reply, within 3 attempts.
4. **Given** a turn is scheduled to run after a short delay, **When** the application process stops and starts again against the same durable queue and the same conversation stores, **Then** the scheduled turn still runs.

---

### User Story 2 - Rapid texts become one turn, and nothing is lost while busy (Priority: P1)

A customer often sends several short texts in a burst ("hello", then "how are you"). Texts that arrive inside a short grouping window (about 400 milliseconds) should be seen as one turn, not as three separate turns. A text that arrives while a turn is already running must still be handled afterward. A button click must not be folded into that text burst.

**Why this priority**: Grouping a burst, and not losing messages that arrive during a turn, is a primary reason the product uses a queue. A queue that runs one turn per message, or that drops texts that arrive while busy, is not worth adopting.

**Independent Test**: Send three texts for the same conversation inside the grouping window and confirm a single agent turn containing all three. While a turn is still running, send another text and confirm a follow-up turn includes it. Send a button click and confirm it is not mixed into the text batch.

**Acceptance Scenarios**:

1. **Given** three customer texts for the same conversation arrive within the grouping window, **When** that window elapses, **Then** the agent runs exactly once and that turn's customer input contains all three texts.
2. **Given** a delayed turn is already scheduled for that conversation, **When** further texts arrive inside the window, **Then** those texts are still kept and included in the single turn, and a competing extra turn is not started for them.
3. **Given** a turn is already running for a conversation, **When** another customer text arrives for that conversation, **Then** a follow-up turn after the current one includes that text. Losing it is a failure.
4. **Given** a button click arrives for a conversation that also has free text waiting, **When** work is scheduled, **Then** the click is not placed in the text batch; it is handled immediately and separately.

---

### User Story 3 - One busy conversation does not freeze the others (Priority: P1)

While one customer's agent turn is in flight, another customer (or a simple health check) must still be accepted promptly. The proof must show whether background work in the same application actually isolates conversations. If it does not, the decision record must say a separate background service is required. That separate service is not built in this proof.

**Why this priority**: A queue that still blocks every other customer is not background processing. The team needs that evidence before choosing this architecture.

**Independent Test**: Start a turn that is waiting on outside work for about 1.5 seconds, not a turn that freezes the application on purpose. During that wait, accept a message for a different conversation, or request a health check, and measure how quickly that second request succeeds.

**Acceptance Scenarios**:

1. **Given** one conversation's agent turn is waiting about 1.5 seconds on outside work, **When** another conversation's message is accepted or a health check is requested, **Then** that second request succeeds within 200 milliseconds.
2. **Given** the second request does not succeed within 200 milliseconds because the application is stuck, **When** the demonstration is recorded, **Then** the decision record states that a separate background service is required, and that service is not built in this proof.

---

### User Story 4 - A choice pauses, a click resumes, and the customer is not spammed (Priority: P1)

The agent asks the customer to choose among options and shows buttons. That turn completes; a pause is not work left hanging. The customer's click resumes the same choice. The remembered response is the option that was chosen, not a typed stand-in such as the letter of the option as the only user text. The pause survives a process restart. Retrying the turn after the buttons were already sent does not send the buttons again. A pause does not also send leftover prose.

**Why this priority**: Choice-and-resume is an existing product behavior that must keep working once turns move to background jobs. A double send, a lost pause, or a resume that looks like typed text is a no-go.

**Independent Test**: Run a turn that asks for a choice, click an option, and confirm one buttons send, a choice response in agent memory, and no extra prose. Repeat with a process restart between the ask and the click. Repeat with a failure after the buttons were sent, and confirm the retry does not send a second set.

**Acceptance Scenarios**:

1. **Given** the agent asks the customer to choose, **When** the turn finishes, **Then** the customer has been shown buttons once, the turn is complete rather than left hanging, and a pending choice is recorded. The operator inbox shows that a buttons message was sent.
2. **Given** a pending choice, **When** the customer clicks an option, **Then** the agent resumes that same choice. Agent memory records the chosen option identity. A typed stand-in, such as the letter of the option, is not the only trace of the click.
3. **Given** a choice is pending, **When** the application process restarts before the click, **Then** the click still resumes the choice. The pending choice is read from durable agent memory. Volatile channel state alone is not an acceptable source; if that is the only source, the design fails and must be corrected before the demonstration can pass.
4. **Given** buttons were already sent for a choice and the background work then fails, **When** that same work is retried, **Then** buttons are not sent a second time for that choice request.
5. **Given** a turn pauses to ask for a choice, **When** outbound messages for that turn are reviewed, **Then** the customer sees one buttons message and no leftover prose. If the agent both speaks and asks for a choice, the prose is not sent. If leftover prose cannot be withheld, the decision record states a no-go for delivery to the customer.

---

### User Story 5 - The conversation is not the channel identity (Priority: P2)

Each open customer thread has its own conversation identity. That identity is what the agent uses as its session. The messaging-channel identity (who to address on the channel) is stored on the conversation, not encoded into the session. Two different channel identities are two conversations. The same channel identity reuses the open conversation. Closing a conversation makes the next message from that channel identity start a new conversation and a new agent session.

**Why this priority**: Human takeover, export, and later bookings hang off the conversation, not off a channel-derived session key. If those cannot be separated, the product architecture is a no-go even if the queue works.

**Independent Test**: Accept messages from two channel identities and confirm two conversations and two agent sessions. Accept a second message from the first identity and confirm reuse. Close that conversation, send again, and confirm a new conversation and a new agent session.

**Acceptance Scenarios**:

1. **Given** a customer message with a channel identity and text, **When** no open conversation exists for that identity, **Then** one conversation is created in automatic-bot status, the agent's session identity is the conversation's own identity, and the channel identity is stored on the conversation so replies can be addressed.
2. **Given** two different channel identities, **When** each sends a message, **Then** two conversations and two agent sessions exist.
3. **Given** an open conversation for a channel identity, **When** that same identity sends again, **Then** the same conversation and the same agent session are reused.
4. **Given** a conversation has been closed, **When** the same channel identity sends again, **Then** a new conversation identity and a new agent session are used.

---

### User Story 6 - Human takeover silences the agent (Priority: P2)

An operator takes a conversation. While it is waiting for a human, or a human is active, further customer messages are stored and the agent does not run and does not send bot text or buttons. Releasing the conversation back to the bot allows the next customer message to run the agent again. No operator console is required; the takeover and release actions themselves are enough.

**Why this priority**: A bot that keeps answering after a human has taken over is a product failure, independent of whether the queue is durable.

**Independent Test**: Mark a conversation as waiting for a human, send a customer message, and confirm it is stored with no agent turn and no bot outbound. Release the conversation and confirm the next message runs the agent.

**Acceptance Scenarios**:

1. **Given** a conversation is waiting for a human, **When** the customer sends a message, **Then** the message is stored as a customer inbox message, the agent does not run, and no bot text or buttons are sent.
2. **Given** a conversation is in human-active status, **When** the customer sends a message, **Then** the same skip rules apply: the message is stored, the agent does not run, and no bot outbound is sent.
3. **Given** a conversation is released back to automatic-bot, **When** the customer sends again, **Then** the agent runs for that message.

---

### User Story 7 - An operator reply is remembered on the next agent turn (Priority: P2)

Today an operator can speak on the channel and the agent never sees it. That is a silent failure for coexistence. An operator reply must be sent to the customer, stored in the inbox, and written into agent memory without asking the agent to generate a reply. The next customer question must be answered in light of what the operator said.

**Why this priority**: If the human and the agent do not share memory, the CRM and the agent cannot coexist. Copying inbox messages into the history the agent reads is not an acceptable substitute.

**Independent Test**: Operator says "the price is 100". Customer then asks what the price was. The agent's reply mentions 100. Confirm the operator text was stored in the inbox and written into agent memory without an agent reply at the moment of the operator message.

**Acceptance Scenarios**:

1. **Given** an operator sends "the price is 100", **When** the reply is accepted, **Then** the customer receives that text, the inbox stores an operator message, and agent memory is updated without generating an agent reply.
2. **Given** that operator statement is in agent memory, **When** the customer asks what the price was, **Then** the agent's reply reflects that the price is 100.
3. **Given** an operator statement cannot be written in a form the agent will see, **When** the demonstration is recorded, **Then** it is a failure: the operator statement must be in agent memory. Copying inbox rows into the history the agent reads is not an acceptable workaround.

---

### User Story 8 - The inbox and agent memory stay separate (Priority: P2)

After an ordinary bot turn, the operator inbox and the agent's memory both contain that turn, but they are not substitutes for each other. The agent prepares its next turn only from its own memory. The operator inbox is painted only from inbox messages. Both survive a process restart. The agent must not be fed a hand-built history copied out of the inbox.

**Why this priority**: This answers whether a production database clone is required. It is not. What is required is writing both records from the same turn, with a clear owner for each.

**Independent Test**: Complete one automatic-bot text turn with no pause. Confirm one customer inbox message and one bot inbox message, and matching customer and agent content in agent memory. Restart the process and confirm both records remain. Confirm the history the agent uses was not assembled from inbox messages.

**Acceptance Scenarios**:

1. **Given** an automatic-bot text turn completes without a pause, **When** both records are inspected, **Then** the inbox has one customer message and one bot message, and agent memory has the customer content and the agent content (and any extra actions from that turn).
2. **Given** the next agent turn is prepared, **When** its history is assembled, **Then** it is assembled only from agent memory, not by copying inbox messages into that history.
3. **Given** an operator views the inbox, **When** the thread is shown, **Then** it is shown only from inbox messages, not by reading agent-memory events.
4. **Given** the application process restarts, **When** both records are read again, **Then** the inbox messages and the agent-memory events from that turn are still present.
5. **Given** the only way for the bot to remember a prior turn is to copy inbox messages into the history the agent reads, **When** the demonstration is recorded, **Then** the result is a no-go.

---

### User Story 9 - The operator sees the channel; the agent remembers the gist (Priority: P2)

Buttons, lists, locations, and media that go out on the channel must be visible in the operator inbox with enough detail to show them again (the options, the pin, the file), not as a vague note that "options were sent". Agent memory must not store the exact channel message used to draw that interface. It may store the small intent (the question and the option identities and titles, or coordinates) and a short gist of the result ("options shown; waiting for a click", "pin sent"). A click is an option identity in agent memory and a choice row in the inbox. The operator can read the option title from the last buttons message in that conversation, without opening agent memory.

**Why this priority**: If the operator cannot see what the customer was shown, the inbox is incomplete. If the exact channel message is stored in agent memory, later turns waste the agent's attention and tend to echo raw interface data. Either failure is a no-go. Putting that channel message into agent memory is not how an incomplete inbox is fixed.

**Independent Test**: Send a choice, a click, and a location. Confirm the inbox can show the choices and a pin from inbox messages alone, including after restart, and that no agent-memory event contains the exact channel message used to draw them.

**Acceptance Scenarios**:

1. **Given** the agent asks for a choice and buttons are sent, **When** agent memory and the inbox are inspected, **Then** no agent-memory event contains the exact channel message used to draw the buttons, the remembered result (if any) is a short gist or empty, and the inbox buttons message includes the full set of option identities and titles that were sent on the channel.
2. **Given** the agent requested a choice, **When** the remembered request details are inspected, **Then** they may include the question and small options (identity and title) and must not include the exact channel message used to draw the buttons.
3. **Given** the customer clicks an option, **When** both records are inspected, **Then** agent memory stores the option identity on the choice response, and the inbox has a choice row whose text is the option title when known (otherwise the option identity). A user text of the option letter is not the only trace.
4. **Given** a location is sent on the channel, **When** both records are inspected, **Then** the inbox has a location message with coordinates, and agent memory has either small coordinates on the request or a short gist such as a pin being sent — not the exact channel location message.
5. **Given** only inbox messages, **When** an inbox view is built, **Then** it can show the question and the option choices (or the pin, or the media caption) without reading agent-memory events, and those messages remain after a process restart.
6. **Given** a media item is sent on the channel, **When** the inbox is inspected, **Then** it has a media message with a caption or filename and enough detail to open the item (where it is, and what type it is). Agent memory does not store the exact channel media message.
7. **Given** the only thing that can be remembered after a send is the full channel message, and there is no way to keep only a gist, **When** the demonstration is recorded, **Then** the decision record says the gist must be written before memory is stored. It must not say to keep the full channel message in agent memory.

---

### User Story 10 - A reviewer can decide go or no-go from a written record (Priority: P1)

The outcome of this proof is a decision, not a feature shipped to customers. A reviewer must be able to answer each architecture question from a written record, with evidence, and see an overall recommendation. If immediate acknowledgement or burst batching fails, the record is still written and the remaining work is not required to justify the queue.

**Why this priority**: The proof exists to choose an architecture. Behaviors without a recorded decision do not finish the job. An early stop with a clear no-go is a successful outcome of the proof.

**Independent Test**: After the demonstrations (or after an early stop), read only the decision record and confirm every question has a result and evidence, and that the overall recommendation follows the published go / no-go rules.

**Acceptance Scenarios**:

1. **Given** the demonstrations have finished or stopped early, **When** a reviewer reads the decision record, **Then** each question below has a result and the evidence that supports it.
2. **Given** the published go / no-go rules, **When** the overall recommendation is read, **Then** it is yes, no, or yes-with-conditions for putting the agent behind a durable queue in the product (one organization, one new agent rather than a port), and a separate no or later for porting the existing specialist agents.
3. **Given** immediate acknowledgement or burst batching has failed, **When** the proof stops, **Then** the decision record is still written, and further stories are not required in order to reject the queue.

The decision record must answer:

1. Does the channel receive acknowledgement before the agent runs?
2. Does delayed work survive an application restart?
3. Do three texts become one agent turn?
4. Is a text that arrives during a turn still processed afterward?
5. Does another conversation stay responsive during a turn?
6. Is background processing worth it compared with running the agent while the customer is still waiting on acknowledgement? Answer yes, no, or yes with a separate background service.
7. Does a choice pause complete, and does the click resume as a choice response rather than typed text?
8. Does the pause survive restart from durable agent memory, not only from process memory?
9. Is the conversation identity the agent session identity, with the channel identity stored separately?
10. Does human takeover skip the agent?
11. Does an operator reply enter agent memory without a model call, and show up on the next turn?
12. Are inbox messages and agent memory both written, without using the inbox as the history the agent reads?
13. Do buttons, lists, and clicks appear in the inbox for the operator?
14. Is the remembered result a short gist, not the exact channel message?
15. Are remembered request details small intent (the question and option identities), not the exact channel message?
16. Does resume store the option identity in agent memory and a choice row in the inbox?
17. Can the inbox be rendered without reading agent-memory events?
18. Does a retry avoid sending buttons twice?
19. Does a pause avoid sending both leftover prose and buttons?
20. Are built-in planning and the ability to reuse prior conversation context still unavailable (already known; not re-tested)?
21. Go for agent plus durable queue in the product? Yes, no, or yes with conditions.
22. Go for porting the existing specialist agents? No, or later.

---

### Edge Cases

- A second or third text arrives while a delayed turn for that conversation is already scheduled: the text is kept and included; a second turn for that window is not started.
- A text arrives while a turn is already running: a follow-up turn must include it. Omitting the follow-up and losing the text is a failure.
- A button click is waiting in the same window as free text: the click is not drained together with the texts. Mixing them breaks choice resume.
- Background work fails after buttons were already sent: the retry must not send a second set of buttons for the same choice request.
- The process restarts between a choice ask and the click: resume must use durable agent memory. If the pending choice lives only in temporary memory that disappears when the process stops, that is a design failure.
- A conversation is closed, then the same channel identity writes again: a new conversation and a new agent session are created. The closed thread is not reused.
- A conversation is waiting for a human or a human is active: the inbound is stored; the agent does not run; no bot text or buttons are sent.
- The agent both speaks and asks for a choice in the same turn: the customer does not receive leftover prose in addition to the buttons. If that cannot be withheld, delivery to the customer is a no-go.
- The exact channel message used to draw buttons, a pin, or media appears in agent memory: that is a failure. The fix is to store a gist before memory is written, not to accept that message in memory.
- The inbox has only a vague text such as "options were sent", with no option list, coordinates, or media details: the operator cannot show the thread. That is a failure, and it is not fixed by putting the channel message into agent memory.
- Acknowledgement is implemented by waiting until the background turn finishes: that fails the immediate-acknowledgement criterion even if a queue is involved.
- Each message becomes its own background turn with no burst grouping: the queue is not worth it; it is the current behavior plus extra infrastructure.
- A durable queue cannot be stood up within about an hour of effort: the queue items are marked blocked and the proof stops. Short in-application delays are not an acceptable substitute for a durable queue.
- Background work blocks other conversations: record that a separate background service is required. Do not build that service in this proof.
- The clicked option's title is unknown: the inbox choice row stores the option identity.
- No model credential is available: demonstrations that need the model to ask a choice or to reflect an operator fact are skipped, not failed. Location and media inbox mapping may use a channel stand-in without a live model.
- Two open conversations for the same channel identity must not result from ordinary find-or-create. An open conversation is reused.
- Built-in planning and the ability to reuse prior conversation context are already known to be unavailable. They are noted again in the decision record and are not checked a second time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Accepting a customer message MUST return success before the agent finishes the turn. When the turn takes about 1.5 seconds, success MUST be returned within 100 milliseconds, and the customer-facing reply MUST arrive only after that acknowledgement.
- **FR-002**: Accepting a customer message MUST only record the message and schedule background work. It MUST NOT wait for the agent turn to finish before responding.
- **FR-003**: A failed agent turn MUST be retried and then completed, up to 3 attempts, with about 1 second between attempts.
- **FR-004**: A scheduled turn MUST still run after the application process restarts, provided the durable queue and the conversation stores remain available.
- **FR-005**: Several customer texts that arrive within the grouping window for the same conversation MUST become exactly one agent turn whose customer input contains all of those texts.
- **FR-006**: Further texts that arrive while a delayed turn is already scheduled for that conversation MUST still be included in that single turn. They MUST NOT start a competing turn for the same window.
- **FR-007**: Customer texts that arrive while a turn is already running MUST be included in a follow-up turn after the current one finishes. Losing them MUST be treated as a failure.
- **FR-008**: Button clicks and human-handoff actions MUST NOT enter the text grouping batch. A click MUST be scheduled immediately and separately from free text.
- **FR-009**: While one conversation's agent turn is waiting about 1.5 seconds, another conversation's inbound or a health check MUST succeed within 200 milliseconds. The wait used in this demonstration MUST yield; a tight loop that deliberately blocks the process is not a valid demonstration.
- **FR-010**: If FR-009 cannot be met because the application is stuck, the decision record MUST state that a separate background service is required. That service MUST NOT be built in this proof.
- **FR-011**: The agent MUST NOT be invoked as part of accepting an inbound message. The turn runs as background work.
- **FR-012**: When the agent asks the customer to choose, the turn MUST complete (a pause is not a hanging job), buttons MUST be shown once, and a pending choice MUST be recorded. The inbox MUST show that a buttons message was sent.
- **FR-013**: A click on a pending choice MUST resume that choice. Agent memory MUST record the chosen option identity. A typed stand-in, such as the letter of the option, MUST NOT be the only trace of the click.
- **FR-014**: A pending choice MUST survive an application restart. It MUST be recovered from durable agent memory. Volatile channel state MUST NOT be the only source.
- **FR-015**: Retrying background work after buttons were already sent for a choice request MUST NOT send a second set of buttons for that same request.
- **FR-016**: When a turn pauses for a choice, the customer MUST see one buttons message and MUST NOT also receive leftover prose from that turn. If the agent both speaks and asks for a choice, the prose MUST NOT be sent. If that cannot be withheld, the decision record MUST state a no-go for delivery to the customer.
- **FR-017**: An inbound with a channel identity MUST find or create one open conversation in automatic-bot status. The agent's session identity MUST be the conversation's own identity. The channel identity MUST be stored on the conversation and MUST NOT be encoded into the session identity.
- **FR-018**: Two different channel identities MUST produce two conversations and two agent sessions. The same channel identity MUST reuse the open conversation.
- **FR-019**: Closing a conversation MUST cause the next inbound from that channel identity to create a new conversation and a new agent session.
- **FR-020**: While a conversation is waiting for a human or a human is active, an inbound customer message MUST be stored as a customer inbox message, MUST NOT run the agent, and MUST NOT send bot text or buttons.
- **FR-021**: Releasing a conversation back to automatic-bot MUST allow the next inbound customer message to run the agent.
- **FR-022**: An operator reply MUST be sent on the channel, stored as an operator inbox message, and written into agent memory without generating an agent reply.
- **FR-023**: After an operator states a fact, the next customer question about that fact MUST be answered in light of that fact. If the operator statement cannot be made visible to the agent, that MUST be recorded as a failure. Copying inbox messages into the history the agent reads MUST NOT be used as a substitute.
- **FR-024**: After an automatic-bot text turn with no pause, the inbox MUST contain one customer message and one bot message, and agent memory MUST contain the user content and the model content (and any tool activity from that turn).
- **FR-025**: The agent MUST assemble the history for its next turn only from agent memory. It MUST NOT read the inbox to assemble that history. The operator inbox MUST be shown only from inbox messages. It MUST NOT be shown by reading agent-memory events.
- **FR-026**: Inbox messages and agent-memory events MUST both survive an application restart.
- **FR-027**: Using inbox messages as the history the agent reads, so the bot remembers, MUST be treated as a no-go.
- **FR-028**: When buttons, a list, a location, or media are sent on the channel, the inbox MUST store enough detail to show that item again, not only a vague text fallback. The mapping MUST be: text stores the text; buttons store the question plus the full options (identity and title) and enough to match a later click to that buttons message; a list stores the question plus any button label and the sections or options; a location stores a name or coordinates plus latitude, longitude, name, and address; media stores a caption or filename plus where the item is, what type it is, and the caption; an inbound choice stores the option title when known (otherwise the option identity) plus the option identity.
- **FR-029**: Agent memory MUST NOT store the exact channel message used to draw buttons, a list, a pin, or media. It MAY store small intent (the question and option identity/title, or coordinates) and a short gist of the result. A remembered result that is exactly that gist is acceptable. Small intent on the request is acceptable. The exact channel message is not.
- **FR-030**: A customer click MUST be stored in agent memory as the option identity on the choice response, and in the inbox as a choice row. The operator MUST be able to read the option title from the last buttons message in that conversation, without reading agent memory.
- **FR-031**: An inbox view MUST be constructable from inbox messages alone (the question plus the choices, the pin, or the media), including after restart.
- **FR-032**: If the only remembered result of a send is the full channel message and there is no way to keep only a gist, the decision record MUST say the gist has to be written before memory is stored. It MUST NOT recommend storing the full channel message in agent memory.
- **FR-033**: The proof MUST produce a written decision record that answers every question listed in User Story 10, each with a result and evidence, plus an overall recommendation.
- **FR-034**: A go for agent-plus-durable-queue MUST be recorded only when immediate acknowledgement, burst batching, follow-up of texts that arrived during a turn, restart survival, choice pause and resume (including after restart), conversation identity as the agent's session identity, human takeover, retry without a second button send, and the inbox/gist split all pass. Other-conversation responsiveness MUST pass, or the record MUST explicitly require a separate background service. Operator-visible-to-agent and separate durable histories MUST pass, or the record MUST document a workaround that still writes the operator statement into agent memory rather than copying inbox messages into the history the agent reads.
- **FR-035**: A no-go MUST be recorded if any of the following is true: resume is only typed text; retry sends buttons twice; inbox messages are copied into the history the agent reads; human takeover does not stop the agent; delayed work does not survive restart; texts cannot be grouped into one turn; the operator cannot see buttons or lists because they exist only in agent memory or in temporary memory that disappears when the process stops; or the exact channel message used to draw the interface enters agent memory.
- **FR-036**: Background processing MUST be recorded as not worth it if acknowledgement waits until the background turn finishes, or if there is no burst batching (one background turn per message).
- **FR-037**: Porting the existing specialist agents MUST remain no or later in the decision record. This proof MUST NOT reverse that conclusion. Built-in planning and the ability to reuse prior conversation context MUST be noted again as already unavailable, not re-tested.
- **FR-038**: Demonstrations that require the model to ask a choice or to reflect an operator fact MUST run only when a model credential is available. When it is not, those demonstrations MUST be skipped rather than failed. Location and media inbox mapping MAY be shown with a channel stand-in and no live model.
- **FR-039**: Capabilities already shown in the current proof (choice resume, sending buttons during a choice, durable agent memory, and an operator sending on the channel without the agent) MUST NOT be rebuilt. This proof adds the queue, the lightweight conversation stub, and the decision record around them.
- **FR-040**: If a durable queue cannot be stood up within about one hour, the queue portion MUST be marked blocked and the proof MUST stop. In-process timers MUST NOT be substituted for a durable queue.
- **FR-041**: Takeover, release, close, operator reply, and inbound acceptance MUST be available as direct actions in the proof. A full operator console is not required.

### Key Entities

- **Conversation**: An open customer thread. Has its own identity (this is the agent's session identity), a status, a channel identity used only to address replies, and a last-updated time. Status is one of automatic-bot, waiting-for-human, human-active, or closed.
- **Inbox message**: What the operator sees for one conversation. Has a role (customer, bot, or operator), a kind (text, buttons, list, location, media, or choice), a short text fallback, and renderable details of what was sent or received on the channel. This record is not the agent's prompt history.
- **Agent memory event**: What the agent reads on the next turn. Holds user content, model content, small choice-request intent, a short result gist, and a choice response carrying an option identity. Does not hold channel rendering payloads.
- **Inbound text buffer**: Pending customer texts for one conversation, waiting to be combined into a single turn. Button clicks and handoff actions are not buffer items.
- **Outbound channel item**: What the customer actually received (text, buttons, list, location, or media). Used to show that a send happened once, and that a pause did not also emit leftover prose.
- **Decision record**: The written outcome of the proof. One result and its evidence for each architecture question, an overall recommendation for agent-plus-durable-queue, and a separate recommendation for porting the Python agents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A channel partner receives success within 100 milliseconds when the agent turn takes about 1.5 seconds, and the customer sees the agent reply only after that acknowledgement.
- **SC-002**: In the burst demonstration, three texts sent inside the debounce window produce exactly one agent turn that contains all three texts.
- **SC-003**: In the busy-turn demonstration, a text that arrives while a turn is running is included in a later turn. Zero such texts are lost.
- **SC-004**: In the restart demonstration, a turn scheduled before the process stops still runs after the process starts again, when the durable queue and conversation stores remain available.
- **SC-005**: In the retry demonstration, a turn that fails on the first attempt is completed on a later attempt, within 3 attempts, and the customer receives one reply.
- **SC-006**: In the isolation demonstration, another conversation's message or a health check succeeds within 200 milliseconds while a 1.5-second turn is in flight — or the decision record states that a separate worker is required and confirms that worker was not built.
- **SC-007**: In the choice demonstration, a click after a process restart resumes the pending choice from durable memory, and the remembered response is the option identity rather than a typed letter as the only user text.
- **SC-008**: In the choice-retry demonstration, the customer receives exactly one buttons message for that choice request.
- **SC-009**: In the pause demonstration, the customer receives one buttons message and zero leftover prose messages — or the decision record states a last-mile no-go because filtering is impossible.
- **SC-010**: Two channel identities produce two conversations; the same identity reuses one open conversation; closing that conversation causes the next inbound to start a new one.
- **SC-011**: Every inbound while a conversation is waiting for a human is stored, and produces zero agent turns and zero bot outbounds.
- **SC-012**: After an operator states a concrete fact, the next customer question about that fact is answered with that fact in the demonstration (model credential available).
- **SC-013**: After a normal text turn and a process restart, both the inbox and agent memory still contain that turn, and the agent prompt was not built from inbox rows.
- **SC-014**: In the buttons and location demonstrations, the inbox has renderable details (full options, or coordinates) and no agent-memory event contains the channel rendering payload. An inbox view can show the prompt and the chips or pin from inbox rows alone.
- **SC-015**: A reviewer can answer all 22 architecture questions from the decision record alone, and the overall recommendation matches the go / no-go rules in FR-034 through FR-037.
- **SC-016**: When no model credential is available, model-dependent demonstrations are skipped rather than failed, and location and media inbox mapping can still be shown without a live model.

## Assumptions

- The audience is the team deciding whether this pattern is fit for the production messaging product. The proof is demo fidelity, not a production port.
- A simulated channel is enough. A live messaging-network integration, signatures, inbound media handling, delivery-status callbacks, push notifications, reminders, and per-tenant credentials are out of scope.
- The production CRM schema, multi-organization rules, and a production database are out of scope. A small local conversation stub (conversation plus inbox messages) in a store that survives process restart is enough to answer the history question.
- The existing live-channel demo is not the decision path and is left as-is. The decision path is inbound acceptance, the durable queue, and the local conversation stub.
- The debounce window is a short demo value of about 400 milliseconds (within 300–500), not the longer production delay.
- Retry budget is 3 attempts with about 1 second between attempts.
- Conversation status values are automatic-bot, waiting-for-human, human-active, and closed. Closing (or otherwise marking the thread not open) is enough; either persisted-closed or removal of the open row is acceptable, as long as the next inbound creates a new conversation and a new agent session.
- Both human-owned statuses skip the agent. The proof's takeover action sets waiting-for-human. Release returns the conversation to automatic-bot.
- Acceptable conditions on a "yes" recommendation: a durable queue is mandatory; one tenant; lightweight local stores rather than the production database; appending an operator event may be unusual but must work; the debounce window is a toy value; a separate worker process is acceptable only if isolation failed.
- An optional inspection view of one conversation (inbox messages, a count of agent-memory events, and a short preview) may be added for human review. It is not required for a go, and it must not add production-only fields such as organization, platform message identifiers, or click-to-ad metadata.
- Already-proven agent behaviors are reused, not rebuilt. A playground, extra routing agents, skill packaging, and multi-tenant tokens are out of scope.
- No project constitution principles were in force beyond this brief; the source plan is the scope boundary.
- Comparison to the product's current queue pattern is conceptual (stable job identity per conversation, ignore a duplicate schedule, drain the buffer once, follow up if more text arrived while busy). The production code is not copied into this proof.
