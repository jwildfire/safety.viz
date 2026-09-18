# Refusal catalog

A refusal is a valid, schema-conformant draft: `sentences` is empty and `flags` carries exactly one `refused:<reason>` entry from the list below (a skill may add its own descriptive flags after it). The runtime also emits these itself when the validator rejects the model's output twice, or when the tools return nothing to describe. The renderer shows a refusal as a card that says why, never as an empty space.

| Flag                        | When to emit it                                                                                                                          | What the card says                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `refused:insufficient-data` | The tools returned no rows for the scope: no events in the window, no lab points for the test, no exposure records, no disposition rows. | "Not enough recorded data to draft a narrative."               |
| `refused:anchor-not-found`  | The anchor `row_id` does not resolve to an event of this participant.                                                                    | "The anchored event could not be found in the record."         |
| `refused:ambiguous-scope`   | The request names a test, term or record that matches several rows and no rule picks one.                                                | "The request matched more than one record; narrow it."         |
| `refused:disallowed-claim`  | The request, or the only sentence the rows support, would require a diagnosis, a causal statement, a treatment judgement or a prognosis. | "A narrative here would need a claim this tool does not make." |
| `refused:validation`        | Emitted by the runtime: the model's output failed the validator twice (schema, citations, forbidden phrases, length).                    | "The draft did not pass validation and was withheld."          |
| `refused:provider-error`    | Emitted by the runtime: the adapter threw or returned no usable content.                                                                 | "The narrative service did not answer."                        |
| `refused:reidentification`  | The request asks for anything about the person beyond the identifier the record uses.                                                    | "This tool does not describe the person, only the record."     |

Rules:

- A refusal names one reason. Choose the most specific.
- A refusal never carries prose in `sentences`. If a partial narrative is possible (some facts are supported), draft those sentences and add a descriptive flag such as `partial:labs-missing` instead of refusing.
- The `provenance` of a refusal is complete: model, skill, input hash, timestamp, tool calls. A refusal is reproducible like any other draft.

Runtime-only additions (never chosen by the model):

| Flag                       | When                                                         | What the card says                             |
| -------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| `refused:provider-refusal` | The provider declined the request (a `refusal` stop reason). | "The narrative service declined this request." |
| `refused:cancelled`        | The host cancelled the generation (an AbortSignal).          | Nothing: the card is removed.                  |
