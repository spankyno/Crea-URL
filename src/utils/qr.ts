// qrcode (~23 kB) se descarga solo cuando se genera un QR
const loadQrCode = async () => (await import('qrcode')).default;

export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    const QRCode = await loadQrCode();
    return await QRCode.toDataURL(text, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Failed to generate QR Code:', err);
    throw err;
  }
}

export async function generateQrSvgString(text: string): Promise<string> {
  try {
    const QRCode = await loadQrCode();
    return await QRCode.toString(text, {
      type: 'svg',
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Failed to generate QR SVG:', err);
    throw err;
  }
}

export function downloadQrImage(dataUrl: string, filename = 'codigo-qr-creaurl.png') {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
