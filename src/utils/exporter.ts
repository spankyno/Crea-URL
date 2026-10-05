import JSZip from 'jszip';
import { PageItem } from '../types';

export function downloadHtmlFile(html: string, filename = 'index.html') {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadZipBundle(page: Partial<PageItem>, html: string) {
  const zip = new JSZip();
  const slug = page.slug || 'pagina';

  // Add index.html
  zip.file('index.html', html);

  // Add metadata.json
  const meta = {
    title: page.title || 'Página Estática',
    description: page.description || '',
    slug: page.slug,
    exportedAt: new Date().toISOString(),
    generator: 'Crea URL (host-html style)',
    version: '1.0.0',
  };
  zip.file('metadata.json', JSON.stringify(meta, null, 2));

  // Add README.md
  const readme = `# ${page.title || 'Página HTML'}
Exportado desde **Crea URL** (${window.location.origin}/p/${slug})

## Archivos incluidos
- \`index.html\`: Código HTML completo original listo para alojar en cualquier CDN, Cloudflare Pages, Vercel, Netlify o servidor local.
- \`metadata.json\`: Información descriptiva del proyecto.

## Cómo visualizar localmente
Abre \`index.html\` con cualquier navegador web moderno o ejecuta:
\`\`\`bash
npx serve .
\`\`\`
`;
  zip.file('README.md', readme);

  // Generate zip blob
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-bundle.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
