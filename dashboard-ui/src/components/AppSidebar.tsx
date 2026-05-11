import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  MonitorCog,
  Server,
  Settings as SettingsIcon,
  Zap,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useSocketContext } from '../socket/context';

const monitorNav = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/stats', icon: BarChart3, label: 'Analytics' },
];

const exploreNav = [
  { to: '/setup', icon: MonitorCog, label: 'Setup' },
];

const systemNav = [{ to: '/settings', icon: SettingsIcon, label: 'Settings' }];

export function AppSidebar() {
  const location = useLocation();
  const { status } = useSocketContext();
  const guildId = getGuildId(location.pathname);

  const isConnected = status === 'connected';

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link to="/">
                <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Server className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Discord Logger</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    Self-bot dashboard
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Monitor</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {monitorNav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(location.pathname, item.to)}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Explore</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {exploreNav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(location.pathname, item.to)}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {guildId ? (
          <SidebarGroup>
            <SidebarGroupLabel>Current Guild</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Guild workspace">
                    <Link to={`/guilds/${guildId}`}>
                      <Server />
                      <span className="truncate">Guild {guildId}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {systemNav.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(location.pathname, item.to)}
                    tooltip={item.label}
                  >
                    <Link to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                <Zap className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Realtime capture</span>
                <span
                  className={`truncate text-xs ${
                    isConnected ? 'text-emerald-500' : 'text-muted-foreground'
                  }`}
                >
                  {isConnected ? 'Connected' : statusLabel(status)}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function isActivePath(pathname: string, to: string) {
  if (to === '/') {
    return pathname === '/';
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function getGuildId(pathname: string) {
  const match = pathname.match(/^\/guilds\/([^/]+)/);
  return match?.[1] ?? null;
}

function statusLabel(status: string) {
  switch (status) {
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Reconnecting…';
    default:
      return 'Disconnected';
  }
}
