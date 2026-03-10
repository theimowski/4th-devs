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
  },
  {
    type: "function",
    name: "get_people_closest_plant_location",
    description: "Calculates the closest power plant for each person based on their last known location using the Haversine formula.",
    parameters: {
      type: "object",
      properties: {
        people_with_locations: {
          type: "array",
          description: "List of people with their locations array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              surname: { type: "string" },
              locations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    lat: { type: "number" },
                    lon: { type: "number" }
                  },
                  required: ["lat", "lon"]
                }
              }
            },
            required: ["name", "surname", "locations"],
            additionalProperties: true
          }
        },
        power_plants_with_locations: {
          type: "array",
          description: "List of power plants with their coordinates",
          items: {
            type: "object",
            properties: {
              code: { type: "string" },
              lat: { type: "number" },
              lon: { type: "number" }
            },
            required: ["code", "lat", "lon"],
            additionalProperties: true
          }
        }
      },
      required: ["people_with_locations", "power_plants_with_locations"],
      additionalProperties: false
    },
    strict: true
  }
];
