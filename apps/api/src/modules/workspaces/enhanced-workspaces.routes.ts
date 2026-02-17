/**
 * Enhanced Workspaces Routes
 * Comprehensive workspace management endpoints
 */

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';
import { workspaceAccess } from '../middleware/workspace.js';
import { validate } from '../middleware/validate.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { analyticsService } from '../lib/analytics.js';
import { notificationService } from '../lib/notifications.js';
import { webhookService } from '../lib/webhooks.js';
import { usageTrackingService, UsageMetric } from '../lib/usage-tracking.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createWorkspaceSchema = z.object({
  name: z.string().min(3).max(100),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  featureFlags: z.record(z.boolean()).optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/).optional(),
  featureFlags: z.record(z.boolean()).optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'STAFF']),
  message: z.string().optional(),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'STAFF']),
});

/**
 * Create new workspace
 */
router.post(
  '/',
  authenticateUser,
  validate(createWorkspaceSchema),
  async (req, res) => {
    try {
      const userId = req.user!.id;
      const { name, slug, featureFlags } = req.body;

      // Check workspace limit
      const exceeded = await usageTrackingService.isQuotaExceeded(
        undefined,
        UsageMetric.WORKSPACES
      );

      if (exceeded) {
        return res.status(429).json({
          error: 'Workspace limit reached',
          message: 'You have reached your workspace limit. Please upgrade your plan.',
        });
      }

      // Check if slug is available
      const existing = await prisma.workspace.findUnique({
        where: { slug },
      });

      if (existing) {
        return res.status(409).json({
          error: 'Slug already taken',
          message: 'This workspace slug is already in use',
        });
      }

      // Create workspace
      const workspace = await prisma.workspace.create({
        data: {
          name,
          slug,
          ownerId: userId,
          featureFlags: featureFlags || {},
          members: {
            create: {
              userId,
              role: 'OWNER',
            },
          },
          subscriptions: {
            create: {
              ownerId: userId,
              plan: 'FREE',
              status: 'TRIALING',
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                },
              },
            },
          },
          subscriptions: true,
        },
      });

      // Track usage
      await usageTrackingService.trackUsage({
        userId,
        metric: UsageMetric.WORKSPACES,
        value: 1,
        timestamp: new Date(),
      });

      // Send notification
      await notificationService.notifyNewWorkspaceMember(
        userId,
        workspace.id,
        workspace.name,
        'OWNER'
      );

      // Trigger webhook
      await webhookService.notifyWorkspaceCreated(workspace.id, {
        workspaceId: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ownerId: userId,
      });

      logger.info('Workspace created', { workspaceId: workspace.id, userId });

      res.status(201).json({
        workspace,
      });
    } catch (error) {
      logger.error('Failed to create workspace', error as Error);
      res.status(500).json({
        error: 'Failed to create workspace',
      });
    }
  }
);

/**
 * List user's workspaces
 */
router.get('/', authenticateUser, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const skip = (page - 1) * limit;

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                },
              },
            },
          },
          subscriptions: true,
          _count: {
            select: {
              members: true,
              revenueEntries: true,
              playerProfiles: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.workspace.count({
        where: {
          members: {
            some: {
              userId,
            },
          },
        },
      }),
    ]);

    res.json({
      workspaces,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list workspaces', error as Error);
    res.status(500).json({
      error: 'Failed to list workspaces',
    });
  }
});

/**
 * Get workspace details
 */
router.get('/:workspaceId', authenticateUser, workspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                displayName: true,
              },
            },
          },
        },
        subscriptions: true,
        _count: {
          select: {
            members: true,
            revenueEntries: true,
            playerProfiles: true,
            jobPosts: true,
            applications: true,
          },
        },
      },
    });

    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
      });
    }

    res.json({ workspace });
  } catch (error) {
    logger.error('Failed to get workspace', error as Error);
    res.status(500).json({
      error: 'Failed to get workspace',
    });
  }
});

/**
 * Update workspace
 */
router.patch(
  '/:workspaceId',
  authenticateUser,
  workspaceAccess,
  validate(updateWorkspaceSchema),
  async (req, res) => {
    try {
      const { workspaceId } = req.params;
      const { name, slug, featureFlags } = req.body;

      // Check if slug is available (if changing)
      if (slug) {
        const existing = await prisma.workspace.findFirst({
          where: {
            slug,
            id: { not: workspaceId },
          },
        });

        if (existing) {
          return res.status(409).json({
            error: 'Slug already taken',
          });
        }
      }

      const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          ...(name && { name }),
          ...(slug && { slug }),
          ...(featureFlags && { featureFlags }),
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  displayName: true,
                },
              },
            },
          },
          subscriptions: true,
        },
      });

      logger.info('Workspace updated', { workspaceId });

      res.json({ workspace });
    } catch (error) {
      logger.error('Failed to update workspace', error as Error);
      res.status(500).json({
        error: 'Failed to update workspace',
      });
    }
  }
);

/**
 * Delete workspace
 */
router.delete('/:workspaceId', authenticateUser, workspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const userId = req.user!.id;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({
        error: 'Workspace not found',
      });
    }

    // Only owner can delete
    if (workspace.ownerId !== userId) {
      return res.status(403).json({
        error: 'Only workspace owner can delete workspace',
      });
    }

    // Delete all related data
    await prisma.$transaction([
      prisma.auditLog.deleteMany({ where: { workspaceId } }),
      prisma.playerIncident.deleteMany({ where: { workspaceId } }),
      prisma.playerProfile.deleteMany({ where: { workspaceId } }),
      prisma.application.deleteMany({ where: { workspaceId } }),
      prisma.jobPost.deleteMany({ where: { workspaceId } }),
      prisma.product.deleteMany({ where: { workspaceId } }),
      prisma.revenueEntry.deleteMany({ where: { workspaceId } }),
      prisma.subscription.deleteMany({ where: { workspaceId } }),
      prisma.workspaceMember.deleteMany({ where: { workspaceId } }),
      prisma.workspace.delete({ where: { id: workspaceId } }),
    ]);

    logger.info('Workspace deleted', { workspaceId, userId });

    res.json({
      message: 'Workspace deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete workspace', error as Error);
    res.status(500).json({
      error: 'Failed to delete workspace',
    });
  }
});

/**
 * Get workspace analytics
 */
router.get('/:workspaceId/analytics', authenticateUser, workspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const dateRange = {
      start: req.query.start ? new Date(req.query.start as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: req.query.end ? new Date(req.query.end as string) : new Date(),
    };

    const [
      revenueAnalytics,
      subscriptionAnalytics,
      playerAnalytics,
      staffAnalytics,
      workspaceAnalytics,
    ] = await Promise.all([
      analyticsService.getRevenueAnalytics(workspaceId, dateRange),
      analyticsService.getSubscriptionAnalytics(workspaceId),
      analyticsService.getPlayerAnalytics(workspaceId, dateRange),
      analyticsService.getStaffAnalytics(workspaceId, dateRange),
      analyticsService.getWorkspaceAnalytics(workspaceId),
    ]);

    res.json({
      revenue: revenueAnalytics,
      subscription: subscriptionAnalytics,
      players: playerAnalytics,
      staff: staffAnalytics,
      workspace: workspaceAnalytics,
    });
  } catch (error) {
    logger.error('Failed to get workspace analytics', error as Error);
    res.status(500).json({
      error: 'Failed to get workspace analytics',
    });
  }
});

/**
 * Invite member to workspace
 */
router.post(
  '/:workspaceId/members/invite',
  authenticateUser,
  workspaceAccess,
  validate(inviteMemberSchema),
  async (req, res) => {
    try {
      const { workspaceId } = req.params;
      const { email, role, message } = req.body;

      // Check if user exists
      let user = await prisma.user.findUnique({
        where: { email },
      });

      // If user doesn't exist, create invitation
      // In production, implement invitation system

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User must have an account to be invited',
        });
      }

      // Check if already a member
      const existing = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: user.id,
          },
        },
      });

      if (existing) {
        return res.status(409).json({
          error: 'User is already a member',
        });
      }

      // Add member
      const member = await prisma.workspaceMember.create({
        data: {
          workspaceId,
          userId: user.id,
          role,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });

      // Send notification
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      if (workspace) {
        await notificationService.notifyNewWorkspaceMember(
          user.id,
          workspaceId,
          workspace.name,
          role
        );
      }

      logger.info('Member invited to workspace', { workspaceId, userId: user.id, role });

      res.status(201).json({ member });
    } catch (error) {
      logger.error('Failed to invite member', error as Error);
      res.status(500).json({
        error: 'Failed to invite member',
      });
    }
  }
);

/**
 * Update member role
 */
router.patch(
  '/:workspaceId/members/:memberId',
  authenticateUser,
  workspaceAccess,
  validate(updateMemberRoleSchema),
  async (req, res) => {
    try {
      const { workspaceId, memberId } = req.params;
      const { role } = req.body;

      const member = await prisma.workspaceMember.update({
        where: { id: memberId },
        data: { role },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      });

      logger.info('Member role updated', { workspaceId, memberId, role });

      res.json({ member });
    } catch (error) {
      logger.error('Failed to update member role', error as Error);
      res.status(500).json({
        error: 'Failed to update member role',
      });
    }
  }
);

/**
 * Remove member from workspace
 */
router.delete(
  '/:workspaceId/members/:memberId',
  authenticateUser,
  workspaceAccess,
  async (req, res) => {
    try {
      const { workspaceId, memberId } = req.params;

      const member = await prisma.workspaceMember.findUnique({
        where: { id: memberId },
      });

      if (!member) {
        return res.status(404).json({
          error: 'Member not found',
        });
      }

      // Don't allow removing owner
      if (member.role === 'OWNER') {
        return res.status(403).json({
          error: 'Cannot remove workspace owner',
        });
      }

      await prisma.workspaceMember.delete({
        where: { id: memberId },
      });

      logger.info('Member removed from workspace', { workspaceId, memberId });

      res.json({
        message: 'Member removed successfully',
      });
    } catch (error) {
      logger.error('Failed to remove member', error as Error);
      res.status(500).json({
        error: 'Failed to remove member',
      });
    }
  }
);

export { router as enhancedWorkspacesRouter };
