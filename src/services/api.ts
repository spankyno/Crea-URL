import { PageItem, CollectionItem, PublishRequest, AdminStats, StarterTemplate, UserSession } from '../types';

class ApiService {
  /**
   * Cabeceras de cada petición. Si hay sesión de Clerk se envía su token (JWT),
   * que el Worker verifica. x-user-id solo identifica a invitados anónimos.
   */
  private async getHeaders(user: UserSession): Promise<HeadersInit> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': user.id,
    };
    try {
      const token = await (window as any).Clerk?.session?.getToken?.();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {
      console.warn('No se pudo obtener el token de sesión:', e);
    }
    // Solo para el servidor local de desarrollo (server.ts), que confía en estas cabeceras.
    // El Worker de producción las ignora y verifica el token de Clerk.
    if (import.meta.env.DEV) {
      headers['x-user-role'] = user.role;
      if (user.email) headers['x-user-email'] = user.email;
      if (user.role === 'admin') headers['x-admin-key'] = 'admin-secret-creaurl';
    }
    return headers;
  }

  async getPages(user: UserSession): Promise<PageItem[]> {
    const res = await fetch('/api/pages', {
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al obtener la lista de páginas');
    }
    const data = await res.json();
    return data.pages || [];
  }

  async getPage(slug: string): Promise<{ page: PageItem; hasPassword: boolean; html?: string }> {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Página no encontrada');
    }
    return res.json();
  }

  async unlockPage(slug: string, password: string): Promise<{ success: boolean; html: string }> {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Contraseña incorrecta');
    }
    return res.json();
  }

  /** HTML original de una página propia (también si tiene contraseña), para editarla. */
  async getPageSource(slug: string, user: UserSession): Promise<{ page: PageItem; html: string }> {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}/source`, {
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo cargar la página para editarla');
    }
    return res.json();
  }

  /** Actualiza el contenido de una página manteniendo su URL. */
  async updatePage(
    slug: string,
    payload: { html: string; title: string; description?: string },
    user: UserSession
  ): Promise<{ page: PageItem }> {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: await this.getHeaders(user),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al guardar los cambios');
    }
    return res.json();
  }

  async publishPage(payload: PublishRequest, user: UserSession): Promise<{ page: PageItem; publicUrl: string; rawUrl: string }> {
    const res = await fetch('/api/pages', {
      method: 'POST',
      headers: await this.getHeaders(user),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al publicar la página');
    }
    return res.json();
  }

  async extendPage(slug: string, user: UserSession): Promise<PageItem> {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}/extend`, {
      method: 'PATCH',
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo extender la expiración');
    }
    const data = await res.json();
    return data.page;
  }

  async updatePagePassword(slug: string, password: string, user: UserSession): Promise<PageItem> {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}/password`, {
      method: 'PATCH',
      headers: await this.getHeaders(user),
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al actualizar la contraseña');
    }
    const data = await res.json();
    return data.page;
  }

  async deletePage(slug: string, user: UserSession): Promise<void> {
    const res = await fetch(`/api/pages/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al eliminar la página');
    }
  }

  async getCollections(user: UserSession): Promise<CollectionItem[]> {
    const res = await fetch('/api/collections', {
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al obtener colecciones');
    }
    const data = await res.json();
    return data.collections || [];
  }

  async getCollection(slug: string): Promise<{ collection: CollectionItem; pages: PageItem[] }> {
    const res = await fetch(`/api/collections/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Colección no encontrada');
    }
    return res.json();
  }

  async createCollection(
    data: { title: string; description?: string; customSlug?: string; pageSlugs: string[] },
    user: UserSession
  ): Promise<CollectionItem> {
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: await this.getHeaders(user),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al crear la colección');
    }
    const result = await res.json();
    return result.collection;
  }

  async deleteCollection(slug: string, user: UserSession): Promise<void> {
    const res = await fetch(`/api/collections/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al eliminar la colección');
    }
  }

  async getAdminStats(user: UserSession): Promise<AdminStats> {
    const res = await fetch('/api/admin/stats', {
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al obtener estadísticas de administración');
    }
    return res.json();
  }

  async purgeExpiredPages(user: UserSession): Promise<{ purgedCount: number; remainingPages: number }> {
    const res = await fetch('/api/admin/purge-expired', {
      method: 'POST',
      headers: await this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al purgar páginas');
    }
    return res.json();
  }

  async getTemplates(): Promise<StarterTemplate[]> {
    const res = await fetch('/api/templates');
    if (!res.ok) return [];
    const data = await res.json();
    return data.templates || [];
  }
}

export const api = new ApiService();
