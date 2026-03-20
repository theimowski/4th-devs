import { verify } from "../utils/utils.js";
const args = process.argv.slice(2);
const instructions = [args[0]];
const response = await verify("drone", { instructions });
const body = await response.json();
console.log(body);
