import {
  EvidenceIdSchema,
  EvidenceSchema,
  HypothesisIdSchema,
  HypothesisSchema,
  InvestigationFindingSchema,
  InvestigationRequestSchema,
  SPECIALISTS,
} from "@warroom/contracts";
import type { TSchema } from "typebox";
import Value from "typebox/value";
import { describe, expect, test } from "vitest";

// Why: every example is written out here, so a wrong schema cannot make its own expectations pass.
const hypothesis = {
  id: "H1",
  title: "Acquirer beta is slow",
  status: "active",
  supportingEvidenceIds: ["EV-01"],
  contradictingEvidenceIds: [],
  missingEvidence: [{ id: "M1", need: "Deploy history for the last hour", askOf: "bob" }],
  createdAt: "2026-10-28T12:00:00Z",
};
const receiptEvidence = {
  id: "EV-01",
  hypothesisId: "H1",
  observation: "acquirer-beta p95 latency is 8,012 ms",
  quote: "p95: 8012",
  source: { kind: "receipt", receiptIds: ["call-7"] },
  createdAt: "2026-10-28T12:01:00Z",
};
const humanEvidence = {
  id: "EV-02",
  hypothesisId: "H1",
  observation: "A rollout started at 11:50",
  quote: "I pushed the BIN table at 11:50",
  source: { kind: "human", userId: "bob", role: "Responder" },
  createdAt: "2026-10-28T12:02:00Z",
};
const request = {
  hypothesisId: "H1",
  specialist: "acquirer",
  question: "Is acquirer-beta slower than usual?",
  since: "2026-10-28T11:00:00Z",
  until: "2026-10-28T12:00:00Z",
};
const finding = {
  hypothesisId: "H1",
  specialist: "acquirer",
  verdict: "supports",
  summary: "acquirer-beta p95 is 8,012 ms against a base of 120 ms",
  evidenceIds: ["EV-01"],
};

describe("investigation contract", () => {
  test("specialists in order", () => {
    expect([...SPECIALISTS]).toEqual(["logs", "db", "deploy", "acquirer"]);
  });

  test("accepts valid examples", () => {
    const valid: Array<[string, TSchema, unknown]> = [
      ["hypothesis active", HypothesisSchema, hypothesis],
      ["hypothesis ruled_out", HypothesisSchema, { ...hypothesis, status: "ruled_out" }],
      ["hypothesis confirmed", HypothesisSchema, { ...hypothesis, status: "confirmed" }],
      ["evidence receipt", EvidenceSchema, receiptEvidence],
      ["evidence human", EvidenceSchema, humanEvidence],
      ["request", InvestigationRequestSchema, request],
      ["finding", InvestigationFindingSchema, finding],
      ["hypothesis id H1", HypothesisIdSchema, "H1"],
      ["hypothesis id H12", HypothesisIdSchema, "H12"],
      ["evidence id EV-01", EvidenceIdSchema, "EV-01"],
      ["evidence id EV-123", EvidenceIdSchema, "EV-123"],
    ];
    expect(valid).toHaveLength(11);
    const rejected = valid.filter(([, schema, value]) => !Value.Check(schema, value));
    expect(rejected.map(([name]) => name)).toEqual([]);
  });

  test("rejects invalid values", () => {
    const { until: _until, ...requestWithoutUntil } = request;
    const invalid: Array<[string, TSchema, unknown]> = [
      ["hypothesis id H0", HypothesisIdSchema, "H0"],
      ["hypothesis id X1", HypothesisIdSchema, "X1"],
      ["evidence id EV-1", EvidenceIdSchema, "EV-1"],
      [
        "request specialist network",
        InvestigationRequestSchema,
        { ...request, specialist: "network" },
      ],
      ["request without until", InvestigationRequestSchema, requestWithoutUntil],
      ["request empty question", InvestigationRequestSchema, { ...request, question: "" }],
      ["finding verdict maybe", InvestigationFindingSchema, { ...finding, verdict: "maybe" }],
      [
        "finding evidence id EV-1",
        InvestigationFindingSchema,
        { ...finding, evidenceIds: ["EV-1"] },
      ],
      ["hypothesis status open", HypothesisSchema, { ...hypothesis, status: "open" }],
      ["request extra property foo", InvestigationRequestSchema, { ...request, foo: 1 }],
    ];
    expect(invalid).toHaveLength(10);
    // Why: each row differs from a valid literal by one fault, and these bases must pass or a row could fail for another reason.
    expect(Value.Check(InvestigationRequestSchema, request)).toBe(true);
    expect(Value.Check(InvestigationFindingSchema, finding)).toBe(true);
    expect(Value.Check(HypothesisSchema, hypothesis)).toBe(true);
    const accepted = invalid.filter(([, schema, value]) => Value.Check(schema, value));
    expect(accepted.map(([name]) => name)).toEqual([]);

    const invalidBoundaries: Array<[string, TSchema, unknown]> = [
      ["request non-ISO since", InvestigationRequestSchema, { ...request, since: "yesterday" }],
      ["request non-ISO until", InvestigationRequestSchema, { ...request, until: "tomorrow" }],
      ["hypothesis non-ISO createdAt", HypothesisSchema, { ...hypothesis, createdAt: "today" }],
      ["evidence non-ISO createdAt", EvidenceSchema, { ...receiptEvidence, createdAt: "today" }],
      [
        "receipt source extra property",
        EvidenceSchema,
        {
          ...receiptEvidence,
          source: { ...receiptEvidence.source, foo: 1 },
        },
      ],
      [
        "human source extra property",
        EvidenceSchema,
        {
          ...humanEvidence,
          source: { ...humanEvidence.source, foo: 1 },
        },
      ],
      [
        "receipt source human attribution",
        EvidenceSchema,
        {
          ...receiptEvidence,
          source: { ...receiptEvidence.source, userId: "bob", role: "Responder" },
        },
      ],
      [
        "human source receipt attribution",
        EvidenceSchema,
        {
          ...humanEvidence,
          source: { ...humanEvidence.source, receiptIds: ["call-7"] },
        },
      ],
      ["hypothesis extra property", HypothesisSchema, { ...hypothesis, foo: 1 }],
      ["evidence extra property", EvidenceSchema, { ...receiptEvidence, foo: 1 }],
      ["finding extra property", InvestigationFindingSchema, { ...finding, foo: 1 }],
      [
        "missing evidence extra property",
        HypothesisSchema,
        {
          ...hypothesis,
          missingEvidence: [{ id: "M1", need: "Deploy history", foo: 1 }],
        },
      ],
    ];
    expect(invalidBoundaries).toHaveLength(12);
    expect(Value.Check(EvidenceSchema, receiptEvidence)).toBe(true);
    expect(Value.Check(EvidenceSchema, humanEvidence)).toBe(true);
    for (const [name, schema, value] of invalidBoundaries) {
      expect(Value.Check(schema, value), name).toBe(false);
    }
  });
});
