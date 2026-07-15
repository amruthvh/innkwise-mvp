import type { NextApiRequest, NextApiResponse } from "next";
import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth/auth";
import { formatApiError, isApiError } from "@/lib/auth/errors";

export type AuthenticatedApiRequest = NextApiRequest & {
  auth: AuthenticatedUser;
};

type AuthenticatedHandler = (
  req: AuthenticatedApiRequest,
  res: NextApiResponse
) => unknown | Promise<unknown>;

type AuthorizeCallback = (
  req: AuthenticatedApiRequest,
  user: AuthenticatedUser
) => unknown | Promise<unknown>;

export function withApiAuth(
  handler: AuthenticatedHandler,
  options: { authorize?: AuthorizeCallback } = {}
) {
  return async function authenticatedHandler(req: NextApiRequest, res: NextApiResponse) {
    try {
      const user = await getAuthenticatedUser(req);
      const authenticatedReq = req as AuthenticatedApiRequest;
      authenticatedReq.auth = user;

      if (options.authorize) {
        await options.authorize(authenticatedReq, user);
      }

      return await handler(authenticatedReq, res);
    } catch (error) {
      if (isApiError(error)) {
        console.warn("[auth] Protected API request rejected", {
          code: error.code,
          method: req.method,
          path: req.url
        });
      } else {
        console.error("[auth] Protected API request failed", {
          method: req.method,
          path: req.url,
          error
        });
      }

      const response = formatApiError(error);
      return res.status(response.statusCode).json(response.body);
    }
  };
}
