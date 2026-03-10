export const tools = [
  {
    type: "function",
    name: "get_people_locations",
    description: "Enriches a list of people with their recent geographical coordinates (lat, lon)",
    parameters: {
      type: "object",
      properties: {
        people: {
          type: "array",
          description: "List of people to get locations for",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "First name of the person" },
              surname: { type: "string", description: "Last name of the person" }
            },
            required: ["name", "surname"],
            additionalProperties: false
          }
        }
      },
      required: ["people"],
      additionalProperties: false
    },
    strict: true
  }
];
