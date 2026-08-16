/**
 * MSW handlers for the language model provider endpoint.
 *
 * These intercept the request the provider client would send, so the analysis
 * can be driven end to end -- through the real client and the real
 * serialisation -- while the body it produces is captured and measured. That
 * is the point: what gets counted is what would have gone over the wire, not
 * an approximation taken further up the stack.
 *
 * The endpoint is the **Responses API**, not Chat Completions. `@ai-sdk/openai`
 * posts to `/v1/responses` with an `input[]` array; a handler pointed at
 * `/v1/chat/completions` intercepts nothing and every assertion downstream
 * passes vacuously. Two response shapes are equally unforgiving and fail with
 * an error that names JSON parsing rather than protocol shape:
 * `usage.input_tokens`/`output_tokens` must be present, and a text content
 * part must carry `annotations: []`.
 */
import {http, HttpResponse} from 'msw';

/** Where the provider client sends its requests. */
export const providerEndpoint = 'https://api.openai.com/v1/responses';

/**
 * A scripted reply: either a tool call or a final message.
 */
export type ScriptedReply =
	| {kind: 'tool-call'; toolName: string; input?: string}
	| {kind: 'text'; text: string};

/**
 * Build a Responses-API body.
 *
 * `usage` is mandatory in this shape even though nothing here reads it.
 */
const responseBody = (output: unknown[]) => ({
	id: 'resp_test',
	object: 'response',
	created_at: 0,
	model: 'gpt-5',
	status: 'completed',
	output,
	usage: {input_tokens: 1, output_tokens: 1, total_tokens: 2},
});

/**
 * Render one scripted reply into the provider's response shape.
 */
const renderReply = (reply: ScriptedReply, index: number) => {
	if (reply.kind === 'tool-call') {
		return responseBody([
			{
				type: 'function_call',
				id: `fc_${index}`,
				call_id: `call_${index}`,
				name: reply.toolName,
				arguments: reply.input ?? '{}',
			},
		]);
	}

	return responseBody([
		{
			type: 'message',
			id: `msg_${index}`,
			role: 'assistant',
			status: 'completed',
			// Omitting `annotations` fails validation with an opaque message.
			content: [{type: 'output_text', text: reply.text, annotations: []}],
		},
	]);
};

/**
 * Create a handler that replays a script, one reply per request.
 *
 * Once the script is exhausted the handler keeps returning the last reply, so
 * a loop that runs longer than expected produces a measurable transcript
 * rather than an unhandled-request error that hides what happened.
 *
 * @param script - Replies to return, in order
 * @param onRequest - Called with each intercepted request body
 * @returns An MSW handler
 */
export function scriptedProvider(
	script: ScriptedReply[],
	onRequest?: (body: unknown) => void,
) {
	let call = 0;

	return http.post(providerEndpoint, async ({request}) => {
		// Cloned before reading: a body can only be consumed once, and a
		// superseded handler still matching the same route would otherwise
		// throw "Body is unusable" from underneath the handler that replaced it.
		const body: unknown = await request.clone().json();
		onRequest?.(body);

		const reply = script[Math.min(call, script.length - 1)] ?? {
			kind: 'text' as const,
			text: 'done',
		};
		call++;

		return HttpResponse.json(renderReply(reply, call));
	});
}
