import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', err);

  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      message: 'A record with this value already exists',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      message: 'Record not found',
    });
  }

  if (err.statusCode && err.statusCode < 500) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}
