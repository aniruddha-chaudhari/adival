/**
 * Custom Verification Functions
 *
 * Implements specific verification logic for tasks that go beyond simple URL or DOM checks.
 * Register additional custom verifications here using registerCustomVerification().
 */

import { registerCustomVerification } from "./verification";
import type { BrowserState } from "./types";

// ============================================
// WIKIPEDIA TASK VERIFICATIONS
// ============================================

/**
 * Verify that the Python release year (1991) was found/extracted
 */
registerCustomVerification(
  "verifyYearExtracted",
  (state: BrowserState, _history: BrowserState[]) => {
    // Check if "1991" is present in the final state DOM/snapshot
    return state.dom.includes("1991");
  }
);

/**
 * Verify that the Python creator (Guido van Rossum) was found/extracted
 */
registerCustomVerification(
  "verifyCreatorExtracted",
  (state: BrowserState, _history: BrowserState[]) => {
    const content = state.dom.toLowerCase();
    return content.includes("guido van rossum");
  }
);

/**
 * Verify that the Python stable version was found/extracted
 */
registerCustomVerification(
  "verifyVersionExtracted",
  (state: BrowserState, _history: BrowserState[]) => {
    const content = state.dom;
    return (
      content.includes("3.12") ||
      content.includes("3.13") ||
      content.includes("3.14") ||
      content.includes("3.11")
    );
  }
);
