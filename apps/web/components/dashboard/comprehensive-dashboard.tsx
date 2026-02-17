'use client';

/**
 * Comprehensive Dashboard Component
 * Main dashboard with widgets, metrics, and real-time updates
 */

import { useState, useEffect } from 'react';
import { Card } from '../ui/card';
import { RevenueChart } from '../revenue-chart';

interface DashboardMetric {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  icon?: string;
}

interface DashboardProps {
  workspaceId: string;
}

export function ComprehensiveDashboard({ workspaceId }: DashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [workspaceId]);

  async function loadDashboardData() {
    try {
      setLoading(true);
      
      // Fetch dashboard data
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/analytics`);
      
      if (!response.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const data = await response.json();

      // Transform data into metrics
      setMetrics([
        {
          label: 'Monthly Recurring Revenue',
          value: `$${data.revenue.monthlyRecurringRevenue.current.toLocaleString()}`,
          change: data.revenue.monthlyRecurringRevenue.changePercent,
          trend: data.revenue.monthlyRecurringRevenue.trend,
        },
        {
          label: 'Total Revenue',
          value: `$${data.revenue.totalRevenue.current.toLocaleString()}`,
          change: data.revenue.totalRevenue.changePercent,
          trend: data.revenue.totalRevenue.trend,
        },
        {
          label: 'Active Players',
          value: data.players.activePlayers.current,
          change: data.players.activePlayers.changePercent,
          trend: data.players.activePlayers.trend,
        },
        {
          label: 'Team Members',
          value: data.workspace.memberCount.current,
        },
        {
          label: 'Flagged Players',
          value: data.players.flaggedPlayers.current,
          change: data.players.flaggedPlayers.changePercent,
          trend: data.players.flaggedPlayers.trend,
        },
        {
          label: 'Open Applications',
          value: data.staff.pendingApplications.current,
        },
        {
          label: 'Average Reputation',
          value: data.players.averageReputationScore.current.toFixed(1),
        },
        {
          label: 'Activity Score',
          value: data.workspace.activityScore,
        },
      ]);

      setRevenueData(data.revenue.revenueOverTime);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="p-6 bg-red-50 border-red-200">
          <p className="text-red-800">{error}</p>
          <button 
            onClick={loadDashboardData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button 
          onClick={loadDashboardData}
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition"
        >
          Refresh
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => (
          <Card key={index} className="p-4">
            <div className="flex flex-col">
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <div className="flex items-baseline mt-2 space-x-2">
                <p className="text-2xl font-semibold">{metric.value}</p>
                {metric.change !== undefined && (
                  <span
                    className={`text-sm ${
                      metric.trend === 'up'
                        ? 'text-green-600'
                        : metric.trend === 'down'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {metric.change > 0 ? '+' : ''}
                    {metric.change.toFixed(1)}%
                  </span>
                )}
              </div>
              {metric.trend && (
                <div className="mt-1">
                  {metric.trend === 'up' && (
                    <span className="text-xs text-green-600">↑ Trending up</span>
                  )}
                  {metric.trend === 'down' && (
                    <span className="text-xs text-red-600">↓ Trending down</span>
                  )}
                  {metric.trend === 'stable' && (
                    <span className="text-xs text-gray-600">→ Stable</span>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Revenue Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">Revenue over time</h2>
        <RevenueChart data={revenueData} />
      </Card>

      {/* Quick Actions */}
      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <button className="px-4 py-3 text-left bg-blue-50 hover:bg-blue-100 rounded-lg transition">
            <div className="font-medium text-blue-900">Add Revenue</div>
            <div className="text-sm text-blue-700">Track new revenue entry</div>
          </button>
          <button className="px-4 py-3 text-left bg-green-50 hover:bg-green-100 rounded-lg transition">
            <div className="font-medium text-green-900">Manage Players</div>
            <div className="text-sm text-green-700">View player profiles</div>
          </button>
          <button className="px-4 py-3 text-left bg-purple-50 hover:bg-purple-100 rounded-lg transition">
            <div className="font-medium text-purple-900">Staff Applications</div>
            <div className="text-sm text-purple-700">Review applications</div>
          </button>
          <button className="px-4 py-3 text-left bg-orange-50 hover:bg-orange-100 rounded-lg transition">
            <div className="font-medium text-orange-900">View Analytics</div>
            <div className="text-sm text-orange-700">Detailed insights</div>
          </button>
        </div>
      </Card>

      {/* Recent Activity */}
      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4">Recent Activity</h2>
        <div className="space-y-3">
          <ActivityItem
            action="Revenue entry added"
            details="Product Sale - $250.00"
            time="2 hours ago"
          />
          <ActivityItem
            action="Player incident reported"
            details="Griefing incident for Player_abc123"
            time="4 hours ago"
          />
          <ActivityItem
            action="Staff application submitted"
            details="New application for Moderator position"
            time="6 hours ago"
          />
          <ActivityItem
            action="Team member added"
            details="john@example.com joined as Staff"
            time="1 day ago"
          />
        </div>
      </Card>
    </div>
  );
}

interface ActivityItemProps {
  action: string;
  details: string;
  time: string;
}

function ActivityItem({ action, details, time }: ActivityItemProps) {
  return (
    <div className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition">
      <div className="flex-shrink-0 w-2 h-2 mt-2 bg-blue-500 rounded-full"></div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{action}</p>
        <p className="text-sm text-gray-600 truncate">{details}</p>
      </div>
      <div className="flex-shrink-0 text-sm text-gray-500">{time}</div>
    </div>
  );
}
