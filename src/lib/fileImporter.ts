import JSZip from 'jszip';
import { cleanFileStem, type ParsedSourceDoc } from './parser';

function stripHtmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Preserve structural headings and paragraph breaks
  doc.querySelectorAll('h1, h2').forEach((el) => {
    const text = el.textContent?.trim();
    if (text) el.textContent = `\n## ${text}\n`;
  });
  doc.querySelectorAll('h3, h4').forEach((el) => {
    const text = el.textContent?.trim();
    if (text) el.textContent = `\n### ${text}\n`;
  });
  doc.querySelectorAll('p, div, blockquote, li').forEach((el) => {
    if (el.tagName === 'BLOCKQUOTE' && el.textContent?.trim()) {
      el.textContent = `\n> ${el.textContent.trim()}\n`;
    } else if (el.children.length === 0 && el.textContent?.trim()) {
      el.textContent = `\n${el.textContent.trim()}\n`;
    }
  });
  return (doc.body?.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function parsePdfFile(file: File): Promise<ParsedSourceDoc> {
  const arrayBuffer = await file.arrayBuffer();
  let loadingTask: any = null;
  let pdf: any = null;
  try {
    const pdfjsLib = await import('pdfjs-dist');
    // Use standard browser-local workerless/inline setup fallback safely
    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    }

    loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    pdf = await loadingTask.promise;
    const pageTexts: string[] = [];
    let lowTextPages = 0;

    for (let p = 1; p <= pdf.numPages; p++) {
      if (p % 10 === 0) {
        // Yield thread on mobile every 10 pages to prevent UI jank
        await new Promise((r) => setTimeout(r, 0));
      }
      const page = await pdf.getPage(p);
      try {
        const content = await page.getTextContent();
        const lines: string[] = [];
        let currentLine = '';
        let lastY: number | null = null;

        for (const item of content.items) {
          if (!('str' in item)) continue;
          const textItem = item as { str: string; transform?: number[] };
          const y = textItem.transform ? Math.round(textItem.transform[5]) : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = textItem.str;
          } else {
            currentLine += (currentLine && textItem.str ? ' ' : '') + textItem.str;
          }
          if (y !== null) lastY = y;
        }
        if (currentLine.trim()) lines.push(currentLine.trim());
        const joined = lines.join('\n').trim();
        if (joined.length < 30) lowTextPages += 1;
        if (joined) pageTexts.push(joined);
      } finally {
        page.cleanup?.();
      }
    }

    const metaData = await pdf.getMetadata().catch(() => null);
    const info = (metaData?.info || {}) as Record<string, unknown>;
    const pdfTitle =
      typeof info.Title === 'string' && info.Title.trim().length > 1
        ? info.Title.trim()
        : cleanFileStem(file.name);
    const pdfAuthor =
      typeof info.Author === 'string' && info.Author.trim().length > 1
        ? info.Author.trim()
        : undefined;

    const fullText = pageTexts.join('\n\n');
    const looksScanned = pdf.numPages > 0 && lowTextPages / pdf.numPages > 0.65;

    return {
      fileName: file.name,
      title: pdfTitle,
      author: pdfAuthor,
      text:
        fullText ||
        `This PDF (${pdf.numPages} pages) appears to contain scanned page images with little embedded text. You may keep it bound here as a local reference or add margin notes as you read.`,
      meta: {
        name: file.name,
        size: file.size,
        type: 'application/pdf',
        lastModified: file.lastModified,
      },
      ocrNote: looksScanned
        ? 'Some pages in this PDF appear to be scanned images; extracted text may be incomplete.'
        : undefined,
      isTechnical: /paper|appendix|neural|study|report|research|lecture|notes/i.test(file.name),
    };
  } catch {
    return {
      fileName: file.name,
      title: cleanFileStem(file.name),
      text: `Bound locally from ${file.name}. This PDF could not be unpacked cleanly into plain text in this browser session.`,
      meta: {
        name: file.name,
        size: file.size,
        type: 'application/pdf',
        lastModified: file.lastModified,
      },
      ocrNote: 'PDF text extraction encountered an unusual encoding; review carefully.',
    };
  } finally {
    try {
      await pdf?.destroy?.();
    } catch {
      // ignore
    }
    try {
      await loadingTask?.destroy?.();
    } catch {
      // ignore
    }
  }
}

async function parseEpubFile(file: File): Promise<ParsedSourceDoc> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  let title = cleanFileStem(file.name);
  let author: string | undefined;

  // Locate OPF via META-INF/container.xml
  let opfPath: string | null = null;
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('string');
    const match = containerXml.match(/full-path="([^"]+)"/);
    if (match) opfPath = match[1];
  }

  const chapterPaths: string[] = [];
  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath)!.async('string');
    const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(opfXml, 'application/xml');

    const titleEl = doc.getElementsByTagName('dc:title')[0] || doc.getElementsByTagName('title')[0] || doc.querySelector('title');
    if (titleEl?.textContent?.trim()) title = titleEl.textContent.trim();
    const creatorEl = doc.getElementsByTagName('dc:creator')[0] || doc.getElementsByTagName('creator')[0] || doc.querySelector('creator');
    if (creatorEl?.textContent?.trim()) author = creatorEl.textContent.trim();

    const manifestMap = new Map<string, string>();
    doc.querySelectorAll('manifest > item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) {
        const cleanHref = href.split('#')[0].split('?')[0];
        manifestMap.set(id, baseDir + cleanHref);
      }
    });

    doc.querySelectorAll('spine > itemref').forEach((ref) => {
      const idref = ref.getAttribute('idref');
      if (idref && manifestMap.has(idref)) {
        chapterPaths.push(manifestMap.get(idref)!);
      }
    });
  }

  // Fallback: gather all xhtml/html files in order
  if (chapterPaths.length === 0) {
    zip.forEach((relativePath, entry) => {
      if (!entry.dir && /\.(xhtml|html|htm)$/i.test(relativePath)) {
        chapterPaths.push(relativePath);
      }
    });
    chapterPaths.sort();
  }

  const parts: string[] = [];
  for (const path of chapterPaths) {
    const entry = zip.file(path);
    if (!entry) continue;
    const html = await entry.async('string');
    const plain = stripHtmlToPlainText(html);
    if (plain.length > 20) {
      parts.push(plain);
    }
  }

  return {
    fileName: file.name,
    title,
    author,
    text: parts.join('\n\n') || 'Empty EPUB manuscript.',
    meta: {
      name: file.name,
      size: file.size,
      type: 'application/epub+zip',
      lastModified: file.lastModified,
    },
  };
}

async function parseZipArchive(file: File): Promise<ParsedSourceDoc[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docs: ParsedSourceDoc[] = [];

  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && !path.startsWith('__MACOSX') && !path.split('/').pop()?.startsWith('.')) {
      entries.push({ path, entry });
    }
  });
  entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  for (const { path, entry } of entries) {
    const baseName = path.split('/').pop() || path;
    if (/\.(txt|md|markdown)$/i.test(baseName)) {
      const text = await entry.async('string');
      if (text.trim()) {
        docs.push({
          fileName: baseName,
          title: cleanFileStem(baseName),
          text,
          meta: {
            name: baseName,
            size: text.length,
            type: baseName.endsWith('.md') ? 'text/markdown' : 'text/plain',
            lastModified: file.lastModified,
          },
        });
      }
    } else if (/\.pdf$/i.test(baseName)) {
      const blob = await entry.async('blob');
      const innerFile = new File([blob], baseName, {
        type: 'application/pdf',
        lastModified: file.lastModified,
      });
      docs.push(await parsePdfFile(innerFile));
    }
  }

  return docs;
}

export function isSupportedBookFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  const base = lower.split('/').pop() || lower;
  if (base.startsWith('.') || base.startsWith('__macosx')) return false;
  return (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.text') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.epub') ||
    lower.endsWith('.zip')
  );
}

export function filterTextFiles(files: File[]): File[] {
  return files.filter((f) => {
    const lower = f.name.toLowerCase();
    const base = lower.split('/').pop() || lower;
    if (base.startsWith('.') || base.startsWith('__macosx')) return false;
    return (
      lower.endsWith('.txt') ||
      lower.endsWith('.md') ||
      lower.endsWith('.markdown') ||
      lower.endsWith('.text')
    );
  });
}

export function getFolderNameFromFiles(files: File[]): string | undefined {
  for (const f of files) {
    if (f.webkitRelativePath) {
      const parts = f.webkitRelativePath.split('/');
      if (parts.length > 1 && parts[0].trim()) {
        return parts[0].trim();
      }
    }
  }
  return undefined;
}

export async function extractFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<{ files: File[]; folderName?: string; isFolder: boolean }> {
  const items = Array.from(dataTransfer.items || []);
  const entries: any[] = [];

  for (const item of items) {
    if (typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
  }

  const dirEntry = entries.find((e) => e.isDirectory);
  if (dirEntry) {
    const folderName = dirEntry.name;
    const collectedFiles: File[] = [];

    const traverse = async (entry: any) => {
      if (entry.isFile) {
        await new Promise<void>((resolve) => {
          entry.file(
            (file: File) => {
              collectedFiles.push(file);
              resolve();
            },
            () => resolve()
          );
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = async (): Promise<any[]> => {
          const batch: any[] = await new Promise((resolve) => {
            reader.readEntries((ents: any[]) => resolve(ents || []), () => resolve([]));
          });
          if (batch && batch.length > 0) {
            const next = await readBatch();
            return [...batch, ...next];
          }
          return [];
        };
        try {
          const children = await readBatch();
          for (const child of children) {
            await traverse(child);
          }
        } catch {
          // ignore directory traversal failures
        }
      }
    };

    for (const entry of entries) {
      await traverse(entry);
    }

    return { files: collectedFiles, folderName, isFolder: true };
  }

  return { files: Array.from(dataTransfer.files || []), isFolder: false };
}

export async function readDroppedFilesLocally(files: File[]): Promise<ParsedSourceDoc[]> {
  const results: ParsedSourceDoc[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    const base = lower.split('/').pop() || lower;
    if (base.startsWith('.') || base.startsWith('__macosx')) continue;
    if (lower.endsWith('.epub')) {
      results.push(await parseEpubFile(file));
    } else if (lower.endsWith('.zip')) {
      const unpacked = await parseZipArchive(file);
      results.push(...unpacked);
    } else if (lower.endsWith('.pdf')) {
      results.push(await parsePdfFile(file));
    } else if (
      lower.endsWith('.txt') ||
      lower.endsWith('.md') ||
      lower.endsWith('.markdown') ||
      lower.endsWith('.text')
    ) {
      const text = await file.text();
      // Skip empty or whitespace-only files (poems, haikus, short notes are kept)
      if (!text.trim()) continue;
      results.push({
        fileName: file.name,
        title: cleanFileStem(file.name),
        text,
        meta: {
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          lastModified: file.lastModified,
        },
        isTechnical: /\.(md|markdown)$/i.test(lower) && /```/.test(text),
      });
    }
  }

  return results;
}

export async function processImportedFolder(files: File[]): Promise<{ files: File[]; title: string }> {
  // 1. Filter out hidden system files (.DS_Store, __macosx) and check supported files
  const validFiles = files.filter((f) => {
    const base = f.name.toLowerCase();
    const relative = (f.webkitRelativePath || '').toLowerCase();
    if (base.startsWith('.') || base.startsWith('__macosx')) return false;
    if (relative.includes('__macosx') || relative.split('/').some((part) => part.startsWith('.'))) {
      return false;
    }
    return isSupportedBookFile(f);
  });

  // 2. Natural alphanumeric sort (e.g. Chapter 1, Chapter 2, Chapter 10)
  validFiles.sort((a, b) =>
    (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );

  // 3. Extract folder title from webkitRelativePath or fallback to 'Imported Volume'
  let folderName = 'Imported Volume';
  for (const f of validFiles) {
    if (f.webkitRelativePath) {
      const parts = f.webkitRelativePath.split('/');
      if (parts.length > 1 && parts[0].trim()) {
        folderName = parts[0].trim();
        break;
      }
    }
  }

  return { files: validFiles, title: folderName };
}
