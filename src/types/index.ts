export type UserRole = 'anon' | 'user' | 'admin';

export interface UserSession {
  id: string;
  email?: string;
  name: string;
  role: UserRole;
  isRegistered: boolean;
  avatarUrl?: string;
}

export interface PageItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  sizeBytes: number;
  userId: string;
  userEmail?: string;
  userRole: UserRole;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  isEphemeral: boolean;
  hasPassword: boolean;
  viewsCount: number;
  lastViewedAt?: string;
  collectionId?: string;
}

export interface CollectionItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  userId: string;
  userEmail?: string;
  pageSlugs: string[];
  createdAt: string;
  updatedAt: string;
  pages?: PageItem[];
}

export interface PublishRequest {
  html: string;
  title: string;
  description?: string;
  customSlug?: string;
  password?: string;
  isEphemeral?: boolean;
  collectionId?: string;
}

export interface AdminStats {
  totalPages: number;
  totalViews: number;
  totalSizeBytes: number;
  activePages: number;
  expiredPages: number;
  passwordProtectedPages: number;
  ephemeralPages: number;
  totalCollections: number;
  storageDirectory?: string;
}

export interface HtmlValidationResult {
  isValid: boolean;
  hasDoctype: boolean;
  hasHtmlTag: boolean;
  hasBodyTag: boolean;
  hasHeadTag: boolean;
  warnings: string[];
  errors: string[];
  tagStats: {
    scripts: number;
    styles: number;
    images: number;
    links: number;
    totalElements: number;
  };
}

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  html: string;
}
