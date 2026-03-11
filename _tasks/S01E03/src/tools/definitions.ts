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
  }
];
