import React, { useState, useEffect } from 'react';
import { 
  FolderKanban, 
  Plus, 
  ExternalLink, 
  Trash2, 
  FileCode, 
  Layers, 
  ArrowLeft, 
  Check, 
  Sparkles,
  Eye
} from 'lucide-react';
import { CollectionItem, PageItem, UserSession } from '../types';
import { api } from '../services/api';
import { formatBytes } from '../utils/htmlValidator';

interface CollectionsViewProps {
  currentUser: UserSession;
  onViewPage: (slug: string) => void;
  selectedCollectionSlug?: string | null;
  onSelectCollection: (slug: string | null) => void;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  currentUser,
  onViewPage,
  selectedCollectionSlug,
  onSelectCollection,
}) => {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [availablePages, setAvailablePages] = useState<PageItem[]>([]);
  const [activeCollectionData, setActiveCollectionData] = useState<{
    collection: CollectionItem;
    pages: PageItem[];
  } | null>(null);

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [selectedPageSlugs, setSelectedPageSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Load collections & pages
  const loadCollections = async () => {
    setLoading(true);
    try {
      const [cols, pgs] = await Promise.all([
        api.getCollections(currentUser),
        api.getPages(currentUser),
      ]);
      setCollections(cols);
      setAvailablePages(pgs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, [currentUser]);

  // Load selected collection if present
  useEffect(() => {
    if (selectedCollectionSlug) {
      api.getCollection(selectedCollectionSlug)
        .then((data) => setActiveCollectionData(data))
        .catch((e) => {
          console.error(e);
          setActiveCollectionData(null);
        });
    } else {
      setActiveCollectionData(null);
    }
  }, [selectedCollectionSlug]);

  const handleTogglePage = (slug: string) => {
    if (selectedPageSlugs.includes(slug)) {
      setSelectedPageSlugs(selectedPageSlugs.filter((s) => s !== slug));
    } else {
      setSelectedPageSlugs([...selectedPageSlugs, slug]);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      alert('Introduce un título para la colección');
      return;
    }

    try {
      const created = await api.createCollection(
        {
          title: newTitle,
          description: newDescription,
          customSlug: newSlug || undefined,
          pageSlugs: selectedPageSlugs,
        },
        currentUser
      );
      setCollections([created, ...collections]);
      setIsCreating(false);
      setNewTitle('');
      setNewDescription('');
      setNewSlug('');
      setSelectedPageSlugs([]);
    } catch (err: any) {
      alert(err.message || 'Error al crear la colección');
    }
  };

  const handleDeleteCollection = async (slug: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta colección? Las páginas individuales no se borrarán.')) return;
    try {
      await api.deleteCollection(slug, currentUser);
      setCollections(collections.filter((c) => c.slug !== slug));
      if (selectedCollectionSlug === slug) {
        onSelectCollection(null);
      }
    } catch (err: any) {
      alert(err.message || 'Error al eliminar');
    }
  };

  // If a specific collection is selected for viewing
  if (activeCollectionData) {
    const { collection, pages } = activeCollectionData;
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-200">
        <button
          onClick={() => onSelectCollection(null)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver a todas las colecciones</span>
        </button>

        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FolderKanban className="w-5 h-5 text-emerald-400" />
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {collection.title}
                </h1>
              </div>
              <p className="text-xs text-slate-400 max-w-xl">
                {collection.description || 'Colección de páginas web estáticas.'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-md">
                /c/{collection.slug}
              </span>
            </div>
          </div>
        </div>

        {/* Pages Grid in Collection */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pages.length === 0 ? (
            <div className="col-span-full p-12 text-center text-slate-400 bg-[#0f172a] border border-slate-800 rounded-xl">
              <p className="text-sm">Esta colección aún no tiene páginas asignadas.</p>
            </div>
          ) : (
            pages.map((page) => (
              <div
                key={page.id}
                className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-lg hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                {/* Miniature Preview Frame */}
                <div className="h-44 bg-slate-950 relative overflow-hidden border-b border-slate-800 group">
                  <iframe
                    src={`/raw/${page.slug}`}
                    title={page.title}
                    sandbox="allow-scripts"
                    className="w-[200%] h-[200%] transform scale-50 origin-top-left pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity"
                  />
                  <div className="absolute inset-0 bg-transparent" />
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-100 text-sm mb-1">{page.title}</h3>
                    <p className="text-xs text-slate-400 font-mono">/p/{page.slug}</p>
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800 text-xs">
                    <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {page.viewsCount || 0} visitas
                    </span>
                    <button
                      onClick={() => onViewPage(page.slug)}
                      className="px-3 py-1 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <span>Abrir</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Colecciones de Páginas</span>
            <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              URL: /c/{'{slug}'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Agrupa varios prototipos o proyectos estáticos bajo un solo enlace compartible con vista de galería.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-3.5 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isCreating ? 'Cancelar' : 'Nueva Colección'}</span>
        </button>
      </div>

      {/* Creation Form */}
      {isCreating && (
        <form
          onSubmit={handleCreateCollection}
          className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
        >
          <h2 className="text-base font-bold text-white">Crear Nueva Colección</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Título de la Colección</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ej: Mis Diseños de E-commerce..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Slug Personalizado (Opcional)</label>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300">
                <span className="text-slate-500 font-mono">/c/</span>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  placeholder="mis-proyectos"
                  className="bg-transparent border-0 outline-none w-full text-white font-mono ml-1"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Descripción Breve</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe el propósito o contenido de este grupo de páginas..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            {/* Select Pages */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Selecciona las páginas a incluir:
              </label>
              {availablePages.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  Aún no has subido ninguna página para agrupar.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800">
                  {availablePages.map((p) => {
                    const isSelected = selectedPageSlugs.includes(p.slug);
                    return (
                      <button
                        type="button"
                        key={p.slug}
                        onClick={() => handleTogglePage(p.slug)}
                        className={`text-left p-2 rounded-md border text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="truncate mr-2 font-medium">{p.title}</span>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">/p/{p.slug}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors"
            >
              Guardar Colección
            </button>
          </div>
        </form>
      )}

      {/* Collections Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {collections.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-400 bg-[#0f172a] border border-slate-800 rounded-xl">
            <FolderKanban className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Sin colecciones todavía</h3>
            <p className="text-xs text-slate-500 mb-4">
              Crea tu primera colección para presentar una serie de páginas web o prototipos a tus clientes.
            </p>
          </div>
        ) : (
          collections.map((col) => (
            <div
              key={col.id}
              className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-emerald-400">/c/{col.slug}</span>
                  <button
                    onClick={() => handleDeleteCollection(col.slug)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                    title="Eliminar colección"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h3 className="font-bold text-white text-base mb-1 group-hover:text-emerald-300 transition-colors">
                  {col.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 mb-4">
                  {col.description || 'Sin descripción'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs">
                <span className="text-slate-500 font-mono text-[11px]">
                  {col.pageSlugs.length} página(s)
                </span>
                <button
                  onClick={() => onSelectCollection(col.slug)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <span>Ver Colección</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
