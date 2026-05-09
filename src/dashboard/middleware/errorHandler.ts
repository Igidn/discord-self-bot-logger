import type { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(err, 'Unhandled error');

  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = (err as { statusCode?: number }).statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    ...(!isProduction && { stack: err.stack }),
  });
}
