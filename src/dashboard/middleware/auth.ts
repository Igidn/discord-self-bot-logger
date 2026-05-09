import type { Request, Response, NextFunction } from 'express';
import type { Socket } from 'socket.io';
import { config } from '@/config/loader.js';

export function restAuth(req: Request, res: Response, next: NextFunction): void {
  const cfg = config;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (token !== cfg.dashboard.authToken) {
    res.status(401).json({ error: 'Unauthorized: invalid token' });
    return;
  }

  next();
}

export function socketAuth(socket: Socket, next: (err?: Error) => void): void {
  const cfg = config;
  const token =
    typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : undefined;

  if (!token || token !== cfg.dashboard.authToken) {
    next(new Error('Unauthorized: invalid or missing token'));
    return;
  }

  next();
}
