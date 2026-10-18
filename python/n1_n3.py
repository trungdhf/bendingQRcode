from pathlib import Path
import json
import unittest

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.collections import PolyCollection
import numpy as np

import n1_n2


OUT = Path(__file__).resolve().parent.parent / "output"
N = [112.0, 304.0, 213.0]
RADII = [170.0, 170.0]
ANGLES = [43.4, 100.0]
ROLL = -83.14
OD = 114.3
ISO_U = np.array([1.0, 1.0, 0.0]) / np.sqrt(2)
ISO_V = np.array([-1.0, 1.0, 2.0]) / np.sqrt(6)
CAMERA = np.cross(ISO_U, ISO_V)


def rotate(vector, axis, degrees):
    axis = axis / np.linalg.norm(axis)
    angle = np.deg2rad(degrees)
    return (vector * np.cos(angle) + np.cross(axis, vector) * np.sin(angle)
            + axis * np.dot(axis, vector) * (1 - np.cos(angle)))


def project(points):
    points = np.asarray(points)
    return np.stack([points @ ISO_U, points @ ISO_V], axis=-1)


def bend_point(bend, angle):
    angle = np.asarray(angle)
    return (bend["start"] + bend["radius"] *
            (np.sin(angle)[..., None] * bend["incoming"]
             + (1 - np.cos(angle))[..., None] * bend["normal"]))


def bend_tangent(bend, angle):
    angle = np.asarray(angle)
    return (np.cos(angle)[..., None] * bend["incoming"]
            + np.sin(angle)[..., None] * bend["normal"])


def model():
    lines, bends, pieces, tangents, labels = [], [], [], [], []
    point = np.zeros(3)
    direction = np.array([1.0, 0.0, 0.0])
    normal = np.array([0.0, 1.0, 0.0])
    labels.append(("S", point.copy()))
    for i, length in enumerate(N):
        end = point + length * direction
        lines.append(dict(start=point.copy(), end=end.copy(), length=length, direction=direction.copy()))
        pieces.append(np.array([point, end]))
        tangents.append(np.array([direction, direction]))
        point = end
        if i == len(RADII):
            labels.append(("N3 end", point.copy()))
            break
        if i:
            normal = rotate(normal, direction, ROLL)
        theta = np.deg2rad(ANGLES[i])
        bend = dict(start=point.copy(), incoming=direction.copy(), normal=normal.copy(),
                    radius=RADII[i], angle=theta)
        bend["center"] = point + RADII[i] * normal
        bend["end"] = bend_point(bend, theta)
        bends.append(bend)
        labels.append((f"PC{i+1}", point.copy()))
        phi = np.linspace(0, theta, 121)
        pieces.append(bend_point(bend, phi))
        tangents.append(bend_tangent(bend, phi))
        point = bend["end"]
        labels.append((f"PT{i+1}", point.copy()))
        direction, normal = (np.cos(theta) * direction + np.sin(theta) * normal,
                             -np.sin(theta) * direction + np.cos(theta) * normal)
    return lines, bends, pieces, tangents, labels


LINES, BENDS, PIECES, TANGENTS, LABELS = model()


class GeometryTests(unittest.TestCase):
    def test_preserves_approved_n1_n2_geometry(self):
        np.testing.assert_allclose(BENDS[0]["start"][:2], n1_n2.PC, atol=1e-10)
        np.testing.assert_allclose(BENDS[0]["end"][:2], n1_n2.PT, atol=1e-10)
        np.testing.assert_allclose(LINES[1]["end"][:2], n1_n2.END, atol=1e-10)
        self.assertEqual(LINES[1]["end"][2], 0)

    def test_all_four_joints_have_same_position(self):
        for i, bend in enumerate(BENDS):
            np.testing.assert_allclose(bend_point(bend, 0), LINES[i]["end"], atol=1e-10)
            np.testing.assert_allclose(bend_point(bend, bend["angle"]), LINES[i+1]["start"], atol=1e-10)

    def test_all_four_joints_are_tangent(self):
        for i, bend in enumerate(BENDS):
            for angle, direction in [(0, LINES[i]["direction"]),
                                     (bend["angle"], LINES[i+1]["direction"])]:
                np.testing.assert_allclose(bend_tangent(bend, angle), direction, atol=1e-12)
                h = 1e-7
                numerical = (bend_point(bend, angle + h) - bend_point(bend, angle - h)) / (2*h*bend["radius"])
                np.testing.assert_allclose(numerical, direction, atol=1e-8)

    def test_all_dimensions(self):
        for line, length in zip(LINES, N):
            self.assertAlmostEqual(np.linalg.norm(line["end"] - line["start"]), length)
        for bend, radius, degrees in zip(BENDS, RADII, ANGLES):
            samples = bend_point(bend, np.linspace(0, bend["angle"], 201))
            np.testing.assert_allclose(np.linalg.norm(samples - bend["center"], axis=1), radius, atol=1e-10)
            final_tangent = bend_tangent(bend, bend["angle"])
            self.assertAlmostEqual(np.rad2deg(np.arccos(np.dot(final_tangent, bend["incoming"]))), degrees)

    def test_signed_roll_between_bends(self):
        theta = BENDS[0]["angle"]
        previous = -np.sin(theta) * BENDS[0]["incoming"] + np.cos(theta) * BENDS[0]["normal"]
        current = BENDS[1]["normal"]
        d = LINES[1]["direction"]
        measured = np.rad2deg(np.arctan2(np.dot(d, np.cross(previous, current)), np.dot(previous, current)))
        self.assertAlmostEqual(measured, ROLL)

    def test_n3_leaves_first_bend_plane(self):
        self.assertGreater(abs(LINES[2]["end"][2]), 400)

    def test_isometric_axes_equal_scale(self):
        np.testing.assert_allclose(np.linalg.norm(project(np.eye(3)), axis=1), np.sqrt(2 / 3), atol=1e-12)
        self.assertAlmostEqual(np.dot(ISO_U, ISO_V), 0)

    def test_projected_derivatives_also_join(self):
        for i, bend in enumerate(BENDS):
            np.testing.assert_allclose(project(bend_tangent(bend, 0)),
                                       project(LINES[i]["direction"]), atol=1e-12)
            np.testing.assert_allclose(project(bend_tangent(bend, bend["angle"])),
                                       project(LINES[i+1]["direction"]), atol=1e-12)


def tube(ax):
    points, directions = [], []
    for piece, tangent in zip(PIECES, TANGENTS):
        for point, direction in zip(piece, tangent):
            if points and np.linalg.norm(point - points[-1]) < 1e-9:
                continue
            points.append(point)
            directions.append(direction)
    normals = []
    u, previous = np.array([0.0, 1.0, 0.0]), directions[0]
    for direction in directions:
        axis = np.cross(previous, direction)
        length = np.linalg.norm(axis)
        if length > 1e-12:
            angle = np.rad2deg(np.arctan2(length, np.dot(previous, direction)))
            u = rotate(u, axis, angle)
        u -= direction * np.dot(u, direction)
        u /= np.linalg.norm(u)
        normals.append(u.copy())
        previous = direction
    rings, radial_normals = [], []
    phi = np.linspace(0, 2*np.pi, 49)
    for point, direction, normal in zip(points, directions, normals):
        other = np.cross(direction, normal)
        radial = np.cos(phi)[:, None] * normal + np.sin(phi)[:, None] * other
        radial_normals.append(radial)
        rings.append(point + OD / 2 * radial)
    faces, depths, colors = [], [], []
    light = np.array([-0.4, -0.2, 0.9])
    light /= np.linalg.norm(light)
    for i in range(len(rings)-1):
        for j in range(len(phi)-1):
            face = np.array([rings[i][j], rings[i+1][j], rings[i+1][j+1], rings[i][j+1]])
            faces.append(project(face))
            depths.append(np.mean(face @ CAMERA))
            radial = radial_normals[i][j] + radial_normals[i][j+1]
            radial /= np.linalg.norm(radial)
            shade = 0.83 + 0.13 * np.dot(radial, light)
            colors.append([shade * 0.89, shade * 0.96, shade])
    order = np.argsort(depths)
    ax.add_collection(PolyCollection([faces[i] for i in order],
                                     facecolors=[colors[i] for i in order],
                                     edgecolors="none", rasterized=True, zorder=2))


def iso_dimension(ax, start, end, offset, label):
    a, b = project(start), project(end)
    direction = b - a
    normal = np.array([-direction[1], direction[0]]) / np.linalg.norm(direction)
    da, db = a + normal * offset, b + normal * offset
    for point, tip in [(a, da), (b, db)]:
        pair = np.array([point + normal * np.sign(offset) * 51, tip + normal * np.sign(offset) * 8])
        ax.plot(pair[:, 0], pair[:, 1], color="#6d7f8b", lw=0.65, zorder=6)
    ax.annotate("", db, da, arrowprops=dict(arrowstyle="<|-|>", lw=0.9, color="#204e70"), zorder=7)
    angle = np.rad2deg(np.arctan2(direction[1], direction[0]))
    if angle < -90 or angle > 90:
        angle += 180
    ax.text(*((da + db)/2), label, ha="center", va="center", rotation=angle, fontsize=12,
            color="#204e70", bbox=dict(facecolor="white", edgecolor="none", pad=2), zorder=8)


def iso_sheet():
    fig = plt.figure(figsize=(16.54, 11.69), facecolor="white")
    fig.text(0.055, 0.94, "DT11-111-7  |  N1 - B1 - N2 - B2 - N3", fontsize=21, weight="bold", color="#183b53")
    fig.text(0.055, 0.905, "ISOMETRIC DETAIL  /  STPG370-E  /  OD 114.3 x t6  /  Dimensions in mm", fontsize=11, color="#526b7b")
    fig.text(0.95, 0.94, "REV 03  /  1 OF 2", fontsize=10, ha="right", color="#526b7b")
    ax = fig.add_axes([0.04, 0.20, 0.72, 0.65])
    tube(ax)
    for points in PIECES:
        q = project(points)
        ax.plot(q[:, 0], q[:, 1], lw=1.4, color="#167a93", dashes=(9, 3, 2, 3), zorder=5)
    offsets = [(-16, 4), (-4, -20), (0, 12), (-4, 12), (-32, 4), (-5, -23)]
    for (label, point), offset in zip(LABELS, offsets):
        p = project(point)
        ax.plot(*p, "o", ms=3.5, color="#a85d29", zorder=8)
        ax.annotate(label, p, xytext=offset, textcoords="offset points", fontsize=9,
                    color="#924b19", zorder=9)
    for i, (line, offset) in enumerate(zip(LINES, [-94, 88, 125])):
        iso_dimension(ax, line["start"], line["end"], offset, f"N{i+1} = {line['length']:g}")
    for i, (bend, label_xy) in enumerate(zip(BENDS, [(95, 86), (545, 78)])):
        p = project(bend_point(bend, bend["angle"] * 0.5))
        ax.annotate(f"B{i+1}   R170\n{ANGLES[i]:g}° bend", p, xytext=label_xy,
                    ha="center", fontsize=12, color="#204e70",
                    arrowprops=dict(arrowstyle="-|>", lw=0.85, color="#204e70"), zorder=9)
    origin = np.array([40.0, -300.0])
    for axis, label in zip(np.eye(3), ["X", "Y", "Z"]):
        target = origin + project(axis * 65)
        ax.annotate("", target, origin, arrowprops=dict(arrowstyle="-|>", lw=1, color="#6d7f8b"))
        ax.text(*(origin + project(axis * 85)), label, ha="center", va="center", fontsize=9, color="#526b7b")
    ax.text(40, -360, "Equal-axis isometric", fontsize=9, color="#526b7b", ha="center")
    ax.set_xlim(-90, 855)
    ax.set_ylim(-490, 155)
    ax.set_aspect("equal")
    ax.axis("off")
    table_ax = fig.add_axes([0.77, 0.34, 0.185, 0.46])
    table_ax.axis("off")
    table_ax.text(0, 1.05, "TRUE DIMENSIONS", fontsize=12, weight="bold", color="#183b53")
    rows = [
        ["Straight N1", "112 mm"],
        ["Straight N2", "304 mm"],
        ["Straight N3", "213 mm"],
        ["Bend B1", "R170 / 43.4°"],
        ["Bend B2", "R170 / 100°"],
        ["Roll B1 → B2", "−83.14°"],
        ["Outside diameter", "114.3 mm"],
        ["Wall thickness", "6 mm"],
    ]
    table = table_ax.table(cellText=rows, colWidths=[0.55, 0.45], bbox=[0, 0.12, 1, 0.86], cellLoc="left")
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor("#d6e0e6")
        cell.set_linewidth(0.6)
        cell.set_facecolor("#f1f6f8" if row % 2 == 0 else "white")
        cell.get_text().set_color("#183b53")
    table_ax.text(0, 0.01, "Roll is NOT the 100° bend angle.", fontsize=9, color="#a55c23")
    fig.text(0.055, 0.15, "N3 is out of the N1-N2 plane. Use the isometric view, not a flat 2D chain.",
             fontsize=11, color="#183b53", weight="bold")
    fig.text(0.055, 0.113, "All N labels are TRUE straight lengths; projected distances and angles must not be measured from this sheet.",
             fontsize=10, color="#526b7b")
    fig.text(0.055, 0.078, "Assumption: −83.14° is right-hand roll about N2 in the S → N3 travel direction. Confirm the machine's sign convention.",
             fontsize=9, color="#a55c23")
    fig.text(0.95, 0.037, "PARTIAL MODEL: N4-N5 NOT INCLUDED  /  REFERENCE, NOT FOR FABRICATION", ha="right", fontsize=8, color="#526b7b")
    return fig


def local_bend(ax, first_length, second_length, degrees, first_name, second_name, title):
    theta = np.deg2rad(degrees)
    radius = 170.0
    pc = np.array([first_length, 0.0])
    center = pc + np.array([0, radius])
    phi = np.linspace(0, theta, 241)
    radial = np.stack([np.sin(phi), -np.cos(phi)], axis=-1)
    d2 = np.array([np.cos(theta), np.sin(theta)])
    normal2 = np.array([-np.sin(theta), np.cos(theta)])
    arc = center + radius * radial
    pt, end = arc[-1], arc[-1] + second_length * d2
    for offset in [-OD / 2, OD / 2]:
        outline = np.vstack([np.array([0.0, offset]), center + (radius - offset) * radial, end + offset * normal2])
        ax.plot(outline[:, 0], outline[:, 1], color="#314e62", lw=1.2)
    for end_point, normal in [(np.zeros(2), np.array([0, 1])), (end, normal2)]:
        pair = np.array([end_point - OD/2 * normal, end_point + OD/2 * normal])
        ax.plot(pair[:, 0], pair[:, 1], lw=0.8, color="#314e62")
    q = np.vstack([np.zeros(2), arc, end])
    ax.plot(q[:, 0], q[:, 1], lw=1.1, color="#167a93", dashes=(9, 3, 2, 3))
    n1_n2.dimension(ax, np.zeros(2), pc, -95, f"{first_name} = {first_length:g}")
    n1_n2.dimension(ax, pt, end, -103, f"{second_name} = {second_length:g}")
    midpoint = center + radius * np.array([np.sin(theta/2), -np.cos(theta/2)])
    label_pos = center + np.array([-95, 30])
    ax.annotate(f"R170 / {degrees:g}°", midpoint, xytext=label_pos, ha="center", fontsize=12,
                color="#204e70", arrowprops=dict(arrowstyle="-|>", lw=0.8, color="#204e70"))
    for point, label, offset in [(pc, "PC", (-6, -22)), (pt, "PT", (7, 8))]:
        ax.plot(*point, "o", ms=3.3, color="#a85d29")
        ax.annotate(label, point, xytext=offset, textcoords="offset points", fontsize=9, color="#924b19")
    ax.set_xlim(-80, 655)
    ax.set_ylim(-132, 480)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title, fontsize=14, color="#183b53", weight="bold", pad=16)


def details_sheet():
    fig = plt.figure(figsize=(16.54, 11.69), facecolor="white")
    fig.text(0.055, 0.94, "DT11-111-7  |  TRUE-SHAPE BEND DETAILS", fontsize=21, weight="bold", color="#183b53")
    fig.text(0.055, 0.905, "Each bend is shown separately in its OWN plane. These two panels are NOT one coplanar pipe.", fontsize=11, color="#526b7b")
    fig.text(0.95, 0.94, "REV 03  /  2 OF 2", fontsize=10, ha="right", color="#526b7b")
    ax1 = fig.add_axes([0.045, 0.23, 0.445, 0.59])
    ax2 = fig.add_axes([0.51, 0.23, 0.445, 0.59])
    local_bend(ax1, N[0], N[1], ANGLES[0], "N1", "N2", "B1  |  N1 - N2 plane")
    local_bend(ax2, N[1], N[2], ANGLES[1], "N2", "N3", "B2  |  N2 - N3 plane")
    fig.text(0.055, 0.18, "Plane change B1 → B2: −83.14° around the N2 axis. N2 is the SAME straight in both panels.", fontsize=12,
             color="#183b53", weight="bold")
    arcs = sum(r * np.deg2rad(a) for r, a in zip(RADII, ANGLES))
    fig.text(0.055, 0.135, f"Straight total: 629 mm   |   Bend arcs: {arcs:.2f} mm   |   N1-B1-N2-B2-N3 developed length: {sum(N)+arcs:.2f} mm",
             fontsize=11, color="#526b7b")
    fig.text(0.055, 0.095, "N dimensions exclude arcs. R170 is the centerline radius. Material: STPG370-E / OD 114.3 mm / t6 mm.",
             fontsize=10, color="#526b7b")
    fig.text(0.95, 0.037, "N4-N5 NOT INCLUDED  /  REFERENCE, NOT FOR FABRICATION  /  DO NOT SCALE", ha="right", fontsize=8, color="#526b7b")
    return fig


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GeometryTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)
    plt.rcParams.update({"font.family": "DejaVu Sans", "pdf.fonttype": 42})
    fig1, fig2 = iso_sheet(), details_sheet()
    with PdfPages(OUT / "DT11-111-7_N1-N3_isometric_rev03.pdf") as pdf:
        pdf.savefig(fig1, dpi=200)
        pdf.savefig(fig2, dpi=200)
    fig1.savefig(OUT / "DT11-111-7_N1-N3_isometric_rev03.png", dpi=150)
    fig2.savefig(OUT / "DT11-111-7_N1-N3_details_rev03.png", dpi=150)
    plt.close("all")
    data = {
        "scope": "N1-B1-N2-B2-N3 only",
        "convention": "Right-hand roll about N2 in S-to-N3 travel direction; machine sign not yet verified",
        "roll_degrees": ROLL,
        "points": {label: point.tolist() for label, point in LABELS},
        "straight_lengths": N, "bend_angles": ANGLES, "centerline_radii": RADII,
        "tests_passed": result.testsRun,
    }
    (OUT / "validation_n1_n3.json").write_text(json.dumps(data, indent=2))
    print(json.dumps(data, indent=2))
