export const allTools = [
    {
        type: "function",
        name: "delegate",
        description: "Delegate a task to another specialized agent.",
        parameters: {
            type: "object",
            properties: {
                agent: { type: "string", enum: ["pointer"], description: "The name of the agent to delegate to" },
                task: { type: "string", description: "The specific task description for the agent" }
            },
            required: ["agent", "task"],
            additionalProperties: false
        },
        strict: true
    }
];

export const createNativeHandlers = (agentName) => ({
    // Add custom tool handlers here if needed
});
