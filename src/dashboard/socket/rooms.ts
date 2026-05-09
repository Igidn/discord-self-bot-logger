import type { Socket } from 'socket.io';

const socketRooms = new WeakMap<Socket, Set<string>>();

interface SearchSubscription {
  q?: string;
  filters?: unknown;
}

const searchSubscriptions = new WeakMap<Socket, SearchSubscription>();

export function setSearchSubscription(socket: Socket, sub: SearchSubscription): void {
  searchSubscriptions.set(socket, sub);
}

export function removeSearchSubscription(socket: Socket): void {
  searchSubscriptions.delete(socket);
}

export function getSearchSubscription(socket: Socket): SearchSubscription | undefined {
  return searchSubscriptions.get(socket);
}

export function getAllSearchSubscriptions(): Map<Socket, SearchSubscription> {
  const map = new Map<Socket, SearchSubscription>();
  // Note: WeakMap cannot be iterated; this is a stub for future refactors
  // In practice, broadcaster.ts iterates over io.sockets.sockets and calls getSearchSubscription per socket
  return map;
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
  const rooms = socketRooms.get(socket) ?? new Set<string>();
  rooms.add(room);
  socketRooms.set(socket, rooms);
}

export function leaveRoom(socket: Socket, room: string): void {
  socket.leave(room);
  const rooms = socketRooms.get(socket);
  if (rooms) {
    rooms.delete(room);
  }
}

export function getSocketRooms(socket: Socket): string[] {
  return Array.from(socketRooms.get(socket) ?? []);
}

export function clearSocketRooms(socket: Socket): void {
  const rooms = socketRooms.get(socket);
  if (rooms) {
    for (const room of rooms) {
      socket.leave(room);
    }
    rooms.clear();
  }
}
