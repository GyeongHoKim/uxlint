# Research: CLI State Machine Refactor

**Date**: 2025-12-02  
**Feature Branch**: `001-readme-md-uxlint`

## Research Tasks

### 1. XState/React Integration

**Task**: Research best practices for XState v5 with React integration

**Decision**: Use `@xstate/react` with `createActorContext` for global state management

**Rationale**:
- `createActorContext` provides built-in React Context with Provider pattern
- Prevents props drilling by exposing `useSelector` and `useActorRef` hooks
- Type-safe integration with TypeScript via `setup()` function
- XState v5 uses actor model which aligns well with CLI state transitions

**Alternatives Considered**:
- Manual React Context with `useReducer`: Rejected because XState provides better state visualization, guards, and actions
- Zustand/Redux: Rejected because state machines are a better fit for finite, deterministic CLI flows
- XState Store: Simpler but lacks the full state machine capabilities needed for complex transitions

**Installation Required**:
```bash
npm install xstate @xstate/react
```

**Code Pattern**:
```typescript
// source/machines/uxlint-machine.ts
import { setup, assign } from 'xstate';

export const uxlintMachine = setup({
  types: {
    context: {} as UxlintMachineContext,
    events: {} as UxlintMachineEvent,
  },
}).createMachine({
  id: 'uxlint',
  initial: 'idle',
  states: {
    idle: { /* ... */ },
    tty: { /* ... */ },
    ci: { /* ... */ },
  },
});

// source/contexts/uxlint-context.tsx
import { createActorContext } from '@xstate/react';
import { uxlintMachine } from '../machines/uxlint-machine.js';

export const UxlintMachineContext = createActorContext(uxlintMachine);
```

---

### 2. Testing Strategy

**Task**: Research testing approaches for XState machines and Ink components

#### 2.1 XState Machine Testing

**Decision**: Use XState's built-in testing utilities with Ava

**Rationale**:
- XState v5 machines are pure functions that can be tested directly
- Use `createActor` to test state transitions
- Test guards and actions in isolation

**Code Pattern**:
```typescript
import test from 'ava';
import { createActor } from 'xstate';
import { uxlintMachine } from '../../source/machines/uxlint-machine.js';

test('transitions from idle to tty when interactive flag is true', t => {
  const actor = createActor(uxlintMachine, {
    input: { interactive: true, configExists: false },
  });
  actor.start();
  
  t.is(actor.getSnapshot().value, 'tty');
});
```

#### 2.2 Ink Component Testing

**Decision**: Use `ink-testing-library` (already installed) with Ava snapshot tests

**Rationale**:
- Already installed in devDependencies
- Provides `render`, `lastFrame`, `rerender`, `stdin` for testing
- Constitution mandates visual regression tests for components

**Code Pattern**:
```typescript
import test from 'ava';
import { render } from 'ink-testing-library';
import { App } from '../../source/app.js';

test('App renders wizard when in TTY mode without config', t => {
  const { lastFrame } = render(<App />);
  t.snapshot(lastFrame());
});
```

#### 2.3 Hook Testing

**Decision**: Use `@testing-library/react`'s `renderHook` (already available)

**Rationale**:
- React 18+ includes `renderHook` in `@testing-library/react`
- `@testing-library/react-hooks` is deprecated for React 18+
- Already in use in `tests/hooks/use-config-wizard.spec.tsx`

**No Installation Required**: `@testing-library/react` already installed

---

### 3. Files to Delete

**Task**: Identify files that become obsolete with the new state machine

**Decision**: The following files will be modified or deleted:

#### Files to DELETE:
- `source/hooks/use-wizard.ts` - Replaced by XState machine
  - Currently used by `use-config-wizard.ts` for state management
  - Will be replaced by XState context

#### Files to HEAVILY MODIFY:
- `source/cli.tsx` - Remove mode determination logic, add XState initialization
- `source/app.tsx` - Remove mode prop, use XState context to determine rendering
- `source/hooks/use-config-wizard.ts` - Remove `useWizard` dependency, integrate with XState

#### Files to KEEP (minimal changes):
- `source/models/wizard-state.ts` - Type definitions still useful
- `source/components/config-wizard.tsx` - UI component, will use XState context
- `source/components/analysis-runner.tsx` - UI component, minimal changes
- `source/hooks/use-config.ts` - Config loading logic unchanged
- `source/hooks/use-analysis.ts` - Analysis state, may integrate with XState

---

### 4. Global State Pattern

**Task**: Research props drilling prevention patterns

**Decision**: Use `createActorContext` from `@xstate/react`

**Rationale**:
- Provides both Provider and consumer hooks in one package
- `useSelector` for reading state without full re-renders
- `useActorRef` for sending events
- Type-safe by default with XState v5

**Usage Pattern**:
```typescript
// Provider in cli.tsx or app.tsx
<UxlintMachineContext.Provider>
  <App />
</UxlintMachineContext.Provider>

// Consumer in any component
function SomeComponent() {
  const currentState = UxlintMachineContext.useSelector(state => state.value);
  const actorRef = UxlintMachineContext.useActorRef();
  
  return (
    <Button onPress={() => actorRef.send({ type: 'START_ANALYSIS' })}>
      Start
    </Button>
  );
}
```

---

## Summary

| Item | Decision | Installation |
|------|----------|--------------|
| State Machine | XState v5 + @xstate/react | `npm install xstate @xstate/react` |
| Global State | createActorContext | Included in @xstate/react |
| Component Testing | ink-testing-library | Already installed |
| Hook Testing | @testing-library/react renderHook | Already installed |
| Machine Testing | XState createActor | Included in xstate |

