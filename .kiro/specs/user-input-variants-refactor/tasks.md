# Implementation Plan

- [ ] 1. Set up TypeScript type definitions for variant system
  - Create discriminated union types for UserInput variants (default, typing, loading, error)
  - Define variant-specific prop interfaces with proper type constraints
  - Export types for external usage
  - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 2. Create UserInputLabel component
  - [ ] 2.1 Implement basic UserInputLabel component structure
    - Create new component file with TypeScript interface
    - Implement text rendering with Ink Text component
    - Add variant prop support (default, required, optional)
    - Apply theme-based styling for different variants
    - _Requirements: 6.2, 6.3, 6.5_

  - [ ]* 2.2 Write unit tests for UserInputLabel component
    - Test text rendering functionality
    - Test variant styling application
    - Test theme integration
    - _Requirements: 6.2, 6.3, 6.5_

- [ ] 3. Refactor UserInput component to use variant system
  - [ ] 3.1 Remove existing boolean flag props and label functionality
    - Remove isLoading, isTyping, error boolean props
    - Remove all label/prompt related code and props
    - Clean up conditional rendering logic based on boolean flags
    - _Requirements: 1.1, 6.1_

  - [ ] 3.2 Implement variant-based rendering logic
    - Add variant prop to component interface
    - Implement switch/case logic for variant-specific rendering
    - Handle variant-specific props (loadingText for loading, error for error)
    - Ensure proper TypeScript type checking for variant props
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.3 Implement default variant rendering
    - Render normal input state with placeholder text when empty
    - Handle basic input functionality (value, onChange, onSubmit)
    - _Requirements: 2.1, 3.1_

  - [ ] 3.4 Implement typing variant rendering
    - Show active input state with "Press Enter to submit" hint
    - Maintain same input functionality as default variant
    - _Requirements: 2.2, 3.2_

  - [ ] 3.5 Implement loading variant rendering
    - Display spinner with loading text
    - Disable input interaction during loading state
    - Ignore input events when in loading state
    - _Requirements: 2.3, 3.3_

  - [ ] 3.6 Implement error variant rendering
    - Show error message with error styling
    - Allow input correction while displaying error
    - Maintain input functionality for error recovery
    - _Requirements: 2.4, 3.4_

  - [ ]* 3.7 Write unit tests for UserInput variants
    - Test each variant renders correctly
    - Test variant-specific prop validation
    - Test event handling for each variant
    - Test TypeScript type safety
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Update existing usage of UserInput component
  - [ ] 4.1 Find and update all UserInput component usage
    - Search codebase for existing UserInput usage
    - Replace boolean flag props with appropriate variant props
    - Remove any label-related props and replace with UserInputLabel component
    - _Requirements: 6.1, 6.4_

  - [ ] 4.2 Implement UserInput and UserInputLabel composition
    - Update components that need both input and label functionality
    - Ensure proper component composition without tight coupling
    - Test component interaction and styling coordination
    - _Requirements: 6.4, 6.5_

- [ ]* 5. Integration testing and validation
  - Write integration tests for UserInput + UserInputLabel composition
  - Test component interaction and event flow
  - Validate theme-consistent styling across components
  - Test Ink rendering compatibility
  - _Requirements: 6.4, 6.5_