import { type Static, Type } from "typebox";
import { ShellUserSchema } from "./shell.ts";

/** The four specialist investigators, in the architecture's table order. */
export const SPECIALISTS = ["logs", "db", "deploy", "acquirer"] as const;

export const SpecialistSchema = Type.Union([
  Type.Literal("logs"),
  Type.Literal("db"),
  Type.Literal("deploy"),
  Type.Literal("acquirer"),
]);

/** `H1`, `H2`, and so on; the numeral starts at 1. */
export const HypothesisIdSchema = Type.String({ pattern: "^H[1-9][0-9]*$" });

/** `EV-01`, `EV-02`, ... `EV-123`; at least two digits. */
export const EvidenceIdSchema = Type.String({ pattern: "^EV-[0-9]{2,}$" });

/** An ISO 8601 date-time string, because JSON has no date type. */
const IsoDateTimeSchema = Type.String({ format: "date-time" });

export const HypothesisSchema = Type.Object(
  {
    id: HypothesisIdSchema,
    title: Type.String(),
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("ruled_out"),
      Type.Literal("confirmed"),
    ]),
    supportingEvidenceIds: Type.Array(EvidenceIdSchema),
    contradictingEvidenceIds: Type.Array(EvidenceIdSchema),
    missingEvidence: Type.Array(
      Type.Object(
        { id: Type.String(), need: Type.String(), askOf: Type.Optional(Type.String()) },
        { additionalProperties: false },
      ),
    ),
    createdAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

export const EvidenceSchema = Type.Object(
  {
    id: EvidenceIdSchema,
    hypothesisId: HypothesisIdSchema,
    observation: Type.String(),
    quote: Type.String(),
    source: Type.Union([
      Type.Object(
        { kind: Type.Literal("receipt"), receiptIds: Type.Array(Type.String()) },
        { additionalProperties: false },
      ),
      Type.Object(
        {
          kind: Type.Literal("human"),
          userId: ShellUserSchema.properties.id,
          role: ShellUserSchema.properties.role,
        },
        { additionalProperties: false },
      ),
    ]),
    createdAt: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

/** What the Coordinator asks one specialist to look into, over one time range. */
export const InvestigationRequestSchema = Type.Object(
  {
    hypothesisId: HypothesisIdSchema,
    specialist: SpecialistSchema,
    question: Type.String({ minLength: 1, maxLength: 2000 }),
    since: IsoDateTimeSchema,
    until: IsoDateTimeSchema,
  },
  { additionalProperties: false },
);

/** What a specialist reports back: a verdict on the hypothesis and the evidence it recorded. */
export const InvestigationFindingSchema = Type.Object(
  {
    hypothesisId: HypothesisIdSchema,
    specialist: SpecialistSchema,
    verdict: Type.Union([
      Type.Literal("supports"),
      Type.Literal("contradicts"),
      Type.Literal("inconclusive"),
    ]),
    summary: Type.String({ minLength: 1, maxLength: 2000 }),
    evidenceIds: Type.Array(EvidenceIdSchema),
  },
  { additionalProperties: false },
);

export type Specialist = Static<typeof SpecialistSchema>;
export type Hypothesis = Static<typeof HypothesisSchema>;
export type Evidence = Static<typeof EvidenceSchema>;
export type InvestigationRequest = Static<typeof InvestigationRequestSchema>;
export type InvestigationFinding = Static<typeof InvestigationFindingSchema>;
