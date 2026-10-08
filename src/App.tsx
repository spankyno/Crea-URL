import React, { useState, useEffect, Suspense } from 'react';
import { lazyWithReload } from './utils/lazyWithReload';
import { STARTER_HTML } from './constants/starterHtml';
import { Navbar } from './components/Navbar';
import { EditorZone } from './components/EditorZone';
import { PreviewZone } from './components/PreviewZone';
import { Footer } from './components/Footer';

// Pantallas secundarias: se descargan solo cuando se necesitan (reduce el paquete inicial)
const PublishModal = lazyWithReload(() => import('./components/PublishModal').then((m) => ({ default: m.PublishModal })));
const DashboardView = lazyWithReload(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const CollectionsView = lazyWithReload(() => import('./components/CollectionsView').then((m) => ({ default: m.CollectionsView })));
const AdminView = lazyWithReload(() => import('./components/AdminView').then((m) => ({ default: m.AdminView })));
const PublicPageView = lazyWithReload(() => import('./components/PublicPageView').then((m) => ({ default: m.PublicPageView })));
const TemplatesModal = lazyWithReload(() => import('./components/TemplatesModal').then((m) => ({ default: m.TemplatesModal })));

const LoadingFallback: React.FC<{ fullScreen?: boolean }> = ({ fullScreen }) => (
  <div
    className={`flex items-center justify-center text-xs text-slate-400 ${fullScreen ? 'min-h-screen bg-app' : 'py-16'}`}
    role="status"
  >
    Cargando…
  </div>
);
import { UserSession, PageItem, CollectionItem, StarterTemplate } from './types';
import { api } from './services/api';
import { FileCode, Eye } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';

const IS_CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const ANON_ID_KEY = 'creaurl_anon_id';

function makeAnonSession(): UserSession {
  let id = '';
  try {
    id = localStorage.getItem(ANON_ID_KEY) || '';
  } catch (e) {}
  if (!/^anon_[A-Za-z0-9]{4,32}$/.test(id)) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    id = 'anon_' + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
    try {
      localStorage.setItem(ANON_ID_KEY, id);
    } catch (e) {}
  }
  return { id, name: 'Invitado Anónimo', role: 'anon', isRegistered: false };
}

function ClerkUserSync({ onUserChange }: { onUserChange: (user: UserSession) => void }) {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && user) {
      const email = user.primaryEmailAddress?.emailAddress;
      const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'admin@host-html.com';
      const isRoleAdmin =
        user.publicMetadata?.role === 'admin' ||
        (email && email.toLowerCase() === adminEmail.toLowerCase());

      onUserChange({
        id: user.id,
        email: email || undefined,
        name: user.fullName || user.username || 'Usuario Registrado',
        role: isRoleAdmin ? 'admin' : 'user',
        isRegistered: true,
        avatarUrl: user.imageUrl,
      });
    } else {
      // Sin sesión de Clerk: volver a invitado (conserva su id anónimo para ver sus páginas)
      onUserChange(makeAnonSession());
    }
  }, [isLoaded, isSignedIn, user, onUserChange]);

  return null;
}



export default function App() {
  // Routing state
  const [currentTab, setCurrentTab] = useState<'editor' | 'dashboard' | 'collections' | 'admin'>('editor');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [activeCollectionSlug, setActiveCollectionSlug] = useState<string | null>(null);

  // User state (Clerk simulation)
  const [currentUser, setCurrentUser] = useState<UserSession>(() => {
    // En producción, las sesiones registradas solo existen con Clerk (el servidor las verifica)
    if (!IS_CLERK_ENABLED && !import.meta.env.DEV) return makeAnonSession();
    try {
      const saved = localStorage.getItem('creaurl_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return makeAnonSession();
  });

  // Modo edición: slug de la página publicada que se está editando (null = página nueva)
  const [editingSlug, setEditingSlug] = useState<string | null>(() => {
    try {
      return localStorage.getItem('creaurl_editing_slug') || null;
    } catch (e) {
      return null;
    }
  });
  const [publishWasUpdate, setPublishWasUpdate] = useState<boolean>(false);

  useEffect(() => {
    try {
      if (editingSlug) localStorage.setItem('creaurl_editing_slug', editingSlug);
      else localStorage.removeItem('creaurl_editing_slug');
    } catch (e) {}
  }, [editingSlug]);

  // Editor states
  const [html, setHtml] = useState<string>(() => {
    try {
      const draft = localStorage.getItem('creaurl_draft_html');
      if (draft) {
        // Migración: borradores antiguos guardados con el enlace a host-html.com
        return draft.replace(
          /href=(["'])https?:\/\/(www\.)?host-html\.com\/?\1/g,
          `href="${window.location.origin}/acerca-de"`
        );
      }
    } catch (e) {}
    return STARTER_HTML;
  });

  const [title, setTitle] = useState<string>(() => {
    try {
      return localStorage.getItem('creaurl_draft_title') || '';
    } catch (e) {}
    return '';
  });

  const [description, setDescription] = useState<string>('');
  const [customSlug, setCustomSlug] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isEphemeral, setIsEphemeral] = useState<boolean>(false);
  const [collectionId, setCollectionId] = useState<string>('');
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  // Modals & Panels
  const [publishedPage, setPublishedPage] = useState<PageItem | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor');
  // Tema: oscuro por defecto; la preferencia se guarda y se comparte con la página «Acerca de»
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('creaurl_theme') !== 'light';
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.classList.toggle('light', !darkMode);
    try {
      localStorage.setItem('creaurl_theme', darkMode ? 'dark' : 'light');
    } catch (e) {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#0b0f17' : '#f8fafc');
  }, [darkMode]);

  // Sync user state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('creaurl_user', JSON.stringify(currentUser));
    } catch (e) {}
  }, [currentUser]);

  // Load collections for dropdown
  useEffect(() => {
    if (currentUser.isRegistered) {
      api.getCollections(currentUser)
        .then(setCollections)
        .catch(console.error);
    }
  }, [currentUser]);

  // Parse path on initial load & handle browser back/forward
  useEffect(() => {
    const handleLocation = () => {
      const path = window.location.pathname;
      if (path.startsWith('/p/')) {
        const slug = path.replace('/p/', '').split('/')[0];
        setActiveSlug(slug);
      } else if (path.startsWith('/c/')) {
        const slug = path.replace('/c/', '').split('/')[0];
        setActiveCollectionSlug(slug);
        setCurrentTab('collections');
      } else if (path === '/admin') {
        setCurrentTab('admin');
      } else if (path === '/dashboard') {
        setCurrentTab('dashboard');
      } else {
        setActiveSlug(null);
        setActiveCollectionSlug(null);
      }
    };

    handleLocation();
    window.addEventListener('popstate', handleLocation);
    return () => window.removeEventListener('popstate', handleLocation);
  }, []);

  const navigateTo = (tab: 'editor' | 'dashboard' | 'collections' | 'admin', path = '/') => {
    setCurrentTab(tab);
    setActiveSlug(null);
    setActiveCollectionSlug(null);
    window.history.pushState({}, '', path);
  };

  const handleViewPage = (slug: string) => {
    setActiveSlug(slug);
    window.history.pushState({}, '', `/p/${slug}`);
  };

  const handleViewCollection = (slug: string) => {
    setActiveCollectionSlug(slug);
    setCurrentTab('collections');
    window.history.pushState({}, '', `/c/${slug}`);
  };

  const handleNewPage = () => {
    setEditingSlug(null);
    setHtml(STARTER_HTML);
    setTitle('');
    setDescription('');
    setCustomSlug('');
    setPassword('');
    setIsEphemeral(false);
    setCollectionId('');
    navigateTo('editor', '/');
  };

  // Cargar una página publicada en el editor para modificarla (misma URL)
  const handleEditPage = async (slug: string) => {
    try {
      const { page, html: sourceHtml } = await api.getPageSource(slug, currentUser);
      setHtml(sourceHtml);
      setTitle(page.title || '');
      setDescription(page.description || '');
      setCustomSlug('');
      setPassword('');
      setIsEphemeral(false);
      setCollectionId('');
      setEditingSlug(slug);
      navigateTo('editor', '/');
    } catch (err: any) {
      alert(err.message || 'No se pudo cargar la página para editarla');
    }
  };

  // Publish Page Handler
  const handlePublish = async () => {
    if (!html.trim()) {
      alert('El código HTML no puede estar vacío');
      return;
    }

    setIsPublishing(true);
    try {
      if (editingSlug) {
        const upd = await api.updatePage(
          editingSlug,
          { html, title: title || 'Página Sin Título', description },
          currentUser
        );
        setPublishWasUpdate(true);
        setPublishedPage(upd.page);
        return;
      }
      setPublishWasUpdate(false);
      const res = await api.publishPage(
        {
          html,
          title: title || 'Página Sin Título',
          description,
          customSlug: customSlug || undefined,
          password: password || undefined,
          isEphemeral,
          collectionId: collectionId || undefined,
        },
        currentUser
      );
      setPublishedPage(res.page);
    } catch (err: any) {
      alert(err.message || 'Error al publicar la página');
    } finally {
      setIsPublishing(false);
    }
  };

  // If viewing a public page `/p/:slug`
  if (activeSlug) {
    return (
      <Suspense fallback={<LoadingFallback fullScreen />}>
        <PublicPageView
          slug={activeSlug}
          onBack={() => {
            setActiveSlug(null);
            window.history.pushState({}, '', '/');
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors bg-app text-slate-100`}>
      {IS_CLERK_ENABLED && <ClerkUserSync onUserChange={setCurrentUser} />}
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={(tab) => navigateTo(tab, tab === 'editor' ? '/' : `/${tab}`)}
        currentUser={currentUser}
        setCurrentUser={setCurrentUser}
        onOpenTemplates={() => setShowTemplatesModal(true)}
        onNewPage={handleNewPage}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* Main Content Viewports */}
      <main className="flex-1 flex flex-col">
        <h1 className="sr-only">Crea URL: publica páginas HTML gratis con URL pública</h1>
        {currentTab === 'editor' && (
          <div className="flex-1 flex flex-col p-3 sm:p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
            {/* Mobile View Toggle Segmented Control */}
            <div className="flex lg:hidden items-center justify-center mb-3">
              <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 w-full max-w-xs">
                <button
                  onClick={() => setMobileView('editor')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                    mobileView === 'editor' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Editor & Ajustes</span>
                </button>
                <button
                  onClick={() => setMobileView('preview')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                    mobileView === 'preview' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Vista Previa</span>
                </button>
              </div>
            </div>

            {/* Split Screen Container */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-6rem)] min-h-[640px]">
              {/* Left Column: Editor Zone */}
              <div className={`h-full flex flex-col ${mobileView === 'editor' ? 'flex' : 'hidden lg:flex'}`}>
                <EditorZone
                  html={html}
                  setHtml={setHtml}
                  title={title}
                  setTitle={setTitle}
                  description={description}
                  setDescription={setDescription}
                  customSlug={customSlug}
                  setCustomSlug={setCustomSlug}
                  password={password}
                  setPassword={setPassword}
                  isEphemeral={isEphemeral}
                  setIsEphemeral={setIsEphemeral}
                  collectionId={collectionId}
                  setCollectionId={setCollectionId}
                  collections={collections}
                  currentUser={currentUser}
                  onPublish={handlePublish}
                  isPublishing={isPublishing}
                  editingSlug={editingSlug}
                  onCancelEdit={() => setEditingSlug(null)}
                  onOpenTemplates={() => setShowTemplatesModal(true)}
                />
              </div>

              {/* Right Column: Preview Zone */}
              <div className={`h-full flex flex-col ${mobileView === 'preview' ? 'flex' : 'hidden lg:flex'}`}>
                <PreviewZone
                  html={html}
                  onOpenTemplates={() => setShowTemplatesModal(true)}
                />
              </div>
            </div>
          </div>
        )}

        <Suspense fallback={<LoadingFallback />}>
        {currentTab === 'dashboard' && (
          <DashboardView
            currentUser={currentUser}
            onViewPage={handleViewPage}
            onEditPage={handleEditPage}
            onViewCollection={handleViewCollection}
            onCreateNewPage={handleNewPage}
            onSwitchToCollections={() => setCurrentTab('collections')}
          />
        )}

        {currentTab === 'collections' && (
          <CollectionsView
            currentUser={currentUser}
            onViewPage={handleViewPage}
            selectedCollectionSlug={activeCollectionSlug}
            onSelectCollection={(slug) => {
              setActiveCollectionSlug(slug);
              if (!slug) window.history.pushState({}, '', '/collections');
            }}
          />
        )}

        {currentTab === 'admin' && (
          <AdminView
            currentUser={currentUser}
            onViewPage={handleViewPage}
          />
        )}
        </Suspense>
      </main>

      {/* Footer */}
      <Footer />

      {/* Publish Success Modal */}
      {publishedPage && (
        <Suspense fallback={null}>
        <PublishModal
          page={publishedPage}
          isUpdate={publishWasUpdate}
          rawHtml={html}
          onClose={() => setPublishedPage(null)}
          onViewPage={(slug) => {
            setPublishedPage(null);
            handleViewPage(slug);
          }}
        />
        </Suspense>
      )}

      {/* Starter Templates Modal */}
      {showTemplatesModal && (
      <Suspense fallback={null}>
      <TemplatesModal
        isOpen={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
        onSelectTemplate={(tpl: StarterTemplate) => {
          setHtml(tpl.html);
          setTitle(tpl.name);
          setDescription(tpl.description);
        }}
      />
      </Suspense>
      )}
    </div>
  );
}
