import { PageItem, CollectionItem, PublishRequest, AdminStats, StarterTemplate, UserSession } from '../types';

class ApiService {
  private getHeaders(user: UserSession): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-id': user.id,
      'x-user-role': user.role,
    };
    if (user.email) {
      headers['x-user-email'] = user.email;
    }
    if (user.role === 'admin') {
      headers['x-admin-key'] = 'admin-secret-creaurl';
    }
    return headers;
  }

  async getPages(user: UserSession): Promise<PageItem[]> {
    const res = await fetch('/api/pages', {
      headers: this.getHeaders(user),
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

  async publishPage(payload: PublishRequest, user: UserSession): Promise<{ page: PageItem; publicUrl: string; rawUrl: string }> {
    const res = await fetch('/api/pages', {
      method: 'POST',
      headers: this.getHeaders(user),
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
      headers: this.getHeaders(user),
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
      headers: this.getHeaders(user),
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
      headers: this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al eliminar la página');
    }
  }

  async getCollections(user: UserSession): Promise<CollectionItem[]> {
    const res = await fetch('/api/collections', {
      headers: this.getHeaders(user),
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
      headers: this.getHeaders(user),
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
      headers: this.getHeaders(user),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al eliminar la colección');
    }
  }

  async getAdminStats(user: UserSession): Promise<AdminStats> {
    const res = await fetch('/api/admin/stats', {
      headers: this.getHeaders(user),
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
      headers: this.getHeaders(user),
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
