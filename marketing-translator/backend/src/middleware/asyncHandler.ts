import type { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps an async route handler so that any rejected promise is forwarded to
 * Express's next(err) error handler rather than causing an unhandled rejection.
 */
export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
