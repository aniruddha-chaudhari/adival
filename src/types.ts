// Type definitions for the function execution endpoint

export interface ExecuteRequest {
  input: string;
  functionName?: string;
}

export interface ExecuteResponse {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface FunctionRegistry {
  [key: string]: (input: string) => any;
}
