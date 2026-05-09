import { Router } from 'express';
import z from 'zod';
import { searchMessages, suggestField } from '@/database/queries.js';
import { filterSchema } from '@/shared/filters.js';
import { logger } from '@/utils/logger.js';

const router = Router();

const searchQuerySchema = z.object({
  q: z.string().optional(),
  filters: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const suggestQuerySchema = z.object({
  field: z.enum(['authorId', 'channelId', 'guildId']),
  prefix: z.string().min(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  guildId: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const query = searchQuerySchema.parse(req.query);
    let parsedFilters: unknown = undefined;

    if (query.filters) {
      try {
        const parsed = JSON.parse(query.filters);
        parsedFilters = filterSchema.parse(parsed);
      } catch (err) {
        res.status(400).json({ error: 'Invalid filters JSON', details: err });
        return;
      }
    }

    const result = searchMessages(
      query.q ?? '',
      parsedFilters as import('@/database/queries.js').MessageFilters,
      { limit: query.limit, cursor: query.cursor }
    );

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    logger.error(err, 'Search failed');
    next(err);
  }
});

router.get('/filters', (_req, res) => {
  res.json({
    availableFilters: [
      { field: 'guildId', type: 'string', operators: ['eq', 'in', 'nin'] },
      { field: 'channelId', type: 'string', operators: ['eq', 'in', 'nin'] },
      { field: 'authorId', type: 'string', operators: ['eq', 'in', 'nin', 'contains'] },
      { field: 'content', type: 'string', operators: ['contains', 'startsWith', 'endsWith', 'eq'] },
      { field: 'createdAt', type: 'timestamp', operators: ['gt', 'gte', 'lt', 'lte', 'between'] },
      { field: 'hasAttachment', type: 'boolean', operators: ['eq'] },
      { field: 'hasEmbed', type: 'boolean', operators: ['eq'] },
      { field: 'hasReaction', type: 'boolean', operators: ['eq'] },
      { field: 'isDeleted', type: 'boolean', operators: ['eq'] },
      { field: 'isEdited', type: 'boolean', operators: ['eq'] },
      { field: 'isDm', type: 'boolean', operators: ['eq'] },
      { field: 'messageType', type: 'string', operators: ['eq', 'in'] },
    ],
    operators: [
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
      'contains', 'startsWith', 'endsWith',
      'in', 'nin', 'between',
      'isNull', 'isNotNull',
    ],
    enumValues: {
      messageType: ['default', 'reply', 'pin', 'system'],
    },
  });
});

router.get('/suggest', async (req, res, next) => {
  try {
    const query = suggestQuerySchema.parse(req.query);
    const suggestions = await suggestField(
      query.field,
      query.prefix,
      query.limit,
      query.guildId
    );
    res.json(suggestions);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

export default router;
