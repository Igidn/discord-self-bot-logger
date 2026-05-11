import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './socket/context';
import { Layout } from './components/Layout';
import Overview from './pages/Overview';
import Setup from './pages/Setup';
import GuildView from './pages/GuildView';
import ChannelFeed from './pages/ChannelFeed';
import Search from './pages/Search';
import MessageDetail from './pages/MessageDetail';
import UserProfile from './pages/UserProfile';
import Activity from './pages/Activity';
import Stats from './pages/Stats';
import Settings from './pages/Settings';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard render failed', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
          <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold">Dashboard failed to render</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A runtime error occurred while loading the dashboard.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Overview />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/guilds/:id" element={<GuildView />} />
              <Route path="/guilds/:id/channels/:channelId" element={<ChannelFeed />} />
              <Route path="/search" element={<Search />} />
              <Route path="/messages/:id" element={<MessageDetail />} />
              <Route path="/users/:id" element={<UserProfile />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AppErrorBoundary>
  );
}
