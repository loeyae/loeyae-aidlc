const DEFAULT_DESCENDER_RATIO = 0.3
const DEFAULT_CHAR_WIDTH_RATIO = 0.6

export function multilineTextBounds({ lines, x, y, fontSize = 16, anchor = "middle", lineHeight = 20 }) {
  const textLines = Array.isArray(lines) && lines.length > 0 ? lines : [""]
  const longest = Math.max(...textLines.map(line => [...String(line)].length), 1)
  const width = longest * fontSize * DEFAULT_CHAR_WIDTH_RATIO
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2
  const firstBaseline = y - ((textLines.length - 1) * lineHeight) / 2
  const lastBaseline = y + ((textLines.length - 1) * lineHeight) / 2
  return {
    left,
    right: left + width,
    top: firstBaseline - fontSize,
    bottom: lastBaseline + fontSize * DEFAULT_DESCENDER_RATIO,
    firstBaseline,
    lastBaseline,
  }
}
