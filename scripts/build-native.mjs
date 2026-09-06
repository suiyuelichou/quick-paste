import { existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const compilerCandidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
]
const compiler = compilerCandidates.find(existsSync)
if (!compiler) {
  console.error('未找到 Windows C# 编译器，无法构建原生输入助手。')
  process.exit(1)
}

const source = resolve('native/InputHelper.cs')
const outputDir = resolve('resources/native')
const output = resolve(outputDir, 'QuickPaste.InputHelper.exe')
mkdirSync(outputDir, { recursive: true })

const result = spawnSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${output}`, source], {
  stdio: 'inherit'
})
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`原生输入助手已生成：${output}`)
