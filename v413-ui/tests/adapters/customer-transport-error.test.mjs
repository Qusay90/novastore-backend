import assert from "node:assert/strict";
import test from "node:test";

import { mapCustomerFacingTransportError } from "../../src/adapters/contracts.ts";

test("HTTP failures map to fixed customer-safe categories", () => {
  assert.equal(mapCustomerFacingTransportError({ status: 401 }).code, "session-expired");
  assert.equal(mapCustomerFacingTransportError({ response: { status: 403 } }).code, "forbidden");
  assert.equal(mapCustomerFacingTransportError({ status: "404" }).code, "not-found");
  assert.equal(mapCustomerFacingTransportError({ status: 429 }).code, "rate-limited");
  assert.equal(mapCustomerFacingTransportError({ response: { status: 503 } }).code, "service-unavailable");
});

test("transport signals map without reflecting raw failure details", () => {
  const secret = "Bearer owner-secret-token";
  const failure = {
    code: "ECONNREFUSED",
    message: `connect ECONNREFUSED 10.0.2.2:5000 ${secret}`,
    stack: `https://private.example.invalid/orders?token=${secret}`,
    response: { body: { pan: "4111111111111111", cvv: "123" } },
  };

  const mapped = mapCustomerFacingTransportError(failure);
  const serialized = JSON.stringify(mapped);

  assert.equal(mapped.code, "offline");
  assert.equal(mapped.retryable, true);
  for (const sensitiveValue of [secret, "10.0.2.2", "5000", "4111111111111111", "123", "private.example.invalid"]) {
    assert.equal(serialized.includes(sensitiveValue), false);
  }
});

test("timeouts and unknown failures remain fixed and bounded", () => {
  assert.deepEqual(mapCustomerFacingTransportError({ name: "AbortError", message: "raw abort detail" }), {
    code: "timeout",
    message: "İstek zaman aşımına uğradı. Lütfen tekrar dene.",
    retryable: true,
    requiresAuthentication: false,
  });

  const unknown = mapCustomerFacingTransportError(new Error("database host password=secret"));
  assert.equal(unknown.code, "unknown");
  assert.equal(unknown.message.includes("database"), false);
  assert.equal(unknown.message.includes("secret"), false);
});

test("hostile property getters cannot escape into the customer error", () => {
  const failure = Object.create(null, {
    status: { get: () => { throw new Error("token leak"); } },
    code: { get: () => { throw new Error("host leak"); } },
  });

  assert.equal(mapCustomerFacingTransportError(failure).code, "unknown");
});
