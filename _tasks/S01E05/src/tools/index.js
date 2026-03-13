import { verify } from "../../utils/utils.js";
import { log } from "../log.js";

export const nativeTools = [
  {
    type: "function",
    name: "call_railway_api",
    description: "Call the railway API with a specific action.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The URL-encoded path with query, e.g. 'reconfigure?route=x-01'"
        }
      },
      required: ["action"],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: "function",
    name: "sleep",
    description: "Sleep for a specified number of seconds.",
    parameters: {
      type: "object",
      properties: {
        seconds: {
          type: "number",
          description: "Number of seconds to sleep."
        }
      },
      required: ["seconds"],
      additionalProperties: false
    },
    strict: true
  }
];

export const nativeHandlers = {
  async call_railway_api({ action }) {
    log(`Calling railway API: answer={"action": "${action}"}`, 'api-req');
    const response = await verify("railway", { action });
    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());
    const bodyText = await response.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      body = bodyText;
    }
    log(`status=${status}, headers=${JSON.stringify(headers)}, body=${JSON.stringify(body)}`, 'api-res-detailed', true);
    log({ status, body }, 'api-res');
    return { status, headers, body };
  },
  async sleep({ seconds }) {
    log(`Sleeping for ${seconds} seconds`, 'tool-use');
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
};
