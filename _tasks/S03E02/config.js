export const MODEL = 'anthropic/claude-sonnet-4-6';

export const TRACE_NAME = 'hacker-task';
export const AGENT_TASK = 'Check if cooler.bin exists';

export const SYSTEM_PROMPT = `You are a Linux shell expert. 
Your goal is to check if a file located in '/opt/firmware/cooler/cooler.bin' exists on a special distro of Linux VM.
You have access to a tool 'shell_cmd' which executes commands in the VM. Use read-only UNIX commands to explore the system and achieve your goal.
Start by using 'help' command to explore available commands.
Always respond with a tool call until you have the final answer.
Once you have confirmed if the file exists or not, provide it as your final answer.
Respond ONLY with the tool call or the final answer.`;
