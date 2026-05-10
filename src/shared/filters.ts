import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export const filterOperatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'startsWith',
  'endsWith',
  'in',
  'nin',
  'between',
  'isNull',
  'isNotNull',
  'hasAttachment',
  'hasEmbed',
  'hasReaction',
  'isDeleted',
  'isEdited',
  'isDm',
]);

export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export interface FilterClause {
  field: string;
  op: FilterOperator;
  value?: unknown;
}

export interface FilterGroup {
  combinator: 'and' | 'or';
  filters: (FilterClause | FilterGroup)[];
}

export type Filter = FilterClause | FilterGroup;

/* ------------------------------------------------------------------ */
/*  Zod Schemas                                                        */
/* ------------------------------------------------------------------ */

export const filterClauseSchema: z.ZodType<FilterClause> = z.lazy(() =>
  z.object({
    field: z.string(),
    op: filterOperatorSchema,
    value: z.unknown().optional(),
  })
);

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    combinator: z.enum(['and', 'or']),
    filters: z.array(z.union([filterClauseSchema, filterGroupSchema])),
  })
);

export const filterSchema: z.ZodType<Filter> = z.union([
  filterClauseSchema,
  filterGroupSchema,
]);

/* ------------------------------------------------------------------ */
/*  evaluateFilter                                                     */
/* ------------------------------------------------------------------ */

export function evaluateFilter(
  message: Record<string, unknown>,
  filter: Filter
): boolean {
  if ('combinator' in filter) {
    if (filter.combinator === 'and') {
      return filter.filters.every((f) => evaluateFilter(message, f));
    }
    return filter.filters.some((f) => evaluateFilter(message, f));
  }

  const { field, op, value } = filter;

  // Boolean flag fields can be expressed either as operator or field+eq
  const booleanFlagFields = new Set([
    'hasAttachment',
    'hasEmbed',
    'hasReaction',
    'isDeleted',
    'isEdited',
    'isDm',
  ]);

  if (booleanFlagFields.has(field) && op === 'eq') {
    const isTrue = value !== false;
    return evaluateFilter(message, { field, op: field as FilterOperator, value: isTrue });
  }

  const messageValue = message[field];

  switch (op) {
    case 'eq':
      return messageValue === value;
    case 'neq':
      return messageValue !== value;
    case 'gt':
      return messageValue != null && value != null && messageValue > value;
    case 'gte':
      return messageValue != null && value != null && messageValue >= value;
    case 'lt':
      return messageValue != null && value != null && messageValue < value;
    case 'lte':
      return messageValue != null && value != null && messageValue <= value;
    case 'contains':
      return (
        typeof messageValue === 'string' &&
        typeof value === 'string' &&
        messageValue.includes(value)
      );
    case 'startsWith':
      return (
        typeof messageValue === 'string' &&
        typeof value === 'string' &&
        messageValue.startsWith(value)
      );
    case 'endsWith':
      return (
        typeof messageValue === 'string' &&
        typeof value === 'string' &&
        messageValue.endsWith(value)
      );
    case 'in':
      return Array.isArray(value) && value.includes(messageValue);
    case 'nin':
      return Array.isArray(value) && !value.includes(messageValue);
    case 'between':
      return (
        Array.isArray(value) &&
        value.length === 2 &&
        messageValue != null &&
        messageValue >= value[0] &&
        messageValue <= value[1]
      );
    case 'isNull':
      return messageValue == null;
    case 'isNotNull':
      return messageValue != null;
    case 'hasAttachment':
      return (
        Array.isArray(message.attachments) && message.attachments.length > 0
      );
    case 'hasEmbed':
      return (
        message.embedsJson != null &&
        String(message.embedsJson).length > 0 &&
        String(message.embedsJson) !== '[]'
      );
    case 'hasReaction':
      return (
        Array.isArray(message.reactions) && message.reactions.length > 0
      );
    case 'isDeleted':
      return message.deletedAt != null;
    case 'isEdited':
      return message.editedAt != null;
    case 'isDm':
      return message.isDm === true || message.isDm === 1;
    default:
      return false;
  }
}
