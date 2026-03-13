In `_tasks/S01E05/main.js` write a program that will use AI agent to interact with "railway" API

The program should have the following flow:

1. read 'help.json' file - this is the documentation for the "railway" API
2. use a simple agent loop with a system prompt and given set of tools to solve the main challenge
3. print the final response of the agent to console

The main challenge:

* activate the `X-01` railway route using the API
* make sure that the reconfigure mode is enabled for a route before changing it status
* make sure to check that the `X-01` railway route is activated at the end
* conform to the help documentation of the API

The "railway" API:

* is provided by 'verify' endpoint - function from '_tasks/utils/utils.js' file can call this endpoint
* `task` is "railway"
* `answer` is ```{"action":"help"}``` where `action` is the URL-encoded path with query, e.g. `reconfigure?route=x-01`
* IMPORTANT! the API is overloaded on purpose - it regularly returns 503, which is not a real failure but a simulation
* the API has very restrictive request limits
* when the API returns in body following fragment ```{FLG:...}```, make note of it and include in final response
* read errors in response carefully - it should clearly tell what went wrong

The agent should:

* use `gpt-5.2` model
* include the "help" documentation in system prompt
* not call "help" action - 'help.json' already contains the whole documentation
* use only the actions documented in help.json
* respect 503 errors - when they happen wait a little bit and try again, the 503 responses are not a real error, but a simulation
* watch out for request limits - check for HTTP headers in the response, they should include info about time to reset the limit
* use exponential backoff as a strategy to increase the wait time, if you don't know how long to wait

Add following native tools for the agent:

* `call_railway_api` - call the railway API as described above, make sure to include status code, HTTP headers and response body in the output
* `sleep` - sleep for a specified number of seconds, use it when we need to wait before calling the API again

Logging:

* the program should write to both: console and 'log.txt' file
* logs in console should be compact, logs in file should be very detailed
* log all requests to the API
* log all responses from the API
* logs for API responses should include status, headers and body
* log tool usage
* log token usage (input, output, cache)