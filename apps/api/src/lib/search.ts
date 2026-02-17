/**
 * Search System
 * Provides full-text search across multiple entities
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';

export enum SearchEntity {
  WORKSPACES = 'workspaces',
  USERS = 'users',
  PLAYERS = 'players',
  REVENUE = 'revenue',
  APPLICATIONS = 'applications',
  JOB_POSTS = 'job_posts',
  AUDIT_LOGS = 'audit_logs',
  ALL = 'all',
}

export interface SearchOptions {
  query: string;
  entities?: SearchEntity[];
  workspaceId?: string;
  limit?: number;
  offset?: number;
  filters?: Record<string, unknown>;
}

export interface SearchResult {
  entity: SearchEntity;
  id: string;
  title: string;
  description?: string;
  url?: string;
  score: number;
  highlights?: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  took: number; // milliseconds
}

class SearchService {
  /**
   * Perform search across entities
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();

    try {
      logger.info('Performing search', {
        query: options.query,
        entities: options.entities,
        workspaceId: options.workspaceId,
      });

      const entities = options.entities || [SearchEntity.ALL];
      const limit = options.limit || 20;
      const offset = options.offset || 0;

      const results: SearchResult[] = [];

      // Search in each entity type
      if (entities.includes(SearchEntity.ALL) || entities.includes(SearchEntity.WORKSPACES)) {
        const workspaceResults = await this.searchWorkspaces(options);
        results.push(...workspaceResults);
      }

      if (entities.includes(SearchEntity.ALL) || entities.includes(SearchEntity.PLAYERS)) {
        const playerResults = await this.searchPlayers(options);
        results.push(...playerResults);
      }

      if (entities.includes(SearchEntity.ALL) || entities.includes(SearchEntity.REVENUE)) {
        const revenueResults = await this.searchRevenue(options);
        results.push(...revenueResults);
      }

      if (entities.includes(SearchEntity.ALL) || entities.includes(SearchEntity.APPLICATIONS)) {
        const applicationResults = await this.searchApplications(options);
        results.push(...applicationResults);
      }

      if (entities.includes(SearchEntity.ALL) || entities.includes(SearchEntity.JOB_POSTS)) {
        const jobPostResults = await this.searchJobPosts(options);
        results.push(...jobPostResults);
      }

      if (entities.includes(SearchEntity.ALL) || entities.includes(SearchEntity.AUDIT_LOGS)) {
        const auditLogResults = await this.searchAuditLogs(options);
        results.push(...auditLogResults);
      }

      // Sort by score
      results.sort((a, b) => b.score - a.score);

      // Apply pagination
      const paginatedResults = results.slice(offset, offset + limit);

      const took = Date.now() - startTime;

      logger.info('Search completed', {
        query: options.query,
        resultsCount: results.length,
        took,
      });

      return {
        results: paginatedResults,
        total: results.length,
        query: options.query,
        took,
      };
    } catch (error) {
      logger.error('Search failed', error as Error, { query: options.query });
      throw error;
    }
  }

  /**
   * Search workspaces
   */
  private async searchWorkspaces(options: SearchOptions): Promise<SearchResult[]> {
    const query = options.query.toLowerCase();

    const workspaces = await prisma.workspace.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { slug: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
    });

    return workspaces.map(w => ({
      entity: SearchEntity.WORKSPACES,
      id: w.id,
      title: w.name,
      description: `Workspace: ${w.slug}`,
      url: `/workspaces/${w.id}`,
      score: this.calculateScore(query, w.name),
      metadata: {
        slug: w.slug,
        createdAt: w.createdAt,
      },
    }));
  }

  /**
   * Search players
   */
  private async searchPlayers(options: SearchOptions): Promise<SearchResult[]> {
    if (!options.workspaceId) return [];

    const query = options.query.toLowerCase();

    const players = await prisma.playerProfile.findMany({
      where: {
        workspaceId: options.workspaceId,
      },
      include: {
        playerIdentity: true,
      },
      take: 10,
    });

    const results: SearchResult[] = [];

    for (const player of players) {
      // Search in usernames
      const matchingUsernames = player.playerIdentity.knownUsernames.filter(
        username => username.toLowerCase().includes(query)
      );

      if (matchingUsernames.length > 0 || 
          player.playerIdentity.minecraftUuid?.toLowerCase().includes(query)) {
        results.push({
          entity: SearchEntity.PLAYERS,
          id: player.id,
          title: matchingUsernames[0] || 'Unknown Player',
          description: `Reputation: ${player.reputationScore}, Warnings: ${player.warningCount}`,
          url: `/workspaces/${options.workspaceId}/players/${player.id}`,
          score: this.calculateScore(query, matchingUsernames.join(' ')),
          highlights: matchingUsernames,
          metadata: {
            reputationScore: player.reputationScore,
            warningCount: player.warningCount,
            uuid: player.playerIdentity.minecraftUuid,
          },
        });
      }
    }

    return results;
  }

  /**
   * Search revenue entries
   */
  private async searchRevenue(options: SearchOptions): Promise<SearchResult[]> {
    if (!options.workspaceId) return [];

    const query = options.query.toLowerCase();

    const revenues = await prisma.revenueEntry.findMany({
      where: {
        workspaceId: options.workspaceId,
        OR: [
          { source: { contains: query, mode: 'insensitive' } },
          { productName: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
      orderBy: { date: 'desc' },
    });

    return revenues.map(r => ({
      entity: SearchEntity.REVENUE,
      id: r.id,
      title: r.productName,
      description: `${r.source} - ${r.currency} ${r.amount}`,
      url: `/workspaces/${options.workspaceId}/revenue`,
      score: this.calculateScore(query, `${r.productName} ${r.source}`),
      metadata: {
        amount: r.amount.toString(),
        currency: r.currency,
        date: r.date,
        source: r.source,
      },
    }));
  }

  /**
   * Search applications
   */
  private async searchApplications(options: SearchOptions): Promise<SearchResult[]> {
    if (!options.workspaceId) return [];

    const query = options.query.toLowerCase();

    const applications = await prisma.application.findMany({
      where: {
        workspaceId: options.workspaceId,
        OR: [
          { applicantTag: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        jobPost: true,
        applicantUser: true,
      },
      take: 10,
    });

    return applications.map(a => ({
      entity: SearchEntity.APPLICATIONS,
      id: a.id,
      title: `Application for ${a.jobPost.title}`,
      description: `${a.applicantUser?.displayName || a.applicantTag} - ${a.status}`,
      url: `/workspaces/${options.workspaceId}/staff/applications/${a.id}`,
      score: this.calculateScore(query, a.applicantTag || ''),
      metadata: {
        status: a.status,
        jobTitle: a.jobPost.title,
        createdAt: a.createdAt,
      },
    }));
  }

  /**
   * Search job posts
   */
  private async searchJobPosts(options: SearchOptions): Promise<SearchResult[]> {
    if (!options.workspaceId) return [];

    const query = options.query.toLowerCase();

    const jobPosts = await prisma.jobPost.findMany({
      where: {
        workspaceId: options.workspaceId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
    });

    return jobPosts.map(j => ({
      entity: SearchEntity.JOB_POSTS,
      id: j.id,
      title: j.title,
      description: j.description.substring(0, 200),
      url: `/workspaces/${options.workspaceId}/staff/jobs/${j.id}`,
      score: this.calculateScore(query, `${j.title} ${j.description}`),
      metadata: {
        isOpen: j.isOpen,
        createdAt: j.createdAt,
      },
    }));
  }

  /**
   * Search audit logs
   */
  private async searchAuditLogs(options: SearchOptions): Promise<SearchResult[]> {
    if (!options.workspaceId) return [];

    const query = options.query.toLowerCase();

    const logs = await prisma.auditLog.findMany({
      where: {
        workspaceId: options.workspaceId,
        OR: [
          { action: { contains: query, mode: 'insensitive' } },
          { entityType: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { user: true },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    return logs.map(l => ({
      entity: SearchEntity.AUDIT_LOGS,
      id: l.id,
      title: l.action,
      description: `${l.user?.displayName || 'System'} - ${l.entityType}`,
      url: `/workspaces/${options.workspaceId}/audit`,
      score: this.calculateScore(query, `${l.action} ${l.entityType}`),
      metadata: {
        action: l.action,
        entityType: l.entityType,
        userName: l.user?.displayName,
        createdAt: l.createdAt,
      },
    }));
  }

  /**
   * Calculate relevance score
   */
  private calculateScore(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Exact match: highest score
    if (textLower === queryLower) {
      return 100;
    }

    // Starts with query: high score
    if (textLower.startsWith(queryLower)) {
      return 80;
    }

    // Contains query: medium score
    if (textLower.includes(queryLower)) {
      return 60;
    }

    // Word match: lower score
    const queryWords = queryLower.split(/\s+/);
    const textWords = textLower.split(/\s+/);
    
    let matchingWords = 0;
    for (const qWord of queryWords) {
      if (textWords.some(tWord => tWord.includes(qWord))) {
        matchingWords++;
      }
    }

    if (matchingWords > 0) {
      return (matchingWords / queryWords.length) * 40;
    }

    return 0;
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(
    query: string,
    workspaceId?: string,
    limit: number = 5
  ): Promise<string[]> {
    try {
      logger.info('Getting search suggestions', { query, workspaceId });

      const queryLower = query.toLowerCase();
      const suggestions = new Set<string>();

      // Get workspace names
      if (!workspaceId) {
        const workspaces = await prisma.workspace.findMany({
          where: {
            name: { contains: query, mode: 'insensitive' },
          },
          select: { name: true },
          take: limit,
        });
        workspaces.forEach(w => suggestions.add(w.name));
      }

      // Get product names
      if (workspaceId) {
        const products = await prisma.product.findMany({
          where: {
            workspaceId,
            name: { contains: query, mode: 'insensitive' },
          },
          select: { name: true },
          take: limit,
        });
        products.forEach(p => suggestions.add(p.name));
      }

      return Array.from(suggestions).slice(0, limit);
    } catch (error) {
      logger.error('Failed to get search suggestions', error as Error);
      return [];
    }
  }

  /**
   * Index entity for search (for future elasticsearch/algolia integration)
   */
  async indexEntity(
    entity: SearchEntity,
    id: string,
    data: Record<string, unknown>
  ): Promise<void> {
    logger.info('Indexing entity for search', { entity, id });
    // In production, integrate with Elasticsearch or Algolia
  }

  /**
   * Remove entity from search index
   */
  async removeFromIndex(entity: SearchEntity, id: string): Promise<void> {
    logger.info('Removing entity from search index', { entity, id });
    // In production, remove from Elasticsearch or Algolia
  }

  /**
   * Reindex all entities (maintenance task)
   */
  async reindexAll(workspaceId?: string): Promise<void> {
    logger.info('Starting full reindex', { workspaceId });
    // In production, batch process and reindex all entities
  }
}

export const searchService = new SearchService();
