import { useRef, useState } from 'react';

interface FileUploadProps {
  onFilesSelect: (files: File[]) => void;
}

export function FileUpload({ onFilesSelect }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Check if there's at least one .gltf or .glb file
    const hasModelFile = fileArray.some(
      f => f.name.endsWith('.gltf') || f.name.endsWith('.glb')
    );

    if (hasModelFile) {
      onFilesSelect(fileArray);
    } else {
      alert('Пожалуйста, выберите папку с .gltf или .glb файлом');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const files: File[] = [];

    // Process dropped items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();

        if (entry) {
          if (entry.isDirectory) {
            // Process directory
            await processDirectory(entry as FileSystemDirectoryEntry, files);
          } else {
            // Single file
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      }
    }

    if (files.length > 0) {
      processFiles(files);
    }
  };

  const processDirectory = async (
    directory: FileSystemDirectoryEntry,
    files: File[]
  ): Promise<void> => {
    const reader = directory.createReader();

    return new Promise((resolve) => {
      reader.readEntries(async (entries) => {
        for (const entry of entries) {
          if (entry.isFile) {
            const file = await getFile(entry as FileSystemFileEntry);
            if (file) files.push(file);
          } else if (entry.isDirectory) {
            await processDirectory(entry as FileSystemDirectoryEntry, files);
          }
        }
        resolve();
      });
    });
  };

  const getFile = (fileEntry: FileSystemFileEntry): Promise<File | null> => {
    return new Promise((resolve) => {
      fileEntry.file(
        (file) => resolve(file),
        () => resolve(null)
      );
    });
  };

  const handleFolderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    folderInputRef.current?.click();
  };

  const handleFileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`file-upload ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".gltf,.glb"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore - webkitdirectory is not in TypeScript types
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <div className="upload-icon">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <h3>Загрузите 3D модель</h3>
      <p>Перетащите папку с моделью сюда или выберите:</p>
      <div className="upload-buttons">
        <button onClick={handleFolderClick} className="upload-btn">
          Выбрать папку
        </button>
        <button onClick={handleFileClick} className="upload-btn secondary">
          Один .glb файл
        </button>
      </div>
    </div>
  );
}
