# UX Analysis Report

**Generated**: <normalised>
**Pages Analyzed**: 1 successful
**Failed Pages**: 1
**Browser Tooling**: unknown@unknown
**Browser**: unknown

## Executive Summary

Analyzed 1 page(s) successfully. Found 5 UX issue(s) requiring attention.

## Statistics

| Metric | Value |
|--------|-------|
| Total Findings | 5 |
| 🔴 Critical | 1 |
| 🟠 High | 2 |
| 🟡 Medium | 2 |
| 🟢 Low | 0 |

### Measured

| Page | Accessibility | LCP | CLS |
|------|---------------|-----|-----|
| https://example.com | 67/100 | 65 ms | 0.00 |
| https://example.com/pricing | not measured (page-not-loaded) | not measured (page-not-loaded) | not measured (page-not-loaded) |

Accessibility is audited without reloading the page, so it describes the same page load the analysis read. First Contentful Paint is not reported: the tracing tool does not measure one.

**Target Persona**:
- A developer evaluating the product

## Page Analyses

### https://example.com

**Features**: Landing page

**Findings**: 5 issues identified

- 🟠 **Accessibility**: Background and foreground colors do not have a sufficient contrast ratio. (`color-contrast`, 3 elements — _measured_)
- 🟠 **Accessibility**: `<html>` element does not have a `[lang]` attribute (`html-has-lang`, 1 element — _measured_)
- 🔴 **Accessibility**: Image elements do not have `[alt]` attributes (`image-alt`, 1 element — _measured_)
- 🟡 **Accessibility**: Document does not have a main landmark. (`landmark-one-main`, 1 element — _measured_)
- 🟡 **Navigation**: The primary action is below the fold (_AI judgement_)

**Measurement**: audited, 4 accessibility rules failing

### ⚠️ https://example.com/pricing

**Features**: Pricing

**Status**: Failed — findings below are only what was collected before the failure.

**Findings**: 0 issues identified

**Measurement**: not taken (page-not-loaded)

### Failed Pages

- ❌ https://example.com/pricing — Failed after 3 attempts. Last error: AI_APICallError: baseline-injected provider outage

## Prioritized Findings

All findings sorted by severity:

### 1. Image elements do not have `[alt]` attributes

🔴 **Severity**: Critical
**Category**: Accessibility
**Page**: https://example.com
**Source**: `image-alt`, 1 element — _measured_
**Recommendation**: see the rule documentation for this violation

### 2. Background and foreground colors do not have a sufficient contrast ratio.

🟠 **Severity**: High
**Category**: Accessibility
**Page**: https://example.com
**Source**: `color-contrast`, 3 elements — _measured_
**Recommendation**: see the rule documentation for this violation

### 3. `<html>` element does not have a `[lang]` attribute

🟠 **Severity**: High
**Category**: Accessibility
**Page**: https://example.com
**Source**: `html-has-lang`, 1 element — _measured_
**Recommendation**: see the rule documentation for this violation

### 4. Document does not have a main landmark.

🟡 **Severity**: Medium
**Category**: Accessibility
**Page**: https://example.com
**Source**: `landmark-one-main`, 1 element — _measured_
**Recommendation**: see the rule documentation for this violation

### 5. The primary action is below the fold

🟡 **Severity**: Medium
**Category**: Navigation
**Page**: https://example.com
**Source**: _AI judgement_
**Personas Affected**: A developer evaluating the product
**Recommendation**: Raise the call to action

---

Generated on <normalised>