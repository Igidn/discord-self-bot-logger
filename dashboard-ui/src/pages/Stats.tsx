import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { BarChart3, Calendar, TrendingUp } from 'lucide-react';
import apiClient from '../api/client';

interface DailyCount {
  day: string;
  count: number;
}

interface TopChannel {
  channelId: string;
  count: number;
}

interface TopUser {
  userId: string;
  count: number;
}

interface StatsData {
  dailyCounts: DailyCount[];
  topChannels: TopChannel[];
  topUsers: TopUser[];
}

const COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245', '#3ba55d', '#faa61a'];

export default function Stats() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const dailyData = (stats?.dailyCounts ?? []).map((item) => ({
    date: item.day,
    count: item.count,
  }));

  const topChannelData = (stats?.topChannels ?? []).map((item) => ({
    label: `#${item.channelId.slice(-6)}`,
    count: item.count,
  }));

  const topUserData = (stats?.topUsers ?? []).map((item) => ({
    label: item.userId.slice(-6),
    count: item.count,
  }));

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const res = await apiClient.get<StatsData>(`/stats/overview?range=${range}`);
        setStats(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [range]);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-discord-blurple" />
          Analytics
        </h1>
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                range === r
                  ? 'bg-discord-blurple text-white'
                  : 'text-gray-400 hover:text-gray-100'
              }`}
            >
              {r === '7d' ? 'Last 7d' : r === '30d' ? 'Last 30d' : 'Last 90d'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading stats...</div>
      ) : !stats ? (
        <div className="text-sm text-gray-500">No stats available.</div>
      ) : (
        <>
          {/* Daily Messages */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-discord-green" />
              <h2 className="font-semibold">Daily Messages</h2>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '0.5rem',
                      color: '#f3f4f6',
                    }}
                  />
                  <Bar dataKey="count" fill="#5865F2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Channels */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h2 className="font-semibold mb-4">Top Channels</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topChannelData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {topChannelData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        border: '1px solid #1f2937',
                        borderRadius: '0.5rem',
                        color: '#f3f4f6',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Users */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h2 className="font-semibold mb-4">Top Users</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={topUserData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label
                    >
                      {topUserData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111827',
                        border: '1px solid #1f2937',
                        borderRadius: '0.5rem',
                        color: '#f3f4f6',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
