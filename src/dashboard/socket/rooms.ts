import type { Socket } from 'socket.io';

interface SearchSubscription {
  q?: string;
  filters?: unknown;
}

const searchSubscriptions = new Map<Socket, SearchSubscription>();

export function setSearchSubscription(socket: Socket, sub: SearchSubscription): void {
  searchSubscriptions.set(socket, sub);
}

export function removeSearchSubscription(socket: Socket): void {
  searchSubscriptions.delete(socket);
}

export function getSearchSubscription(socket: Socket): SearchSubscription | undefined {
  return searchSubscriptions.get(socket);
}

export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export function guildRoom(guildId: string): string {
  return `guild:${guildId}`;
}

export function globalRoom(): string {
  return 'global';
}

export function joinRoom(socket: Socket, room: string): void {
  socket.join(room);
}

export function leaveRoom(socket: Socket, room: string): void {
  socket.leave(room);
}

// ponytail: socket.io already tracks joined rooms in socket.rooms; the socket's
// own id is in that set, so skip it when leaving on disconnect.
export function clearSocketRooms(socket: Socket): void {
  for (const room of socket.rooms) {
    if (room === socket.id) continue;
    socket.leave(room);
  }
}
