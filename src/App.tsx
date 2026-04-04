import { useState } from "react";
import { ModelViewer } from "./components/ModelViewer";
import { FileUpload } from "./components/FileUpload";
import { VirtualFileSystem } from "./utils/VirtualFileSystem";
import { Provider } from "./components/UI/provider";
import "./App.scss";
import ViewerBackground from "./components/UI/ViewerBackground";
import { Button, Box } from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = motion(Box);

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
            {/* <div className="viewer-container"> */}
            <MotionBox
              layout
              initial={false}
              animate={{
                width: fileSystem ? "100%" : "460px",
                height: fileSystem ? "100%" : "420px",
                scale: fileSystem ? 1 : 0.95,
                opacity: fileSystem ? 1 : 0.9,
              }}
              transition={{
                duration: 0.35,
                ease: [0.4, 0, 0.2, 1],
              }}
              maxW="1200px"
              maxH="800px"
              bg="white"
              borderRadius={fileSystem ? "24px" : "20px"}
              boxShadow="0 20px 60px rgba(0,0,0,0.3)"
              overflow="hidden"
              display="flex"
              alignItems="center"
              justifyContent="center"
              position="relative"
            >
              {fileSystem ? (
                <>
                  <ModelViewer fileSystem={fileSystem} />
                  <Box position="absolute" top="1.5rem" right="1.5rem">
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
                  </Box>
                </>
              ) : (
                <FileUpload onFilesSelect={handleFilesSelect} />
              )}
            </MotionBox>
          </main>
        </div>
      </div>
    </Provider>
  );
}

export default App;
