import { io, Socket } from 'socket.io-client';

export const socket: Socket = io('/', {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  randomizationFactor: 0.5,
  transports: ['websocket', 'polling'],
});

export default socket;
