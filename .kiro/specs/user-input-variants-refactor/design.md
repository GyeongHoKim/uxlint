# Design Document

## Overview

This design outlines the refactoring of the UserInput component from a boolean flag-based state management system to a variant-based architecture. The refactor will improve type safety, maintainability, and component composition by introducing clear state variants and separating label functionality into a dedicated component.

## Architecture

### Component Separation

The current UserInput component will be split into two focused components:

1. **UserInput Component**: Handles input functionality and variant-based state management
2. **UserInputLabel Component**: Manages label/prompt display logic independently

This separation follows the single responsibility principle and enables better component composition.

### Variant-Based State Management

The new UserInput component will use a discriminated union type system where each variant has specific props and behavior:

```typescript
type UserInputVariant = 
  | { variant: 'default'; value: string; placeholder?: string }
  | { variant: 'typing'; value: string; placeholder?: string }
  | { variant: 'loading'; loadingText: string }
  | { variant: 'error'; error: string; value: string; placeholder?: string }
```

## Components and Interfaces

### UserInput Component

**Purpose**: Handle input functionality with variant-based state management

**Props Interface**:
```typescript
type UserInputProps = UserInputVariant & {
  onValueChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  disabled?: boolean;
}
```

**Key Features**:
- Single `variant` prop determines visual state and available props
- Type-safe props based on variant selection
- Backward compatibility with existing boolean flag API
- Clean separation from label concerns

### UserInputLabel Component

**Purpose**: Handle label/prompt display logic independently

**Props Interface**:
```typescript
interface UserInputLabelProps {
  text: string;
  variant?: 'default' | 'required' | 'optional';
}
```

**Key Features**:
- Reusable across different input types
- Independent styling and behavior using existing theme system
- Consistent with project's theming approach
- Flexible composition with input components

## Data Models

### Variant State Model

```typescript
// Core variant types
type DefaultVariant = {
  variant: 'default';
  value: string;
  placeholder?: string;
}

type TypingVariant = {
  variant: 'typing';
  value: string;
  placeholder?: string;
}

type LoadingVariant = {
  variant: 'loading';
  loadingText: string;
}

type ErrorVariant = {
  variant: 'error';
  error: string;
  value: string;
  placeholder?: string;
}

type UserInputVariant = DefaultVariant | TypingVariant | LoadingVariant | ErrorVariant;
```



## Error Handling

### Variant Validation

- **Invalid Variant Props**: TypeScript compilation errors for incorrect prop combinations
- **Runtime Validation**: Development-time warnings for prop mismatches
- **Fallback Behavior**: Default variant as fallback for invalid configurations

### Component Error Boundaries

- **UserInput**: Handle input-specific errors (validation, submission failures)
- **UserInputLabel**: Handle label rendering errors gracefully
- **Composition**: Parent components handle coordination errors

## Testing Strategy

### Unit Testing Approach

**UserInput Component Tests**:
- Variant rendering verification
- Props validation for each variant
- Event handling (onChange, onSubmit)
- Legacy API compatibility
- TypeScript type checking

**UserInputLabel Component Tests**:
- Label text rendering in terminal
- Theme-based styling application
- Variant styling application
- Terminal UI accessibility

### Integration Testing

**Component Composition Tests**:
- UserInput + UserInputLabel integration
- Event flow between components
- Theme-consistent styling coordination
- Ink rendering compatibility



## Implementation Phases

### Phase 1: Core Variant System
- Implement variant type definitions
- Create basic variant rendering logic
- Add TypeScript type safety

### Phase 2: Label Separation
- Extract label functionality to UserInputLabel component
- Remove label logic from UserInput
- Ensure component composition works

### Phase 3: Testing & Documentation
- Comprehensive test coverage
- Update component documentation
- Migration guide for existing usage



## Performance Considerations

### Rendering Optimization

- **Variant-Specific Rendering**: Only render components needed for current variant
- **Memoization**: Use React.memo for stable props
- **Event Handler Stability**: Stable references to prevent unnecessary re-renders

### Bundle Size Impact

- **Tree Shaking**: Unused variant logic can be eliminated
- **Component Separation**: Label component can be imported independently
- **Type-Only Imports**: TypeScript types don't affect bundle size