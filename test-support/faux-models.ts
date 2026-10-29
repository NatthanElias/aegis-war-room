import type { Message } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import type { AgentModels } from "../apps/warroom-server/src/models.ts";

export interface FauxModels {
  readonly models: Models;
  /** Every agent runs on the faux model. */
  readonly agentModels: AgentModels;
  /** The message list of each model request, in order. */
  readonly requests: Array<readonly Message[]>;
  /** How many model calls the faux provider served. */
  callCount(): number;
}

/**
 * A model catalog whose only provider is pi-ai's faux provider; it answers every request with `reply`
 * and records the messages it was sent. No test using it can reach OpenRouter.
 */
export function createFauxModels(reply = "Acknowledged."): FauxModels {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const requests: Array<readonly Message[]> = [];
  faux.setResponses(
    Array.from({ length: 500 }, () => (context) => {
      requests.push(context.messages);
      return fauxAssistantMessage(reply);
    }),
  );
  const ref = { provider: faux.getModel().provider, modelId: faux.getModel().id };
  return {
    models,
    agentModels: { coordinator: ref, logs: ref, db: ref, deploy: ref, acquirer: ref },
    requests,
    callCount: () => faux.state.callCount,
  };
}
