import type { FunctionRegistry } from './types';

// Example functions that can be executed
export const exampleFunctions: FunctionRegistry = {
  // Convert string to uppercase
  toUpperCase: (input: string) => {
    return input.toUpperCase();
  },

  // Convert string to lowercase
  toLowerCase: (input: string) => {
    return input.toLowerCase();
  },

  // Reverse the string
  reverse: (input: string) => {
    return input.split('').reverse().join('');
  },

  // Count characters in string
  countChars: (input: string) => {
    return {
      length: input.length,
      characters: input.split('').reduce((acc, char) => {
        acc[char] = (acc[char] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  },

  // Add exclamation marks
  addExcitement: (input: string) => {
    return `${input}!!!`;
  },

  // Remove vowels
  removeVowels: (input: string) => {
    return input.replace(/[aeiouAEIOU]/g, '');
  },

  // Count words
  countWords: (input: string) => {
    const words = input.trim().split(/\s+/).filter(word => word.length > 0);
    return {
      wordCount: words.length,
      words: words
    };
  },

  // Default function - just return the input
  default: (input: string) => {
    return {
      message: "Function executed successfully",
      input: input,
      timestamp: new Date().toISOString()
    };
  }
};

// Function to get available function names
export const getAvailableFunctions = (): string[] => {
  return Object.keys(exampleFunctions);
};

// Function to execute a specific function by name
export const executeFunction = (functionName: string, input: string): any => {
  const func = exampleFunctions[functionName];
  if (!func) {
    throw new Error(`Function '${functionName}' not found. Available functions: ${getAvailableFunctions().join(', ')}`);
  }
  return func(input);
};
