import { useState } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';

export type FilterOperator =
  | 'eq' | 'neq'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startsWith' | 'endsWith'
  | 'in' | 'nin'
  | 'between'
  | 'isNull' | 'isNotNull'
  | 'hasAttachment' | 'hasEmbed' | 'hasReaction'
  | 'isDeleted' | 'isEdited' | 'isDm';

export interface FilterClause {
  field: string;
  op: FilterOperator;
  value?: unknown;
}

export interface FilterGroup {
  combinator: 'and' | 'or';
  filters: (FilterClause | FilterGroup)[];
}

const FIELDS = [
  { value: 'guildId', label: 'Guild', type: 'string' },
  { value: 'channelId', label: 'Channel', type: 'string' },
  { value: 'authorId', label: 'Author', type: 'string' },
  { value: 'content', label: 'Content', type: 'string' },
  { value: 'createdAt', label: 'Created At', type: 'timestamp' },
  { value: 'hasAttachment', label: 'Has Attachment', type: 'boolean' },
  { value: 'hasEmbed', label: 'Has Embed', type: 'boolean' },
  { value: 'hasReaction', label: 'Has Reaction', type: 'boolean' },
  { value: 'isDeleted', label: 'Is Deleted', type: 'boolean' },
  { value: 'isEdited', label: 'Is Edited', type: 'boolean' },
  { value: 'isDm', label: 'Is DM', type: 'boolean' },
];

const OPERATORS: { value: FilterOperator; label: string; types: string[] }[] = [
  { value: 'eq', label: '=', types: ['string', 'timestamp', 'boolean'] },
  { value: 'neq', label: '!=', types: ['string', 'timestamp', 'boolean'] },
  { value: 'gt', label: '>', types: ['timestamp'] },
  { value: 'gte', label: '>=', types: ['timestamp'] },
  { value: 'lt', label: '<', types: ['timestamp'] },
  { value: 'lte', label: '<=', types: ['timestamp'] },
  { value: 'contains', label: 'contains', types: ['string'] },
  { value: 'startsWith', label: 'starts with', types: ['string'] },
  { value: 'endsWith', label: 'ends with', types: ['string'] },
  { value: 'in', label: 'in', types: ['string'] },
  { value: 'nin', label: 'not in', types: ['string'] },
  { value: 'between', label: 'between', types: ['timestamp'] },
  { value: 'isNull', label: 'is null', types: ['string', 'timestamp', 'boolean'] },
  { value: 'isNotNull', label: 'is not null', types: ['string', 'timestamp', 'boolean'] },
  { value: 'hasAttachment', label: 'has attachment', types: ['boolean'] },
  { value: 'hasEmbed', label: 'has embed', types: ['boolean'] },
  { value: 'hasReaction', label: 'has reaction', types: ['boolean'] },
  { value: 'isDeleted', label: 'is deleted', types: ['boolean'] },
  { value: 'isEdited', label: 'is edited', types: ['boolean'] },
  { value: 'isDm', label: 'is DM', types: ['boolean'] },
];

interface FilterBuilderProps {
  initial?: FilterGroup;
  onSave: (group: FilterGroup) => void;
  onClose: () => void;
}

export function FilterBuilder({ initial, onSave, onClose }: FilterBuilderProps) {
  const [combinator, setCombinator] = useState<'and' | 'or'>(initial?.combinator ?? 'and');
  const [rows, setRows] = useState<FilterClause[]>(
    initial?.filters.filter((f): f is FilterClause => !('combinator' in f)) ?? []
  );

  const addRow = () => {
    setRows((prev) => [...prev, { field: 'content', op: 'contains', value: '' }]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<FilterClause>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSave = () => {
    const validRows = rows.filter((r) => {
      if (['isNull', 'isNotNull', 'hasAttachment', 'hasEmbed', 'hasReaction', 'isDeleted', 'isEdited', 'isDm'].includes(r.op)) {
        return true;
      }
      return r.value !== undefined && r.value !== '';
    });
    onSave({ combinator, filters: validRows });
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filter Builder</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Match</span>
        <select
          value={combinator}
          onChange={(e) => setCombinator(e.target.value as 'and' | 'or')}
          className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm"
        >
          <option value="and">All</option>
          <option value="or">Any</option>
        </select>
        <span className="text-sm text-gray-400">of the following:</span>
      </div>

      <div className="space-y-2">
        {rows.map((row, idx) => {
          const fieldDef = FIELDS.find((f) => f.value === row.field);
          const type = fieldDef?.type ?? 'string';
          const availableOps = OPERATORS.filter((o) => o.types.includes(type));

          return (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={row.field}
                onChange={(e) => {
                  const newField = e.target.value;
                  const newType = FIELDS.find((f) => f.value === newField)?.type ?? 'string';
                  const newOps = OPERATORS.filter((o) => o.types.includes(newType));
                  const newOp = newOps.find((o) => o.value === row.op) ? row.op : newOps[0]?.value ?? 'eq';
                  updateRow(idx, { field: newField, op: newOp as FilterOperator, value: undefined });
                }}
                className="bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm"
              >
                {FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                value={row.op}
                onChange={(e) => updateRow(idx, { op: e.target.value as FilterOperator })}
                className="bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm"
              >
                {availableOps.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              {!['isNull', 'isNotNull', 'hasAttachment', 'hasEmbed', 'hasReaction', 'isDeleted', 'isEdited', 'isDm'].includes(row.op) && (
                <input
                  type={type === 'timestamp' ? 'datetime-local' : 'text'}
                  value={typeof row.value === 'string' ? row.value : ''}
                  onChange={(e) => updateRow(idx, { value: e.target.value })}
                  placeholder="Value"
                  className="flex-1 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-discord-blurple"
                />
              )}

              <button
                onClick={() => removeRow(idx)}
                className="p-1.5 rounded hover:bg-discord-red/10 text-gray-400 hover:text-discord-red transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={addRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add filter
        </button>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-discord-blurple hover:bg-discord-blurple/90 text-sm font-medium transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          Apply
        </button>
      </div>
    </div>
  );
}
