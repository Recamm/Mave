import { getSupabaseClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type CategoryRow = Database['public']['Tables']['categories']['Row'];

export type Category = Pick<CategoryRow, 'id' | 'name' | 'source' | 'archived_at'>;

type CategoryClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type CategoryClientProvider = () => CategoryClient | null;

const categoryFields = 'id,name,source,archived_at';

export function createCategoryService(clientProvider: CategoryClientProvider = getSupabaseClient) {
  function requireClient(): CategoryClient {
    const client = clientProvider();

    if (!client) {
      throw new Error('Supabase is not configured.');
    }

    return client;
  }

  return {
    async listCategories(): Promise<Category[]> {
      const { data, error } = await requireClient()
        .from('categories')
        .select(categoryFields)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      return data;
    },

    async listActiveCategories(): Promise<Category[]> {
      const { data, error } = await requireClient()
        .from('categories')
        .select(categoryFields)
        .is('archived_at', null)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      return data;
    },

    async createCategory(name: string): Promise<Category> {
      const { data, error } = await requireClient()
        .from('categories')
        .insert({ name: name.trim() })
        .select(categoryFields)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async renameCategory(id: string, name: string): Promise<Category> {
      const { data, error } = await requireClient()
        .from('categories')
        .update({ name: name.trim() })
        .eq('id', id)
        .select(categoryFields)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async archiveCategory(id: string): Promise<Category> {
      const { data, error } = await requireClient()
        .from('categories')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .is('archived_at', null)
        .select(categoryFields)
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
  };
}

export const categoryService = createCategoryService();
