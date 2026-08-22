#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { renderDeliveryBusinessFlowSvg } from "./render-delivery-business-flow-svg.mjs"
import { renderDiagram } from "./render-svg-diagrams.mjs"
import { GENERIC_SVG_MANIFESTS, STRICT_SVG_DIAGRAMS } from "./svg-diagram-catalog.mjs"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const UNSAFE_SVG = /<\s*(?:script|foreignObject|image|style)\b|<[^>]*\b(?:href|on[a-zA-Z]+|style)\s*=|<[^>]*url\s*\(\s*(?!#)[^)]*\)/i
const MERMAID_FENCE = /^(?: {0,3})(?:`{3,}|~{3,})[ \t]*mermaid\b/im

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function countMatches(text, expression) {
  return [...text.matchAll(expression)].length
}

function validateSvg(svgPath, expectedNodes, expectedEdges, expectedSvg) {
  assert(existsSync(svgPath), `缺少 SVG 输出：${relative(root, svgPath)}`)
  const svg = readFileSync(svgPath, "utf8")
  assert(svg === expectedSvg, `${relative(root, svgPath)} 与结构化源不一致，请重新渲染`)
  assert(/<svg\b/.test(svg), `${relative(root, svgPath)} 缺少 SVG 根元素`)
  assert(/\bviewBox=/.test(svg) && /\brole="img"/.test(svg), `${relative(root, svgPath)} 缺少 viewBox 或图片角色`)
  assert(/<title\b/.test(svg) && /<desc\b/.test(svg), `${relative(root, svgPath)} 缺少无障碍标题或描述`)
  assert(!UNSAFE_SVG.test(svg), `${relative(root, svgPath)} 包含不允许的可执行或外部嵌入内容`)
  assert(countMatches(svg, /\bdata-node="/g) === expectedNodes, `${relative(root, svgPath)} 的节点数量与结构化源不一致`)
  assert(countMatches(svg, /\bdata-edge="/g) === expectedEdges, `${relative(root, svgPath)} 的连线数量与结构化源不一致`)
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function hasSvgImageReference(markdown, output) {
  const imageReference = new RegExp(`!\\[[^\\]]*\\]\\(assets/${escapeRegularExpression(output)}(?:[ \\t]+["'][^"']*["'])?\\)`)
  let fence = null
  for (const line of markdown.split(/\r?\n/)) {
    const delimiter = line.match(/^(?: {0,3})(`{3,}|~{3,})/)
    if (delimiter) {
      const marker = delimiter[1]
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (!fence && imageReference.test(line)) return true
  }
  return false
}

function validateReferences(references) {
  for (const reference of references) {
    const documentPath = resolve(root, reference.document)
    assert(existsSync(documentPath), `缺少引用 SVG 的文档：${reference.document}`)
    const markdown = readFileSync(documentPath, "utf8")
    for (const output of reference.outputs) {
      const assetPath = `assets/${output}`
      assert(hasSvgImageReference(markdown, output), `${reference.document} 未以 Markdown 图片形式引用 ${assetPath}`)
    }
  }
}

function walkMarkdown(directory, results = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) walkMarkdown(path, results)
    else if (entry.isFile() && entry.name.endsWith(".md")) results.push(path)
  }
  return results
}

try {
  let diagramCount = 0
  for (const entry of GENERIC_SVG_MANIFESTS) {
    const manifestPath = resolve(root, entry.input)
    assert(existsSync(manifestPath), `缺少结构化图表源：${entry.input}`)
    const manifest = readJson(manifestPath)
    assert(manifest.version === 1 && Array.isArray(manifest.diagrams), `${entry.input} 不符合版本 1 图表清单`)
    const outputs = new Set()
    for (const diagram of manifest.diagrams) {
      assert(!outputs.has(diagram.output), `${entry.input} 存在重复输出：${diagram.output}`)
      outputs.add(diagram.output)
      validateSvg(resolve(root, entry.outputDirectory, diagram.output), diagram.nodes.length, (diagram.edges ?? []).length, renderDiagram(diagram))
      diagramCount += 1
    }
    validateReferences(entry.references)
  }

  for (const entry of STRICT_SVG_DIAGRAMS) {
    const inputPath = resolve(root, entry.input)
    assert(existsSync(inputPath), `缺少严格端点结构化源：${entry.input}`)
    const diagram = readJson(inputPath)
    validateSvg(resolve(root, entry.output), diagram.nodes.length, diagram.edges.length, renderDeliveryBusinessFlowSvg(diagram))
    validateReferences([{ document: entry.document, outputs: [entry.output.split("/").at(-1)] }])
  }

  const mermaidFiles = walkMarkdown(root).filter(path => MERMAID_FENCE.test(readFileSync(path, "utf8")))
  assert(mermaidFiles.length === 0, `仍存在 Mermaid 图块：${mermaidFiles.map(path => relative(root, path)).join(", ")}`)
  console.log(`SVG 图表验证通过：${diagramCount} 个通用场景，${STRICT_SVG_DIAGRAMS.length} 个严格端点场景，且无 Mermaid 图块。`)
} catch (error) {
  console.error(`SVG 图表验证失败：${error.message}`)
  process.exitCode = 1
}
