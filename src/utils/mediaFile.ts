// A dropped/picked file's `type` (MIME) is read from OS file-type registration, which
// is unreliable for less common video containers (.mkv, .ts, .3gp, some .avi/.wmv on
// Linux/Android in particular often come back as '' rather than 'video/...') — relying
// on it alone silently dropped those files from both the drag-and-drop zone and the
// "Add image/video" file pickers (an empty-string type matched neither branch, so the
// file just vanished with no error). Falling back to the extension covers them.
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'wmv', 'flv', '3gp', 'mpeg', 'mpg', 'ts', 'ogv'];

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

/** 'image' | 'video' | null (neither — not a supported media file) for a dropped/picked File, trusting its MIME type first and its extension only as a fallback when the type is missing/unrecognized. */
export function classifyMediaFile(file: File): 'image' | 'video' | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  const ext = extensionOf(file.name);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return null;
}
