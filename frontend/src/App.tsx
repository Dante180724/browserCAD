import { useState } from "react";
import { ModelViewer } from "./components/ModelViewer";
import { FileUpload } from "./components/FileUpload";
import { VirtualFileSystem } from "./utils/VirtualFileSystem";
import { Provider } from "./components/UI/provider";
import ViewerBackground from "./components/UI/ViewerBackground";
import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = motion(Box);

function App() {
  const [fileSystem, setFileSystem] = useState<VirtualFileSystem | null>(null);
  const [isClosingViewer, setIsClosingViewer] = useState(false);

  const isViewerVisible = !!fileSystem && !isClosingViewer;
  const isUploadLayout = !isViewerVisible;

  const handleFilesSelect = (files: File[]) => {
    // Dispose of old file system if it exists
    if (fileSystem) {
      fileSystem.dispose();
    }

    // Create new virtual file system
    const vfs = new VirtualFileSystem(files);
    setIsClosingViewer(false);
    setFileSystem(vfs);
  };

  const handleReset = () => {
    if (fileSystem) {
      setIsClosingViewer(true);
    }
  };

  return (
    <Provider>
      <Box position="fixed" inset="0" overflow="hidden" bg="#050814">
        <Box position="absolute" inset="0">
          <ViewerBackground />
        </Box>

        <Flex position="relative" zIndex={1} direction="column" h="full">
          {isUploadLayout && (
            <Box
              as="header"
              px={{ base: 6, md: 8 }}
              pt={{ base: 6, md: 8 }}
              pb={{ base: 3, md: 4 }}
              textAlign="center"
              color="white"
            >
              <Heading
                size={{ base: "2xl", md: "3xl" }}
                fontWeight="700"
                letterSpacing="-0.04em"
              >
                BrowserCAD
              </Heading>
              <Text
                mt="2"
                fontSize={{ base: "sm", md: "md" }}
                color="whiteAlpha.800"
              >
                Загружайте модель и сразу переходите в полноэкранный просмотр.
              </Text>
            </Box>
          )}

          <Flex
            as="main"
            flex="1"
            minH="0"
            align={isUploadLayout ? "center" : "stretch"}
            justify={isUploadLayout ? "center" : "stretch"}
            px={isUploadLayout ? { base: 4, md: 8 } : 0}
            pb={isUploadLayout ? { base: 4, md: 8 } : 0}
          >
            <MotionBox
              layout
              initial={false}
              animate={{
                width: isViewerVisible ? "100%" : "460px",
                height: isViewerVisible ? "100%" : "420px",
                scale: isViewerVisible ? 1 : 0.96,
                opacity: isViewerVisible ? 1 : 0.9,
              }}
              transition={{
                duration: 0.35,
                ease: [0.4, 0, 0.2, 1],
              }}
              onAnimationComplete={() => {
                if (isClosingViewer && fileSystem) {
                  fileSystem.dispose();
                  setFileSystem(null);
                  setIsClosingViewer(false);
                }
              }}
              w={isViewerVisible ? "full" : "460px"}
              h={isViewerVisible ? "full" : "420px"}
              maxW={isViewerVisible ? "none" : "460px"}
              maxH={isViewerVisible ? "none" : "420px"}
              bg={isViewerVisible ? "transparent" : "white"}
              borderRadius={isViewerVisible ? "0" : "24px"}
              boxShadow={
                isViewerVisible ? "none" : "0 20px 60px rgba(0, 0, 0, 0.3)"
              }
              overflow="hidden"
              display="flex"
              alignItems="stretch"
              justifyContent="stretch"
              position="relative"
            >
              {fileSystem ? (
                <ModelViewer fileSystem={fileSystem} onReset={handleReset} />
              ) : (
                <FileUpload onFilesSelect={handleFilesSelect} />
              )}
            </MotionBox>
          </Flex>
        </Flex>
      </Box>
    </Provider>
  );
}

export default App;
