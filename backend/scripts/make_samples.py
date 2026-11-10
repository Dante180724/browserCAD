"""Генерация STEP-образцов для демонстрации (ядро OCP — само делает модели).

Запуск (из backend/):  .venv/bin/python -m scripts.make_samples

Создаёт:
    samples/plate.step     — одиночная деталь (плита с 4 отверстиями)
    samples/flange.step    — одиночная деталь (фланец с bore и bolt holes)
    samples/assembly.step  — сборка с именами деталей и цветами (XCAF)

и сразу конвертирует каждый в samples/*.glb — запасной сценарий демо
(Вариант 1): GLB просто перетаскивается во вьюер, STEP остаётся для
показа «инженерного формата» и точных метрик.
"""

from pathlib import Path

from OCP.BRep import BRep_Builder
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.IFSelect import IFSelect_ReturnStatus
from OCP.Quantity import Quantity_Color, Quantity_TOC_sRGB
from OCP.STEPCAFControl import STEPCAFControl_Writer
from OCP.STEPControl import STEPControl_StepModelType
from OCP.TCollection import TCollection_ExtendedString
from OCP.TDataStd import TDataStd_Name
from OCP.TDocStd import TDocStd_Document
from OCP.TopoDS import TopoDS_Compound
from OCP.XCAFDoc import (
    XCAFDoc_ColorType,
    XCAFDoc_ColorTool,
    XCAFDoc_DocumentTool,
    XCAFDoc_ShapeTool,
)
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec

from app.core.converter import convert_step_to_glb

SAMPLES = Path(__file__).resolve().parent.parent / "samples"


def cylinder_z(x, y, z_bottom, radius, height):
    from OCP.BRepPrimAPI import BRepPrimAPI_MakeCylinder

    return BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(x, y, z_bottom), gp_Dir(0, 0, 1)), radius, height
    ).Shape()


def make_plate():
    """Плита 120×80×12 мм с 4 отверстиями Ø10."""
    plate = BRepPrimAPI_MakeBox(gp_Pnt(0, 0, 0), 120, 80, 12).Shape()
    for x, y in ((25, 25), (95, 25), (25, 55), (95, 55)):
        plate = BRepAlgoAPI_Cut(plate, cylinder_z(x, y, -1, 5, 14)).Shape()
    return plate


def make_flange():
    """Фланец: диск Ø80×10, ступица Ø30×35, bore Ø16, 4 bolt holes Ø7."""
    base = cylinder_z(0, 0, 0, 40, 10)
    hub = cylinder_z(0, 0, 0, 15, 35)
    part = BRepAlgoAPI_Fuse(base, hub).Shape()
    part = BRepAlgoAPI_Cut(part, cylinder_z(0, 0, -1, 8, 40)).Shape()
    for x, y in ((28, 0), (-28, 0), (0, 28), (0, -28)):
        part = BRepAlgoAPI_Cut(part, cylinder_z(x, y, -1, 3.5, 12)).Shape()
    return part


def make_bushing():
    """Втулка Ø30×40 со сквозным отверстием Ø16."""
    part = cylinder_z(0, 0, 0, 15, 40)
    part = BRepAlgoAPI_Cut(part, cylinder_z(0, 0, -1, 8, 42)).Shape()
    return part


def translated(shape, dx, dy, dz):
    trsf = gp_Trsf()
    trsf.SetTranslation(gp_Vec(dx, dy, dz))
    return BRepBuilderAPI_Transform(shape, trsf, True).Shape()


def new_doc() -> TDocStd_Document:
    return TDocStd_Document(TCollection_ExtendedString("XmlOcaf"))


def write_step(doc: TDocStd_Document, path: Path) -> None:
    writer = STEPCAFControl_Writer()
    writer.SetNameMode(True)
    writer.SetColorMode(True)
    writer.Transfer(doc, STEPControl_StepModelType.STEPControl_AsIs)
    if writer.Write(str(path)) != IFSelect_ReturnStatus.IFSelect_RetDone:
        raise ValueError(f"Не удалось записать STEP: {path}")
    print(f"STEP: {path} ({path.stat().st_size} байт)")


def add_part(
    doc: TDocStd_Document,
    shape,
    name: str,
    color: tuple[float, float, float] | None,
):
    shape_tool: XCAFDoc_ShapeTool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    color_tool: XCAFDoc_ColorTool = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())
    label = shape_tool.AddShape(shape, False)
    TDataStd_Name.Set_s(label, TCollection_ExtendedString(name))
    if color is not None:
        color_tool.SetColor(
            label,
            Quantity_Color(color[0], color[1], color[2], Quantity_TOC_sRGB),
            XCAFDoc_ColorType.XCAFDoc_ColorSurf,
        )
    return label


def write_single(name: str, shape) -> Path:
    doc = new_doc()
    add_part(doc, shape, name, None)
    path = SAMPLES / f"{name.lower()}.step"
    write_step(doc, path)
    return path


def write_assembly() -> Path:
    """Сборка: плита + фланец + втулка, с именами и цветами."""
    doc = new_doc()

    plate = make_plate()
    flange = translated(make_flange(), 55, 40, 12)
    bushing = translated(make_bushing(), 105, 65, 12)

    add_part(doc, plate, "Base plate", (0.25, 0.55, 0.85))
    add_part(doc, flange, "Flange", (0.62, 0.65, 0.70))
    add_part(doc, bushing, "Bushing", (0.85, 0.45, 0.15))

    asm = TopoDS_Compound()
    builder = BRep_Builder()
    builder.MakeCompound(asm)
    builder.Add(asm, plate)
    builder.Add(asm, flange)
    builder.Add(asm, bushing)

    shape_tool: XCAFDoc_ShapeTool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    asm_label = shape_tool.AddShape(asm, True)
    TDataStd_Name.Set_s(asm_label, TCollection_ExtendedString("Demo unit"))

    path = SAMPLES / "assembly.step"
    write_step(doc, path)
    return path


def main() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)

    step_files = [
        write_single("Plate", make_plate()),
        write_single("Flange", make_flange()),
        write_assembly(),
    ]

    for step in step_files:
        glb = step.with_suffix(".glb")
        meta = convert_step_to_glb(step, glb)
        print(
            f"GLB:  {glb} ({meta['output_size']} байт, "
            f"{meta['triangles']} треугольников, "
            f"объём {meta['volume_mm3']:.1f} мм³, "
            f"{meta['total_seconds']} с)"
        )


if __name__ == "__main__":
    main()
