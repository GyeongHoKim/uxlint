# Feature Specification: Real-time LLM Response Display in TTY Analyze Mode

**Feature Branch**: `002-uxlint-tty-analyze`
**Created**: 2025-01-27
**Status**: Draft
**Input**: User description: "uxlint 사용자들이 tty모드에서 analyze 단계일때, LLM의 response를 Terminal UI에서 responsive하게 확인이 불가하다는 점을 답답하게 생각하고 있어. 따라서 나는 uxlint의 tty 모드 중 analyze 단계가 의미하는 것이 우리 uxlint state machine의 어떤 상태를 의미하는 것인지를 먼저 파악한 후 해당 로직을 찾아서 LLM messages들이 생성될 때마다 그것을 responsive하게 UI에 업데이트 해줘야 해."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View LLM Responses During Analysis (Priority: P1)

When users run uxlint in TTY mode with the `--interactive` flag and the analysis phase begins, they want to see LLM responses appear in real-time as they are generated during the analysis process. Currently, users only see a generic "Analyzing with AI" message with a spinner, which provides no visibility into what the AI is actually doing or thinking.

**Why this priority**: This is the core user pain point - users cannot see what the LLM is doing during analysis, making the process feel opaque and unresponsive. This directly addresses the user frustration mentioned in the input.

**Independent Test**: Can be fully tested by running uxlint in TTY mode with a valid configuration and observing that LLM messages appear in the terminal UI as they are generated during the analysis phase. This delivers immediate value by providing transparency into the analysis process.

**Acceptance Scenarios**:

1. **Given** uxlint is running in TTY mode (`--interactive` flag) with a valid configuration file, **When** the analysis phase begins, **Then** the terminal UI displays a section showing LLM messages as they are generated
2. **Given** the analysis is in progress and the LLM generates a new response message, **When** the message is received by the system, **Then** the message appears in the terminal UI within 1 second of generation
3. **Given** multiple LLM messages are generated during a single page analysis, **When** each message is received, **Then** all messages are displayed in chronological order in the terminal UI
4. **Given** the analysis completes or moves to the next page, **When** the state changes, **Then** the LLM message history remains visible or is appropriately cleared based on the new state

---

### User Story 2 - Distinguish Between Different Message Types (Priority: P2)

Users want to understand the context of each LLM message - whether it's a request being sent to the LLM, a response received from the LLM, or a tool call being executed. This helps users understand the analysis workflow.

**Why this priority**: While seeing messages is valuable, understanding their context (request vs response vs tool call) provides deeper insight into the analysis process and helps users understand what's happening.

**Independent Test**: Can be tested independently by verifying that different message types (requests, responses, tool calls) are visually distinguished in the UI when displayed. This delivers value by making the analysis process more understandable.

**Acceptance Scenarios**:

1. **Given** LLM messages are being displayed in the terminal UI, **When** a message is a request being sent to the LLM, **Then** it is visually distinguished (e.g., labeled or styled differently) from responses
2. **Given** LLM messages are being displayed in the terminal UI, **When** a message is a response from the LLM, **Then** it is visually distinguished from requests and tool calls
3. **Given** LLM messages are being displayed in the terminal UI, **When** a message represents a tool call execution, **Then** it is visually distinguished from regular text messages

---

### User Story 3 - Handle Long Messages and Message Overflow (Priority: P3)

When LLM generates very long messages or many messages during analysis, users should still be able to see the most recent and relevant information without the UI becoming cluttered or unreadable.

**Why this priority**: This ensures the feature remains usable even with verbose LLM responses or long analysis sessions. Without this, the UI could become overwhelming.

**Independent Test**: Can be tested by running analysis with LLM that generates long messages or many messages, and verifying that the UI handles this gracefully (e.g., truncation, scrolling, or limiting visible messages). This delivers value by ensuring the feature remains practical in real-world scenarios.

**Acceptance Scenarios**:

1. **Given** the LLM generates a message longer than the terminal width, **When** the message is displayed, **Then** it is formatted appropriately (wrapped or truncated with indication) so it remains readable
2. **Given** many LLM messages are generated during analysis (e.g., 20+ messages), **When** messages are displayed, **Then** the UI shows the most recent messages prominently while keeping older messages accessible (e.g., via scrolling or limiting visible count)
3. **Given** the terminal window is resized during analysis, **When** the resize occurs, **Then** the message display adapts to the new terminal size without breaking the layout

---

### Edge Cases

- What happens when LLM messages are generated very rapidly (multiple messages per second)? The UI should handle this gracefully without flickering or performance issues
- How does the system handle LLM messages that contain special characters or control sequences that might interfere with terminal rendering?
- What happens if the analysis fails or errors occur while messages are being displayed? Messages should remain visible for debugging purposes
- How does the system handle terminal environments with limited color support or monochrome displays? The UI should degrade gracefully
- What happens when the user switches between pages during multi-page analysis? Should message history be preserved per page or cleared?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display LLM messages in the terminal UI as they are generated during the analysis phase in TTY mode
- **FR-002**: System MUST update the terminal UI within 1 second of receiving a new LLM message during analysis
- **FR-003**: System MUST display LLM messages in chronological order as they are generated
- **FR-004**: System MUST visually distinguish between different types of LLM messages (requests, responses, tool calls) when displayed
- **FR-005**: System MUST handle long LLM messages by formatting them appropriately for terminal display (wrapping or truncation with indication)
- **FR-006**: System MUST handle high-frequency message generation (multiple messages per second) without UI flickering or performance degradation
- **FR-007**: System MUST preserve LLM message display during analysis errors so users can see what happened before the error
- **FR-008**: System MUST integrate LLM message display with the existing analysis progress UI without breaking current functionality
- **FR-009**: System MUST only display LLM messages during the analysis phase in TTY mode, not during other phases (wizard, report generation, etc.)
- **FR-010**: System MUST handle terminal resize events gracefully, adapting message display to new terminal dimensions

### Key Entities

- **LLM Message**: Represents a single message exchanged with the language model during analysis. Contains content (text), role (user/assistant/system), and optional metadata (tool calls, timestamps)
- **Analysis Progress State**: Current state of the analysis process, including current stage, page being analyzed, and accumulated LLM messages
- **Message Display Component**: UI component responsible for rendering LLM messages in the terminal, handling formatting, scrolling, and visual distinction between message types

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can see LLM messages appear in the terminal UI within 1 second of generation during analysis phase
- **SC-002**: 100% of LLM messages generated during analysis are displayed in the terminal UI (no messages are lost or hidden)
- **SC-003**: Terminal UI remains responsive (no noticeable lag or freezing) when displaying messages at a rate of up to 5 messages per second
- **SC-004**: Users can distinguish between different message types (requests, responses, tool calls) with 90% accuracy when viewing the terminal UI
- **SC-005**: Long messages (up to 1000 characters) are displayed in a readable format without breaking terminal layout
- **SC-006**: Feature does not degrade existing analysis functionality - all existing analysis workflows complete successfully with the new message display enabled

## Assumptions

- LLM messages are generated during the analysis process and are available to the UI layer in real-time
- The analysis phase in TTY mode is a distinct state in the application workflow where analysis occurs
- The terminal UI can be updated dynamically to display new content as it becomes available
- Users want to see messages in real-time for transparency, but do not necessarily need to interact with or modify the messages
- The feature should enhance visibility without requiring changes to the core analysis logic or LLM interaction patterns
- Message display should integrate with existing progress indicators without disrupting current user workflows
