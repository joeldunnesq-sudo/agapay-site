import assert from "node:assert/strict";
import { Readable } from "node:stream";
import parishesHandler from "../api/parishes.js";
import checkoutHandler from "../api/create-checkout-session.js";

function createReq(method, url, body) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000" };
  return req;
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(chunk = "") {
      this.body += chunk;
    }
  };
}

let res = createRes();
await parishesHandler(createReq("GET", "/api/parishes"), res);
assert.equal(res.statusCode, 200);
assert.ok(JSON.parse(res.body).parishes.some((parish) => parish.id === "st-seraphim-mission"));

res = createRes();
await checkoutHandler(
  createReq("POST", "/api/create-checkout-session", {
    parishId: "st-seraphim-mission",
    giftType: "stewardship",
    amount: 50,
    firstName: "Test",
    email: "test@example.com"
  }),
  res
);
assert.equal(res.statusCode, 200);
assert.equal(JSON.parse(res.body).mode, "demo");

console.log("AgaPay API smoke tests passed.");
