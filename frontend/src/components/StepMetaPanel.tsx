import {
  Box,
  Card,
  Flex,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ImCalculator } from "react-icons/im";
import type { StepMeta } from "../services/stepConversion";

const int = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const frac = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatVolume(mm3: number): string {
  return `${int.format(mm3)} мм³ (${frac.format(mm3 / 1000)} см³)`;
}

function formatArea(mm2: number): string {
  return `${int.format(mm2)} мм² (${frac.format(mm2 / 100)} см²)`;
}

function formatDims(bbox: [number, number, number]): string {
  return `${frac.format(bbox[0])} × ${frac.format(bbox[1])} × ${frac.format(
    bbox[2],
  )} мм`;
}

interface StepMetaPanelProps {
  meta: StepMeta;
}

export function StepMetaPanel({ meta }: StepMetaPanelProps) {
  const rows: Array<[string, string]> = [
    ["Объём", formatVolume(meta.volume_mm3)],
    ["Площадь", formatArea(meta.area_mm2)],
    ["Габариты", formatDims(meta.bbox_mm)],
    ["Тела / грани", `${meta.solids} / ${meta.faces}`],
    ["Треугольники", int.format(meta.triangles)],
    ["Точность", `deflection ${meta.deflection_mm} мм`],
    ["Время", `${meta.total_seconds.toFixed(1)} с`],
  ];

  return (
    <Box
      position="absolute"
      bottom={{ base: "92px", md: "104px" }}
      left={{ base: "8px", md: "16px" }}
      zIndex={5}
      w={{ base: "250px", md: "290px" }}
      maxW="calc(100% - 24px)"
      pointerEvents="auto"
    >
      <Card.Root
        bg="rgba(255, 255, 255, 0.96)"
        color="gray.800"
        border="1px solid"
        borderColor="blackAlpha.100"
        boxShadow="0 18px 44px rgba(15, 23, 42, 0.18)"
        borderRadius="18px"
        overflow="hidden"
      >
        <Card.Header pb="2" px="4" pt="3">
          <Flex align="center" gap="2">
            <ImCalculator size="16px" color="#5A7FAF" />
            <Text fontSize="sm" fontWeight="600">
              Инженерные метрики
            </Text>
          </Flex>
          <Text mt="1" fontSize="xs" color="gray.500">
            {meta.file} · STEP (B-Rep) → OpenCASCADE
          </Text>
        </Card.Header>
        <Card.Body pt="1" px="4" pb="3">
          <Stack gap="1.5" fontSize="xs">
            {rows.map(([label, value]) => (
              <Flex key={label} justify="space-between" gap="3" w="full">
                <Text color="gray.500" whiteSpace="nowrap">
                  {label}
                </Text>
                <Text fontFamily="mono" textAlign="right" wordBreak="break-word">
                  {value}
                </Text>
              </Flex>
            ))}
          </Stack>
          <Text mt="2" fontSize="10px" color="gray.400">
            Объём и площадь — точные (B-Rep), не по треугольникам
          </Text>
        </Card.Body>
      </Card.Root>
    </Box>
  );
}
