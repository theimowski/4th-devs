import { verify } from "../../utils/utils.js";
import { log } from "../log.js";

let ignoredHeaders = {};

export function setIgnoredHeaders(headers) {
  ignoredHeaders = headers;
}

export const nativeTools = [
  {
    type: "function",
    name: "call_railway_api",
    description: "Call the railway API with a specific action and parameters.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The action name (e.g., 'reconfigure', 'getstatus', 'setstatus', 'save')"
        },
        route: {
          type: "string",
          description: "The route identifier (e.g., 'X-01')"
        },
        value: {
          type: "string",
          description: "The status value for 'setstatus' (e.g., 'RTOPEN', 'RTCLOSE')"
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
  async call_railway_api({ action, route, value }) {
    const answer = { action };
    if (route) answer.route = route;
    if (value) answer.value = value;

    log(`Calling railway API: answer=${JSON.stringify(answer)}`, 'api-req');
    const response = await verify("railway", answer);
    const status = response.status;
    
    // Filter headers
    const allHeaders = Object.fromEntries(response.headers.entries());
    const filteredHeaders = Object.fromEntries(
      Object.entries(allHeaders).filter(([key]) => !ignoredHeaders[key.toLowerCase()])
    );

    const bodyText = await response.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      body = bodyText;
    }
    
    log(`status=${status}, headers=${JSON.stringify(allHeaders)}, body=${JSON.stringify(body)}`, 'api-res-detailed', true);
    log({ status, body }, 'api-res');
    
    return { status, headers: filteredHeaders, body };
  },
  async sleep({ seconds }) {
    log(`Sleeping for ${seconds} seconds`, 'tool-use');
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
};
