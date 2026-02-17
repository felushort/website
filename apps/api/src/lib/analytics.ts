/**
 * Analytics and reporting system
 * Provides insights into workspace activity, revenue, and user behavior
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface MetricData {
  current: number;
  previous?: number;
  change?: number;
  changePercent?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface RevenueAnalytics {
  totalRevenue: MetricData;
  monthlyRecurringRevenue: MetricData;
  averageOrderValue: MetricData;
  revenueBySource: Array<{ source: string; amount: number; percentage: number }>;
  revenueOverTime: TimeSeriesDataPoint[];
  topProducts: Array<{ name: string; revenue: number; count: number }>;
  growthRate: number;
}

export interface SubscriptionAnalytics {
  totalSubscriptions: MetricData;
  activeSubscriptions: MetricData;
  trialingSubscriptions: MetricData;
  churnRate: number;
  conversionRate: number;
  subscriptionsByPlan: Array<{ plan: string; count: number; percentage: number }>;
  subscriptionsOverTime: TimeSeriesDataPoint[];
  ltv: number; // Lifetime value
}

export interface PlayerAnalytics {
  totalPlayers: MetricData;
  activePlayers: MetricData;
  flaggedPlayers: MetricData;
  averageReputationScore: MetricData;
  incidentsOverTime: TimeSeriesDataPoint[];
  incidentsByType: Array<{ type: string; count: number; percentage: number }>;
  incidentsBySeverity: Array<{ severity: number; count: number }>;
  topFlaggedPlayers: Array<{ playerTag: string; warningCount: number; reputationScore: number }>;
}

export interface StaffAnalytics {
  totalApplications: MetricData;
  pendingApplications: MetricData;
  acceptanceRate: number;
  applicationsByStatus: Array<{ status: string; count: number; percentage: number }>;
  applicationsOverTime: TimeSeriesDataPoint[];
  averageResponseTime: number; // in hours
  topJobPosts: Array<{ title: string; applicationCount: number; acceptanceRate: number }>;
}

export interface WorkspaceAnalytics {
  memberCount: MetricData;
  membersByRole: Array<{ role: string; count: number; percentage: number }>;
  activityScore: number;
  recentActivity: Array<{ action: string; count: number; timestamp: Date }>;
  mostActiveUsers: Array<{ userName: string; actionCount: number }>;
}

export interface PlatformAnalytics {
  totalWorkspaces: number;
  activeWorkspaces: number;
  totalUsers: number;
  activeUsers: number;
  totalRevenue: number;
  platformGrowthRate: number;
  workspacesOverTime: TimeSeriesDataPoint[];
  usersOverTime: TimeSeriesDataPoint[];
  revenueOverTime: TimeSeriesDataPoint[];
}

class AnalyticsService {
  /**
   * Get revenue analytics for a workspace
   */
  async getRevenueAnalytics(
    workspaceId: string,
    dateRange: DateRange
  ): Promise<RevenueAnalytics> {
    try {
      logger.info('Fetching revenue analytics', { workspaceId, dateRange });

      // Get revenue entries for the period
      const revenues = await prisma.revenueEntry.findMany({
        where: {
          workspaceId,
          date: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
        orderBy: { date: 'asc' },
      });

      // Calculate total revenue
      const totalRevenue = revenues.reduce((sum, r) => sum + Number(r.amount), 0);

      // Get previous period for comparison
      const periodLength = dateRange.end.getTime() - dateRange.start.getTime();
      const previousRange = {
        start: new Date(dateRange.start.getTime() - periodLength),
        end: dateRange.start,
      };

      const previousRevenues = await prisma.revenueEntry.findMany({
        where: {
          workspaceId,
          date: {
            gte: previousRange.start,
            lt: previousRange.end,
          },
        },
      });

      const previousTotal = previousRevenues.reduce((sum, r) => sum + Number(r.amount), 0);
      const change = totalRevenue - previousTotal;
      const changePercent = previousTotal > 0 ? (change / previousTotal) * 100 : 0;

      // Revenue by source
      const revenueBySource = revenues.reduce((acc, r) => {
        const existing = acc.find(item => item.source === r.source);
        if (existing) {
          existing.amount += Number(r.amount);
        } else {
          acc.push({ source: r.source, amount: Number(r.amount), percentage: 0 });
        }
        return acc;
      }, [] as Array<{ source: string; amount: number; percentage: number }>);

      // Calculate percentages
      revenueBySource.forEach(item => {
        item.percentage = totalRevenue > 0 ? (item.amount / totalRevenue) * 100 : 0;
      });

      // Revenue over time
      const revenueOverTime = this.groupByDate(
        revenues.map(r => ({ date: r.date, value: Number(r.amount) }))
      );

      // Top products
      const productRevenue = revenues.reduce((acc, r) => {
        const existing = acc.find(item => item.name === r.productName);
        if (existing) {
          existing.revenue += Number(r.amount);
          existing.count += 1;
        } else {
          acc.push({ name: r.productName, revenue: Number(r.amount), count: 1 });
        }
        return acc;
      }, [] as Array<{ name: string; revenue: number; count: number }>);

      productRevenue.sort((a, b) => b.revenue - a.revenue);
      const topProducts = productRevenue.slice(0, 10);

      // Calculate growth rate
      const monthlyRevenueData = this.groupByMonth(revenues);
      const growthRate = this.calculateGrowthRate(monthlyRevenueData);

      // Calculate MRR (approximate)
      const currentMonth = new Date();
      const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      const currentMonthRevenue = await prisma.revenueEntry.aggregate({
        where: {
          workspaceId,
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      });

      const mrr = Number(currentMonthRevenue._sum.amount || 0);

      return {
        totalRevenue: {
          current: totalRevenue,
          previous: previousTotal,
          change,
          changePercent,
          trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
        },
        monthlyRecurringRevenue: {
          current: mrr,
        },
        averageOrderValue: {
          current: revenues.length > 0 ? totalRevenue / revenues.length : 0,
        },
        revenueBySource,
        revenueOverTime,
        topProducts,
        growthRate,
      };
    } catch (error) {
      logger.error('Failed to fetch revenue analytics', error as Error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get subscription analytics for a workspace
   */
  async getSubscriptionAnalytics(workspaceId: string): Promise<SubscriptionAnalytics> {
    try {
      logger.info('Fetching subscription analytics', { workspaceId });

      const subscription = await prisma.subscription.findUnique({
        where: { workspaceId },
      });

      // In a multi-subscription model, aggregate all subscriptions
      const subscriptionsByPlan = [
        { plan: subscription?.plan || 'FREE', count: 1, percentage: 100 },
      ];

      return {
        totalSubscriptions: { current: 1 },
        activeSubscriptions: { 
          current: subscription?.status === 'ACTIVE' ? 1 : 0 
        },
        trialingSubscriptions: { 
          current: subscription?.status === 'TRIALING' ? 1 : 0 
        },
        churnRate: 0,
        conversionRate: subscription?.status === 'ACTIVE' ? 100 : 0,
        subscriptionsByPlan,
        subscriptionsOverTime: [],
        ltv: 0,
      };
    } catch (error) {
      logger.error('Failed to fetch subscription analytics', error as Error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get player analytics for a workspace
   */
  async getPlayerAnalytics(
    workspaceId: string,
    dateRange: DateRange
  ): Promise<PlayerAnalytics> {
    try {
      logger.info('Fetching player analytics', { workspaceId, dateRange });

      const players = await prisma.playerProfile.findMany({
        where: { workspaceId },
        include: { incidents: true },
      });

      const totalPlayers = players.length;
      const flaggedPlayers = players.filter(p => p.warningCount > 0).length;
      const avgReputation = players.length > 0
        ? players.reduce((sum, p) => sum + p.reputationScore, 0) / players.length
        : 0;

      // Get incidents in date range
      const incidents = await prisma.playerIncident.findMany({
        where: {
          workspaceId,
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Incidents over time
      const incidentsOverTime = this.groupByDate(
        incidents.map(i => ({ date: i.createdAt, value: 1 }))
      );

      // Incidents by type
      const incidentsByType = incidents.reduce((acc, i) => {
        const existing = acc.find(item => item.type === i.type);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ type: i.type, count: 1, percentage: 0 });
        }
        return acc;
      }, [] as Array<{ type: string; count: number; percentage: number }>);

      incidentsByType.forEach(item => {
        item.percentage = incidents.length > 0 ? (item.count / incidents.length) * 100 : 0;
      });

      // Incidents by severity
      const incidentsBySeverity = incidents.reduce((acc, i) => {
        const existing = acc.find(item => item.severity === i.severity);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ severity: i.severity, count: 1 });
        }
        return acc;
      }, [] as Array<{ severity: number; count: number }>);

      incidentsBySeverity.sort((a, b) => b.severity - a.severity);

      // Top flagged players
      const topFlaggedPlayers = players
        .filter(p => p.warningCount > 0)
        .sort((a, b) => b.warningCount - a.warningCount)
        .slice(0, 10)
        .map(p => ({
          playerTag: `Player_${p.id.substring(0, 8)}`,
          warningCount: p.warningCount,
          reputationScore: p.reputationScore,
        }));

      return {
        totalPlayers: { current: totalPlayers },
        activePlayers: { current: totalPlayers },
        flaggedPlayers: { current: flaggedPlayers },
        averageReputationScore: { current: avgReputation },
        incidentsOverTime,
        incidentsByType,
        incidentsBySeverity,
        topFlaggedPlayers,
      };
    } catch (error) {
      logger.error('Failed to fetch player analytics', error as Error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get staff analytics for a workspace
   */
  async getStaffAnalytics(
    workspaceId: string,
    dateRange: DateRange
  ): Promise<StaffAnalytics> {
    try {
      logger.info('Fetching staff analytics', { workspaceId, dateRange });

      const applications = await prisma.application.findMany({
        where: {
          workspaceId,
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
        include: { jobPost: true },
      });

      const totalApplications = applications.length;
      const pendingApplications = applications.filter(a => a.status === 'PENDING').length;
      const acceptedApplications = applications.filter(a => a.status === 'ACCEPTED').length;
      const acceptanceRate = totalApplications > 0 ? (acceptedApplications / totalApplications) * 100 : 0;

      // Applications by status
      const applicationsByStatus = applications.reduce((acc, a) => {
        const existing = acc.find(item => item.status === a.status);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ status: a.status, count: 1, percentage: 0 });
        }
        return acc;
      }, [] as Array<{ status: string; count: number; percentage: number }>);

      applicationsByStatus.forEach(item => {
        item.percentage = totalApplications > 0 ? (item.count / totalApplications) * 100 : 0;
      });

      // Applications over time
      const applicationsOverTime = this.groupByDate(
        applications.map(a => ({ date: a.createdAt, value: 1 }))
      );

      // Top job posts
      const jobPostStats = applications.reduce((acc, a) => {
        const existing = acc.find(item => item.title === a.jobPost.title);
        if (existing) {
          existing.applicationCount += 1;
          if (a.status === 'ACCEPTED') existing.acceptedCount += 1;
        } else {
          acc.push({
            title: a.jobPost.title,
            applicationCount: 1,
            acceptedCount: a.status === 'ACCEPTED' ? 1 : 0,
            acceptanceRate: 0,
          });
        }
        return acc;
      }, [] as Array<{ title: string; applicationCount: number; acceptedCount: number; acceptanceRate: number }>);

      jobPostStats.forEach(item => {
        item.acceptanceRate = item.applicationCount > 0 
          ? (item.acceptedCount / item.applicationCount) * 100 
          : 0;
      });

      jobPostStats.sort((a, b) => b.applicationCount - a.applicationCount);
      const topJobPosts = jobPostStats.slice(0, 10);

      return {
        totalApplications: { current: totalApplications },
        pendingApplications: { current: pendingApplications },
        acceptanceRate,
        applicationsByStatus,
        applicationsOverTime,
        averageResponseTime: 24, // placeholder
        topJobPosts,
      };
    } catch (error) {
      logger.error('Failed to fetch staff analytics', error as Error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get workspace analytics
   */
  async getWorkspaceAnalytics(workspaceId: string): Promise<WorkspaceAnalytics> {
    try {
      logger.info('Fetching workspace analytics', { workspaceId });

      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: { user: true },
      });

      const memberCount = members.length;

      // Members by role
      const membersByRole = members.reduce((acc, m) => {
        const existing = acc.find(item => item.role === m.role);
        if (existing) {
          existing.count += 1;
        } else {
          acc.push({ role: m.role, count: 1, percentage: 0 });
        }
        return acc;
      }, [] as Array<{ role: string; count: number; percentage: number }>);

      membersByRole.forEach(item => {
        item.percentage = memberCount > 0 ? (item.count / memberCount) * 100 : 0;
      });

      // Get recent audit logs
      const recentLogs = await prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { user: true },
      });

      // Activity score (simple calculation based on recent activity)
      const activityScore = Math.min(100, recentLogs.length * 2);

      // Recent activity summary
      const recentActivity = recentLogs.slice(0, 10).map(log => ({
        action: log.action,
        count: 1,
        timestamp: log.createdAt,
      }));

      // Most active users
      const userActivity = recentLogs.reduce((acc, log) => {
        if (log.user) {
          const existing = acc.find(item => item.userName === log.user!.displayName);
          if (existing) {
            existing.actionCount += 1;
          } else {
            acc.push({ userName: log.user.displayName, actionCount: 1 });
          }
        }
        return acc;
      }, [] as Array<{ userName: string; actionCount: number }>);

      userActivity.sort((a, b) => b.actionCount - a.actionCount);
      const mostActiveUsers = userActivity.slice(0, 5);

      return {
        memberCount: { current: memberCount },
        membersByRole,
        activityScore,
        recentActivity,
        mostActiveUsers,
      };
    } catch (error) {
      logger.error('Failed to fetch workspace analytics', error as Error, { workspaceId });
      throw error;
    }
  }

  /**
   * Get platform-wide analytics (admin only)
   */
  async getPlatformAnalytics(dateRange: DateRange): Promise<PlatformAnalytics> {
    try {
      logger.info('Fetching platform analytics', { dateRange });

      const totalWorkspaces = await prisma.workspace.count();
      const totalUsers = await prisma.user.count();

      // Active workspaces (those with recent activity)
      const activeWorkspaces = await prisma.auditLog.groupBy({
        by: ['workspaceId'],
        where: {
          workspaceId: { not: null },
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // last 30 days
          },
        },
      });

      // Calculate total revenue
      const revenueSum = await prisma.revenueEntry.aggregate({
        _sum: { amount: true },
        where: {
          date: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
      });

      const totalRevenue = Number(revenueSum._sum.amount || 0);

      return {
        totalWorkspaces,
        activeWorkspaces: activeWorkspaces.length,
        totalUsers,
        activeUsers: totalUsers, // simplified
        totalRevenue,
        platformGrowthRate: 0,
        workspacesOverTime: [],
        usersOverTime: [],
        revenueOverTime: [],
      };
    } catch (error) {
      logger.error('Failed to fetch platform analytics', error as Error);
      throw error;
    }
  }

  /**
   * Helper: Group data points by date
   */
  private groupByDate(data: Array<{ date: Date; value: number }>): TimeSeriesDataPoint[] {
    const grouped = data.reduce((acc, item) => {
      const dateStr = item.date.toISOString().split('T')[0];
      const existing = acc.find(i => i.date === dateStr);
      if (existing) {
        existing.value += item.value;
      } else {
        acc.push({ date: dateStr, value: item.value });
      }
      return acc;
    }, [] as TimeSeriesDataPoint[]);

    return grouped.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Helper: Group data points by month
   */
  private groupByMonth(revenues: Array<{ date: Date; amount: any }>): TimeSeriesDataPoint[] {
    const grouped = revenues.reduce((acc, item) => {
      const monthStr = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
      const existing = acc.find(i => i.date === monthStr);
      if (existing) {
        existing.value += Number(item.amount);
      } else {
        acc.push({ date: monthStr, value: Number(item.amount) });
      }
      return acc;
    }, [] as TimeSeriesDataPoint[]);

    return grouped.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Helper: Calculate growth rate
   */
  private calculateGrowthRate(monthlyData: TimeSeriesDataPoint[]): number {
    if (monthlyData.length < 2) return 0;

    const recent = monthlyData.slice(-3);
    if (recent.length < 2) return 0;

    const firstValue = recent[0].value;
    const lastValue = recent[recent.length - 1].value;

    if (firstValue === 0) return 0;

    return ((lastValue - firstValue) / firstValue) * 100;
  }
}

export const analyticsService = new AnalyticsService();
