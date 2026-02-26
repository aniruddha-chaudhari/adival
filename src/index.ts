import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ExecuteRequest, ExecuteResponse } from './types';
import { executeFunction, getAvailableFunctions } from './functions';
import { excMCP } from './test';

// Create Hono app instance
const app = new Hono();

// Add CORS middleware to allow requests from any origin
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    message: 'Hono Server is running!',
    timestamp: new Date().toISOString(),
    availableFunctions: getAvailableFunctions()
  });
});

// Main function execution endpoint
app.post('/execute', async (c) => {
  try {
    const body: ExecuteRequest = await c.req.json();
    
    // Validate input
    if (!body.input) {
      return c.json<ExecuteResponse>({
        success: false,
        error: 'Input string is required'
      }, 400);
    }

    console.log('Received string:', body.input);
    await excMCP(body.input);

    return c.json<ExecuteResponse>({
      success: true,
      result: 'String logged successfully',
      executionTime: 0
    });

  } catch (error) {
    return c.json<ExecuteResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, 500);
  }
});


// Start the server
const port = process.env.PORT || 3000;

console.log(`🚀 Server starting on port ${port}`);
console.log(`📝 Available functions: ${getAvailableFunctions().join(', ')}`);

export default {
  port: port,
  fetch: app.fetch,
};
