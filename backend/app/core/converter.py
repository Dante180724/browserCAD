"""Чтение STEP и инженерный отчёт (Урок 2).

Запуск:  python -m app.core.converter samples/screw.step

Дальше (Урок 3): добавится convert_step_to_glb() —
STEPCAFControl_Reader (дерево/цвета) -> BRepMesh_IncrementalMesh (сетка)
-> RWGltf_CafWriter (GLB; в OCP 8.x класс называется Caf, не CAF!).
"""

import sys
from pathlib import Path

from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_ReturnStatus
from OCP.TopAbs import TopAbs_ShapeEnum
from OCP.TopExp import TopExp_Explorer
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib


def read_step(path: Path):
    reader = STEPControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_ReturnStatus.IFSelect_RetDone:
        raise ValueError(f"Не удалось прочитать файл: {path}")
    reader.TransferRoots()   # переводим все корневые объекты STEP в геометрию OCCT
    return reader.OneShape() # вся модель (даже сборка) — одним составным телом


def count_subshapes(shape, kind) -> int:
    """TODO 1: посчитай части формы типа kind (kind = TopAbs_ShapeEnum.Face и т.п.)"""
    ...


def shape_metrics(shape) -> tuple[float, float, tuple[float, float, float]]:
    """TODO 2-3: вернуть (объём_мм3, площадь_мм2, (размерX, размерY, размерZ))"""
    ...


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Использование: python -m app.core.converter <файл.step>")
    shape = read_step(Path(sys.argv[1]))

    faces = count_subshapes(shape, TopAbs_ShapeEnum.Face)
    solids = count_subshapes(shape, TopAbs_ShapeEnum.Solid)
    volume, area, dims = shape_metrics(shape)

    print(f"Тел (solids):     {solids}")
    print(f"Граней (faces):   {faces}")
    print(f"Объём:            {volume:.1f} мм³ = {volume / 1000:.2f} см³")
    print(f"Площадь:          {area:.1f} мм²")
    print(f"Габариты:         {dims[0]:.1f} × {dims[1]:.1f} × {dims[2]:.1f} мм")


if __name__ == "__main__":
    main()
