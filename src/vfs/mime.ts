// AetherOS - MIME Type Detection & File Associations

const EXTENSION_MAP: Record<string, string> = {
  // Text & Code
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  ts: 'application/typescript',
  tsx: 'text/typescript-jsx',
  jsx: 'text/javascript-jsx',
  json: 'application/json',
  sh: 'application/x-sh',
  bash: 'application/x-sh',
  py: 'text/x-python',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  xml: 'application/xml',
  csv: 'text/csv',
  log: 'text/plain',
  conf: 'text/plain',
  ini: 'text/plain',

  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',

  // Audio / Video
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',

  // Documents & Archives
  pdf: 'application/pdf',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  aetherpkg: 'application/x-aether-package',
};

export function getMimeType(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    const ext = parts.pop()!.toLowerCase();
    return EXTENSION_MAP[ext] || 'application/octet-stream';
  }
  return 'text/plain';
}

export function isTextMime(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime === 'application/javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/x-sh' ||
    mime === 'application/x-yaml'
  );
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

export function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/');
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/');
}

export function getAppForFile(filename: string, mime: string): string {
  if (isImageMime(mime)) return 'image-viewer';
  if (isAudioMime(mime) || isVideoMime(mime)) return 'media-player';
  if (mime === 'text/markdown') return 'document-viewer';
  if (filename.endsWith('.aetherpkg')) return 'software-center';
  if (
    filename.endsWith('.html') ||
    filename.endsWith('.js') ||
    filename.endsWith('.ts') ||
    filename.endsWith('.css')
  ) {
    return 'code-studio';
  }
  return 'text-editor';
}
