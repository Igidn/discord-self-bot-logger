import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSocketContext } from '../socket/context';

export function LiveBadge() {
  const { status } = useSocketContext();

  const config =
    status === 'connected'
      ? {
          label: 'Live',
          badgeClassName: 'border-primary/20 bg-primary/10 text-primary',
          dotClassName: 'bg-primary',
        }
      : status === 'reconnecting'
      ? {
          label: 'Reconnecting',
          badgeClassName: 'border-border bg-muted text-muted-foreground',
          dotClassName: 'animate-pulse bg-muted-foreground',
        }
      : status === 'connecting'
      ? {
          label: 'Connecting',
          badgeClassName: 'border-border bg-muted text-muted-foreground',
          dotClassName: 'bg-muted-foreground',
        }
      : {
          label: 'Disconnected',
          badgeClassName: 'border-destructive/20 bg-destructive/10 text-destructive',
          dotClassName: 'bg-destructive',
        };

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]',
        config.badgeClassName,
      )}
    >
      <span className={cn('size-1.5 rounded-full', config.dotClassName)} />
      <span aria-live="polite">{config.label}</span>
    </Badge>
  );
}
