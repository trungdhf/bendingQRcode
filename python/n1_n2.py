from pathlib import Path
import json
import unittest

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


OUT = Path(__file__).resolve().parent.parent / "output"
N1, N2, R, DEG, OD, WALL = 112.0, 304.0, 170.0, 43.4, 114.3, 6.0
THETA = np.deg2rad(DEG)
D1 = np.array([1.0, 0.0])
B1 = np.array([0.0, 1.0])
D2 = np.array([np.cos(THETA), np.sin(THETA)])
B2 = np.array([-np.sin(THETA), np.cos(THETA)])
S = np.zeros(2)
PC = S + N1 * D1
C = PC + R * B1


def arc_point(angle, radius=R):
    angle = np.asarray(angle)
    return C + radius * np.stack([np.sin(angle), -np.cos(angle)], axis=-1)


def arc_tangent(angle):
    return np.array([np.cos(angle), np.sin(angle)])


PT = arc_point(THETA)
END = PT + N2 * D2
SETBACK = R * np.tan(THETA / 2)
V = PC + SETBACK * D1


class GeometryTests(unittest.TestCase):
    def test_positions_match_at_both_joints(self):
        np.testing.assert_allclose(arc_point(0), PC, atol=1e-12)
        np.testing.assert_allclose(arc_point(THETA), END - N2 * D2, atol=1e-12)

    def test_tangents_match_at_both_joints(self):
        np.testing.assert_allclose(arc_tangent(0), D1, atol=1e-12)
        np.testing.assert_allclose(arc_tangent(THETA), D2, atol=1e-12)
        h = 1e-7
        for angle, expected in [(0, D1), (THETA, D2)]:
            derivative = (arc_point(angle + h) - arc_point(angle - h)) / (2 * h * R)
            np.testing.assert_allclose(derivative, expected, atol=1e-8)

    def test_dimensions(self):
        self.assertAlmostEqual(np.linalg.norm(PC - S), N1)
        self.assertAlmostEqual(np.linalg.norm(END - PT), N2)
        points = arc_point(np.linspace(0, THETA, 1000))
        np.testing.assert_allclose(np.linalg.norm(points - C, axis=1), R, atol=1e-10)
        self.assertAlmostEqual(np.rad2deg(np.arccos(np.dot(D1, D2))), DEG)

    def test_both_pipe_contours_are_tangent(self):
        for offset in [-OD / 2, OD / 2]:
            radius = R - offset
            np.testing.assert_allclose(arc_point(0, radius), PC + offset * B1, atol=1e-10)
            np.testing.assert_allclose(arc_point(THETA, radius), PT + offset * B2, atol=1e-10)

    def test_tangent_intersection(self):
        np.testing.assert_allclose(V, PT - SETBACK * D2, atol=1e-10)


def dimension(ax, start, end, offset, label):
    direction = end - start
    normal = np.array([-direction[1], direction[0]]) / np.linalg.norm(direction)
    a, b = start + normal * offset, end + normal * offset
    sign = np.sign(offset)
    for point, tip in [(start, a), (end, b)]:
        ax.plot(
            [point[0] + normal[0] * sign * (OD / 2 + 6), tip[0] + normal[0] * sign * 8],
            [point[1] + normal[1] * sign * (OD / 2 + 6), tip[1] + normal[1] * sign * 8],
            color="#596775", lw=0.7,
        )
    ax.annotate("", b, a, arrowprops=dict(arrowstyle="<|-|>", lw=0.8, color="#1e405e"))
    mid = (a + b) / 2
    angle = np.rad2deg(np.arctan2(direction[1], direction[0]))
    ax.text(
        *mid, label, rotation=angle, ha="center", va="center", fontsize=12,
        color="#1e405e", bbox=dict(facecolor="white", edgecolor="none", pad=2.5),
    )


def draw():
    plt.rcParams.update({"font.family": "DejaVu Sans", "pdf.fonttype": 42})
    fig = plt.figure(figsize=(11.69, 8.27), facecolor="white")
    fig.text(0.065, 0.94, "DT11-111-7  |  N1 - B1 - N2", fontsize=19, weight="bold", color="#17344e")
    fig.text(0.065, 0.905, "LOCAL 2D DETAIL  /  STPG370-E  /  OD 114.3 x t6  /  mm", fontsize=10, color="#596775")
    fig.text(0.935, 0.94, "REV 02", fontsize=10, ha="right", color="#596775")
    ax = fig.add_axes([0.065, 0.23, 0.87, 0.62])
    phi = np.linspace(0, THETA, 300)
    for offset in [-OD / 2, OD / 2]:
        curve = arc_point(phi, R - offset)
        points = np.vstack([S + offset * B1, curve, END + offset * B2])
        ax.plot(points[:, 0], points[:, 1], color="#263b4a", lw=1.35)
    for end, normal in [(S, B1), (END, B2)]:
        pair = np.array([end - OD / 2 * normal, end + OD / 2 * normal])
        ax.plot(pair[:, 0], pair[:, 1], color="#263b4a", lw=1.1)
    centerline = np.vstack([S, arc_point(phi), END])
    ax.plot(centerline[:, 0], centerline[:, 1], color="#1d7d96", lw=1.15, dashes=(10, 3, 2, 3))
    for point, label, xy in [
        (S, "S", (-15, 10)),
        (PC, "PC1", (-8, -26)),
        (PT, "PT1", (8, 10)),
        (END, "N2 end", (5, 8)),
    ]:
        ax.plot(*point, "o", ms=3.6, color="#b96829")
        ax.annotate(label, point, xytext=xy, textcoords="offset points", fontsize=9, color="#8b4b19")

    dimension(ax, S, PC, -95, "N1 = 112")
    dimension(ax, PT, END, -110, "N2 = 304")
    # Bend angle is between the forward extensions of the two straight axes.
    axis_end = V + np.array([220.0, 0.0])
    ax.plot([PC[0], axis_end[0]], [PC[1], axis_end[1]], lw=0.65, ls="--", color="#9aa5ae")
    ax.plot(*V, "+", color="#9aa5ae", ms=5)
    angle_radius = 175.0
    angle_points = V + angle_radius * np.stack([np.cos(phi), np.sin(phi)], axis=-1)
    ax.plot(angle_points[:, 0], angle_points[:, 1], lw=0.85, color="#1e405e")
    for start, end in [(1, 0), (-2, -1)]:
        ax.annotate("", angle_points[end], angle_points[start],
                    arrowprops=dict(arrowstyle="-|>", lw=0.8, color="#1e405e"))
    label_point = V + 210 * np.array([np.cos(THETA / 2), np.sin(THETA / 2)])
    ax.text(*label_point, "43.4°", fontsize=12, color="#1e405e", ha="center", va="center",
            bbox=dict(facecolor="white", edgecolor="none", pad=2))

    on_arc = arc_point(THETA * 0.45)
    ax.plot(*C, "+", ms=9, color="#1e405e", mew=0.8)
    ax.annotate("R170 (CL)", on_arc, xytext=(78, 197), ha="center", fontsize=12, color="#1e405e",
                arrowprops=dict(arrowstyle="-|>", lw=0.8, color="#1e405e"))
    ax.annotate("OD 114.3", xy=(0, OD / 2), xytext=(-52, 105), fontsize=10, color="#1e405e",
                arrowprops=dict(arrowstyle="-|>", lw=0.8, color="#1e405e"))

    ax.set_aspect("equal")
    ax.set_xlim(-85, 565)
    ax.set_ylim(-127, 350)
    ax.axis("off")
    fig.text(0.065, 0.18, "112 mm straight  →  R170 / 43.4° bend  →  304 mm straight",
             fontsize=11, color="#17344e", weight="bold")
    fig.text(0.065, 0.143, f"Bend arc length = {R * THETA:.2f} mm    |    Local developed length = {N1 + N2 + R * THETA:.2f} mm",
             fontsize=10, color="#596775")
    fig.text(0.065, 0.108, "N values are straight lengths, excluding the bend arc; PC1 / PT1 are tangency points.",
             fontsize=9, color="#596775")
    fig.text(0.065, 0.076, "Partial detail only: N3-N5 and inter-bend rotations are NOT shown. Do not scale drawing.",
             fontsize=9, color="#875222")
    fig.text(0.935, 0.035, "REFERENCE  /  NOT FOR FABRICATION  /  A4 landscape", ha="right", fontsize=8, color="#596775")
    fig.savefig(OUT / "DT11-111-7_N1-N2_rev02.pdf")
    fig.savefig(OUT / "DT11-111-7_N1-N2_rev02.png", dpi=185)
    plt.close(fig)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GeometryTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)
    draw()
    data = {
        "scope": "N1-B1-N2 only; not the complete part",
        "N1": N1, "N2": N2, "radius_centerline": R, "bend_angle_degrees": DEG,
        "PC1": PC.tolist(), "PT1": PT.tolist(), "N2_end": END.tolist(),
        "arc_start_tangent": arc_tangent(0).tolist(),
        "arc_end_tangent": arc_tangent(THETA).tolist(),
        "arc_length_mm": R * THETA,
        "local_developed_length_mm": N1 + N2 + R * THETA,
        "tests_passed": result.testsRun,
    }
    (OUT / "validation.json").write_text(json.dumps(data, indent=2))
    print(json.dumps(data, indent=2))
