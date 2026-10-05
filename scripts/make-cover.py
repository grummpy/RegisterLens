"""Recreate the Register Lens cover when the original upload is not on disk."""

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1920, 1080
BG = (12, 16, 22)
GOLD = (232, 176, 64)
CYAN = (94, 214, 222)
TEAL = (80, 196, 176)
AMBER = (255, 176, 64)
INK = (244, 247, 250)
MUTED = (176, 190, 200)
PANEL = (16, 24, 32)
LINE = (58, 78, 92)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def mono(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return font(size)


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image, "RGBA")

    # Warm refinery glow and cool blueprint wash.
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((-200, -80, 900, 520), fill=(180, 110, 30, 70))
    g.ellipse((1100, -200, 2100, 700), fill=(30, 90, 120, 50))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    image.paste(Image.alpha_composite(image.convert("RGBA"), glow).convert("RGB"))
    draw = ImageDraw.Draw(image)

    # Simple plant silhouette.
    for x, h in ((40, 280), (90, 360), (150, 220), (210, 420), (280, 300), (340, 180)):
        draw.rectangle((x, 250 - h // 6, x + 28, 430), fill=(28, 22, 16))
        draw.polygon([(x + 14, 250 - h // 6 - 70), (x - 6, 250 - h // 6), (x + 34, 250 - h // 6)], fill=(40, 30, 18))
    draw.rectangle((0, 400, 520, 470), fill=(24, 20, 16))

    # Faint rings on the right.
    for radius in (80, 140, 210):
        draw.ellipse((1580 - radius, 80 - radius // 4, 1580 + radius, 80 + radius), outline=(40, 70, 84))

    title = font(132, bold=True)
    draw.text((WIDTH / 2, 70), "REGISTER LENS", font=title, fill=GOLD, anchor="ma")
    sub = font(36, bold=True)
    draw.text((690, 220), "Offline", font=sub, fill=GOLD, anchor="ma")
    draw.text((960, 220), "Modbus TCP", font=sub, fill=CYAN, anchor="ma")
    draw.text((1220, 220), "decoder", font=sub, fill=GOLD, anchor="ma")
    draw.line((430, 250, 700, 250), fill=GOLD, width=3)
    draw.line((1220, 250, 1490, 250), fill=GOLD, width=3)

    draw.rounded_rectangle((70, 280, 1850, 930), radius=18, outline=LINE, width=2, fill=(10, 16, 22))

    heading = font(28, bold=True)
    small = font(20)
    tiny = font(16)
    hex_font = mono(26)

    draw.text((120, 320), "MODBUS TCP MESSAGE (HEX)", font=heading, fill=GOLD)
    offsets = ["00", "06", "0C", "10"]
    for index, label in enumerate(offsets):
        draw.text((150 + index * 220, 380), label, font=tiny, fill=MUTED)

    row_a = ["00", "01", "00", "00", "00", "06", "01", "03", "00", "00", "00", "02"]
    row_b = ["00", "FD", "00", "00", "00", "02", "41", "A6", "66", "66"]
    for index, value in enumerate(row_a):
        x = 130 + index * 78
        draw.rounded_rectangle((x, 420, x + 68, 478), radius=6, outline=(70, 90, 104), fill=(22, 32, 42))
        draw.text((x + 34, 449), value, font=hex_font, fill=INK, anchor="mm")
    for index, value in enumerate(row_b):
        x = 130 + index * 78
        selected = index < 2
        register = index >= 6
        fill = (58, 42, 12) if selected else ((18, 48, 46) if register else (18, 36, 44))
        outline = AMBER if selected else (TEAL if register else CYAN)
        draw.rounded_rectangle((x, 500, x + 68, 568), radius=6, outline=outline, width=3 if selected else 2, fill=fill)
        draw.text((x + 34, 534), value, font=hex_font, fill=AMBER if selected else INK, anchor="mm")

    draw.rectangle((120, 610, 148, 638), fill=AMBER)
    draw.text((160, 612), "Selected bytes", font=small, fill=INK)
    draw.rectangle((430, 610, 458, 638), fill=(90, 104, 116))
    draw.text((470, 612), "MBAP Header (7 bytes)", font=small, fill=INK)
    draw.rectangle((860, 610, 888, 638), fill=CYAN)
    draw.text((900, 612), "PDU", font=small, fill=INK)
    draw.rectangle((1040, 610, 1068, 638), fill=TEAL)
    draw.text((1080, 612), "Register value (float)", font=small, fill=INK)
    draw.text((120, 690), "Teaching mode: explicit map", font=font(26, bold=True), fill=GOLD)

    # Right decode card.
    draw.rounded_rectangle((1120, 330, 1780, 900), radius=14, outline=CYAN, width=2)
    draw.text((1160, 360), "DECODED BY EXPLICIT MAP", font=heading, fill=CYAN)
    draw.text((1160, 420), "MBAP HEADER", font=font(24, bold=True), fill=INK)
    draw.text((1580, 420), "7 bytes", font=small, fill=MUTED)
    headers = [("Transaction ID", "00 01"), ("Protocol ID", "00 00"), ("Length", "00 06"), ("Unit ID", "01")]
    for index, (name, value) in enumerate(headers):
        x = 1160 + (index % 4) * 150
        draw.text((x, 470), name, font=tiny, fill=MUTED)
        draw.text((x, 496), value, font=mono(22), fill=INK)
    draw.line((1160, 540, 1740, 540), fill=LINE, width=2)
    draw.text((1160, 560), "PDU", font=font(24, bold=True), fill=INK)
    draw.text((1580, 560), "5 bytes", font=small, fill=MUTED)
    draw.text((1160, 610), "Function Code", font=tiny, fill=MUTED)
    draw.text((1160, 636), "03 (Read Holding Registers)", font=small, fill=INK)
    draw.text((1500, 610), "Starting Address", font=tiny, fill=MUTED)
    draw.text((1500, 636), "00 00", font=mono(22), fill=INK)

    draw.rounded_rectangle((1160, 700, 1740, 860), radius=10, outline=GOLD, width=3)
    draw.text((1180, 720), "REGISTER VALUE (FLOAT)", font=font(22, bold=True), fill=GOLD)
    draw.text((1180, 770), "Value", font=small, fill=MUTED)
    draw.text((1300, 755), "25.3 °C", font=font(48, bold=True), fill=CYAN)
    draw.text((1180, 820), "(IEEE 754 Single Precision)", font=small, fill=MUTED)
    draw.text((1160, 880), "Mapped from register address 0x0000", font=small, fill=CYAN)
    draw.text((1160, 910), "(2 registers, byte order: Big Endian)", font=tiny, fill=MUTED)

    footer = [
        "INDUSTRIAL PROTOCOL",
        "OFFLINE ANALYSIS",
        "EXPLICIT MAP TEACHING",
        "NO VENDOR LOCK-IN",
        "SEE INSIDE THE BYTES",
    ]
    for index, label in enumerate(footer):
        x = 80 + index * 370
        draw.text((x, 970), label, font=font(22, bold=True), fill=GOLD if index % 2 == 0 else CYAN)

    image.save("docs/cover.jpg", quality=92, optimize=True)


if __name__ == "__main__":
    main()
