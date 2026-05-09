import { Router } from 'express';
import z from 'zod';
import { createExportJob, getExportJob, type ExportFilters } from '@/services/exporter.js';
import { logger } from '@/utils/logger.js';
import { filterSchema } from '@/shared/filters.js';

const router = Router();

const exportQuery = z.object({
  format: z.enum(['jsonl', 'csv', 'html']),
  filters: z.string().optional(),
});

router.post('/messages', async (req, res, next) => {
  try {
    const query = exportQuery.parse(req.query);
    let filters: ExportFilters = {};

    if (req.query.filters && typeof req.query.filters === 'string') {
      try {
        const parsed = JSON.parse(req.query.filters);
        filterSchema.parse(parsed);
        // Cast parsed filters to the exporter's simpler filter shape
        filters = parsed as ExportFilters;
      } catch (err) {
        res.status(400).json({ error: 'Invalid filters JSON', details: err });
        return;
      }
    }

    const jobId = createExportJob(query.format, filters);
    logger.info({ jobId, format: query.format }, 'Export job created');
    res.status(202).json({ jobId, status: 'pending' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    next(err);
  }
});

router.get('/:jobId', async (req, res, next) => {
  try {
    const job = getExportJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }

    if (job.status === 'completed' && job.filePath) {
      res.json({ ...job, download: job.filePath });
      return;
    }

    res.json(job);
  } catch (err) {
    next(err);
  }
});

export default router;
