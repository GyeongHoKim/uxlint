# Quickstart: CLI State Machine Refactor

**Date**: 2025-12-02  
**Feature Branch**: `001-readme-md-uxlint`

## Prerequisites

1. Node.js >= 18.18.0
2. npm or yarn

## Setup

### 1. Install New Dependencies

```bash
npm install xstate @xstate/react
```

### 2. Verify Existing Dependencies

These should already be installed:
- `ink-testing-library` (devDependency)
- `@testing-library/react` (devDependency)

## Project Structure Changes

### New Files to Create

```
source/
├── machines/
│   └── uxlint-machine.ts       # XState machine definition
├── contexts/
│   └── uxlint-context.tsx      # React context provider
└── models/
    └── errors.ts               # Add MissingConfigError

tests/
├── machines/
│   └── uxlint-machine.spec.ts  # Machine transition tests
└── components/
    └── app.spec.tsx            # App component snapshot tests
```

### Files to Modify

```
source/
├── cli.tsx                     # Initialize machine, wrap with provider
├── app.tsx                     # Use context to determine what to render
└── hooks/
    └── use-config-wizard.ts    # Integrate with XState events
```

### Files to Delete

```
source/
└── hooks/
    └── use-wizard.ts           # Replaced by XState machine
```

## Implementation Order

### Phase 1: Setup & Machine Definition
1. Create `source/machines/uxlint-machine.ts`
2. Create `source/contexts/uxlint-context.tsx`
3. Add `MissingConfigError` to `source/models/errors.ts`

### Phase 2: Write Tests (TDD)
1. Create `tests/machines/uxlint-machine.spec.ts`
   - Test all state transitions
   - Test guards
   - Test actions

### Phase 3: Integration
1. Modify `source/cli.tsx`
   - Remove mode determination logic
   - Add XState provider
   - Send INITIALIZE event
2. Modify `source/app.tsx`
   - Remove mode prop
   - Use XState context to render appropriate component

### Phase 4: Component Integration
1. Modify `source/hooks/use-config-wizard.ts`
   - Remove `useWizard` import
   - Send `WIZARD_COMPLETE` event on completion
2. Delete `source/hooks/use-wizard.ts`

### Phase 5: Testing & Cleanup
1. Update existing tests
2. Add snapshot tests for components
3. Run quality gates

## Quick Reference

### Reading State in Components

```typescript
import { UxlintMachineContext } from '../contexts/uxlint-context.js';

function MyComponent() {
  // Read current state value
  const currentState = UxlintMachineContext.useSelector(
    state => state.value
  );
  
  // Read context data
  const config = UxlintMachineContext.useSelector(
    state => state.context.config
  );
  
  // Get actor ref to send events
  const actorRef = UxlintMachineContext.useActorRef();
  
  return (
    <Button onPress={() => actorRef.send({ type: 'WIZARD_COMPLETE', config })}>
      Complete
    </Button>
  );
}
```

### Checking States

```typescript
// Check if in specific state
const isInWizard = UxlintMachineContext.useSelector(
  state => state.matches('tty.wizard')
);

// Check if in nested state
const isAnalyzing = UxlintMachineContext.useSelector(
  state => state.matches('tty.analyzeWithUI') || state.matches('ci.analyzeWithoutUI')
);
```

### Sending Events

```typescript
const actorRef = UxlintMachineContext.useActorRef();

// Send simple event
actorRef.send({ type: 'WIZARD_CANCEL' });

// Send event with data
actorRef.send({ 
  type: 'ANALYSIS_COMPLETE', 
  result: analysisResult 
});
```

## Quality Gates

Run after every change:

```bash
npm run compile && npm run format && npm run lint
```

Run tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

