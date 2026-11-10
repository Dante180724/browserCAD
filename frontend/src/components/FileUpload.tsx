import { useEffect, useRef, useState } from "react";
import { ImDownload } from "react-icons/im";
import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Input,
  Spinner,
  Text,
} from "@chakra-ui/react";
import {
  convertStep,
  stepToGlbFile,
  type StepMeta,
} from "../services/stepConversion";

interface FileUploadProps {
  onFilesSelect: (files: File[], stepMeta?: StepMeta | null) => void;
}

const CONVERSION_STAGES = [
  "Чтение STEP — точная B-Rep геометрия…",
  "Триангуляция поверхностей (deflection)…",
  "Расчёт объёма и площади по B-Rep…",
  "Запись GLB…",
];

const STAGE_INTERVAL_MS = 2200;

export function FileUpload({ onFilesSelect }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [convertingFileName, setConvertingFileName] = useState("");
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const startConversion = async (stepFile: File) => {
    setIsConverting(true);
    setStageIndex(0);
    setConvertingFileName(stepFile.name);
    stageTimerRef.current = setInterval(() => {
      setStageIndex((i) => (i + 1) % CONVERSION_STAGES.length);
    }, STAGE_INTERVAL_MS);
    abortRef.current = new AbortController();

    try {
      const { glb, meta } = await convertStep(stepFile, {
        signal: abortRef.current.signal,
      });
      onFilesSelect([stepToGlbFile(glb, stepFile)], meta);
    } catch (error) {
      if (abortRef.current?.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "неизвестная ошибка";
      alert(`Не удалось конвертировать STEP: ${message}`);
    } finally {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
      abortRef.current = null;
      setIsConverting(false);
      setConvertingFileName("");
    }
  };

  const cancelConversion = () => {
    abortRef.current?.abort();
    if (stageTimerRef.current) clearInterval(stageTimerRef.current);
    stageTimerRef.current = null;
    abortRef.current = null;
    setIsConverting(false);
    setConvertingFileName("");
  };

  const processFiles = (files: FileList | File[]) => {
    if (isConverting) return;

    const fileArray = Array.from(files);

    const stepFile = fileArray.find(
      (f) =>
        f.name.toLowerCase().endsWith(".step") ||
        f.name.toLowerCase().endsWith(".stp"),
    );
    if (stepFile) {
      void startConversion(stepFile);
      return;
    }

    // Check if there's at least one supported model file
    const hasModelFile = fileArray.some(
      (f) =>
        f.name.endsWith(".gltf") ||
        f.name.endsWith(".glb") ||
        f.name.endsWith(".stl"),
    );

    if (hasModelFile) {
      onFilesSelect(fileArray);
    } else {
      alert("Пожалуйста, выберите .gltf, .glb, .stl или .step модель");
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

      if (item.kind === "file") {
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
    files: File[],
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
        () => resolve(null),
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
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="6"
      w="full"
      h="full"
      px={{ base: 6, md: 10 }}
      py={{ base: 8, md: 12 }}
      textAlign="center"
      cursor="pointer"
      bg={isDragging ? "rgba(240, 244, 248, 0.96)" : "white"}
      transition="all 0.3s ease"
      _hover={{ bg: "rgba(250, 250, 250, 0.98)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Input
        ref={fileInputRef}
        type="file"
        accept=".gltf,.glb,.stl,.step,.stp"
        onChange={handleFileChange}
        display="none"
      />
      <Input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error - webkitdirectory is not in TypeScript types
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileChange}
        display="none"
      />
      {isConverting ? (
        <Flex direction="column" align="center" justify="center" gap="5">
          <Spinner size="xl" color="#5A7FAF" />
          <Box>
            <Heading size="lg" color="gray.800">
              Расчёт в ядре OpenCASCADE
            </Heading>
            <Text
              mt="2"
              fontSize="md"
              color="gray.600"
              maxW="420px"
              lineHeight="1.6"
            >
              {CONVERSION_STAGES[stageIndex]}
            </Text>
            <Text mt="1" fontSize="sm" color="gray.500" fontFamily="mono">
              {convertingFileName}
            </Text>
          </Box>
          <Button
            size="md"
            px="20px"
            py="8px"
            bg="rgba(120,120,120,0.12)"
            border="1px solid"
            borderColor="#5A7FAF"
            color="#5A7FAF"
            borderRadius="12px"
            fontWeight="600"
            _hover={{ bg: "rgba(120,120,120,0.18)" }}
            onClick={cancelConversion}
          >
            Отмена
          </Button>
        </Flex>
      ) : (
        <>
          <Box role="group">
            <Icon
              as={ImDownload}
              boxSize="80px"
              color="#5A7FAF"
              opacity={0.9}
              mb="8"
              transition="transform 0.3s"
              _hover={{ transform: "translateY(-8px)", opacity: 1 }}
            />
          </Box>

          <Box>
            <Heading size="xl" color="gray.800">
              Загрузите 3D модель
            </Heading>
            <Text
              mt="3"
              fontSize="md"
              color="gray.600"
              maxW="420px"
              lineHeight="1.6"
            >
              Перетащите папку с моделью сюда или выберите удобный способ
              загрузки.
            </Text>
          </Box>

          <Box
            display="flex"
            gap="1rem"
            flexWrap="wrap"
            justifyContent="center"
            width="100%"
          >
            <Button
              size="2xl"
              px="20px"
              py="10px"
              bg="#5A7FAF"
              color="white"
              borderRadius="12px"
              fontSize="0.95rem"
              fontWeight="500"
              boxShadow="0 4px 12px rgba(0,0,0,0.25)"
              transition="all 0.2s"
              _hover={{
                bg: "#6B90BF",
                transform: "translateY(-2px)",
                boxShadow: "0 6px 16px rgba(0,0,0,0.3)",
              }}
              _active={{
                transform: "translateY(0)",
              }}
              onClick={handleFolderClick}
            >
              Выбрать папку
            </Button>

            <Button
              size="2xl"
              px="20px"
              py="10px"
              bg="rgba(120,120,120,0.12)"
              backdropFilter="blur(1px)"
              border="1px solid"
              borderColor="#5A7FAF"
              color="#5A7FAF"
              borderRadius="12px"
              fontSize="0.95rem"
              fontWeight="600"
              transition="all 0.2s"
              _hover={{
                bg: "rgba(120,120,120,0.18)",
                borderColor: "whiteAlpha.300",
              }}
              _active={{
                bg: "rgba(120,120,120,0.22)",
              }}
              onClick={handleFileClick}
            >
              Файл .glb / .stl / .step
            </Button>
          </Box>
        </>
      )}
    </Flex>
  );
}
