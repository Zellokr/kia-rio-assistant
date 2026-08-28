#!/usr/bin/env python3
"""Minimal CID-aware PDF text extractor.

Why this exists: the project contract lives in
`docs/Especificacion_Final_Asistente_Kia_Rio_v2.0.pdf`, which is untracked and
unreadable on this machine — there is no poppler, pypdf, pdfminer or pymupdf
available, so neither `pdftotext` nor any agent's built-in PDF reader can open
it. `docs/PHASE_ROADMAP.md` mirrors section 3 of that PDF into the repository;
this script is how that mirror is produced and re-checked.

    python3 scripts/extract-spec-pdf.py docs/Especificacion_Final_Asistente_Kia_Rio_v2.0.pdf

Handles what these documents need and nothing more:
  - FlateDecode streams, including object streams (PDF 1.5 /ObjStm)
  - Per-font /ToUnicode CMaps (bfchar + bfrange)
  - Identity-H style 2-byte CIDs and 1-byte simple fonts
  - Tf / Tj / TJ / ' / " text operators, with Td/TD/T*/ET line breaks

No external dependencies beyond zlib.
"""

import re
import sys
import zlib

OBJ_RE = re.compile(rb"(\d+)\s+(\d+)\s+obj\b")


def load_objects(data):
    """Return {objnum: (raw_dict_bytes, stream_bytes_or_None)}."""
    objects = {}
    for match in OBJ_RE.finditer(data):
        num = int(match.group(1))
        start = match.end()
        end = data.find(b"endobj", start)
        if end == -1:
            continue
        body = data[start:end]
        stream = None
        smatch = re.search(rb"stream\r?\n", body)
        if smatch:
            header = body[: smatch.start()]
            raw = body[smatch.end():]
            raw = re.sub(rb"\s*endstream\s*$", b"", raw)
            if b"/FlateDecode" in header:
                try:
                    stream = zlib.decompress(raw)
                except zlib.error:
                    try:
                        stream = zlib.decompressobj().decompress(raw)
                    except zlib.error:
                        stream = None
            else:
                stream = raw
            body = header
        objects[num] = (body, stream)
    return objects


def expand_object_streams(objects):
    """Inline objects that live inside /ObjStm containers."""
    extra = {}
    for body, stream in list(objects.values()):
        if b"/ObjStm" not in body or stream is None:
            continue
        n_match = re.search(rb"/N\s+(\d+)", body)
        first_match = re.search(rb"/First\s+(\d+)", body)
        if not (n_match and first_match):
            continue
        count = int(n_match.group(1))
        first = int(first_match.group(1))
        header = stream[:first].split()
        for i in range(count):
            try:
                num = int(header[2 * i])
                off = int(header[2 * i + 1])
            except (IndexError, ValueError):
                break
            start = first + off
            end = first + int(header[2 * i + 3]) if 2 * i + 3 < len(header) else len(stream)
            extra[num] = (stream[start:end], None)
    for num, value in extra.items():
        objects.setdefault(num, value)
    return objects


def parse_tounicode(cmap):
    """Parse a ToUnicode CMap into {code_int: str}, plus the code byte width."""
    mapping = {}
    width = 2

    for block in re.findall(rb"beginbfchar(.*?)endbfchar", cmap, re.S):
        for src, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            width = max(1, len(src) // 2)
            mapping[int(src, 16)] = hex_to_text(dst)

    for block in re.findall(rb"beginbfrange(.*?)endbfrange", cmap, re.S):
        # <lo> <hi> <dst>
        for lo, hi, dst in re.findall(
            rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block
        ):
            width = max(1, len(lo) // 2)
            lo_i, hi_i = int(lo, 16), int(hi, 16)
            base = int(dst, 16)
            for offset in range(min(hi_i - lo_i + 1, 65536)):
                mapping[lo_i + offset] = safe_chr(base + offset)
        # <lo> <hi> [ <d1> <d2> ... ]
        for lo, hi, arr in re.findall(
            rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[(.*?)\]", block, re.S
        ):
            width = max(1, len(lo) // 2)
            lo_i = int(lo, 16)
            for offset, dst in enumerate(re.findall(rb"<([0-9A-Fa-f]+)>", arr)):
                mapping[lo_i + offset] = hex_to_text(dst)

    return mapping, width


def hex_to_text(hexbytes):
    raw = bytes.fromhex(hexbytes.decode("ascii"))
    if len(raw) % 2:
        raw += b"\x00"
    try:
        return raw.decode("utf-16-be")
    except UnicodeDecodeError:
        return ""


def safe_chr(code):
    try:
        return chr(code)
    except ValueError:
        return ""


def resolve_dict(body, key, objects):
    """Return the body of /key, whether it is inline <<...>> or an indirect ref."""
    ref = re.search(rb"/" + key + rb"\s+(\d+)\s+\d+\s+R", body)
    if ref:
        target = objects.get(int(ref.group(1)))
        return target[0] if target else b""
    inline = re.search(rb"/" + key + rb"\s*<<(.*?)>>", body, re.S)
    return inline.group(1) if inline else b""


def font_map_for_page(page_body, objects):
    """Return {font_resource_name: (cmap_dict, width)} for one page."""
    fonts = {}
    res_body = resolve_dict(page_body, b"Resources", objects) or page_body
    res_body = resolve_dict(res_body, b"Font", objects)

    for name, num in re.findall(rb"/([^\s/<>\[\]]+)\s+(\d+)\s+\d+\s+R", res_body):
        font_obj = objects.get(int(num))
        if not font_obj:
            continue
        tu = re.search(rb"/ToUnicode\s+(\d+)\s+\d+\s+R", font_obj[0])
        if not tu:
            fonts[name] = ({}, 1)
            continue
        cmap_obj = objects.get(int(tu.group(1)))
        if cmap_obj and cmap_obj[1]:
            fonts[name] = parse_tounicode(cmap_obj[1])
        else:
            fonts[name] = ({}, 2)
    return fonts


STRING_RE = re.compile(rb"\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>", re.S)
TOKEN_RE = re.compile(
    rb"/([^\s/<>\[\]()]+)\s+[\d.]+\s+Tf"          # 1: font select
    rb"|(\[(?:[^\[\]\\]|\\.)*\])\s*TJ"            # 2: TJ array
    rb"|(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>)\s*(?:Tj|')"  # 3: Tj
    rb"|(T\*|Td|TD|ET)",                          # 4: line break ops
    re.S,
)


def decode_string(token, cmap, width):
    if token.startswith(b"<"):
        hexdigits = re.sub(rb"[^0-9A-Fa-f]", b"", token[1:-1])
        if len(hexdigits) % 2:
            hexdigits += b"0"
        raw = bytes.fromhex(hexdigits.decode("ascii"))
    else:
        raw = unescape_literal(token[1:-1])

    if not cmap:
        return raw.decode("latin-1", "replace")

    out = []
    step = max(1, width)
    for i in range(0, len(raw) - step + 1, step):
        code = int.from_bytes(raw[i:i + step], "big")
        out.append(cmap.get(code, ""))
    return "".join(out)


ESCAPES = {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f"}


def unescape_literal(raw):
    out = bytearray()
    i = 0
    while i < len(raw):
        if raw[i:i + 1] == b"\\" and i + 1 < len(raw):
            nxt = raw[i + 1:i + 2]
            if nxt in ESCAPES:
                out += ESCAPES[nxt]
                i += 2
            elif nxt.isdigit():
                octal = raw[i + 1:i + 4]
                out.append(int(octal, 8) & 0xFF)
                i += 1 + len(octal)
            else:
                out += nxt
                i += 2
        else:
            out += raw[i:i + 1]
            i += 1
    return bytes(out)


def extract_page(content, fonts):
    cmap, width = {}, 1
    parts = []
    for match in TOKEN_RE.finditer(content):
        if match.group(1):
            cmap, width = fonts.get(match.group(1), ({}, 1))
        elif match.group(2):
            for token in STRING_RE.findall(match.group(2)):
                parts.append(decode_string(token, cmap, width))
        elif match.group(3):
            parts.append(decode_string(match.group(3), cmap, width))
        elif match.group(4):
            parts.append("\n")
    text = "".join(parts)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return "\n".join(line.rstrip() for line in text.splitlines())


def page_content(page_body, objects):
    refs = re.search(rb"/Contents\s+(\d+)\s+\d+\s+R", page_body)
    if refs:
        obj = objects.get(int(refs.group(1)))
        return obj[1] or b"" if obj else b""
    arr = re.search(rb"/Contents\s*\[(.*?)\]", page_body, re.S)
    if arr:
        chunks = []
        for num in re.findall(rb"(\d+)\s+\d+\s+R", arr.group(1)):
            obj = objects.get(int(num))
            if obj and obj[1]:
                chunks.append(obj[1])
        return b"\n".join(chunks)
    return b""


def main(path):
    data = open(path, "rb").read()
    objects = expand_object_streams(load_objects(data))

    pages = [
        (num, body)
        for num, (body, _) in sorted(objects.items())
        if re.search(rb"/Type\s*/Page\b", body) and b"/Pages" not in body[:200]
    ]

    for index, (num, body) in enumerate(pages, 1):
        content = page_content(body, objects)
        if not content:
            continue
        text = extract_page(content, font_map_for_page(body, objects))
        print(f"\n===== PAGE {index} (obj {num}) =====")
        print(text)


if __name__ == "__main__":
    main(sys.argv[1])
