import assert from "node:assert/strict";
import test from "node:test";
import {
  businessIdentityAdapterTestUtils,
  createBusinessIdentityAdapter,
} from "../src/adapters/businessIdentityAdapter.js";
import { normalizeStorefrontApiPath } from "../src/integration/storefrontHttp.js";

const configuredIdentity = Object.freeze({
  legalCompanyName: "NovaStore Test İşletmesi AŞ",
  tradeName: "NovaStore Test",
  taxNumber: "1234567890",
  taxOffice: "Kadıköy Test Vergi Dairesi",
  mersisNumber: "1234567890123456",
  registeredAddress: "Yalnız yerel sözleşme testi adresi, İstanbul",
  kepAddress: "novastore-test@example.test",
  phone: "+905551112233",
  email: "support@example.test",
  customerDomain: "https://www.example.test/",
});

test("business identity endpoint is an allowed same-origin public read", () => {
  assert.equal(normalizeStorefrontApiPath("/api/business-identity", "https://www.example.test"), "/api/business-identity");
});

test("partial owner identity fails closed instead of rendering partial legal values", () => {
  assert.deepEqual(
    businessIdentityAdapterTestUtils.normalizeIdentity({
      status: "pending_owner_company_formation",
      identity: { legalCompanyName: "Temporary Name" },
    }),
    { status: "pending_owner_company_formation", identity: null },
  );
});

test("trade name is required while tax office stays optional", () => {
  const { tradeName: _tradeName, ...withoutTradeName } = configuredIdentity;
  assert.deepEqual(
    businessIdentityAdapterTestUtils.normalizeIdentity({
      status: "configured",
      identity: withoutTradeName,
    }),
    { status: "pending_owner_company_formation", identity: null },
  );

  const { taxOffice: _taxOffice, ...withoutTaxOffice } = configuredIdentity;
  assert.deepEqual(
    businessIdentityAdapterTestUtils.normalizeIdentity({
      status: "configured",
      identity: withoutTaxOffice,
    }),
    { status: "configured", identity: withoutTaxOffice },
  );
  assert.deepEqual(
    businessIdentityAdapterTestUtils.PUBLIC_IDENTITY_FIELDS,
    [
      "legalCompanyName",
      "tradeName",
      "taxNumber",
      "mersisNumber",
      "registeredAddress",
      "kepAddress",
      "phone",
      "email",
      "customerDomain",
    ],
  );
  assert.deepEqual(businessIdentityAdapterTestUtils.OPTIONAL_PUBLIC_IDENTITY_FIELDS, ["taxOffice"]);
});

test("configured projection retains the exact public identity fields", async () => {
  const adapter = createBusinessIdentityAdapter({
    request: async (path) => {
      assert.equal(path, "/api/business-identity");
      return { status: "configured", identity: configuredIdentity };
    },
  });
  assert.deepEqual(await adapter.load(), { status: "configured", identity: configuredIdentity });
});
