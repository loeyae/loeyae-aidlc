#!/usr/bin/env node

import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { renderManifest } from "./render-svg-diagrams.mjs"
import { GENERIC_SVG_MANIFESTS } from "./svg-diagram-catalog.mjs"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))

try {
  let total = 0
  for (const entry of GENERIC_SVG_MANIFESTS) {
    const result = renderManifest(resolve(root, entry.input), resolve(root, entry.outputDirectory))
    total += result.count
    console.log(`已渲染 ${result.count} 个 SVG：${entry.input}`)
  }
  console.log(`全部通用 SVG 图表渲染和结构验证通过：${total} 个输出`)
} catch (error) {
  console.error(`全部通用 SVG 图表渲染失败：${error.message}`)
  process.exitCode = 1
}
