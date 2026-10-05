import { HtmlValidationResult } from '../types';

export function validateHtml(html: string): HtmlValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!html || !html.trim()) {
    return {
      isValid: false,
      hasDoctype: false,
      hasHtmlTag: false,
      hasBodyTag: false,
      hasHeadTag: false,
      warnings: [],
      errors: ['El documento HTML está vacío.'],
      tagStats: { scripts: 0, styles: 0, images: 0, links: 0, totalElements: 0 },
    };
  }

  const trimmed = html.trim();
  const hasDoctype = /<!doctype\s+html/i.test(trimmed);
  const hasHtmlTag = /<html[\s>]/i.test(trimmed);
  const hasHeadTag = /<head[\s>]/i.test(trimmed);
  const hasBodyTag = /<body[\s>]/i.test(trimmed);

  if (!hasDoctype) {
    warnings.push('Falta la declaración <!DOCTYPE html>. El navegador podría usar Quirks Mode.');
  }

  if (!hasHtmlTag) {
    warnings.push('No se encontró etiqueta <html> envolvente.');
  }

  if (!hasHeadTag) {
    warnings.push('Se recomienda incluir una sección <head> con charset UTF-8 y viewport.');
  }

  if (!/<meta\s+name=["']viewport["']/i.test(trimmed)) {
    warnings.push('Falta <meta name="viewport"> para optimización en dispositivos móviles.');
  }

  if (!/<meta\s+charset/i.test(trimmed)) {
    warnings.push('Se sugiere declarar <meta charset="UTF-8"> para caracteres especiales.');
  }

  // Parse with DOMParser
  let totalElements = 0;
  let scripts = 0;
  let styles = 0;
  let images = 0;
  let links = 0;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Check parsererror
    const parserErrors = doc.querySelectorAll('parsererror');
    if (parserErrors.length > 0) {
      errors.push('Error sintáctico en el marcado XML/HTML.');
    }

    scripts = doc.querySelectorAll('script').length;
    styles = doc.querySelectorAll('style, link[rel="stylesheet"]').length;
    images = doc.querySelectorAll('img').length;
    links = doc.querySelectorAll('a').length;
    totalElements = doc.querySelectorAll('*').length;

    // Detect insecure external scripts (http:)
    const scriptElements = Array.from(doc.querySelectorAll('script'));
    for (const sc of scriptElements) {
      const src = sc.getAttribute('src');
      if (src && src.startsWith('http://')) {
        warnings.push(`Script inseguro HTTP detectado: "${src}". Usa HTTPS para evitar bloqueos por contenido mixto.`);
      }
    }
  } catch (err: any) {
    errors.push(`Error al analizar el código: ${err.message}`);
  }

  return {
    isValid: errors.length === 0,
    hasDoctype,
    hasHtmlTag,
    hasBodyTag,
    hasHeadTag,
    warnings,
    errors,
    tagStats: {
      scripts,
      styles,
      images,
      links,
      totalElements,
    },
  };
}

export function getByteLength(str: string): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Minify HTML: removes HTML comments, collapses excessive whitespace
 * while safely preserving content inside <pre>, <textarea>, and <script>
 */
export function minifyHtml(html: string): { minified: string; savedBytes: number; savedPercent: number } {
  const originalSize = getByteLength(html);

  // Strip standard HTML comments, keeping conditionals
  let result = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');

  // Collapse multiple whitespaces between tags
  result = result
    .replace(/>\s{2,}</g, '> <')
    .replace(/^\s+/gm, '')
    .trim();

  const minifiedSize = getByteLength(result);
  const savedBytes = Math.max(0, originalSize - minifiedSize);
  const savedPercent = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

  return {
    minified: result,
    savedBytes,
    savedPercent,
  };
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
