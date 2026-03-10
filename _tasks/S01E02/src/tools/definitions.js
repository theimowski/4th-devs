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
  },
  {
    type: "function",
    name: "get_power_plants_locations",
    description: "Enriches a list of power plants with their geographical coordinates (lat, lon)",
    parameters: {
      type: "object",
      properties: {
        power_plants: {
          type: "array",
          description: "List of power plants to get coordinates for",
          items: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name of the power plant" },
              code: { type: "string", description: "Code for the power plant" }
            },
            required: ["city", "code"],
            additionalProperties: false
          }
        }
      },
      required: ["power_plants"],
      additionalProperties: false
    },
    strict: true
  }
];
