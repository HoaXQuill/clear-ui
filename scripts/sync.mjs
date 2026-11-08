// 把插件文件同步到已安装的 profile 目录。
//
// 为什么需要它：`dsh plugin add file:...` 在 profile 里放的是源文件的硬链接拷贝。
// 编辑器保存常常「换 inode」（先写临时文件再改名），硬链接会断掉，于是 profile 里
// 留着旧内容。改完代码跑一下这个脚本，再重启 DSH。
//
// 用法：
//   node scripts/sync.mjs                 # 默认同步到 ~/.dsh/profiles/desktop
//   node scripts/sync.mjs <profileDir>
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const profile = process.argv[2] ?? join(homedir(), '.dsh', 'profiles', 'desktop')
const target = join(profile, 'node_modules', 'clear-ui')

const files = ['package.json', 'cordis.patch.yml']
for (const name of await readdir(join(pkgRoot, 'lib'))) {
  if (name.endsWith('.js')) files.push(join('lib', name))
}

for (const rel of files) {
  const to = join(target, rel)
  await mkdir(dirname(to), { recursive: true })
  await copyFile(join(pkgRoot, rel), to)
}

console.log('synced ' + files.length + ' files -> ' + target)
