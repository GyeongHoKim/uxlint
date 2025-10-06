# Design Document

## Overview

The beautiful CLI interface for uxlint will transform the current basic "Hello, World" style interface into a modern, branded terminal application that provides an engaging user experience. The design leverages Ink's React-based terminal UI capabilities to create gradient effects, interactive input components, and a cohesive visual identity that positions uxlint as a premium developer tool.

## Architecture

### Project Structure

```
source/
├── components/           # UI Components (React + Ink)
│   ├── Header.tsx       # Brand display with gradient
│   ├── UserInput.tsx    # Generic input component
│   ├── GradientText.tsx # Text with gradient effects
│   └── index.ts         # Component exports
├── hooks/               # Custom React Hooks
│   ├── useUserInput.ts  # Input state management
│   └── index.ts         # Hook exports
├── models/              # Pure TypeScript Business Logic
│   ├── ValidationEngine.ts  # Input validation logic
│   ├── InputProcessor.ts    # Input processing utilities
│   ├── theme.ts            # Theme constants and utilities
│   └── index.ts            # Model exports
├── app.tsx              # Main application component
└── cli.tsx              # CLI entry point
```

## Architecture Layers

#### Component Hierarchy (UI Layer)

```
App (Main Container)
├── Header (Brand Display)
│   ├── Logo/Title with Gradient
│   └── Tagline/Description
├── UserInput (Generic Interactive Input)
│   ├── Input Field (Pure UI)
│   ├── Validation Feedback Display
│   └── Configurable Prompt/Placeholder
└── Footer (Optional Status/Help)
```

#### Business Logic Layer

```
Core Business Logic (Pure TypeScript)
├── ValidationEngine
│   ├── URLValidator
│   ├── RequiredValidator
│   └── CompositeValidator
└── InputProcessor
    ├── ValueNormalizer
    └── SubmissionHandler
```

#### Custom Hooks Layer (React Integration)

```
Custom Hooks (Business Logic Wrappers)
├── useUserInput
│   ├── useValidation
│   ├── useInputState
│   └── useSubmission
└── useAppState
    └── useNavigationState
```

### State Management

The application will use React hooks for state management:
- `useState` for URL input value and validation state
- `useEffect` for terminal size detection and color support
- Custom hooks for gradient animation and theme management

## Components and Interfaces

### 1. Header Component

**Purpose:** Display uxlint branding with gradient styling

**Props Interface:**
```typescript
interface HeaderProps {
  theme: ThemeConfig;
  terminalWidth: number;
}
```

**Features:**
- Animated gradient text for "uxlint" title
- Subtitle describing the tool's purpose
- Responsive layout based on terminal width
- Fallback styling for terminals without color support

### 2. UserInput Component (UI Only)

**Purpose:** Pure UI component for displaying input interface

**Props Interface:**
```typescript
interface UserInputProps {
  value: string;
  prompt?: string;
  placeholder?: string;
  error?: string;
  isLoading?: boolean;
  loadingText?: string;
  isFocused?: boolean;
  isTyping?: boolean;
  showCursor?: boolean;
  theme: ThemeConfig;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}
```

**Features:**
- Pure UI rendering without business logic
- Displays current input value and validation state
- Shows loading states and error messages
- Handles keyboard input and submission events
- **Real-time visual feedback during typing (cursor, focus states)**
- **Smooth transitions between states (idle, typing, validating, error)**
- Fully controlled by parent component or hook

### Business Logic Classes

#### ValidationEngine (models/ValidationEngine.ts)
```typescript
class ValidationEngine {
  static url(value: string): ValidationResult;
  static required(value: string): ValidationResult;
  static minLength(min: number): (value: string) => ValidationResult;
  static compose(...validators: Validator[]): Validator;
}
```

#### InputProcessor (models/InputProcessor.ts)
```typescript
class InputProcessor {
  static normalizeUrl(url: string): string;
  static sanitizeInput(input: string): string;
  static processSubmission(value: string, validator?: Validator): ProcessedInput;
}
```

#### ThemeEngine (models/theme.ts)
```typescript
class ThemeEngine {
  static getTheme(colorSupport: boolean): ThemeConfig;
  static interpolateColor(start: string, end: string, ratio: number): string;
  static createGradient(text: string, startColor: string, endColor: string): ColoredChar[];
  static detectColorSupport(): ColorCapabilities;
}
```

### Custom Hooks (React Integration Layer)

#### useUserInput Hook
```typescript
interface UseUserInputOptions {
  validator?: Validator;
  onSubmit: (value: string) => void | Promise<void>;
  initialValue?: string;
  type?: InputType;
}

interface UseUserInputReturn {
  value: string;
  error: string | undefined;
  isLoading: boolean;
  isValid: boolean;
  handleChange: (newValue: string) => void;
  handleSubmit: () => void;
  reset: () => void;
}

function useUserInput(options: UseUserInputOptions): UseUserInputReturn;
```

#### useAppState Hook
```typescript
interface UseAppStateOptions {
  initialStep?: 'input' | 'processing' | 'results';
}

interface UseAppStateReturn {
  currentStep: 'input' | 'processing' | 'results';
  navigateToStep: (step: 'input' | 'processing' | 'results') => void;
  reset: () => void;
}

function useAppState(options?: UseAppStateOptions): UseAppStateReturn;
```

### 3. GradientText Component

**Purpose:** Render text with gradient effects using character-by-character coloring

**Props Interface:**
```typescript
interface GradientTextProps {
  children: string;
  startColor: string;
  endColor: string;
  fallbackColor?: string;
}
```

**Implementation Details:**
- Uses Ink's `<Text color="...">` prop for individual character styling
- Integrates with Chalk for color interpolation calculations
- Gracefully degrades to single color when gradients aren't supported

### 4. Theme System (models/theme.ts)

**Purpose:** Centralized color and styling constants as single source of truth

**Theme Interface:**
```typescript
interface ThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
  gradient: {
    start: string;
    end: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
  };
  status: {
    success: string;
    error: string;
    warning: string;
  };
}

// Default theme constants
export const DEFAULT_THEME: ThemeConfig = {
  primary: '#6366f1',
  secondary: '#8b5cf6', 
  accent: '#06b6d4',
  gradient: {
    start: '#6366f1',
    end: '#8b5cf6'
  },
  text: {
    primary: '#ffffff',
    secondary: '#e2e8f0',
    muted: '#94a3b8'
  },
  status: {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b'
  }
};

// Fallback theme for limited color support
export const FALLBACK_THEME: ThemeConfig = {
  primary: 'blue',
  secondary: 'magenta',
  accent: 'cyan',
  gradient: {
    start: 'blue',
    end: 'magenta'
  },
  text: {
    primary: 'white',
    secondary: 'gray',
    muted: 'gray'
  },
  status: {
    success: 'green',
    error: 'red',
    warning: 'yellow'
  }
};

// Theme utility functions
export class ThemeEngine {
  static getTheme(colorSupport: boolean = true): ThemeConfig {
    return colorSupport ? DEFAULT_THEME : FALLBACK_THEME;
  }
  
  static interpolateColor(start: string, end: string, ratio: number): string;
  static createGradient(text: string, startColor: string, endColor: string): ColoredChar[];
}
```

## Data Models

### Input Validation Model

```typescript
interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalizedValue?: string;
}

interface InputState {
  value: string;
  validation: ValidationResult;
  isSubmitting: boolean;
}

// Predefined validators for common use cases
interface ValidatorLibrary {
  url: (value: string) => ValidationResult;
  required: (value: string) => ValidationResult;
  minLength: (min: number) => (value: string) => ValidationResult;
  custom: (fn: (value: string) => boolean, errorMessage: string) => (value: string) => ValidationResult;
}
```

### Terminal Capabilities Model

```typescript
interface TerminalCapabilities {
  supportsColor: boolean;
  supportsGradients: boolean;
  width: number;
  height: number;
}
```

## Color Scheme and Brand Identity

### Primary Brand Colors (Defined in models/theme.ts)

**Primary Color:** `#6366f1` (Indigo-500) - Modern, trustworthy, tech-forward
**Secondary Color:** `#8b5cf6` (Violet-500) - Creative, innovative
**Accent Color:** `#06b6d4` (Cyan-500) - Fresh, energetic

All colors are centrally defined in `DEFAULT_THEME` constant to ensure consistency across components.

### Ink Color Implementation

Ink supports multiple color formats that we'll leverage:
- **Named colors:** `"blue"`, `"green"`, `"magenta"`, `"cyan"`
- **Hex colors:** `"#6366f1"`, `"#8b5cf6"`, `"#06b6d4"`
- **RGB colors:** `"rgb(99, 102, 241)"`, `"rgb(139, 92, 246)"`

### Gradient Implementation Strategy

Since Ink doesn't have native gradient support, we'll create gradient effects using:

1. **Character-by-character coloring:** Split text into characters and apply different colors
2. **Chalk integration:** Use Chalk for advanced color manipulation and blending
3. **Manual gradient calculation:** Interpolate between colors for smooth transitions

```typescript
// Example gradient text implementation
const createGradientText = (text: string, startColor: string, endColor: string) => {
  // Split text and apply interpolated colors to each character
  return text.split('').map((char, index) => {
    const ratio = index / (text.length - 1);
    const color = interpolateColor(startColor, endColor, ratio);
    return <Text key={index} color={color}>{char}</Text>;
  });
};
```

### Fallback Colors (Defined in models/theme.ts)

For terminals with limited color support, defined in `FALLBACK_THEME`:
- Primary: `"blue"` (Ink named color)
- Secondary: `"magenta"` (Ink named color)
- Accent: `"cyan"` (Ink named color)
- Text: Default terminal colors

Components import theme from single source: `import { DEFAULT_THEME, FALLBACK_THEME } from '../models/theme.js'`

## Error Handling

### Color Support Detection

Ink automatically handles color support detection, but we can enhance it:

```typescript
import chalk from 'chalk';

const detectColorSupport = (): {
  level: number;
  hasColor: boolean;
  supportsRgb: boolean;
} => {
  return {
    level: chalk.level,
    hasColor: chalk.level > 0,
    supportsRgb: chalk.level >= 3
  };
};
```

### Graceful Degradation Strategy

1. **Full Color Support:** Complete gradient and brand styling
2. **Basic Color Support:** Solid colors without gradients
3. **No Color Support:** Text-only interface with ASCII art
4. **Narrow Terminals:** Compact layout with essential elements only

### Input Validation System

**Built-in Validators:**
- **URL Validator:** Valid HTTP/HTTPS URL, auto-prepend protocol, reachability check
- **Required Validator:** Non-empty input validation
- **Length Validators:** Minimum/maximum length constraints
- **Custom Validators:** User-defined validation functions

**Validation Features:**
- Real-time validation as user types
- Helpful error messages for common mistakes
- Value normalization (e.g., auto-prepend `https://`)
- Async validation support for network checks
- Composable validators for complex rules

## Testing Strategy

### Testing Strategy with Separated Concerns

#### 1. Business Logic Tests (Pure TypeScript)

```typescript
import test from 'ava';
import {ValidationEngine, InputProcessor, ThemeEngine, DEFAULT_THEME, FALLBACK_THEME} from '../source/models/index.js';

test('ValidationEngine.url validates URLs correctly', t => {
  // Valid URLs
  t.true(ValidationEngine.url('https://example.com').isValid);
  t.true(ValidationEngine.url('http://localhost:3000').isValid);
  
  // Invalid URLs
  t.false(ValidationEngine.url('not-a-url').isValid);
  t.false(ValidationEngine.url('').isValid);
  
  // Error messages
  const result = ValidationEngine.url('invalid');
  t.is(result.error, 'Please enter a valid URL');
});

test('ValidationEngine.compose combines validators', t => {
  const composedValidator = ValidationEngine.compose(
    ValidationEngine.required,
    ValidationEngine.minLength(5),
    ValidationEngine.url
  );
  
  // Should fail on first validator
  t.false(composedValidator('').isValid);
  
  // Should fail on second validator
  const shortResult = composedValidator('hi');
  t.false(shortResult.isValid);
  t.true(shortResult.error?.includes('at least 5 characters'));
  
  // Should fail on third validator
  const invalidUrlResult = composedValidator('hello world');
  t.false(invalidUrlResult.isValid);
  t.true(invalidUrlResult.error?.includes('valid URL'));
  
  // Should pass all validators
  t.true(composedValidator('https://example.com').isValid);
});

test('InputProcessor.normalizeUrl adds protocol', t => {
  t.is(InputProcessor.normalizeUrl('example.com'), 'https://example.com');
  t.is(InputProcessor.normalizeUrl('https://example.com'), 'https://example.com');
  t.is(InputProcessor.normalizeUrl('http://example.com'), 'http://example.com');
});

test('ThemeEngine provides consistent theme constants', t => {
  // Test default theme
  const defaultTheme = ThemeEngine.getTheme(true);
  t.is(defaultTheme.primary, DEFAULT_THEME.primary);
  t.is(defaultTheme.secondary, DEFAULT_THEME.secondary);
  
  // Test fallback theme
  const fallbackTheme = ThemeEngine.getTheme(false);
  t.is(fallbackTheme.primary, FALLBACK_THEME.primary);
  t.is(fallbackTheme.secondary, FALLBACK_THEME.secondary);
});

test('Theme constants are properly defined', t => {
  // Test that all required theme properties exist
  t.true(typeof DEFAULT_THEME.primary === 'string');
  t.true(typeof DEFAULT_THEME.secondary === 'string');
  t.true(typeof DEFAULT_THEME.accent === 'string');
  t.true(typeof DEFAULT_THEME.status.error === 'string');
  
  // Test hex color format for default theme
  t.regex(DEFAULT_THEME.primary, /^#[0-9a-f]{6}$/i);
  t.regex(DEFAULT_THEME.secondary, /^#[0-9a-f]{6}$/i);
});


```

#### 2. Custom Hook Tests

```typescript
import test from 'ava';
import {renderHook, act} from '@testing-library/react-hooks';
import {useUserInput} from '../source/hooks/index.js';

test('useUserInput manages input state', t => {
  const mockSubmit = (value: string) => {
    t.is(value, 'https://example.com');
  };
  
  const {result} = renderHook(() => useUserInput({
    validator: ValidationEngine.url,
    onSubmit: mockSubmit
  }));
  
  // Initial state
  t.is(result.current.value, '');
  t.is(result.current.error, undefined);
  t.false(result.current.isLoading);
  
  // Change value
  act(() => {
    result.current.handleChange('example.com');
  });
  
  t.is(result.current.value, 'example.com');
  t.true(result.current.isValid);
  
  // Submit
  act(() => {
    result.current.handleSubmit();
  });
});

test('useUserInput handles validation errors', t => {
  const {result} = renderHook(() => useUserInput({
    validator: ValidationEngine.url,
    onSubmit: () => {}
  }));
  
  act(() => {
    result.current.handleChange('invalid-url');
  });
  
  t.false(result.current.isValid);
  t.true(result.current.error?.includes('valid URL'));
});

test('useAppState manages navigation state', t => {
  const {result} = renderHook(() => useAppState());
  
  // Initial state
  t.is(result.current.currentStep, 'input');
  
  // Navigate to processing
  act(() => {
    result.current.navigateToStep('processing');
  });
  
  t.is(result.current.currentStep, 'processing');
  
  // Navigate to results
  act(() => {
    result.current.navigateToStep('results');
  });
  
  t.is(result.current.currentStep, 'results');
  
  // Reset
  act(() => {
    result.current.reset();
  });
  
  t.is(result.current.currentStep, 'input');
});

test('useAppState accepts initial step', t => {
  const {result} = renderHook(() => useAppState({ initialStep: 'processing' }));
  
  t.is(result.current.currentStep, 'processing');
});


```

#### 3. Component Tests (UI Only)

```typescript
import test from 'ava';
import React from 'react';
import chalk from 'chalk';
import {render} from 'ink-testing-library';
import {Header, UserInput} from '../source/components/index.js';

```typescript
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import {Header} from '../source/components/Header.js';

test('Header renders uxlint title with gradient colors', t => {
  const theme = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    gradient: { start: '#6366f1', end: '#8b5cf6' }
  };
  
  const {lastFrame} = render(<Header theme={theme} terminalWidth={80} />);
  
  // Test exact color output using chalk for comparison
  const expectedTitle = chalk.hex('#6366f1')('u') + 
                       chalk.hex('#7c3aed')('x') + 
                       chalk.hex('#8b5cf6')('lint');
  
  t.true(lastFrame().includes(expectedTitle));
  t.true(lastFrame().includes('UX review CLI tool'));
});

test('Header adapts to narrow terminal width', t => {
  const theme = {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    gradient: { start: '#6366f1', end: '#8b5cf6' }
  };
  
  const {lastFrame} = render(<Header theme={theme} terminalWidth={40} />);
  
  // Should still render but in compact format
  t.true(lastFrame().includes('uxlint'));
  // Check that layout is compact (fewer characters per line)
  const lines = lastFrame().split('\n');
  t.true(lines.every(line => line.length <= 40));
});

test('Header falls back to basic colors when gradients not supported', t => {
  const theme = {
    primary: 'blue',
    secondary: 'magenta',
    gradient: { start: 'blue', end: 'magenta' }
  };
  
  const {lastFrame} = render(<Header theme={theme} terminalWidth={80} />);
  
  // Test fallback to single color
  const expectedFallback = chalk.blue('uxlint');
  t.true(lastFrame().includes(expectedFallback));
});
```

test('UserInput displays controlled state', t => {

test('UserInput renders with custom prompt and placeholder', t => {
  const mockSubmit = () => {};
  const theme = { primary: '#6366f1' };
  
  const {lastFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      prompt="Enter URL to analyze:"
      placeholder="https://example.com"
    />
  );
  
  // Test colored prompt text
  const expectedPrompt = chalk.hex('#6366f1')('Enter URL to analyze:');
  t.true(lastFrame().includes(expectedPrompt));
});

test('UserInput handles user input with URL validator', async t => {
  t.plan(2);
  
  const mockSubmit = (url: string) => {
    t.is(url, 'https://example.com');
  };
  const theme = { primary: '#6366f1' };
  
  const {stdin, lastFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      validator={ValidationEngine.url}
      type="url"
    />
  );
  
  // Simulate typing
  stdin.write('https://example.com');
  t.true(lastFrame().includes('https://example.com'));
  
  // Simulate Enter key
  stdin.write('\r');
});

test('UserInput shows validation error with custom validator', async t => {
  const mockSubmit = () => {};
  const theme = { 
    primary: '#6366f1',
    status: { error: '#ef4444' }
  };
  
  const customValidator = (value: string) => ({
    isValid: value.startsWith('https://'),
    error: value ? 'Must start with https://' : 'URL is required'
  });
  
  const {stdin, lastFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      validator={customValidator}
    />
  );
  
  // Type invalid input
  stdin.write('http://example.com');
  stdin.write('\r');
  
  // Should show colored error message
  const expectedError = chalk.hex('#ef4444')('✗ Must start with https://');
  t.true(lastFrame().includes(expectedError));
});

test('UserInput shows custom loading state', t => {
  const mockSubmit = () => {};
  const theme = { 
    primary: '#6366f1',
    accent: '#06b6d4'
  };
  
  const {lastFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme} 
      isLoading={true}
      loadingText="Processing your request..."
    />
  );
  
  // Test colored loading message with spinner
  const expectedLoading = chalk.hex('#06b6d4')('⠋ Processing your request...');
  t.true(lastFrame().includes(expectedLoading) || 
         lastFrame().includes(chalk.hex('#06b6d4')('Processing')));
});

test('UserInput works with different input types', t => {
  const mockSubmit = () => {};
  const theme = { primary: '#6366f1' };
  
  // Test URL type
  const {lastFrame: urlFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      type="url"
      validator={ValidationEngine.url}
      placeholder="https://example.com"
    />
  );
  
  t.true(urlFrame().includes('https://example.com'));
  
  // Test text type
  const {lastFrame: textFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      type="text"
      placeholder="Enter any text"
    />
  );
  
  t.true(textFrame().includes('Enter any text'));
});

test('UserInput supports validator composition', async t => {
  const mockSubmit = () => {};
  const theme = { 
    primary: '#6366f1',
    status: { error: '#ef4444' }
  };
  
  // Compose multiple validators
  const composedValidator = ValidationEngine.compose(
    ValidationEngine.required,
    ValidationEngine.minLength(5),
    ValidationEngine.url
  );
  
  const {stdin, lastFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      validator={composedValidator}
    />
  );
  
  // Test empty input
  stdin.write('\r');
  t.true(lastFrame().includes(chalk.hex('#ef4444')('✗')));
});
```

#### 3. Gradient Text Component Tests

```typescript
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import {GradientText} from '../source/components/GradientText.js';

test('GradientText renders text with color styling', t => {
  const {lastFrame} = render(
    <GradientText 
      startColor="#6366f1" 
      endColor="#8b5cf6"
      fallbackColor="blue"
    >
      uxlint
    </GradientText>
  );
  
  // Test exact gradient color output
  const expectedGradient = 
    chalk.hex('#6366f1')('u') +
    chalk.hex('#6f42c1')('x') +
    chalk.hex('#7c3aed')('l') +
    chalk.hex('#8332dd')('i') +
    chalk.hex('#8b5cf6')('n') +
    chalk.hex('#8b5cf6')('t');
  
  t.is(lastFrame(), expectedGradient);
});

test('GradientText falls back to single color when needed', t => {
  // Mock limited color support
  const originalLevel = chalk.level;
  chalk.level = 0; // Disable colors
  
  const {lastFrame} = render(
    <GradientText 
      startColor="#6366f1" 
      endColor="#8b5cf6"
      fallbackColor="blue"
    >
      test
    </GradientText>
  );
  
  // Should fallback to plain text or basic color
  t.is(lastFrame(), 'test'); // Plain text when no color support
  
  // Restore original color level
  chalk.level = originalLevel;
});
```

#### 4. Theme System Tests

```typescript
import test from 'ava';
import chalk from 'chalk';
import {createTheme, interpolateColor, detectColorSupport} from '../source/utils/theme.js';

test('createTheme returns correct color scheme', t => {
  const theme = createTheme();
  
  t.is(theme.primary, '#6366f1');
  t.is(theme.secondary, '#8b5cf6');
  t.is(theme.accent, '#06b6d4');
});

test('interpolateColor calculates gradient colors correctly', t => {
  const startColor = '#6366f1'; // Indigo
  const endColor = '#8b5cf6';   // Violet
  
  const midColor = interpolateColor(startColor, endColor, 0.5);
  
  // Test exact interpolated color value
  t.is(midColor, '#7c3aed'); // Expected mid-point color
  
  // Test edge cases
  t.is(interpolateColor(startColor, endColor, 0), startColor);
  t.is(interpolateColor(startColor, endColor, 1), endColor);
});

test('detectColorSupport returns capability object', t => {
  const support = detectColorSupport();
  
  t.true(typeof support.level === 'number');
  t.true(typeof support.hasColor === 'boolean');
  t.true(typeof support.supportsRgb === 'boolean');
  
  // Test chalk integration
  t.is(support.level, chalk.level);
});

test('theme colors work with chalk', t => {
  const theme = createTheme();
  
  // Test that theme colors can be used with chalk
  const coloredText = chalk.hex(theme.primary)('test');
  t.true(coloredText.includes('test'));
  t.true(coloredText !== 'test'); // Should have ANSI codes
});

test('color interpolation produces valid hex colors', t => {
  const colors = [
    ['#ff0000', '#00ff00'], // Red to Green
    ['#6366f1', '#8b5cf6'], // Indigo to Violet
    ['#000000', '#ffffff']  // Black to White
  ];
  
  colors.forEach(([start, end]) => {
    for (let i = 0; i <= 10; i++) {
      const ratio = i / 10;
      const interpolated = interpolateColor(start, end, ratio);
      
      // Should be valid hex color
      t.regex(interpolated, /^#[0-9a-f]{6}$/i);
    }
  });
});
```

#### 5. Color Support and Fallback Tests

```typescript
import test from 'ava';
import chalk from 'chalk';
import {render} from 'ink-testing-library';

test('components handle different color support levels', t => {
  const originalLevel = chalk.level;
  
  // Test with different color levels
  [0, 1, 2, 3].forEach(level => {
    chalk.level = level;
    
    const {lastFrame} = render(<App />);
    
    // Should render without errors at any color level
    t.true(lastFrame().length > 0);
    t.true(lastFrame().includes('uxlint'));
  });
  
  chalk.level = originalLevel;
});

test('gradient text adapts to color capabilities', t => {
  const originalLevel = chalk.level;
  
  // Test 24-bit color support (level 3)
  chalk.level = 3;
  const {lastFrame: frame24bit} = render(
    <GradientText startColor="#6366f1" endColor="#8b5cf6">test</GradientText>
  );
  
  // Test 8-bit color support (level 2)
  chalk.level = 2;
  const {lastFrame: frame8bit} = render(
    <GradientText startColor="#6366f1" endColor="#8b5cf6">test</GradientText>
  );
  
  // Test basic color support (level 1)
  chalk.level = 1;
  const {lastFrame: frameBasic} = render(
    <GradientText startColor="#6366f1" endColor="#8b5cf6">test</GradientText>
  );
  
  // All should contain the text but with different color encoding
  t.true(frame24bit().includes('test'));
  t.true(frame8bit().includes('test'));
  t.true(frameBasic().includes('test'));
  
  // 24-bit should have more complex ANSI codes than basic
  t.true(frame24bit().length >= frameBasic().length);
  
  chalk.level = originalLevel;
});

test('error colors are consistent across components', t => {
  const theme = { 
    status: { 
      error: '#ef4444',
      success: '#10b981',
      warning: '#f59e0b'
    }
  };
  
  // Test error color consistency
  const errorText = chalk.hex(theme.status.error)('Error message');
  const successText = chalk.hex(theme.status.success)('Success message');
  const warningText = chalk.hex(theme.status.warning)('Warning message');
  
  t.true(errorText.includes('Error message'));
  t.true(successText.includes('Success message'));
  t.true(warningText.includes('Warning message'));
  
  // Colors should be different
  t.not(errorText, successText);
  t.not(errorText, warningText);
  t.not(successText, warningText);
});
```

### Integration Testing

#### 5. Full Application Flow Tests

```typescript
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import App from '../source/app.js';

test('App renders complete interface', t => {
  const {lastFrame} = render(<App />);
  
  // Should contain all main elements
  t.true(lastFrame().includes('uxlint'));
  t.true(lastFrame().includes('Enter URL'));
});

test('App handles complete user flow', async t => {
  t.plan(2);
  
  const {stdin, lastFrame, rerender} = render(<App />);
  
  // Initial state
  t.true(lastFrame().includes('uxlint'));
  
  // User types URL
  stdin.write('https://example.com');
  stdin.write('\r');
  
  // Should show processing state
  t.true(lastFrame().includes('Analyzing') || lastFrame().includes('Processing'));
});

test('App handles terminal resize gracefully', t => {
  const {lastFrame, rerender} = render(<App />);
  
  // Should render without errors at different sizes
  t.true(lastFrame().length > 0);
  
  // Simulate resize by re-rendering (actual resize testing would need more setup)
  rerender(<App />);
  t.true(lastFrame().length > 0);
});
```

### Async Testing Patterns

#### 6. Asynchronous Component Behavior

```typescript
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';

test('UserInput validation is async-safe', async t => {
  const asyncValidator = async (value: string) => {
    // Simulate async validation (e.g., network check)
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      isValid: value.startsWith('https://'),
      error: value.startsWith('https://') ? undefined : 'Must be HTTPS URL'
    };
  };
  
  const mockSubmit = () => {};
  const theme = { primary: '#6366f1' };
  
  const {stdin, lastFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      validator={asyncValidator}
    />
  );
  
  stdin.write('https://example.com');
  stdin.write('\r');
  
  // Wait for async validation
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Should not show error for valid URL
  t.false(lastFrame().includes('Must be HTTPS URL'));
});

test('UserInput handles async errors gracefully', async t => {
  const errorValidator = async () => {
    throw new Error('Validation service unavailable');
  };
  
  const mockSubmit = () => {};
  const theme = { 
    primary: '#6366f1',
    status: { error: '#ef4444' }
  };
  
  const {stdin, lastFrame} = render(
    <UserInput 
      onSubmit={mockSubmit} 
      theme={theme}
      validator={errorValidator}
    />
  );
  
  stdin.write('test-input');
  stdin.write('\r');
  
  // Should handle validation error gracefully
  await t.notThrowsAsync(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  // Should show fallback error message
  t.true(lastFrame().includes(chalk.hex('#ef4444')('✗')));
});
```

### Visual Regression Testing

#### Test Folder Structure for Snapshots

```
tests/
├── components/              # Component-specific tests
│   ├── Header.spec.tsx     # Header component tests
│   ├── UserInput.spec.tsx  # UserInput component tests
│   ├── GradientText.spec.tsx # GradientText component tests
│   └── snapshots/          # Component snapshot files (auto-generated)
│       ├── Header.spec.tsx.md
│       ├── Header.spec.tsx.snap
│       ├── UserInput.spec.tsx.md
│       ├── UserInput.spec.tsx.snap
│       ├── GradientText.spec.tsx.md
│       └── GradientText.spec.tsx.snap
├── hooks/                  # Hook tests
│   ├── useUserInput.spec.ts
│   ├── useAppState.spec.ts
│   └── snapshots/          # Hook snapshot files (if needed)
├── models/                 # Business logic tests
│   ├── ValidationEngine.spec.ts
│   ├── InputProcessor.spec.ts
│   ├── theme.spec.ts
│   └── snapshots/          # Model snapshot files (if needed)
├── integration/            # Integration tests (Hooks + Components)
│   ├── user-flow.spec.tsx  # Complete user interaction flows
│   ├── app-integration.spec.tsx # App-level component integration
│   └── snapshots/          # Integration snapshot files
│       ├── user-flow.spec.tsx.md
│       ├── user-flow.spec.tsx.snap
│       ├── app-integration.spec.tsx.md
│       └── app-integration.spec.tsx.snap
└── test.spec.tsx          # Existing test file (to be refactored)
```

#### 7. Snapshot Testing for UI Consistency

**AVA Snapshot Features:**
- Snapshots are stored in `.md` and `.snap` files next to test files
- Use `t.snapshot(value)` to capture and compare outputs
- Run `ava --update-snapshots` to update snapshots when UI changes
- Each test title must be unique for proper snapshot management

```typescript
// tests/components/Header.spec.tsx
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import {Header} from '../../source/components/Header.js';
import {DEFAULT_THEME} from '../../source/models/theme.js';

test('Header component visual snapshot - default theme', t => {
  const {lastFrame} = render(
    <Header theme={DEFAULT_THEME} terminalWidth={80} />
  );
  
  // AVA will create Header.spec.tsx.md and Header.spec.tsx.snap
  t.snapshot(lastFrame(), 'Header with default theme at 80 width');
});

test('Header component visual snapshot - narrow terminal', t => {
  const {lastFrame} = render(
    <Header theme={DEFAULT_THEME} terminalWidth={40} />
  );
  
  t.snapshot(lastFrame(), 'Header with default theme at 40 width');
});

test('Header component visual snapshot - fallback theme', t => {
  const {lastFrame} = render(
    <Header theme={FALLBACK_THEME} terminalWidth={80} />
  );
  
  t.snapshot(lastFrame(), 'Header with fallback theme');
});
```

```typescript
// tests/components/UserInput.spec.tsx
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import {UserInput} from '../../source/components/UserInput.js';
import {DEFAULT_THEME} from '../../source/models/theme.js';

test('UserInput visual snapshot - initial state', t => {
  const mockChange = () => {};
  const mockSubmit = () => {};
  
  const {lastFrame} = render(
    <UserInput 
      value=""
      prompt="Enter URL to analyze:"
      placeholder="https://example.com"
      theme={DEFAULT_THEME}
      onChange={mockChange}
      onSubmit={mockSubmit}
    />
  );
  
  t.snapshot(lastFrame(), 'UserInput initial state');
});

test('UserInput visual snapshot - with value', t => {
  const mockChange = () => {};
  const mockSubmit = () => {};
  
  const {lastFrame} = render(
    <UserInput 
      value="https://example.com"
      prompt="Enter URL to analyze:"
      theme={DEFAULT_THEME}
      onChange={mockChange}
      onSubmit={mockSubmit}
    />
  );
  
  t.snapshot(lastFrame(), 'UserInput with typed value');
});

test('UserInput visual snapshot - error state', t => {
  const mockChange = () => {};
  const mockSubmit = () => {};
  
  const {lastFrame} = render(
    <UserInput 
      value="invalid-url"
      error="Please enter a valid URL"
      theme={DEFAULT_THEME}
      onChange={mockChange}
      onSubmit={mockSubmit}
    />
  );
  
  t.snapshot(lastFrame(), 'UserInput with validation error');
});

test('UserInput visual snapshot - loading state', t => {
  const mockChange = () => {};
  const mockSubmit = () => {};
  
  const {lastFrame} = render(
    <UserInput 
      value="https://example.com"
      isLoading={true}
      loadingText="Validating URL..."
      theme={DEFAULT_THEME}
      onChange={mockChange}
      onSubmit={mockSubmit}
    />
  );
  
  t.snapshot(lastFrame(), 'UserInput loading state');
});
```

#### Integration Test Purpose and Tools

**Integration tests verify that multiple components work together correctly:**
- **Hook + Component integration:** Custom hooks controlling UI components
- **Complete user flows:** End-to-end user interactions
- **App-level behavior:** Full application state management

**Tools used:**
- **AVA:** Test runner (same as unit tests)
- **ink-testing-library:** Component rendering and interaction
- **React hooks testing:** `@testing-library/react-hooks` for hook integration
- **No additional tools needed** - leverages existing test infrastructure

```typescript
// tests/integration/user-flow.spec.tsx
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import {ValidationEngine} from '../../source/models/index.js';
import {useUserInput, useAppState} from '../../source/hooks/index.js';
import {UserInput} from '../../source/components/index.js';
import {DEFAULT_THEME} from '../../source/models/theme.js';

// Integration component that combines hook + component
const IntegratedUserInput = ({onSubmit}: {onSubmit: (value: string) => void}) => {
  const inputState = useUserInput({
    validator: ValidationEngine.url,
    onSubmit
  });
  
  return (
    <UserInput
      value={inputState.value}
      error={inputState.error}
      isLoading={inputState.isLoading}
      theme={DEFAULT_THEME}
      onChange={inputState.handleChange}
      onSubmit={inputState.handleSubmit}
      prompt="Enter URL to analyze:"
    />
  );
};

test('Integration: useUserInput + UserInput - complete flow', async t => {
  t.plan(3);
  
  let submittedUrl = '';
  const mockSubmit = (url: string) => {
    submittedUrl = url;
  };
  
  const {stdin, lastFrame} = render(
    <IntegratedUserInput onSubmit={mockSubmit} />
  );
  
  // Initial state
  t.true(lastFrame().includes('Enter URL to analyze:'));
  
  // User types URL (should be normalized by InputProcessor)
  stdin.write('example.com');
  
  // Submit
  stdin.write('\r');
  
  // Verify integration between hook and component
  t.is(submittedUrl, 'https://example.com'); // URL was normalized
  t.snapshot(lastFrame(), 'Integrated component after submission');
});

test('Integration: validation error flow', t => {
  const mockSubmit = () => {};
  
  const {stdin, lastFrame} = render(
    <IntegratedUserInput onSubmit={mockSubmit} />
  );
  
  // Type invalid URL
  stdin.write('not-a-url');
  stdin.write('\r');
  
  // Should show validation error from ValidationEngine through hook to component
  t.true(lastFrame().includes('✗'));
  t.snapshot(lastFrame(), 'Integrated component with validation error');
});
```

```typescript
// tests/integration/app-integration.spec.tsx
import test from 'ava';
import React from 'react';
import {render} from 'ink-testing-library';
import App from '../../source/app.js';

test('App integration: complete user journey', async t => {
  t.plan(4);
  
  const {stdin, lastFrame} = render(<App />);
  
  // 1. Initial app state
  t.true(lastFrame().includes('uxlint'));
  t.true(lastFrame().includes('Enter URL'));
  
  // 2. User interaction
  stdin.write('https://example.com');
  t.true(lastFrame().includes('https://example.com'));
  
  // 3. Submit and verify app state change
  stdin.write('\r');
  // App should transition to processing state
  t.true(lastFrame().includes('Analyzing') || lastFrame().includes('Processing'));
  
  t.snapshot(lastFrame(), 'App after complete user interaction');
});

test('App integration: handles multiple navigation states', t => {
  // This would test useAppState integration with the main App component
  const {lastFrame} = render(<App />);
  
  // Test that app properly manages different states
  t.snapshot(lastFrame(), 'App initial navigation state');
});

test('App integration: responsive layout', t => {
  // Test app behavior with different terminal sizes
  const {lastFrame, rerender} = render(<App />);
  
  // Simulate terminal resize (would need actual terminal size detection)
  rerender(<App />);
  
  t.true(lastFrame().length > 0);
  t.snapshot(lastFrame(), 'App responsive layout');
});
```

#### Integration vs Unit Test Comparison

| Test Type | Purpose | Scope | Tools |
|-----------|---------|-------|-------|
| **Unit Tests** | Test individual components/functions in isolation | Single component, hook, or function | AVA + ink-testing-library |
| **Integration Tests** | Test multiple components working together | Hook + Component, Component + Component | AVA + ink-testing-library + react-hooks |
| **E2E Tests** | Test complete user scenarios | Full application flow | Not needed for CLI (integration covers this) |

**Why Integration Tests are Important:**
1. **Hook-Component Integration:** Verify custom hooks properly control UI components
2. **State Management:** Test that app state flows correctly between components
3. **User Flows:** Validate complete user interactions work end-to-end
4. **Real-world Scenarios:** Catch issues that only appear when components interact

#### Snapshot Management Commands

```bash
# Run tests and update snapshots when UI changes
npm test -- --update-snapshots

# Run specific snapshot tests
npm test tests/components/Header.spec.tsx

# Update only specific test snapshots
npm test tests/components/Header.spec.tsx -- --update-snapshots

# View snapshot differences
npm test # Will show diff when snapshots don't match
```

#### Snapshot File Examples

**Generated `tests/components/Header.spec.tsx.md`:**
```markdown
# Snapshot report for `tests/components/Header.spec.tsx`

The actual snapshot is saved in `Header.spec.tsx.snap`.

Generated by [AVA](https://avajs.dev).

## Header component visual snapshot - default theme

> Header with default theme at 80 width

    '┌─ uxlint ─────────────────────────────────────────────────────────────────┐\n│                          UX review CLI tool                             │\n└──────────────────────────────────────────────────────────────────────────┘'

## Header component visual snapshot - narrow terminal

> Header with default theme at 40 width

    '┌─ uxlint ─────────────────────────────┐\n│            UX CLI                    │\n└──────────────────────────────────────┘'
```

## Implementation Considerations

### Performance

- Minimize re-renders during gradient animations
- Efficient terminal capability detection
- Lazy loading of color calculation functions
- **Smooth state transitions without blocking the main thread**
- **Debounced validation to avoid excessive API calls**
- **Optimized cursor blinking and typing animations**

### Accessibility

- Ensure sufficient color contrast ratios
- Provide keyboard navigation
- Support screen readers with appropriate text alternatives
- Graceful degradation for accessibility tools

### Cross-Platform Compatibility

- Test on macOS, Linux, and Windows terminals
- Handle different terminal emulators (iTerm2, Terminal.app, Windows Terminal, etc.)
- Account for SSH sessions and remote terminals

### Dependencies

The design leverages existing dependencies:
- **Ink:** Core terminal UI framework with built-in color support
- **React:** Component architecture and state management  
- **Chalk:** Advanced color utilities (already in devDependencies)

Additional dependencies to consider:
- **ink-text-input:** For enhanced input components with better styling
- **ink-big-text:** For large branded title display
- **gradient-string:** For advanced gradient calculations (if needed)

### Ink-Specific Implementation Notes

**Text Styling:**
```typescript
// Basic Ink text styling
<Text color="#6366f1" bold>uxlint</Text>
<Text color="blue" backgroundColor="white">Highlighted text</Text>
<Text dimColor>Subtle text</Text>
```

**Box Styling:**
```typescript
// Ink box with borders and colors
<Box 
  borderStyle="round" 
  borderColor="#8b5cf6"
  backgroundColor="#f8fafc"
  padding={1}
>
  <Text>Content</Text>
</Box>
```

**Layout with Flexbox:**
```typescript
// Ink uses Flexbox for layouts
<Box flexDirection="column" alignItems="center">
  <Text>Centered content</Text>
</Box>
```