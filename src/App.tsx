import { useState } from "react";
import { ModelViewer } from "./components/ModelViewer";
import { FileUpload } from "./components/FileUpload";
import { VirtualFileSystem } from "./utils/VirtualFileSystem";
import { Provider } from "./components/UI/provider"
import "./App.scss";

function App() {
  const [fileSystem, setFileSystem] = useState<VirtualFileSystem | null>(null);

  const handleFilesSelect = (files: File[]) => {
    // Dispose of old file system if it exists
    if (fileSystem) {
      fileSystem.dispose();
    }

    // Create new virtual file system
    const vfs = new VirtualFileSystem(files);
    setFileSystem(vfs);
  };

  const handleReset = () => {
    if (fileSystem) {
      fileSystem.dispose();
      setFileSystem(null);
    }
  };

  return (
  <Provider>
    <div className="app">
      <header className="header">
        <h1>BrowserCAD</h1>
        <p>Просмотр 3D моделей в браузере</p>
      </header>
      <main className="content">
        <div className="viewer-container">
          {fileSystem ? (
            <>
              <ModelViewer fileSystem={fileSystem} />
              <div className="controls">
                <button onClick={handleReset}>Загрузить другую модель</button>
              </div>
            </>
          ) : (
            <FileUpload onFilesSelect={handleFilesSelect} />
          )}
        </div>
      </main>
    </div>
  </Provider>
  );
}

export default App;
