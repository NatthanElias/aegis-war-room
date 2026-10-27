# Jev, System One decision models, and dual-process agent architectures

- **Date:** 2026-10-25
- **Scope:** Primary-source investigation into TypeSafe AI's `Jev`, peer "System One" / decision classifier models integrated into `@earendil-works/pi-ai` and `@earendil-works/pi-durable`, academic and production System 1 vs. System 2 agent architectures, and failure boundaries for incident-response war rooms.
- **Package versions verified locally:** `@earendil-works/pi-durable@1.4.0`, `@earendil-works/pi-ai` (October 2026 release), `@earendil-works/chord@1.4.0`.
- **Revalidation triggers:** Revalidate pricing, context limits, and provider model IDs whenever upgrading `@earendil-works/pi-ai` or changing inference gateways, as System One model catalogs (`jev-1.13`, `jev-1.14`, `clef`, `gpt-6-luna`) evolve rapidly.

---

## 1. What Jev is (and disambiguation from phonetic neighbors)

### Confirmed identity: TypeSafe AI's `Jev`

`Jev` (`jev-latest`, `jev-1.13.0`, `jev-1.14.0`) is a commercial, non-generative **System One decision foundation model** created by **TypeSafe AI** ([typesafe.ai](https://typesafe.ai/)). Named after economist William Stanley Jevons (Jevons paradox: cutting the latency and cost of a software decision by two orders of magnitude expands how often software can invoke machine judgment), `Jev` emerged from stealth in September 2026.

Unlike autoregressive chat LLMs trained with RLHF to stream text tokens, `Jev` is trained via **Reinforcement Learning for Calibrated Decisions (RLCD)** ([typesafe.ai](https://typesafe.ai/)). Given a structured JSON `state` (up to 64,000 tokens on TypeSafe's native API) and a dictionary of typed `questions`, `Jev` executes a single parallel pass (`POST https://api.typesafe.ai/v1/systemone`) and returns typed decisions with probabilities and confidence estimates, generating **zero output text tokens**.

It exposes three query primitives (verified in `@earendil-works/pi-ai` `system-one-shared.js` and [arXiv:2609.37647](https://arxiv.org/abs/2609.37647)):
1. **`choice`:** Picks one label from fixed categorical criteria (`{ <label>: <meaning> }`), returning `{ type: "choice", choice, probabilities, confidence }`.
2. **`score`:** Rates the input along an ordered rubric array (`[<lowest>, ..., <highest>]`), returning `{ type: "score", score, confidence }`.
3. **`bool` (wire type `noul`):** Evaluates whether a binary predicate holds against the state (`{ true: <meaning>, false: <meaning> }`), returning `{ type: "bool", probability }`.

### Disambiguation from similarly named concepts

| Name | Category | Relationship to `Jev` |
| :--- | :--- | :--- |
| **`Jev` (`typesafe/jev`)** | Non-generative System One decision model | **Exact match.** Built by TypeSafe AI; integrated natively in `@earendil-works/pi-ai` and `@earendil-works/pi-durable`. |
| **Jevons paradox** | Economic principle (1865) | **Conceptual namesake.** Cheap, sub-second decisions enable software to run dense micro-checks across logs, tools, and memory. |
| **JEPA / V-JEPA / LeJEPA** | Joint-Embedding Predictive Architecture (Meta FAIR / Yann LeCun) | **Conceptual cousin, distinct model class.** Also non-generative in representation space, but designed for self-supervised world modeling rather than discrete typed software APIs. |
| **JetMoE / Jet-Nemotron** | Sparse MoE / hybrid linear-attention LLMs | **Phonetic neighbor only.** Fast autoregressive text generators, not System One decision models. |

---

## 2. The 2026 "Jev-like" System One model ecosystem

Inspecting `@earendil-works/pi-ai` (`README.md`, `models.generated.js`, and `providers/data/*.json`) alongside Cloudflare and OpenAI documentation shows that `Jev` sits at the center of a broader **System One / Decisions API** category, distinct from fast autoregressive or diffusion text models.

### Category A: Native non-generative System One / Decision models

All models below consume `{ state, questions }` (plus optional images where supported) and return typed answers via `models.classify()` in `@earendil-works/pi-ai` without generating chat prose:

| Model family | Provider / wire API in `pi-ai` | Context window | Catalog input price (per 1M tokens) | Output price | Verified notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TypeSafe `Jev`** (`jev-latest`, `jev-1.13.0`, `jev-1.14.0`) | `typesafe`, `cloudflare-workers-ai`, `openrouter`, `vercel-ai-gateway`, `opencode` (`typesafe-system-one`) | 32K - 64K | **$0.042** ($42 / 1B tokens) | **$0** | Supports text + experimental `assets` image input on TypeSafe/Workers AI ([typesafe.ai](https://typesafe.ai/)). |
| **Cloudflare `Clef`** (`clef`, `clef-flash`, `clef-omni`) | `cloudflare-workers-ai`, `openrouter` (`cloudflare-workers-ai-system-one`) | Varies by tier | Workers AI neuron/token billing | **$0** | 27B multimodal decision model reading text, JSON, images (up to 4 data URLs), or video ([Cloudflare Clef docs](https://developers.cloudflare.com/workers-ai/models/clef/)). |
| **OpenAI `GPT-6 Luna`** (`gpt-6-luna`) | `openai`, `vercel-ai-gateway` (`openai-decisions`, `POST /v1/decisions`) | Up to 922K (504 timeout risk >600K) | **$0.10** | **$0** | Maps `bool` to `predicate`; requires API key auth (`pi-ai/README.md`). |
| **Perplexity `Decider V1.2`** (`pplx-decider-flash-v1.2` 4B, `pplx-decider-v1.2` 27B) | `vercel-ai-gateway` (`typesafe-system-one`) | 262K | **$0.01** (4B) / **$0.02** (27B) | **$0** | Lowest-cost long-context System One classifiers in the `pi-ai` catalog. |
| **Liquid AI `d1` / `d1-ultra`** | `vercel-ai-gateway` (`typesafe-system-one`) | 65K / 32K | **$0.02** / **$0.042** | **$0** | Liquid neural dynamical architecture targeting sub-50ms structured decisions. |
| **Microsoft `Decision-1`** (`microsoft-decision-1`) | `vercel-ai-gateway` (`typesafe-system-one`) | 32K | **$0.042** | **$0** | System One compatible classifier endpoint. |
| **Baseten `Elephant-1` / `Mammoth-1`**, **ScaleDown `Classify-1`**, **ConvAI `Laya`** | `vercel-ai-gateway` (`typesafe-system-one`) | 4K - 16K | $0.00 - $0.05 | **$0** | Specialized compact System One endpoints. |
| **Local `Julia-1` & `Kev` on `llama.cpp`** | Custom provider (`typesafe-system-one` via `/v1/systemone`) | Model-dependent | Local ($0 API) | **$0** | Served natively since `llama.cpp` 0.6.0 (`output_modalities: ["decisions"]`). Any local chat model can also act as a fallback classifier via `llama-cpp-classify` next-token logprobs (`pi-ai/README.md`). |

### Category B: Fast generative System 1 siblings (when short text output is required)

When an agent step must emit short text (such as a 1-sentence chat status update or code diff) rather than a discrete label/score, production systems pair System One classifiers with ultra-fast non-thinking generative models:
- **Masked Diffusion LLMs (dLLMs):** Inception Labs `Mercury` / `Mercury Coder` (~1,000+ tok/s on H100s) and Google `Gemini Diffusion` (800 - 1,500+ tok/s) generate tokens in parallel denoising passes rather than sequential left-to-right decoding ([inceptionlabs.ai](https://inceptionlabs.ai)).
- **Speculative / Zero-Thinking Small Models:** `Gemini Flash` (`thinking: minimal/off`), `Claude Haiku`, `GPT-5-mini`, or Cursor's speculative-edit models (~1,000 tok/s via draft verification on Fireworks AI, [cursor.com/blog/instant-apply](https://cursor.com/blog/instant-apply)).

---

## 3. Empirical capabilities and verified limitations of `Jev`

Independent peer-reviewed benchmarking by Tobias Deußer, Lorenz Sparrenberg, and Rafet Sifa (*Evaluating and Benchmarking the System One Model Jev*, [arXiv:2609.37647](https://arxiv.org/abs/2609.37647), September 2026; code at `github.com/AppliedMachineLearning-Lab/jev-benchmarking`) tested `jev-1.13.0` zero-shot across **37 datasets and 346,009 requests for under $10 USD** against `Qwen3.8-27B` and `Gemma-4-E4B` scored via exact next-token option probabilities:

### Verified strengths (documented guarantees + benchmark observations)
1. **High zero-shot classification accuracy and speed:** Reached 95% - 99% accuracy on IMDB, SST-2, HellaSwag, and ARC, and 86.7% across 122 languages on Belebele, beating `Qwen3.8-27B` on 27 of 37 datasets and `Gemma-4-E4B` on all 37 ([arXiv:2609.37647](https://arxiv.org/abs/2609.37647)). TypeSafe reports single-decision latencies down to 114 ms ($0.000081 vs. 8.57s and $0.01388 for a chat LLM workflow; [typesafe.ai](https://typesafe.ai/)), with independent p50 end-to-end network latencies around ~330 ms.
2. **Option-order invariance:** Rotating the order of candidate labels left `Jev`'s accuracy unchanged, eliminating the positional bias common in autoregressive zero-shot LLM classifiers ([arXiv:2609.37647](https://arxiv.org/abs/2609.37647)).
3. **Well-calibrated `choice` probabilities:** Multi-class `choice` probabilities support selective prediction (acting automatically when `confidence >= threshold` and escalating to a human or System 2 model when uncertain).

### Verified limitations (critical for war-room design)
1. **Poor default 0.5 threshold placement on `bool` (`noul`) queries:** While binary probabilities **rank** examples accurately (high AUROC), raw `bool` probabilities are poorly calibrated around a naive `0.5` cutoff. On UNFAIR-ToS, tuning the decision threshold raised micro-F1 from **0.50 to 0.75** ([arXiv:2609.37647](https://arxiv.org/abs/2609.37647)).
   - *Design implication:* Prefer mutually exclusive **`choice`** rubrics (with explicit criteria per label) over raw `bool` `0.5` cutoffs unless we calibrate the threshold against labeled examples.
2. **Degradation on noisy, fine-grained quality rubrics:** All tested models degraded on subjective, fine-grained rubric judgments ([arXiv:2609.37647](https://arxiv.org/abs/2609.37647)).
3. **Zero multi-hop generative synthesis:** `Jev` cannot write SQL queries, construct counterfactual causal chains across 4 microservices, or author a `REMEDIATION_SPEC.md`.

---

## 4. Dual-process (System 1 + System 2) agent patterns in production

### 4.1 DeepMind Talker-Reasoner and asymmetric shared memory
In *Agents Thinking Fast and Slow: A Talker-Reasoner Architecture* ([arXiv:2410.08328](https://arxiv.org/abs/2410.08328)), Christakopoulou, Mourad, and Matarić decouple fast surface interaction (**System 1 Talker**) from slow multi-step deliberation and tool execution (**System 2 Reasoner**) through a **shared memory blackboard**:
- System 1 performs fast reads over the current belief snapshot to keep interaction sub-second and responsive, while setting a **conditional wait barrier** before high-stakes actions until System 2 completes verification.
- Supporting routing benchmarks such as **RouteLLM** ([arXiv:2406.18665](https://arxiv.org/abs/2406.18665)) show that routing routine sub-decisions to small/fast models cuts inference cost by **45% on MMLU and >85% on MT-Bench** while preserving 95% of frontier quality. Conversely, unconstrained System 2 thinking on trivial checks can trigger "overthinking" self-doubt drift ([arXiv:2604.10739](https://arxiv.org/abs/2604.10739)).

### 4.2 How Earendil Works (`pi-durable` + `Codemode`) integrates `Jev`
In *What is Codemode* ([lucumr.pocoo.org/2026/10/6/codemode/](https://lucumr.pocoo.org/2026/10/6/codemode/), October 6, 2026), Armin Ronacher explains why `pi` and `pi-durable` do **not** expose `Jev` as a conversational chat tool, and instead expose `models.classify()` inside **Codemode** (the embedded QuickJS sandbox) and internal harness hooks:

> "Similar things apply to classifier models such as Jev. They also do not fit well into the workflows of an agent through the typical tools. But rather than making a bespoke tool available, Codemode just allows the agent to reach into the AI SDK and invoke those directly." ([lucumr.pocoo.org/2026/10/6/codemode/](https://lucumr.pocoo.org/2026/10/6/codemode/))

In `@earendil-works/pi-durable@1.4.0` (`dist/codemode/models.js`), calling `models.classify(jev, { state, questions })` inside a QuickJS script executes as a recorded durable internal tool call (`pi.usage` tracks its exact token cost and latency) while keeping 100+ raw log chunks or issue payloads **out** of the System 2 LLM's context window—returning only the compact ranked/filtered result.

### 4.3 SRE war-room boundaries (Resolve AI, Traversal, Datadog Bits AI, Incident.io)
Across production incident harnesses surveyed in 2025 - 2026:
- **Where System 1 wins:** Alert routing, high-volume log anomaly clustering inside sandboxes, semantic prompt-injection and PII triage (`Datadog AI Guard`), grounding/speculation gating on proposed evidence, and sub-second UI classification.
- **Where System 1 fails catastrophically if over-trusted:** Root-cause declaration (availability bias toward the latest deploy), multi-hop causal vs. symptom disambiguation (confusing a downstream gateway timeout with an upstream DB lock), and single-cause narrative fallacy. Those require System 2 falsification anchored to deterministic telemetry IDs (`sourceToolCallId`, span IDs, commit SHAs).

---

## 5. References

1. TypeSafe AI (2026). *TypeSafe AI — System One Models & Jev*. [https://typesafe.ai/](https://typesafe.ai/)
2. Deußer, T., Sparrenberg, L., & Sifa, R. (2026). *Evaluating and Benchmarking the System One Model Jev*. [https://arxiv.org/abs/2609.37647](https://arxiv.org/abs/2609.37647)
3. Ronacher, A. (2026, October 6). *What is Codemode*. [https://lucumr.pocoo.org/2026/10/6/codemode/](https://lucumr.pocoo.org/2026/10/6/codemode/)
4. Ronacher, A. (2025, November 21). *Agent Design Is Still Hard*. [https://lucumr.pocoo.org/2025/11/21/agents-are-hard/](https://lucumr.pocoo.org/2025/11/21/agents-are-hard/)
5. Zechner, M. (2025, November 30). *What I learned building an opinionated and minimal coding agent*. [https://mariozechner.at/posts/2025-11-30-pi-coding-agent/](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
6. Cloudflare Workers AI Docs (2026). *clef (Cloudflare) — 27B Multimodal Decision Model*. [https://developers.cloudflare.com/workers-ai/models/clef/](https://developers.cloudflare.com/workers-ai/models/clef/)
7. Earendil Works (2026). `@earendil-works/pi-ai` & `@earendil-works/pi-durable@1.4.0` package documentation and `system-one-shared.js` / `codemode` implementation.
8. Christakopoulou, K., Mourad, S., & Matarić, M. (2024). *Agents Thinking Fast and Slow: A Talker-Reasoner Architecture*. [https://arxiv.org/abs/2410.08328](https://arxiv.org/abs/2410.08328)
9. Ong, I., et al. (2024/2025). *RouteLLM: Learning to Route LLMs with Preference Data*. [https://arxiv.org/abs/2406.18665](https://arxiv.org/abs/2406.18665)
10. Su, D., et al. (2024). *Dualformer: Controllable Fast and Slow Thinking by Learning with Randomized Reasoning Traces*. [https://arxiv.org/abs/2410.09918](https://arxiv.org/abs/2410.09918)
11. Saha, S., et al. (2024/2025). *System-1.x: Learning to Balance Fast and Slow Planning with Language Models*. [https://arxiv.org/abs/2407.14414](https://arxiv.org/abs/2407.14414)
