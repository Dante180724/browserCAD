/**
 * Синхронная конвертация STEP → GLB демо-сервером (backend/demo_server.py).
 *
 * Отправка .step на POST /api/convert → GLB (model/gltf-binary) одним
 * ответом; точные B-Rep метрики (объём/площадь/габариты/треугольники)
 * приходят в заголовке X-Meta (JSON, percent-encoded — заголовки HTTP
 * должны быть ASCII). GLB оборачивается в File и уходит в существующую
 * цепочку VirtualFileSystem → ModelViewer — вьюер не меняется (§10
 * backend/README.md).
 */

export interface StepMeta {
  file: string;
  input_size: number;
  deflection_mm: number;
  angular_deg: number;
  solids: number;
  faces: number;
  volume_mm3: number;
  area_mm2: number;
  bbox_mm: [number, number, number];
  triangles: number;
  output_size: number;
  seconds: Record<string, number>;
  total_seconds: number;
}

export interface ConvertStepResult {
  glb: Blob;
  meta: StepMeta | null;
}

export interface ConvertStepOptions {
  deflection?: number;
  signal?: AbortSignal;
}

export async function convertStep(
  file: File,
  options: ConvertStepOptions = {},
): Promise<ConvertStepResult> {
  const form = new FormData();
  form.append("file", file);
  if (options.deflection != null) {
    form.append("deflection", String(options.deflection));
  }

  const response = await fetch("/api/convert", {
    method: "POST",
    body: form,
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `Сервер конвертации ответил ошибкой ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (
        typeof body === "object" &&
        body !== null &&
        typeof (body as { message?: unknown }).message === "string"
      ) {
        message = (body as { message: string }).message;
      }
    } catch {
      // тело ответа не JSON — оставляем стандартное сообщение
    }
    throw new Error(message);
  }

  let meta: StepMeta | null = null;
  const metaHeader = response.headers.get("X-Meta");
  if (metaHeader) {
    try {
      meta = JSON.parse(decodeURIComponent(metaHeader)) as StepMeta;
    } catch {
      // метрики некритичны — показываем модель без панели
    }
  }

  const glb = await response.blob();
  if (glb.size < 1024) {
    throw new Error("Сервер вернул подозрительно маленький GLB");
  }
  return { glb, meta };
}

export function stepToGlbFile(glb: Blob, stepFile: File): File {
  const baseName = stepFile.name.replace(/\.ste?p$/i, "");
  return new File([glb], `${baseName}.glb`, { type: "model/gltf-binary" });
}
