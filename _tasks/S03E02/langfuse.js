import { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  startActiveObservation,
  startObservation,
  updateActiveTrace,
} from '@langfuse/tracing';

const storage = new AsyncLocalStorage();
let sdk = null;
let spanProcessor = null;
let initialized = false;

export const initTracing = (serviceName = 'S03E02') => {
  if (initialized) return;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;

  if (!secretKey || !publicKey) {
    console.log(`Langfuse NOT configured (missing keys). Public: ${!!publicKey}, Secret: ${!!secretKey}`);
    initialized = true;
    return;
  }

  console.log(`Initializing Langfuse for ${serviceName} at ${baseUrl || 'default URL'}`);
  try {
    spanProcessor = new LangfuseSpanProcessor();
    sdk = new NodeSDK({
      serviceName,
      spanProcessors: [spanProcessor],
      autoDetectResources: false,
    });
    sdk.start();
    initialized = true;
  } catch (error) {
    initialized = true;
    console.error('Failed to initialize tracing', error);
  }
};

export const flush = async () => {
  try {
    await spanProcessor?.forceFlush();
  } catch {}
};

export const shutdownTracing = async () => {
  try {
    await sdk?.shutdown();
  } catch {} finally {
    sdk = null;
    spanProcessor = null;
    initialized = false;
  }
};

export const isTracingActive = () => initialized && spanProcessor !== null;

export const withAgentContext = async (agentName, agentId, fn) => {
  const ctx = { agentName, agentId, turnNumber: 0, toolIndex: 0 };
  return storage.run(ctx, fn);
};

export const advanceTurn = () => {
  const ctx = storage.getStore();
  if (!ctx) return 0;
  ctx.turnNumber += 1;
  ctx.toolIndex = 0;
  return ctx.turnNumber;
};

const nextToolIndex = () => {
  const ctx = storage.getStore();
  if (!ctx) return 1;
  ctx.toolIndex += 1;
  return ctx.toolIndex;
};

export const formatGenerationName = (baseName = 'generation') => {
  const ctx = storage.getStore();
  return ctx ? `${ctx.agentName}/${baseName}#${ctx.turnNumber}` : baseName;
};

export const formatToolName = (toolName) => {
  const ctx = storage.getStore();
  return ctx ? `${ctx.agentName}/${toolName}#${nextToolIndex()}` : toolName;
};

export const withTrace = async (params, fn) => {
  if (!isTracingActive()) return fn();
  return startActiveObservation(params.name, async (span) => {
    span.update({
      input: params.input,
      metadata: params.metadata,
    });
    span.updateTrace({
      sessionId: params.sessionId,
      userId: params.userId,
      tags: params.tags,
    });
    try {
      const result = await fn();
      updateActiveTrace({ output: result });
      return result;
    } catch (error) {
      span.update({
        level: 'ERROR',
        statusMessage: error.message,
      });
      throw error;
    }
  });
};

export const withAgent = async (params, fn) => {
  if (!isTracingActive()) return withAgentContext(params.name, params.agentId, fn);
  return startActiveObservation(params.name, async (span) => {
    span.update({
      input: { task: params.task },
      metadata: { agentId: params.agentId, ...params.metadata },
    });
    return withAgentContext(params.name, params.agentId, async () => {
      try {
        const result = await fn();
        span.update({ output: result });
        return result;
      } catch (error) {
        span.update({
          level: 'ERROR',
          statusMessage: error.message,
        });
        throw error;
      }
    });
  }, { asType: 'agent' });
};

export const startGeneration = (params) => {
  if (!isTracingActive()) {
    return {
      recordFirstToken: () => {},
      end: () => {},
      error: () => {},
    };
  }
  const name = formatGenerationName();
  const span = startObservation(name, {
    model: params.model,
    input: params.input,
    metadata: {
      turn: storage.getStore()?.turnNumber ?? 0,
      ...params.metadata,
    },
  }, { asType: 'generation' });
  return {
    recordFirstToken: () => {
      span.update({ completionStartTime: new Date() });
    },
    end: (result) => {
      if (result) {
        span.update({
          output: result.output,
          usageDetails: result.usage,
        });
      }
      span.end();
    },
    error: (err) => {
      span.update({
        level: 'ERROR',
        statusMessage: err.message,
        output: {
          error: err.message,
          code: err.code,
        },
      });
      span.end();
    },
  };
};

export const withTool = async (params, fn) => {
  if (!isTracingActive()) return fn();
  const name = formatToolName(params.name);
  return startActiveObservation(name, async (span) => {
    span.update({
      input: params.input,
      metadata: {
        callId: params.callId,
        turn: storage.getStore()?.turnNumber ?? 0,
        ...params.metadata,
      },
    });
    try {
      const result = await fn();
      span.update({ output: result });
      return result;
    } catch (error) {
      span.update({
        level: 'ERROR',
        statusMessage: error.message,
      });
      throw error;
    }
  }, { asType: 'tool' });
};
