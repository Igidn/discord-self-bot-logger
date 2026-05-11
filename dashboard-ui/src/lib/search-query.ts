import { parse } from 'search-query-parser';
import type { Filter, FilterClause } from '../../../../src/shared/filters';

const SEARCH_KEYWORDS = [
  'in',
  'channel',
  'from',
  'author',
  'server',
  'guild',
  'before',
  'after',
  'has',
  'is',
] as const;

const FILTER_ALIASES: Record<string, string> = {
  in: 'in',
  channel: 'in',
  chanel: 'in',
  chanell: 'in',
  chl: 'in',
  from: 'from',
  form: 'from',
  author: 'from',
  user: 'from',
  usr: 'from',
  server: 'server',
  guild: 'server',
  guld: 'server',
  guilld: 'server',
  before: 'before',
  befrore: 'before',
  after: 'after',
  aftrer: 'after',
  has: 'has',
  hs: 'has',
  is: 'is',
};

const HAS_VALUE_ALIASES: Record<string, FilterClause[]> = {
  file: [{ field: 'hasAttachment', op: 'eq', value: true }],
  files: [{ field: 'hasAttachment', op: 'eq', value: true }],
  attachment: [{ field: 'hasAttachment', op: 'eq', value: true }],
  attachments: [{ field: 'hasAttachment', op: 'eq', value: true }],
  embed: [{ field: 'hasEmbed', op: 'eq', value: true }],
  embeds: [{ field: 'hasEmbed', op: 'eq', value: true }],
  reaction: [{ field: 'hasReaction', op: 'eq', value: true }],
  reactions: [{ field: 'hasReaction', op: 'eq', value: true }],
  link: [{ field: 'content', op: 'contains', value: 'http' }],
  links: [{ field: 'content', op: 'contains', value: 'http' }],
};

const IS_VALUE_ALIASES: Record<string, FilterClause[]> = {
  deleted: [{ field: 'isDeleted', op: 'eq', value: true }],
  edited: [{ field: 'isEdited', op: 'eq', value: true }],
  dm: [{ field: 'isDm', op: 'eq', value: true }],
  dms: [{ field: 'isDm', op: 'eq', value: true }],
  reply: [{ field: 'messageType', op: 'eq', value: 'reply' }],
};

type ParsedQueryObject = {
  text?: string[];
  exclude?: Record<string, unknown>;
} & Record<string, unknown>;

export interface ParsedDiscordSearchQuery {
  normalizedQuery: string;
  text: string;
  filter?: Filter;
  chips: string[];
}

export function normalizeDiscordSearchQuery(input: string) {
  return input.replace(/(^|\s)-?(\S+?):/g, (segment, prefix: string, rawKeyword: string) => {
    const keyword = rawKeyword.toLowerCase();
    const canonical = FILTER_ALIASES[keyword];

    if (!canonical) {
      return segment;
    }

    const isExcluded = segment.trimStart().startsWith('-');
    return `${prefix}${isExcluded ? '-' : ''}${canonical}:`;
  }).replace(/\s+/g, ' ').trim();
}

export function parseDiscordSearchQuery(input: string): ParsedDiscordSearchQuery {
  const normalizedQuery = normalizeDiscordSearchQuery(input);
  const parsed = parse(normalizedQuery, {
    keywords: [...SEARCH_KEYWORDS],
    tokenize: true,
    alwaysArray: true,
    offsets: false,
  });

  if (typeof parsed === 'string') {
    return {
      normalizedQuery,
      text: parsed,
      chips: parsed ? [parsed] : [],
    };
  }

  const parsedObject = parsed as ParsedQueryObject;
  const text = stringifyText(parsedObject.text);
  const clauses = buildClauses(parsedObject, false);
  const excludedClauses = buildClauses(parsedObject.exclude ?? {}, true);
  const filters = [...clauses, ...excludedClauses];
  const chips = buildChips(text, filters);

  return {
    normalizedQuery,
    text,
    filter: filters.length > 0 ? { combinator: 'and', filters } : undefined,
    chips,
  };
}

function buildClauses(source: Record<string, unknown>, excluded: boolean) {
  const clauses: FilterClause[] = [];

  appendIdClauses(clauses, 'in', source.in, 'channelId', excluded);
  appendIdClauses(clauses, 'channel', source.channel, 'channelId', excluded);
  appendIdClauses(clauses, 'from', source.from, 'authorId', excluded);
  appendIdClauses(clauses, 'author', source.author, 'authorId', excluded);
  appendIdClauses(clauses, 'server', source.server, 'guildId', excluded);
  appendIdClauses(clauses, 'guild', source.guild, 'guildId', excluded);

  appendDateClauses(clauses, source.before, 'createdAt', excluded ? 'gte' : 'lt');
  appendDateClauses(clauses, source.after, 'createdAt', excluded ? 'lte' : 'gt');
  appendAliasClauses(clauses, source.has, HAS_VALUE_ALIASES, excluded);
  appendAliasClauses(clauses, source.is, IS_VALUE_ALIASES, excluded);

  return clauses;
}

function appendIdClauses(
  clauses: FilterClause[],
  _keyword: string,
  rawValue: unknown,
  field: FilterClause['field'],
  excluded: boolean
) {
  const values = ensureArray(rawValue).map(String).map((value) => value.trim()).filter(Boolean);

  for (const value of values) {
    clauses.push({ field, op: excluded ? 'neq' : 'eq', value });
  }
}

function appendDateClauses(
  clauses: FilterClause[],
  rawValue: unknown,
  field: FilterClause['field'],
  op: FilterClause['op']
) {
  const values = ensureArray(rawValue).map(String).map((value) => value.trim()).filter(Boolean);

  for (const value of values) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      clauses.push({ field, op, value: date.toISOString() });
    }
  }
}

function appendAliasClauses(
  clauses: FilterClause[],
  rawValue: unknown,
  aliasMap: Record<string, FilterClause[]>,
  excluded: boolean
) {
  const values = ensureArray(rawValue)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  for (const value of values) {
    const mapped = aliasMap[value];
    if (!mapped) {
      continue;
    }

    for (const clause of mapped) {
      if (excluded && clause.field === 'messageType') {
        continue;
      }

      clauses.push({
        ...clause,
        value: clause.op === 'eq' && excluded ? false : clause.value,
      });
    }
  }
}

function buildChips(text: string, clauses: FilterClause[]) {
  const chips = text ? [text] : [];

  for (const clause of clauses) {
    if (clause.field === 'channelId' && clause.op === 'eq') {
      chips.push(`in:${String(clause.value)}`);
      continue;
    }
    if (clause.field === 'authorId' && clause.op === 'eq') {
      chips.push(`from:${String(clause.value)}`);
      continue;
    }
    if (clause.field === 'guildId' && clause.op === 'eq') {
      chips.push(`server:${String(clause.value)}`);
      continue;
    }
    if (clause.field === 'createdAt' && clause.op === 'lt') {
      chips.push(`before:${String(clause.value)}`);
      continue;
    }
    if (clause.field === 'createdAt' && clause.op === 'gt') {
      chips.push(`after:${String(clause.value)}`);
      continue;
    }
    if (clause.field === 'hasAttachment' && clause.value === true) {
      chips.push('has:file');
      continue;
    }
    if (clause.field === 'hasEmbed' && clause.value === true) {
      chips.push('has:embed');
      continue;
    }
    if (clause.field === 'hasReaction' && clause.value === true) {
      chips.push('has:reaction');
      continue;
    }
    if (clause.field === 'isDeleted' && clause.value === true) {
      chips.push('is:deleted');
      continue;
    }
    if (clause.field === 'isEdited' && clause.value === true) {
      chips.push('is:edited');
      continue;
    }
    if (clause.field === 'isDm' && clause.value === true) {
      chips.push('is:dm');
      continue;
    }
    if (clause.field === 'messageType' && clause.value === 'reply') {
      chips.push('is:reply');
    }
  }

  return chips;
}

function stringifyText(text: unknown) {
  return ensureArray(text)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function ensureArray(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}
