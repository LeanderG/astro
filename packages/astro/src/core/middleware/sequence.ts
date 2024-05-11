import type { APIContext, MiddlewareHandler, RewritePayload } from '../../@types/astro.js';
import { AstroCookies } from '../cookies/cookies.js';
import { defineMiddleware } from './index.js';

// From SvelteKit: https://github.com/sveltejs/kit/blob/master/packages/kit/src/exports/hooks/sequence.js
/**
 *
 * It accepts one or more middleware handlers and makes sure that they are run in sequence.
 */
export function sequence(...handlers: MiddlewareHandler[]): MiddlewareHandler {
	const filtered = handlers.filter((h) => !!h);
	const length = filtered.length;
	if (!length) {
		return defineMiddleware((_context, next) => {
			return next();
		});
	}

	return defineMiddleware((context, next) => {
		/**
		 * This variable is used to carry the rerouting payload across middleware functions.
		 */
		let carriedPayload: RewritePayload | undefined = undefined;
		return applyHandle(0, context);

		function applyHandle(i: number, handleContext: APIContext) {
			const handle = filtered[i];
			// @ts-expect-error
			// SAFETY: Usually `next` always returns something in user land, but in `sequence` we are actually
			// doing a loop over all the `next` functions, and eventually we call the last `next` that returns the `Response`.
			const result = handle(handleContext, async (payload: RewritePayload) => {
				if (i < length - 1) {
					if (payload) {
						let newRequest;
						if (payload instanceof Request) {
							newRequest = payload;
						} else if (payload instanceof URL) {
							newRequest = new Request(payload, handleContext.request);
						} else {
							newRequest = new Request(
								new URL(payload, handleContext.url.origin),
								handleContext.request
							);
						}
						carriedPayload = payload;
						handleContext.request = newRequest;
						handleContext.url = new URL(newRequest.url);
						handleContext.cookies = new AstroCookies(newRequest);
					}
					return applyHandle(i + 1, handleContext);
				} else {
					return next(payload ?? carriedPayload);
				}
			});
			return result;
		}
	});
}
