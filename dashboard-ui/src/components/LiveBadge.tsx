import { useSocketContext } from '../socket/context';

export function LiveBadge() {
  const { status } = useSocketContext();

  const colorClass =
    status === 'connected'
      ? 'bg-discord-green'
      : status === 'reconnecting' || status === 'connecting'
      ? 'bg-discord-yellow'
      : 'bg-discord-red';

  const label =
    status === 'connected'
      ? 'Live'
      : status === 'reconnecting'
      ? 'Reconnecting'
      : status === 'connecting'
      ? 'Connecting'
      : 'Disconnected';

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-800 border border-gray-700">
      <span className={`relative flex h-2 w-2`}>
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colorClass}`}
        />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${colorClass}`} />
      </span>
      <span className="text-[10px] font-medium text-gray-300 uppercase tracking-wider">{label}</span>
    </div>
  );
}
