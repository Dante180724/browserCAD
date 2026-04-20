export interface FileData {
  file: File;
  url: string;
  path: string;
}

export class VirtualFileSystem {
  private files: Map<string, FileData> = new Map();
  private baseUrl = 'virtual://';

  constructor(files: File[]) {
    this.loadFiles(files);
  }

  private loadFiles(files: File[]) {
    files.forEach(file => {
      // Get the relative path from the file
      // For files from a folder upload, webkitRelativePath contains the path
      const path = file.webkitRelativePath || file.name;
      const blobUrl = URL.createObjectURL(file);

      // Store with blob URL - don't create it multiple times!
      const fileData: FileData = { file, url: blobUrl, path };
      this.files.set(path, fileData);

      // Also index by filename for easier lookup
      const filename = path.split('/').pop() || path;
      if (filename !== path) {
        this.files.set(filename, fileData);
      }
    });
  }

  getFile(pathOrUrl: string): FileData | undefined {
    // Try direct path lookup first
    let fileData = this.files.get(pathOrUrl);
    if (fileData) return fileData;

    // Try to find by filename only
    const filename = pathOrUrl.split('/').pop() || pathOrUrl;
    fileData = this.files.get(filename);
    if (fileData) return fileData;

    // Try full path search as fallback
    for (const [path, data] of this.files.entries()) {
      if (path.endsWith(pathOrUrl) || path.endsWith(filename)) {
        return data;
      }
    }

    return undefined;
  }

  getBlobUrl(pathOrUrl: string): string | null {
    const fileData = this.getFile(pathOrUrl);
    return fileData ? fileData.url : null;
  }

  findModelFile(): FileData | null {
    for (const [path, data] of this.files.entries()) {
      if (path.endsWith('.gltf') || path.endsWith('.glb')) {
        return data;
      }
    }
    return null;
  }

  dispose() {
    // Clean up all blob URLs
    for (const data of this.files.values()) {
      if (data.url.startsWith('blob:')) {
        URL.revokeObjectURL(data.url);
      }
    }
    this.files.clear();
  }

  getAllFiles(): FileData[] {
    return Array.from(this.files.values()).filter(data =>
      !data.url.startsWith(this.baseUrl)
    );
  }
}
