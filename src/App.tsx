import { useState } from "react";
import { ModelViewer } from "./components/ModelViewer";
import { FileUpload } from "./components/FileUpload";
import { VirtualFileSystem } from "./utils/VirtualFileSystem";
import { Provider } from "./components/UI/provider";
import "./App.scss";
import ViewerBackground from "./components/UI/ViewerBackground";
import { Button } from "@chakra-ui/react";

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
      <div className="bg">
        <ViewerBackground />
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
                    <Button
                      bg="#5A7FAF"
                      color="white"
                      px="1.5rem"
                      py="0.75rem"
                      border="none"
                      borderRadius="12px"
                      fontSize="0.875rem"
                      fontWeight="500"
                      boxShadow="0 4px 12px rgba(0, 0, 0, 0.1)"
                      transition="all 0.2s ease"
                      _hover={{
                        transform: "translateY(-2px)",
                        boxShadow: "0 6px 16px rgba(0, 0, 0, 0.15)",
                        bg: "#6B90BF",
                      }}
                      _active={{
                        transform: "translateY(0)",
                      }}
                      onClick={handleReset}
                    >
                      Загрузить другую модель
                    </Button>
                  </div>
                </>
              ) : (
                <FileUpload onFilesSelect={handleFilesSelect} />
              )}
            </div>
          </main>
        </div>
      </div>
    </Provider>
  );
}

export default App;
