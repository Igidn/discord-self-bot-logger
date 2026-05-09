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

export default function App() {
  return (
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
  );
}
