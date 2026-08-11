import assert from "node:assert/strict";
import test from "node:test";
import {
  getHousingLogConfig,
  type HousingLogDraftInput,
} from "@workspace/housing-log";
import { signatureDataUrl } from "./signatureTestUtils";
import { validateHousingLogSignatureImages } from "./signatureValidation";

function input(signature: string): HousingLogDraftInput {
  return {
    logDate: "2026-08-11",
    housingUnit: "A/H",
    shift: "1",
    templateVersion: getHousingLogConfig("A/H", "1").templateVersion,
    values: {},
    events: [],
    signatures: { housingSupervisor: signature, housingOfficer: signature },
  };
}

test("server accepts a structurally valid PNG with plausible handwritten ink", () => {
  assert.deepEqual(
    validateHousingLogSignatureImages(input(signatureDataUrl("valid"))),
    [],
  );
});

test("server rejects blank and tiny signature PNGs", () => {
  assert.equal(
    validateHousingLogSignatureImages(input(signatureDataUrl("blank"))).length,
    2,
  );
  assert.equal(
    validateHousingLogSignatureImages(input(signatureDataUrl("tiny"))).length,
    2,
  );
});

test("server rejects fake PNG data URLs", () => {
  assert.equal(
    validateHousingLogSignatureImages(input("data:image/png;base64,dGVzdA=="))
      .length,
    2,
  );
});
