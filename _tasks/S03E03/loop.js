import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, extractTokenUsage } from '../utils/utils.js';
import { 
  startGeneration, 
  advanceTurn, 
} from '../utils/langfuse.js';

export async function runAgent({
  model,
  systemPrompt,
  userMessage,
  maxSteps,
  tools = [],
  handlers = {},
  debugLogFilePath,
  agentName = 'agent',
  agentId = 'agent-1',
  agentTask = 'task',
  withAgentWrapper
}) {
  let conversation = [
    { role: 'user', content: userMessage }
  ];

  const agentLogic = async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`Step ${step + 1}/${maxSteps}`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model, input: conversation });
      
      try {
        const data = await chat({
          model: model,
          input: conversation,
          tools: tools.length > 0 ? tools : undefined,
          instructions: systemPrompt
        });

        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`Assistant: ${text}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: "assistant", content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          const toolResults = [];
          for (const call of toolCalls) {
            const handler = handlers[call.name];
            if (handler) {
              const args = JSON.parse(call.arguments);
              const output = await handler(args);
              toolResults.push({ type: "function_call_output", call_id: call.call_id, output });
            } else {
              toolResults.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: `Unknown tool: ${call.name}` }) });
            }
          }
          
          conversation = [
            ...conversation,
            ...toolCalls.map(c => ({ ...c })),
            ...toolResults
          ];
        } else {
          if (text) return text;
        }
      } catch (error) {
        generation.error(error);
        log(`Error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return "Max steps exceeded";
  };

  if (withAgentWrapper) {
    return withAgentWrapper({ name: agentName, agentId, task: agentTask }, agentLogic);
  }
  
  return agentLogic();
}
