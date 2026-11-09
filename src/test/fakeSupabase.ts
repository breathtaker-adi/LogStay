// src/test/fakeSupabase.ts
// Test helper: In-memory Supabase mock client that records calls and executes scripted outputs

export function fakeSupabase(script: Record<string, any> = {}) {
  const calls: { fn: string; args: any }[] = [];
  const queryLog: { table: string; method: string; args: any }[] = [];

  const createQueryBuilder = (table: string) => {
    const builder: any = {
      select: (cols = '*') => {
        queryLog.push({ table, method: 'select', args: cols });
        return builder;
      },
      eq: (col: string, val: any) => {
        queryLog.push({ table, method: 'eq', args: [col, val] });
        return builder;
      },
      in: (col: string, vals: any[]) => {
        queryLog.push({ table, method: 'in', args: [col, vals] });
        return builder;
      },
      order: (col: string, opts: any) => {
        queryLog.push({ table, method: 'order', args: [col, opts] });
        return builder;
      },
      limit: (n: number) => {
        queryLog.push({ table, method: 'limit', args: n });
        return builder;
      },
      single: async () => {
        return script[`${table}:single`] || script[table] || { data: null, error: null };
      },
      maybeSingle: async () => {
        return script[`${table}:maybeSingle`] || script[table] || { data: null, error: null };
      },
      insert: async (data: any) => {
        queryLog.push({ table, method: 'insert', args: data });
        return script[`${table}:insert`] || { data, error: null };
      },
      update: (data: any) => {
        queryLog.push({ table, method: 'update', args: data });
        return builder;
      },
      delete: () => {
        queryLog.push({ table, method: 'delete', args: null });
        return builder;
      },
      then: (resolve: any, reject: any) => {
        const res = script[table] || { data: [], error: null };
        return Promise.resolve(res).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    calls,
    queryLog,
    rpc: async (fn: string, args: any) => {
      calls.push({ fn, args });
      const r = script[fn];
      return typeof r === 'function' ? r(args) : r ?? { data: null, error: null };
    },
    from: (table: string) => createQueryBuilder(table),
    auth: {
      getUser: async () => ({
        data: { user: script.user || { id: '00000000-0000-0000-0000-000000000001' } },
        error: null,
      }),
    },
  };
}

