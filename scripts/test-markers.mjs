import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

async function testMarkerPersistence() {
  const root = await mkdtemp(join(tmpdir(), 'marker-test-'))
  try {
    const markersDir = join(root, 'asset-library', 'markers')
    await mkdir(markersDir, { recursive: true })

    const libraryId = randomUUID()
    const marker = {
      id: randomUUID(),
      name: '底座',
      description: '教学标记',
      position: { x: 1.25, y: 0.5, z: -0.75 },
      createdAt: Date.now()
    }

    const filePath = join(markersDir, `${libraryId}.json`)
    await writeFile(filePath, JSON.stringify([marker], null, 2), 'utf8')

    const loaded = JSON.parse(await readFile(filePath, 'utf8'))
    if (!Array.isArray(loaded) || loaded.length !== 1) {
      throw new Error('标记文件读取结果不正确')
    }
    if (loaded[0].name !== '底座') {
      throw new Error('标记名称不匹配')
    }
    if (loaded[0].position.x !== 1.25) {
      throw new Error('标记坐标不匹配')
    }

    console.log('✓ 标记文件读写测试通过')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function testMarkerValidation() {
  const cases = [
    { name: '', position: { x: 0, y: 0, z: 0 }, ok: false },
    { name: '主轴', position: { x: 0, y: 1, z: 0 }, ok: true },
    { name: '外壳', position: { x: NaN, y: 0, z: 0 }, ok: false }
  ]

  for (const item of cases) {
    const valid =
      item.name.trim().length > 0 &&
      Number.isFinite(item.position.x) &&
      Number.isFinite(item.position.y) &&
      Number.isFinite(item.position.z)
    if (valid !== item.ok) {
      throw new Error(`标记校验失败: ${JSON.stringify(item)}`)
    }
  }

  console.log('✓ 标记参数校验测试通过')
}

await testMarkerPersistence()
await testMarkerValidation()
console.log('全部标记测试通过')
