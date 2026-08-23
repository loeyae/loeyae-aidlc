#!/usr/bin/env node

import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { renderManifest } from "./render-svg-diagrams.mjs"
import { GENERIC_SVG_MANIFESTS } from "./svg-diagram-catalog.mjs"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))

try {
  let total = 0
  const migrationWarnings = []
  for (const entry of GENERIC_SVG_MANIFESTS) {
    const result = renderManifest(resolve(root, entry.input), resolve(root, entry.outputDirectory))
    total += result.count
    migrationWarnings.push(...result.migrationWarnings)
    console.log(`已渲染 ${result.count} 个 SVG：${entry.input}`)
  }
  const status = migrationWarnings.length > 0 ? "完成（存在迁移提示）" : "通过"
  console.log(`全部通用 SVG 图表渲染和结构验证${status}：${total} 个输出`)
  if (migrationWarnings.length > 0) {
    console.warn(`兼容性迁移提示：旧资产待迁移 ${migrationWarnings.length} 项：${migrationWarnings.join("；")}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(`全部通用 SVG 图表渲染失败：${error.message}`)
  process.exitCode = 1
}
