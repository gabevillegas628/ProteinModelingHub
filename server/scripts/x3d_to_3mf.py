#!/usr/bin/env python3
"""
x3d_to_3mf.py
Standalone Jmol X3D to 3MF converter. Pure Python, no external dependencies.
Handles DEF/USE geometry reuse and Transform scale attributes.

Usage:
    python x3d_to_3mf.py input.x3d
    python x3d_to_3mf.py input.x3d output.3mf
    python x3d_to_3mf.py file1.x3d file2.x3d ...
"""

import sys
import math
import zipfile
import colorsys
from xml.etree import ElementTree as ET
from collections import defaultdict


# ---------------------------------------------------------------------------
# Pure-Python 4x4 matrix math
# ---------------------------------------------------------------------------

def mat_identity():
    return [[float(i == j) for j in range(4)] for i in range(4)]

def mat_mul(A, B):
    C = [[0.0] * 4 for _ in range(4)]
    for i in range(4):
        for k in range(4):
            if A[i][k] == 0:
                continue
            for j in range(4):
                C[i][j] += A[i][k] * B[k][j]
    return C

def mat_translation(tx, ty, tz):
    M = mat_identity()
    M[0][3] = tx
    M[1][3] = ty
    M[2][3] = tz
    return M

def mat_scale(sx, sy, sz):
    M = mat_identity()
    M[0][0] = sx
    M[1][1] = sy
    M[2][2] = sz
    return M

def mat_rotation(ax, ay, az, angle):
    L = math.sqrt(ax*ax + ay*ay + az*az)
    if L < 1e-10:
        return mat_identity()
    ax /= L; ay /= L; az /= L
    c = math.cos(angle)
    s = math.sin(angle)
    t = 1.0 - c
    return [
        [t*ax*ax + c,      t*ax*ay - s*az, t*ax*az + s*ay, 0],
        [t*ax*ay + s*az,   t*ay*ay + c,    t*ay*az - s*ax, 0],
        [t*ax*az - s*ay,   t*ay*az + s*ax, t*az*az + c,    0],
        [0,                0,              0,               1],
    ]

def transform_point(M, x, y, z):
    return (
        M[0][0]*x + M[0][1]*y + M[0][2]*z + M[0][3],
        M[1][0]*x + M[1][1]*y + M[1][2]*z + M[1][3],
        M[2][0]*x + M[2][1]*y + M[2][2]*z + M[2][3],
    )

def parse_floats(s):
    return [float(v) for v in s.split()]

def round_color(r, g, b, decimals=3):
    return (round(r, decimals), round(g, decimals), round(b, decimals))


# ---------------------------------------------------------------------------
# X3D scene graph walker
# ---------------------------------------------------------------------------

def strip_ns(tag):
    return tag.split('}')[-1] if '}' in tag else tag

def parse_indexed_face_set(node):
    """Parse an IndexedFaceSet into (raw_verts, raw_tris) in local space."""
    ci_str = node.get('coordIndex', '')
    coord_node = None
    for child in node:
        if strip_ns(child.tag) == 'Coordinate':
            coord_node = child
            break
    if coord_node is None or not ci_str:
        return None, None

    pts = parse_floats(coord_node.get('point', ''))
    raw_verts = [(pts[i], pts[i+1], pts[i+2]) for i in range(0, len(pts) - 2, 3)]

    raw_tris = []
    face = []
    for idx in (int(x) for x in ci_str.split()):
        if idx == -1:
            for k in range(1, len(face) - 1):
                raw_tris.append((face[0], face[k], face[k+1]))
            face = []
        else:
            face.append(idx)
    for k in range(1, len(face) - 1):
        raw_tris.append((face[0], face[k], face[k+1]))

    return raw_verts, raw_tris


def parse_x3d(filepath):
    """
    Walk the X3D scene graph and collect all geometry grouped by diffuseColor.
    Handles DEF/USE for both geometry and appearance nodes.
    Handles Transform translation, rotation, and scale.

    Returns:
        dict { (r,g,b) -> {'verts': [(x,y,z),...], 'tris': [(i,j,k),...]} }
    """
    tree = ET.parse(filepath)
    root = tree.getroot()

    groups = defaultdict(lambda: {'verts': [], 'tris': []})
    geom_defs = {}        # DEF id -> (raw_verts, raw_tris)
    appearance_defs = {}  # DEF id -> (r, g, b)

    def walk(node, M):
        tag = strip_ns(node.tag)

        if tag == 'Transform':
            # X3D transform order: T * R * S
            Mlocal = mat_identity()

            scale = node.get('scale')
            if scale:
                sv = parse_floats(scale)
                Mlocal = mat_mul(Mlocal, mat_scale(sv[0], sv[1], sv[2]))

            rot = node.get('rotation')
            if rot:
                rv = parse_floats(rot)
                Mlocal = mat_mul(mat_rotation(rv[0], rv[1], rv[2], rv[3]), Mlocal)

            trans = node.get('translation')
            if trans:
                tv = parse_floats(trans)
                Mlocal = mat_mul(mat_translation(tv[0], tv[1], tv[2]), Mlocal)

            for child in node:
                walk(child, mat_mul(M, Mlocal))

        elif tag == 'Shape':
            color = None
            raw_verts = None
            raw_tris = None

            for child in node:
                ctag = strip_ns(child.tag)

                if ctag == 'IndexedFaceSet':
                    use_id = child.get('USE')
                    def_id = child.get('DEF')
                    if use_id and use_id in geom_defs:
                        raw_verts, raw_tris = geom_defs[use_id]
                    else:
                        raw_verts, raw_tris = parse_indexed_face_set(child)
                        if def_id and raw_verts is not None:
                            geom_defs[def_id] = (raw_verts, raw_tris)

                elif ctag == 'Appearance':
                    use_id = child.get('USE')
                    def_id = child.get('DEF')
                    if use_id and use_id in appearance_defs:
                        color = appearance_defs[use_id]
                    else:
                        for ac in child:
                            if strip_ns(ac.tag) == 'Material':
                                dc = ac.get('diffuseColor', '0.8 0.8 0.8')
                                vals = parse_floats(dc)
                                color = round_color(*vals[:3])
                        if def_id and color is not None:
                            appearance_defs[def_id] = color

            if color is not None and raw_verts and raw_tris:
                g = groups[color]
                offset = len(g['verts'])
                g['verts'].extend(transform_point(M, *v) for v in raw_verts)
                g['tris'].extend(
                    (a + offset, b + offset, c + offset)
                    for a, b, c in raw_tris
                )

        else:
            for child in node:
                walk(child, M)

    walk(root, mat_identity())
    return groups


# ---------------------------------------------------------------------------
# 3MF writer
# ---------------------------------------------------------------------------

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0"
    Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>'''

def color_name(r, g, b):
    """Return a human-readable color label for an RGB triple (floats 0-1)."""
    h, l, s = colorsys.rgb_to_hls(r, g, b)  # note: colorsys returns HLS not HSL
    if l > 0.85:
        return 'white'
    if l < 0.12:
        return 'black'
    if s < 0.15:
        if l < 0.35:
            return 'dark_gray'
        if l > 0.65:
            return 'light_gray'
        return 'gray'
    deg = h * 360
    if deg < 15 or deg >= 345:
        return 'red'
    if deg < 45:
        return 'orange'
    if deg < 70:
        return 'yellow'
    if deg < 150:
        return 'green'
    if deg < 195:
        return 'cyan'
    if deg < 255:
        return 'blue'
    if deg < 285:
        return 'purple'
    return 'pink'


def write_3mf(groups, output_path):
    objects_xml = []
    items_xml = []

    for oid, (color, mesh) in enumerate(groups.items(), start=1):
        r, g, b = color
        hex_color = '#{:02X}{:02X}{:02X}'.format(
            min(255, int(r * 255)),
            min(255, int(g * 255)),
            min(255, int(b * 255)),
        )

        verts_xml = '\n          '.join(
            '<vertex x="{:.5f}" y="{:.5f}" z="{:.5f}"/>'.format(x, y, z)
            for x, y, z in mesh['verts']
        )
        tris_xml = '\n          '.join(
            '<triangle v1="{}" v2="{}" v3="{}"/>'.format(a, b, c)
            for a, b, c in mesh['tris']
        )

        obj_name = '{}_{}'.format(color_name(r, g, b), hex_color[1:])
        objects_xml.append(
            '    <object id="{}" type="model" name="{}">\n'
            '      <mesh>\n'
            '        <vertices>\n'
            '          {}\n'
            '        </vertices>\n'
            '        <triangles>\n'
            '          {}\n'
            '        </triangles>\n'
            '      </mesh>\n'
            '    </object>'.format(oid, obj_name, verts_xml, tris_xml)
        )
        items_xml.append('    <item objectid="{}"/>'.format(oid))

    model_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US"\n'
        '  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
        '  <resources>\n'
        '{}\n'
        '  </resources>\n'
        '  <build>\n'
        '{}\n'
        '  </build>\n'
        '</model>'
    ).format('\n'.join(objects_xml), '\n'.join(items_xml))

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('[Content_Types].xml', CONTENT_TYPES)
        zf.writestr('_rels/.rels', RELS)
        zf.writestr('3D/3dmodel.model', model_xml)

    print('  {} color group(s) -> {}'.format(len(groups), output_path))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def convert(input_path, output_path=None):
    if output_path is None:
        output_path = (input_path.rsplit('.', 1)[0] if '.' in input_path else input_path) + '.3mf'

    print('Processing: {}'.format(input_path))
    try:
        groups = parse_x3d(input_path)
    except Exception as e:
        print('  ERROR parsing X3D: {}'.format(e))
        import traceback; traceback.print_exc()
        return False

    if not groups:
        print('  WARNING: no geometry found.')
        return False

    total_verts = sum(len(m['verts']) for m in groups.values())
    total_tris  = sum(len(m['tris'])  for m in groups.values())
    print('  Found {} color group(s), {} vertices, {} triangles.'.format(
        len(groups), total_verts, total_tris))

    try:
        write_3mf(groups, output_path)
    except Exception as e:
        print('  ERROR writing 3MF: {}'.format(e))
        return False

    return True


def main():
    args = sys.argv[1:]
    if not args:
        print('Usage: python x3d_to_3mf.py input.x3d [output.3mf]')
        sys.exit(1)
    if len(args) == 2 and args[1].lower().endswith('.3mf'):
        ok = convert(args[0], args[1])
    else:
        ok = all(convert(f) for f in args)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
