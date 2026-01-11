# Feature Specification: SecondMe Personal AI Clone

**Feature Branch**: `001-personal-ai-clone`
**Created**: 2026-01-10
**Status**: Draft
**Input**: Build an application with all the requirements in SecondMe-FinalProposal.docx under this project folder

## User Scenarios & Testing *(mandatory)*

### User Story 1 - WhatsApp Bot Activation & Control (Priority: P1)

A user wants to enable their Personal AI Clone to respond to WhatsApp messages on their behalf while maintaining full control over when and how it operates.

**Why this priority**: This is the foundational capability - without bot activation and control, no other features can function. This establishes the critical "Human-in-the-Loop" safety mechanism.

**Independent Test**: Can be fully tested by activating the bot for a test contact, sending messages, and verifying the bot responds. User can manually take over mid-conversation and bot immediately pauses. Delivers immediate value by automating simple responses.

**Acceptance Scenarios**:

1. **Given** a user has authenticated with WhatsApp via QR code, **When** they enable the bot for a specific contact, **Then** the bot activates and responds to incoming messages from that contact only
2. **Given** the bot is responding to a contact, **When** the user sends a message to that contact from their phone, **Then** the bot immediately pauses for 60 minutes and does not send any automated responses
3. **Given** the bot is active, **When** the user clicks the Master Kill Switch in the dashboard, **Then** all bot activity stops immediately across all contacts
4. **Given** the bot is paused for a contact, **When** the pause duration expires, **Then** the bot resumes automatic responses for that contact
5. **Given** multiple messages arrive rapidly, **When** the volume exceeds 10 messages per minute, **Then** the bot auto-pauses to prevent detection

---

### User Story 2 - Context-Aware Personalized Responses (Priority: P2)

A user wants the bot to respond with their personal communication style and incorporate knowledge about their relationships, past conversations, and personal context.

**Why this priority**: This transforms the bot from a generic chatbot to a true digital twin. Without this, responses will feel robotic and potentially damage relationships.

**Independent Test**: Can be tested by configuring a persona style guide, having the bot respond to contacts it has relationship history with, and verifying responses include relevant context (e.g., "How was your trip to Paris?" gets answered with trip details). Delivers value by maintaining authentic personal connections.

**Acceptance Scenarios**:

1. **Given** a user has defined their communication style in the Persona Editor, **When** the bot generates a response, **Then** the response matches the defined style (e.g., professional vs. casual tone)
2. **Given** the system has processed chat history about John working at Google, **When** John asks "How's work?", **Then** the bot retrieves this context and responds with work-related information
3. **Given** a user has different personas for different contacts, **When** the bot responds to a family member vs. a colleague, **Then** the tone and style adapt appropriately to the relationship
4. **Given** a conversation mentions a new fact (e.g., "I'm planning a trip to Tokyo"), **When** the bot processes this message, **Then** the fact is stored in the knowledge graph for future reference
5. **Given** a simple acknowledgment message like "lol" or "ok", **When** the bot classifies the message, **Then** it routes to the fast router model and responds quickly without deep context retrieval

---

### User Story 3 - Natural Human Behavior Simulation (Priority: P3)

A user wants the bot to simulate realistic human typing and messaging patterns to avoid detection by WhatsApp's anti-bot systems.

**Why this priority**: While critical for safety, this can be implemented after core functionality works. It's necessary for production use but doesn't affect basic feature validation.

**Independent Test**: Can be tested by monitoring bot response timing, verifying "typing..." indicators appear, and confirming rate limits trigger correctly. Prevents account bans and ensures long-term usability.

**Acceptance Scenarios**:

1. **Given** the bot is generating a response to a 50-word message, **When** it prepares to send the message, **Then** it delays by (50 words * 300ms) + 2-5 seconds cognitive pause before sending
2. **Given** the bot is about to send a message, **When** the delay begins, **Then** the "typing..." indicator shows in the WhatsApp chat during the delay
3. **Given** it is 2:00 AM and the user has defined sleep hours as 11:00 PM - 7:00 AM, **When** a message arrives, **Then** the bot does not respond until after 7:00 AM
4. **Given** the bot has sent 3 messages in rapid succession, **When** calculating the next response delay, **Then** the cognitive pause varies randomly between 2-5 seconds each time
5. **Given** the user's WhatsApp session has been active for 24 hours, **When** the session timer expires, **Then** the system requires QR code re-authentication before continuing

---

### User Story 4 - Real-Time Monitoring Dashboard (Priority: P2)

A user wants to monitor bot activity, view conversations, and manage settings through a web interface.

**Why this priority**: Essential for transparency and control. Users need to see what the bot is doing and intervene when necessary. Required for Human-in-the-Loop principle.

**Independent Test**: Can be tested by opening the dashboard, viewing active conversations, checking bot status, and toggling settings. Delivers value by providing oversight and peace of mind.

**Acceptance Scenarios**:

1. **Given** the user opens the web dashboard, **When** the page loads, **Then** they see a QR code for WhatsApp authentication and can scan it to connect
2. **Given** the bot is active, **When** the user views the dashboard, **Then** they see a list of all contacts with bot status (Active/Paused) for each
3. **Given** the bot has sent messages, **When** the user views a contact's conversation thread, **Then** they see all messages with clear indicators for bot-sent vs. user-sent messages
4. **Given** the user wants to customize their communication style, **When** they access the Persona Editor, **Then** they can define tone, style, and relationship-specific personas
5. **Given** the bot is processing messages, **When** the user views the dashboard, **Then** they see real-time updates as new messages arrive and responses are sent (via WebSocket)

---

### Edge Cases

- What happens when WhatsApp connection drops mid-conversation (socket disconnection)?
- How does the system handle the user and bot simultaneously trying to respond to the same message?
- What happens if the knowledge graph database becomes unavailable while processing a message?
- How does the system handle malformed or spam messages that don't fit normal conversation patterns?
- What happens when a user deletes their message history but the knowledge graph still contains extracted facts?
- How does the system handle multiple devices logged into the same WhatsApp account?
- What happens when message queue backs up faster than the bot can respond?
- How does the system detect and handle if the user's WhatsApp account gets temporarily banned during bot operation?

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & Session Management**

- **FR-001**: System MUST provide QR code-based WhatsApp authentication through the web dashboard
- **FR-002**: System MUST expire WhatsApp sessions after 24 hours and require re-authentication
- **FR-003**: System MUST detect when the user sends a message from their phone (`fromMe: true`) and immediately pause bot for that contact

**Bot Control & Safety**

- **FR-004**: Users MUST be able to enable/disable bot responses on a per-contact basis
- **FR-005**: System MUST provide a Master Kill Switch that instantly halts all bot activity across all contacts
- **FR-006**: System MUST implement auto-pause when message volume exceeds 10 messages per minute
- **FR-007**: System MUST allow configuration of pause duration (default: 60 minutes) after user intervention
- **FR-008**: System MUST honor user-defined sleep hours and not send automated responses during those times

**Message Processing & Routing**

- **FR-009**: System MUST classify incoming messages as "Phatic" (simple acknowledgments) or "Substantive" (requiring context) using the router model
- **FR-010**: System MUST route phatic messages to fast-response tier (Claude Haiku 4.5)
- **FR-011**: System MUST route substantive messages to reasoning tier (Claude Sonnet 4.5)
- **FR-012**: System MUST retrieve relationship context from knowledge graph before generating substantive responses
- **FR-013**: System MUST track token usage and cost per message type for monitoring

**Style & Persona Management**

- **FR-014**: Users MUST be able to define their communication style through a Persona Editor interface
- **FR-015**: System MUST support multiple persona profiles for different relationship types (e.g., professional, family, friends)
- **FR-016**: System MUST apply the appropriate persona based on the contact relationship when generating responses
- **FR-017**: System MUST cache persona guides and graph schemas to reduce latency and API costs

**Knowledge Graph & Memory**

- **FR-018**: System MUST store entities (Contacts, Events, Topics, Companies) and relationships in the graph database
- **FR-019**: System MUST process chat history in the background to extract facts without blocking message responses
- **FR-020**: System MUST update the knowledge graph when new facts are mentioned in conversations
- **FR-021**: System MUST query the graph for relevant context before generating responses (e.g., "John works at Google")
- **FR-022**: System MUST encrypt knowledge graph data at rest

**Human Behavior Simulation**

- **FR-023**: System MUST calculate response delay using formula: `Delay = (Message_Length * 300ms) + Cognitive_Pause(2-5s)`
- **FR-024**: System MUST trigger WhatsApp "typing..." status during the calculated delay
- **FR-025**: System MUST randomize cognitive pause between 2-5 seconds to vary response timing naturally
- **FR-026**: System MUST NOT send instant responses (minimum delay of 2 seconds)

**Monitoring & Transparency**

- **FR-027**: Dashboard MUST display real-time bot status (Active/Paused) for each contact
- **FR-028**: Dashboard MUST show conversation threads with clear visual distinction between bot-sent and user-sent messages
- **FR-029**: System MUST log all bot-sent messages with timestamps and metadata
- **FR-030**: Dashboard MUST update in real-time when new messages arrive or bot sends responses (WebSocket required)

**System Architecture**

- **FR-031**: WhatsApp connectivity layer MUST run as a separate service from AI orchestration
- **FR-032**: System MUST use message queues (Redis) to decouple message receipt from response generation
- **FR-033**: System MUST maintain state (pause status, session tokens) in Redis accessible to all services
- **FR-034**: Each microservice MUST be independently deployable and restartable without affecting other services

### Key Entities

- **User**: The person who owns the WhatsApp account and operates the Personal AI Clone. Attributes: persona profiles, sleep hours, pause preferences, authentication tokens
- **Contact**: A person in the user's WhatsApp contact list. Attributes: name, phone number, relationship type, bot enabled/disabled status, pause expiry time, conversation history
- **Message**: A WhatsApp message sent or received. Attributes: content, timestamp, sender (user/bot/contact), message type (phatic/substantive), processing status
- **Persona**: A communication style profile. Attributes: name, tone, style guide, relationship types it applies to, example messages
- **Knowledge Graph Entity**: A fact extracted from conversations. Types: Person, Company, Event, Topic. Attributes vary by type (e.g., Person has name, occupation, relationships)
- **Knowledge Graph Relationship**: A connection between entities. Examples: "John works at Google", "User went to Paris in March", "Sarah is User's sister"
- **Session**: A WhatsApp authentication session. Attributes: QR code, session token (encrypted), connection status, expiry time

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can authenticate with WhatsApp and activate bot for a contact in under 3 minutes from first dashboard visit
- **SC-002**: Bot responds to phatic messages (40% of traffic) within 5 seconds including typing simulation delay
- **SC-003**: Bot responds to substantive messages with full context retrieval within 8 seconds including typing simulation delay
- **SC-004**: Human-in-the-Loop override triggers within 1 second of user sending a manual message
- **SC-005**: Master Kill Switch halts all bot activity within 2 seconds of activation
- **SC-006**: 90% of bot responses match the user's defined communication style as validated by user feedback
- **SC-007**: Knowledge graph retrieval queries complete in under 50 milliseconds (P95)
- **SC-008**: System maintains WhatsApp connection uptime of 99% over 7-day period (excluding user-initiated disconnections)
- **SC-009**: Bot operation does NOT trigger WhatsApp ban/suspension over 30-day testing period with realistic usage patterns
- **SC-010**: Dashboard loads initial view in under 1 second on 3G connection
- **SC-011**: Real-time dashboard updates reflect new messages within 2 seconds of arrival
- **SC-012**: Users can successfully override bot and manually respond in 100% of intervention attempts
- **SC-013**: System costs remain under $0.05 per substantive message processed (including all AI model calls and infrastructure)
- **SC-014**: Rate limiting circuit breaker activates within 3 seconds when message volume exceeds threshold

## Assumptions

1. **WhatsApp API Access**: We assume use of unofficial WhatsApp Web API (whatsapp-web.js) is acceptable to the user and they understand the associated risks of potential account suspension
2. **Single Device**: We assume the user's WhatsApp account is primarily used on one device at a time; multi-device scenarios are edge cases
3. **Cloud Hosting**: We assume the system will be deployed on a VPS (like Hetzner or DigitalOcean) that runs 24/7 with stable internet connection
4. **Manual Chat History Upload**: Initial knowledge graph population requires the user to provide chat export files; real-time ingestion begins after initial setup
5. **English Language**: Initial version assumes English communication; internationalization is not in scope
6. **Text Messages Only**: Initial version handles text messages; media (images, videos, voice notes) are out of scope
7. **Individual Chats**: Focus is on one-on-one conversations; group chats are explicitly out of scope for initial version
8. **User Technical Capability**: User can perform basic technical tasks like scanning QR codes, accessing web dashboards, and understanding bot status indicators
9. **API Keys**: User will provide their own Anthropic API key for Claude model access
10. **Data Sovereignty**: All data (knowledge graph, message logs, session tokens) remains under user control on their chosen infrastructure; no third-party data storage

## Out of Scope

The following are explicitly excluded from this feature specification:

1. **Group Chat Support**: Bot will not operate in WhatsApp group conversations (only one-on-one chats)
2. **Media Handling**: Images, videos, voice notes, and documents are not processed or responded to
3. **Voice/Video Calls**: No handling of WhatsApp calls (voice or video)
4. **Multi-Device Sync**: No support for the user having multiple devices logged into WhatsApp simultaneously
5. **Third-Party Integrations**: No integration with calendars, email, CRM systems, or other external services
6. **Mobile App**: Dashboard is web-only; no native iOS/Android app
7. **Multi-User/Tenancy**: System supports one user (one WhatsApp account) per deployment; no multi-tenant architecture
8. **Advanced Analytics**: No conversation analytics, sentiment analysis, or reporting beyond basic usage metrics (message count, cost)
9. **Message Scheduling**: No ability to schedule messages for future sending
10. **Conversation Templates**: No pre-defined response templates or canned messages
11. **Language Translation**: No automatic translation of messages in different languages
12. **Contact Management**: No address book sync, contact enrichment, or contact categorization beyond relationship type
13. **Backup/Export**: No automated backup or export of conversation history or knowledge graph data
14. **User Authentication**: Dashboard has no login system (assumed to run locally or on user's private network); security through network isolation only
