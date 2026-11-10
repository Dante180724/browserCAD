"""Чтение STEP, инженерный отчёт (Урок 2) и конвертация STEP → GLB (Урок 3).

Отчёт:      python -m app.core.converter samples/plate.step
Конвертация: python -m app.core.converter in.step out.glb \
                [--deflection 0.1] [--angular 0.5] [--json]

Конвейер (§5 README): STEPCAFControl_Reader (XCAF: дерево/имена/цвета) →
BRepMesh_IncrementalMesh (deflection — инженерная точность, мм) →
метрики BRepGProp/BRepBndLib (точные, из B-Rep, не по сетке) →
RWGltf_CafWriter (в OCP 8.x класс называется Caf, не CAF!).

Единицы и оси: STEP читается в мм (xstep.cascade.unit=MM), glTF — метры
и Y-up, поэтому писателю задаём вход 0.001 (мм) и Z-up (§5 README).
"""

import json
import sys
import time
from pathlib import Path

from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepGProp import BRepGProp
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.GProp import GProp_GProps
from OCP.IFSelect import IFSelect_ReturnStatus
from OCP.Message import Message_ProgressRange
from OCP.OCP.collections import (
    IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString,
    Sequence_TDF_Label,
)
from OCP.RWGltf import RWGltf_CafWriter
from OCP.RWMesh import (
    RWMesh_CoordinateSystem,
    RWMesh_CoordinateSystemConverter,
    RWMesh_NameFormat,
)
from OCP.STEPCAFControl import STEPCAFControl_Reader
from OCP.STEPControl import STEPControl_Reader
from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
from OCP.TDocStd import TDocStd_Document
from OCP.TopAbs import TopAbs_ShapeEnum
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Compound
from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool

from app import settings
from app.core.validate import validate_glb

# Метка строки с JSON-метриками в stdout (OCCT печатает в stdout свой
# прогресс — парсер демо-сервера ищет именно эту строку).
META_MARKER = "##META##"


def read_step(path: Path):
    """Урок 2: простой путь — вся модель одним составным телом (без дерева)."""
    reader = STEPControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_ReturnStatus.IFSelect_RetDone:
        raise ValueError(f"Не удалось прочитать файл: {path}")
    reader.TransferRoots()   # переводим все корневые объекты STEP в геометрию OCCT
    return reader.OneShape() # вся модель (даже сборка) — одним составным телом


def count_subshapes(shape, kind) -> int:
    """Урок 2 (TODO 1 закрыт): число частей формы типа kind (Face, Solid и т.п.)."""
    explorer = TopExp_Explorer(shape, kind)
    count = 0
    while explorer.More():
        count += 1
        explorer.Next()
    return count


def shape_metrics(shape) -> tuple[float, float, tuple[float, float, float]]:
    """Урок 2 (TODO 2-3 закрыт): (объём_мм3, площадь_мм2, (размерX, размерY, размерZ)).

    Точные метрики B-Rep (UseTriangulation=False): объём/площадь — гауссовы
    интегралы по поверхностям, габариты — по точной геометрии, не по сетке.
    """
    volume_props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, volume_props)

    area_props = GProp_GProps()
    BRepGProp.SurfaceProperties_s(shape, area_props)

    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box, False)  # False — без триангуляции
    corner_min, corner_max = box.CornerMin(), box.CornerMax()
    dims = (
        corner_max.X() - corner_min.X(),
        corner_max.Y() - corner_min.Y(),
        corner_max.Z() - corner_min.Z(),
    )
    return volume_props.Mass(), area_props.Mass(), dims


def read_step_document(path: Path) -> TDocStd_Document:
    """Урок 3: STEP → XCAF-документ (сохраняются имена деталей и цвета)."""
    doc = TDocStd_Document(TCollection_ExtendedString("XmlOcaf"))
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    reader.SetColorMode(True)
    if reader.ReadFile(str(path)) != IFSelect_ReturnStatus.IFSelect_RetDone:
        raise ValueError(f"Не удалось прочитать файл: {path}")
    if not reader.Transfer(doc, Message_ProgressRange()):
        raise ValueError(f"Не удалось перенести геометрию из файла: {path}")
    return doc


def document_shape(doc: TDocStd_Document):
    """Урок 3: вся геометрия документа одним телом (для меша и метрик)."""
    shape_tool: XCAFDoc_ShapeTool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    labels = Sequence_TDF_Label()
    shape_tool.GetFreeShapes(labels)

    shapes = [
        shape_tool.GetShape_s(labels.Value(i))
        for i in range(1, labels.Length() + 1)
    ]
    if not shapes:
        raise ValueError("В документе нет геометрии (пустой STEP?)")
    if len(shapes) == 1:
        return shapes[0]

    compound = TopoDS_Compound()
    builder = BRep_Builder()
    builder.MakeCompound(compound)
    for s in shapes:
        builder.Add(compound, s)
    return compound


def count_triangles(shape) -> int:
    """Число треугольников уже построенной сетки (по граням)."""
    total = 0
    explorer = TopExp_Explorer(shape, TopAbs_ShapeEnum.TopAbs_FACE)
    while explorer.More():
        location = TopLoc_Location()
        triangulation = BRep_Tool.Triangulation_s(
            TopoDS.Face(explorer.Current()), location
        )
        if triangulation is not None:
            total += triangulation.NbTriangles()
        explorer.Next()
    return total


def convert_step_to_glb(
    input_path: Path,
    output_path: Path,
    deflection: float | None = None,
    angle_deg: float | None = None,
    on_stage=None,
) -> dict:
    """Урок 3 (§5 README): STEP → GLB, возвращает словарь метрик.

    deflection (мм) — инженерная точность: максимально допустимое
    отклонение треугольника от точной поверхности.
    on_stage(name, progress) — колбэк прогресса (стадийная модель:
    read 10% → mesh 70% → metrics 10% → write 10%).
    """
    if deflection is None:
        deflection = settings.DEFLECTION_DEFAULT_MM
    if angle_deg is None:
        angle_deg = settings.ANGULAR_DEFAULT_DEG

    def stage(name: str, progress: int) -> None:
        if on_stage is not None:
            on_stage(name, progress)

    timings: dict[str, float] = {}

    stage("read", 10)
    started = time.perf_counter()
    doc = read_step_document(input_path)
    shape = document_shape(doc)
    timings["read"] = round(time.perf_counter() - started, 3)

    stage("mesh", 20)
    started = time.perf_counter()
    mesher = BRepMesh_IncrementalMesh(shape, deflection, False, angle_deg, True)
    if not mesher.IsDone():
        raise ValueError("Не удалось построить триангуляцию (сетку)")
    stage("mesh", 90)
    timings["mesh"] = round(time.perf_counter() - started, 3)

    stage("metrics", 92)
    started = time.perf_counter()
    volume, area, dims = shape_metrics(shape)
    triangles = count_triangles(shape)
    timings["metrics"] = round(time.perf_counter() - started, 3)

    stage("write", 95)
    started = time.perf_counter()
    writer = RWGltf_CafWriter(TCollection_AsciiString(str(output_path)), True)
    converter = writer.ChangeCoordinateSystemConverter()
    converter.SetInputLengthUnit(0.001)  # STEP в мм → glTF в метрах
    converter.SetInputCoordinateSystem(
        RWMesh_CoordinateSystem.RWMesh_CoordinateSystem_Zup
    )
    writer.SetNodeNameFormat(RWMesh_NameFormat.RWMesh_NameFormat_Product)
    info = IndexedDataMap_TCollection_AsciiString_TCollection_AsciiString()
    if not writer.Perform(doc, info, Message_ProgressRange()):
        raise ValueError("RWGltf_CafWriter не смог записать GLB")
    validate_glb(output_path)
    timings["write"] = round(time.perf_counter() - started, 3)

    stage("done", 100)
    return {
        "file": input_path.name,
        "input_size": input_path.stat().st_size,
        "deflection_mm": deflection,
        "angular_deg": angle_deg,
        "solids": count_subshapes(shape, TopAbs_ShapeEnum.TopAbs_SOLID),
        "faces": count_subshapes(shape, TopAbs_ShapeEnum.TopAbs_FACE),
        "volume_mm3": round(volume, 3),
        "area_mm2": round(area, 3),
        "bbox_mm": [round(d, 3) for d in dims],
        "triangles": triangles,
        "output_size": output_path.stat().st_size,
        "seconds": timings,
        "total_seconds": round(sum(timings.values()), 3),
    }


def _parse_args(argv: list[str]) -> tuple[Path, Path | None, float, float, bool]:
    if not argv:
        sys.exit(
            "Использование:\n"
            "  отчёт:        python -m app.core.converter <файл.step>\n"
            "  конвертация:  python -m app.core.converter <in.step> <out.glb>\n"
            "                [--deflection мм] [--angular °] [--json]"
        )
    input_path = Path(argv[0])
    output_path = Path(argv[1]) if len(argv) > 1 else None
    deflection = settings.DEFLECTION_DEFAULT_MM
    angle_deg = settings.ANGULAR_DEFAULT_DEG
    as_json = False

    rest = argv[2:] if output_path is not None else []
    i = 0
    while i < len(rest):
        if rest[i] == "--deflection" and i + 1 < len(rest):
            deflection = float(rest[i + 1])
            i += 2
        elif rest[i] == "--angular" and i + 1 < len(rest):
            angle_deg = float(rest[i + 1])
            i += 2
        elif rest[i] == "--json":
            as_json = True
            i += 1
        else:
            sys.exit(f"Неизвестный аргумент: {rest[i]}")
    return input_path, output_path, deflection, angle_deg, as_json


def main() -> None:
    input_path, output_path, deflection, angle_deg, as_json = _parse_args(sys.argv[1:])

    if output_path is None:
        shape = read_step(input_path)
        faces = count_subshapes(shape, TopAbs_ShapeEnum.TopAbs_FACE)
        solids = count_subshapes(shape, TopAbs_ShapeEnum.TopAbs_SOLID)
        volume, area, dims = shape_metrics(shape)
        print(f"Тел (solids):     {solids}")
        print(f"Граней (faces):   {faces}")
        print(f"Объём:            {volume:.1f} мм³ = {volume / 1000:.2f} см³")
        print(f"Площадь:          {area:.1f} мм²")
        print(f"Габариты:         {dims[0]:.1f} × {dims[1]:.1f} × {dims[2]:.1f} мм")
        return

    meta = convert_step_to_glb(input_path, output_path, deflection, angle_deg)
    if as_json:
        print(f"{META_MARKER} {json.dumps(meta, ensure_ascii=False)}")
    else:
        print(f"Готово: {output_path} ({meta['output_size']} байт)")
        print(f"Тела/грани:      {meta['solids']}/{meta['faces']}")
        print(f"Объём:           {meta['volume_mm3']:.1f} мм³")
        print(f"Площадь:         {meta['area_mm2']:.1f} мм²")
        print(
            f"Габариты:        {meta['bbox_mm'][0]:.1f} × {meta['bbox_mm'][1]:.1f}"
            f" × {meta['bbox_mm'][2]:.1f} мм"
        )
        print(f"Треугольники:    {meta['triangles']}")
        print(f"Точность:        deflection {meta['deflection_mm']} мм")
        print(f"Время:           {meta['total_seconds']} с")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # одиночная русская строка для демо-сервера
        print(f"ОШИБКА: {e}", file=sys.stderr)
        sys.exit(1)
