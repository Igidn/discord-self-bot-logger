import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings as SettingsIcon,
  Search,
  Activity,
  BarChart3,
  Server,
  MonitorCog,
} from 'lucide-react';
import { LiveBadge } from './LiveBadge';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/setup', icon: MonitorCog, label: 'Setup' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
];

export function Layout() {
  const location = useLocation();
  const isGuildRoute = location.pathname.startsWith('/guilds/');

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center gap-3">
          <Server className="w-6 h-6 text-discord-blurple" />
          <span className="font-bold text-lg tracking-tight">Logger</span>
          <div className="ml-auto">
            <LiveBadge />
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-discord-blurple/20 text-discord-blurple'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}

          {isGuildRoute && (
            <div className="mt-4 pt-4 border-t border-gray-800">
              <span className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Guild</span>
              <GuildBreadcrumb />
            </div>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

function GuildBreadcrumb() {
  // Minimal breadcrumb for guild routes; could be enriched with guild name fetch
  return (
    <div className="mt-2 px-3 py-2 text-xs text-gray-500 truncate">
      <Link to="/" className="hover:text-gray-300">Dashboard</Link>
      <span className="mx-1">/</span>
      <span>Guild</span>
    </div>
  );
}
