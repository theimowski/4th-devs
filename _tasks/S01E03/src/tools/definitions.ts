export const tools = [
  {
    type: "function",
    name: "check_package",
    description: "Check the status and contents of a specific package using its ID.",
    parameters: {
      type: "object",
      properties: {
        packageID: {
          type: "string",
          description: "The unique ID of the package (e.g., PKG12345678)"
        }
      },
      required: ["packageID"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "redirect_package",
    description: "Redirect a package to a new destination. Requires a security code.",
    parameters: {
      type: "object",
      properties: {
        packageID: {
          type: "string",
          description: "The unique ID of the package to redirect"
        },
        destination: {
          type: "string",
          description: "The destination code (e.g., PWR3847PL)"
        },
        code: {
          type: "string",
          description: "The security code required for redirection"
        }
      },
      required: ["packageID", "destination", "code"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "get_weather",
    description: "Get the current weather for a specific city.",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The name of the city (e.g., Warsaw)"
        }
      },
      required: ["city"],
      additionalProperties: false
    },
    strict: true
  }
];
