import * as THREE from 'three'
import {
  type PreviewSettings,
  DEFAULT_PREVIEW_SETTINGS
} from '../utils/previewSettings'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import type { ModelStats } from '../types'
import { toLocalUrl, resolveLocalResourceUrl, toLocalResourcePath, parseLocalProtocolPath, joinRelativePath } from '../utils/localFile'
import { readFileBuffer } from '../utils/readFileBuffer'
import { yieldToMain } from '../utils/async'
import { configureMeshTextureWrapping, configureObjectTextureWrapping, applyPreviewTextureWrapping, normalizePreviewMaterials } from './materialPbr'
import { applyStlUpAxisRotation, DEFAULT_STL_UP_AXIS, type StlUpAxis } from '../utils/stlOrientation'

function yieldBeforeHeavyWork(): Promise<void> {
  return yieldToMain()
}

export async function loadModelFromPath(
  filePath: string,
  formatExtension?: string,
  options?: { lightweight?: boolean; upAxis?: StlUpAxis }
): Promise<THREE.Object3D> {
  const extFromPath = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  let ext: string
  if (formatExtension) {
    ext = `.${formatExtension.toLowerCase().replace(/^\./, '')}`
  } else if (extFromPath === '.3dam') {
    throw new Error('加密模型缺少原始格式信息')
  } else {
    ext = extFromPath
  }

  const buffer = await readFileBuffer(filePath)
  await yieldBeforeHeavyWork()
  if (buffer.byteLength > 16 * 1024 * 1024) {
    await yieldBeforeHeavyWork()
  }
  const dir = await window.electronAPI.getDirname(filePath)
  const fileName = filePath.split(/[/\\]/).pop() ?? 'model'

  let object: THREE.Object3D
  switch (ext) {
    case '.glb':
      object = await loadGLTF(buffer, dir)
      break
    case '.gltf':
      object = await loadGLTFText(buffer, dir)
      break
    case '.obj':
      object = await loadOBJ(buffer, dir, fileName)
      break
    case '.fbx':
      object = await loadFBX(buffer, dir, { lightweight: options?.lightweight })
      break
    case '.3ds':
      object = await load3DS(buffer, dir)
      break
    case '.stl':
      object = await loadSTL(buffer, options?.upAxis ?? DEFAULT_STL_UP_AXIS)
      break
    default:
      throw new Error(`Unsupported format: ${ext}`)
  }

  if (options?.lightweight) {
    // 缩略图路径：不阻塞等待外部贴图，避免缺失/异常贴图导致一直转圈
    return object
  }

  await waitForModelTextures(object, { modelFilePath: filePath })
  return object
}

/** 1x1 透明 PNG，用于缩略图生成时占位，避免 FBX 外置贴图拖死加载 */
const STUB_TEXTURE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function createLocalLoadingManager(
  baseDir: string,
  options?: { stubTextures?: boolean }
): {
  manager: THREE.LoadingManager
  done: Promise<void>
} {
  let resolveDone!: () => void
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  const settleDone = (): void => resolveDone()

  const manager = new THREE.LoadingManager(settleDone, undefined, settleDone)
  manager.setURLModifier((url) => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    if (options?.stubTextures) return STUB_TEXTURE_DATA_URL
    return resolveLocalResourceUrl(url, baseDir)
  })
  manager.addHandler(/\.tga$/i, new TGALoader(manager))
  return { manager, done }
}

async function awaitLoadingManagerIdle(
  manager: THREE.LoadingManager,
  done: Promise<void>,
  timeoutMs = 60_000
): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  if (manager.itemsTotal === 0) return
  if (manager.itemsTotal === manager.itemsLoaded) return
  await Promise.race([
    done,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
  ])
}

const MODEL_TEXTURE_KEYS = [
  'map',
  'emissiveMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap'
] as const

const MODEL_TEXTURE_SLOTS: Array<{ key: (typeof MODEL_TEXTURE_KEYS)[number]; srgb: boolean }> = [
  { key: 'map', srgb: true },
  { key: 'emissiveMap', srgb: true },
  { key: 'normalMap', srgb: false },
  { key: 'roughnessMap', srgb: false },
  { key: 'metalnessMap', srgb: false },
  { key: 'aoMap', srgb: false },
  { key: 'alphaMap', srgb: false },
  { key: 'bumpMap', srgb: false },
  { key: 'displacementMap', srgb: false },
  { key: 'lightMap', srgb: false }
]

function isTextureImageReady(texture: THREE.Texture): boolean {
  const image = texture.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined
  if (!image) return false
  if (image instanceof HTMLCanvasElement) return image.width > 0 && image.height > 0
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return image.width > 0 && image.height > 0
  }
  if (image instanceof HTMLImageElement) {
    return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  }
  return true
}

function collectModelTextures(object: THREE.Object3D): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>()
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!mat) continue
      for (const key of MODEL_TEXTURE_KEYS) {
        const texture = (mat as Record<string, unknown>)[key]
        if (texture instanceof THREE.Texture) {
          textures.add(texture)
        }
      }
    }
  })
  return textures
}

async function waitForTextureImage(texture: THREE.Texture): Promise<void> {
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    const image = texture.image as
      | HTMLImageElement
      | HTMLCanvasElement
      | ImageBitmap
      | undefined

    if (!image) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      continue
    }

    if (image instanceof HTMLCanvasElement || (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)) {
      if (isTextureImageReady(texture)) return
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      continue
    }

    if (!(image instanceof HTMLImageElement)) return

    if (image.complete && image.naturalWidth > 0) return

    if (image.complete && image.naturalWidth === 0) {
      console.warn('贴图加载失败:', texture.name || image.src)
      return
    }

    const remaining = Math.max(0, deadline - Date.now())
    try {
      await Promise.race([
        image.decode(),
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('texture-decode-timeout')), remaining)
        })
      ])
      if (image.naturalWidth > 0) return
    } catch {
      await Promise.race([
        new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        }),
        new Promise<void>((resolve) => setTimeout(resolve, remaining))
      ])
      return
    }
  }
}

function extractTextureFileName(texture: THREE.Texture): string | null {
  const image = texture.image as HTMLImageElement | undefined
  if (image?.src) {
    try {
      const path = parseLocalProtocolPath(image.src)
      if (path) {
        return path.split(/[/\\]/).pop() ?? null
      }
    } catch {
      /* ignore malformed texture src */
    }
  }

  const name = texture.name?.trim()
  if (name && /\.(png|jpe?g|tga|bmp|webp|tif{1,2})$/i.test(name)) {
    return name.split(/[/\\]/).pop() ?? name
  }

  return null
}

async function reloadTextureFromFile(texture: THREE.Texture, filePath: string): Promise<boolean> {
  const exists = await window.electronAPI.fileExists(filePath)
  if (!exists) return false

  return new Promise<boolean>((resolve) => {
    const loader = new THREE.TextureLoader()
    loader.load(
      toLocalUrl(filePath),
      (loaded) => {
        texture.image = loaded.image
        applyPreviewTextureWrapping(texture)
        texture.needsUpdate = true
        loaded.dispose()
        resolve(isTextureImageReady(texture))
      },
      undefined,
      () => resolve(false)
    )
  })
}

async function repairFailedModelTextures(
  object: THREE.Object3D,
  modelFilePath: string
): Promise<void> {
  const baseDir = await window.electronAPI.getDirname(modelFilePath)
  const modelFileName = modelFilePath.split(/[/\\]/).pop() ?? ''
  const modelStem = modelFileName.replace(/\.[^.]+$/, '')
  const normalizedBase = baseDir.replace(/\\/g, '/')

  const repairs: Promise<void>[] = []

  for (const texture of collectModelTextures(object)) {
    if (isTextureImageReady(texture)) continue

    const fileName = extractTextureFileName(texture)
    if (!fileName) continue

    const candidates = [
      joinRelativePath(normalizedBase, fileName),
      modelStem ? joinRelativePath(normalizedBase, `${modelStem}.fbm/${fileName}`) : null
    ].filter((value): value is string => !!value)

    repairs.push(
      (async () => {
        for (const candidate of candidates) {
          const ok = await reloadTextureFromFile(texture, candidate)
          if (ok) return
        }
      })()
    )
  }

  await Promise.all(repairs)
}

function finalizeModelTextureUpload(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!mat) continue
      for (const { key, srgb } of MODEL_TEXTURE_SLOTS) {
        const texture = (mat as Record<string, unknown>)[key]
        if (!(texture instanceof THREE.Texture)) continue
        const targetColorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
        if (texture.colorSpace !== targetColorSpace) {
          texture.colorSpace = targetColorSpace
        }
        if (!isTextureImageReady(texture)) {
          if (key === 'aoMap' && mat instanceof THREE.MeshStandardMaterial) {
            mat.aoMap = null
          }
          continue
        }
        applyPreviewTextureWrapping(texture)
        texture.needsUpdate = true
      }
      mat.needsUpdate = true
    }
  })
  configureObjectTextureWrapping(object)
  normalizePreviewMaterials(object)
}

/** 等待模型材质引用的贴图解码完成，避免首帧先显示纯色再跳到贴图。 */
export async function waitForModelTextures(
  object: THREE.Object3D,
  options?: { modelFilePath?: string }
): Promise<void> {
  const textures = collectModelTextures(object)
  await Promise.all([...textures].map(waitForTextureImage))

  if (options?.modelFilePath) {
    await repairFailedModelTextures(object, options.modelFilePath)
    const retried = collectModelTextures(object)
    await Promise.all([...retried].map(waitForTextureImage))
  }

  finalizeModelTextureUpload(object)
}

function createGLTFLoader(baseDir: string): {
  loader: GLTFLoader
  manager: THREE.LoadingManager
  done: Promise<void>
} {
  const { manager, done } = createLocalLoadingManager(baseDir)
  return { loader: new GLTFLoader(manager), manager, done }
}

function createFBXLoader(
  baseDir: string,
  options?: { stubTextures?: boolean }
): {
  loader: FBXLoader
  manager: THREE.LoadingManager
  done: Promise<void>
} {
  const { manager, done } = createLocalLoadingManager(baseDir, options)
  const loader = new FBXLoader(manager)
  if (!options?.stubTextures) {
    loader.setResourcePath(toLocalResourcePath(baseDir))
  }
  return { loader, manager, done }
}

async function loadGLTF(buffer: ArrayBuffer, baseDir: string): Promise<THREE.Object3D> {
  const { loader, manager, done } = createGLTFLoader(baseDir)
  const gltf = await loader.parseAsync(buffer, '')
  await awaitLoadingManagerIdle(manager, done)
  await waitForModelTextures(gltf.scene)
  return gltf.scene
}

async function loadGLTFText(buffer: ArrayBuffer, baseDir: string): Promise<THREE.Object3D> {
  const text = new TextDecoder().decode(buffer)
  const { loader, manager, done } = createGLTFLoader(baseDir)
  const gltf = await loader.parseAsync(text, toLocalUrl(baseDir))
  await awaitLoadingManagerIdle(manager, done)
  await waitForModelTextures(gltf.scene)
  return gltf.scene
}

async function loadOBJ(buffer: ArrayBuffer, baseDir: string, fileName: string): Promise<THREE.Object3D> {
  const text = new TextDecoder().decode(buffer)
  const baseName = fileName.replace(/\.obj$/i, '')
  const mtlPath = await window.electronAPI.joinPath(baseDir, `${baseName}.mtl`)
  const hasMtl = await window.electronAPI.fileExists(mtlPath)

  if (hasMtl) {
    const mtlText = await window.electronAPI.readFileText(mtlPath)
    const { manager, done } = createLocalLoadingManager(baseDir)
    const mtlLoader = new MTLLoader(manager)
    mtlLoader.setMaterialOptions({ side: THREE.FrontSide })
    mtlLoader.setResourcePath(toLocalUrl(baseDir) + '/')
    const materials = mtlLoader.parse(mtlText, '')
    materials.preload()
    await awaitLoadingManagerIdle(manager, done)

    const objLoader = new OBJLoader()
    objLoader.setMaterials(materials)
    const object = objLoader.parse(text)
    await waitForModelTextures(object)
    return object
  }

  const objLoader = new OBJLoader()
  const object = objLoader.parse(text)
  await waitForModelTextures(object)
  return object
}

async function loadFBX(
  buffer: ArrayBuffer,
  baseDir: string,
  options?: { lightweight?: boolean }
): Promise<THREE.Object3D> {
  await yieldBeforeHeavyWork()
  const lightweight = !!options?.lightweight
  const { loader, manager, done } = createFBXLoader(baseDir, { stubTextures: lightweight })
  const resourcePath = lightweight ? '' : toLocalResourcePath(baseDir)

  let object: THREE.Object3D
  try {
    object = loader.parse(buffer, resourcePath)
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `FBX 解析失败：${detail}。该文件可能版本过旧、已损坏或含 Three.js 不支持的特性，请尝试重新导出为 FBX 7.4+ 二进制或 GLB。`
    )
  }

  await awaitLoadingManagerIdle(manager, done, lightweight ? 8_000 : 60_000)
  if (!lightweight) {
    await waitForModelTextures(object)
  }
  return object
}

async function load3DS(buffer: ArrayBuffer, baseDir: string): Promise<THREE.Object3D> {
  const loader = new TDSLoader()
  const resourcePath = toLocalResourcePath(baseDir)
  loader.setResourcePath(resourcePath)
  const object = loader.parse(buffer, resourcePath)
  await waitForModelTextures(object)
  return object
}

function createMeshFromStlGeometry(geometry: THREE.BufferGeometry): THREE.Mesh {
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const stlGeometry = geometry as THREE.BufferGeometry & {
    hasColors?: boolean
    alpha?: number
  }

  if (stlGeometry.hasColors && geometry.attributes.color) {
    const alpha = typeof stlGeometry.alpha === 'number' ? stlGeometry.alpha : 1
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      opacity: alpha,
      transparent: alpha < 1,
      side: THREE.DoubleSide
    })
    return new THREE.Mesh(geometry, material)
  }

  const material = new THREE.MeshPhongMaterial({
    color: 0x8899aa,
    side: THREE.DoubleSide,
    flatShading: true
  })
  return new THREE.Mesh(geometry, material)
}

async function loadSTL(buffer: ArrayBuffer, upAxis: StlUpAxis = DEFAULT_STL_UP_AXIS): Promise<THREE.Object3D> {
  await yieldBeforeHeavyWork()
  const geometry = new STLLoader().parse(buffer)
  applyStlUpAxisRotation(geometry, upAxis)
  const mesh = createMeshFromStlGeometry(geometry)
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

const THUMBNAIL_MAX_TRIANGLES = 12000
export const PREVIEW_MAX_TRIANGLES = 500_000
/** 超过此面数时询问用户是否减面，默认保留原始精度 */
export const PREVIEW_SIMPLIFY_PROMPT_TRIANGLES = 1_000_000

export function formatModelTriangleCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 10_000) return `${Math.round(count / 1000)}K`
  return String(count)
}

export function getGeometryTriangleCount(geometry: THREE.BufferGeometry): number {
  if (geometry.index) return geometry.index.count / 3
  const position = geometry.attributes.position
  return position ? Math.floor(position.count / 3) : 0
}

export function decimateGeometry(
  geometry: THREE.BufferGeometry,
  maxTriangles: number
): THREE.BufferGeometry {
  if (maxTriangles <= 0) return geometry

  if (geometry.index) {
    const indexArray = geometry.index.array
    const totalTris = Math.floor(indexArray.length / 3)
    if (totalTris <= maxTriangles) return geometry

    const step = Math.ceil(totalTris / maxTriangles)
    const newIndices: number[] = []
    for (let tri = 0; tri < totalTris; tri += step) {
      const base = tri * 3
      newIndices.push(indexArray[base], indexArray[base + 1], indexArray[base + 2])
    }

    const result = geometry.clone()
    const needsUint32 = indexArray instanceof Uint32Array || newIndices.some((value) => value > 65535)
    const typed = needsUint32 ? new Uint32Array(newIndices) : new Uint16Array(newIndices)
    result.setIndex(typed)
    return result
  }

  const position = geometry.attributes.position
  if (!position) return geometry

  const totalTris = Math.floor(position.count / 3)
  if (totalTris <= maxTriangles) return geometry

  const step = Math.ceil(totalTris / maxTriangles)
  const estimatedVerts = Math.ceil(totalTris / step) * 3
  const array = new Float32Array(estimatedVerts * 3)
  let write = 0

  for (let tri = 0; tri < totalTris; tri += step) {
    const baseVertex = tri * 3
    for (let v = 0; v < 3; v++) {
      const idx = (baseVertex + v) * 3
      array[write++] = position.array[idx]
      array[write++] = position.array[idx + 1]
      array[write++] = position.array[idx + 2]
    }
  }

  const trimmed = array.subarray(0, write)
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.BufferAttribute(trimmed, 3))
  result.computeVertexNormals()
  result.computeBoundingBox()
  result.computeBoundingSphere()
  return result
}

export interface ModelPreviewOptimizationInfo {
  originalTriangles: number
  optimizedTriangles: number
  simplified: boolean
}

export function countModelTriangles(object: THREE.Object3D): number {
  let faces = 0
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      faces += getGeometryTriangleCount(child.geometry)
    }
  })
  return Math.round(faces)
}

export function simplifyModelForPreview(
  object: THREE.Object3D,
  maxTriangles = PREVIEW_MAX_TRIANGLES
): ModelPreviewOptimizationInfo {
  const staticMeshes: THREE.Mesh[] = []
  let staticTris = 0
  let skinnedTris = 0

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return
    const triCount = getGeometryTriangleCount(child.geometry)
    if (child instanceof THREE.SkinnedMesh) {
      skinnedTris += triCount
      return
    }
    staticMeshes.push(child)
    staticTris += triCount
  })

  const originalTriangles = staticTris + skinnedTris
  if (staticTris <= maxTriangles) {
    return {
      originalTriangles,
      optimizedTriangles: originalTriangles,
      simplified: false
    }
  }

  const ratio = maxTriangles / staticTris
  for (const mesh of staticMeshes) {
    const meshTris = getGeometryTriangleCount(mesh.geometry)
    const target = Math.max(2000, Math.floor(meshTris * ratio))
    const decimated = decimateGeometry(mesh.geometry, target)
    if (decimated !== mesh.geometry) {
      mesh.geometry.dispose()
      mesh.geometry = decimated
    }
  }

  let optimizedStatic = 0
  for (const mesh of staticMeshes) {
    optimizedStatic += getGeometryTriangleCount(mesh.geometry)
  }

  return {
    originalTriangles,
    optimizedTriangles: optimizedStatic + skinnedTris,
    simplified: true
  }
}

export async function resolvePreviewOptimization(
  object: THREE.Object3D,
  askShouldSimplify: (message: string) => boolean | Promise<boolean>
): Promise<ModelPreviewOptimizationInfo> {
  const originalTriangles = countModelTriangles(object)
  if (originalTriangles <= PREVIEW_SIMPLIFY_PROMPT_TRIANGLES) {
    return {
      originalTriangles,
      optimizedTriangles: originalTriangles,
      simplified: false
    }
  }

  const label = formatModelTriangleCount(originalTriangles)
  const shouldSimplify = await askShouldSimplify(
    [
      `该模型约有 ${label}（${originalTriangles.toLocaleString('zh-CN')}）个三角面，超过 100 万面可能影响预览流畅度。`,
      '',
      '是否减面加载？',
      '· 确定：减面后加载（约 50 万面以内）',
      '· 取消：保留原始面数'
    ].join('\n')
  )

  if (!shouldSimplify) {
    return {
      originalTriangles,
      optimizedTriangles: originalTriangles,
      simplified: false
    }
  }

  const optimization = simplifyModelForPreview(object)
  if (optimization.simplified) {
    object.updateMatrixWorld(true)
  }
  return optimization
}

export function decimateGeometryForThumbnail(
  geometry: THREE.BufferGeometry,
  maxTriangles = THUMBNAIL_MAX_TRIANGLES
): THREE.BufferGeometry {
  return decimateGeometry(geometry, maxTriangles)
}

export function simplifyMeshForThumbnail(object: THREE.Object3D): THREE.Object3D {
  const meshes: THREE.Mesh[] = []
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      meshes.push(child)
    }
  })
  if (meshes.length === 0) return object

  for (const mesh of meshes) {
    const decimated = decimateGeometryForThumbnail(mesh.geometry)
    if (decimated !== mesh.geometry) {
      mesh.geometry.dispose()
      mesh.geometry = decimated
    }
  }
  return object
}

export function computeModelStats(object: THREE.Object3D): ModelStats {
  let vertices = 0
  let faces = 0

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geo = child.geometry
      if (geo.attributes.position) {
        vertices += geo.attributes.position.count
      }
      if (geo.index) {
        faces += geo.index.count / 3
      } else if (geo.attributes.position) {
        faces += geo.attributes.position.count / 3
      }
    }
  })

  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())

  // 模型文件坐标与界面显示单位一致（cm）。
  return {
    vertices: Math.round(vertices),
    faces: Math.round(faces),
    width: size.x,
    height: size.y,
    depth: size.z
  }
}

export function computeMeshBoundingBox(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  const meshBox = new THREE.Box3()
  let hasMesh = false

  object.updateMatrixWorld(true)
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return

    const geometry = child.geometry
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox()
    }
    if (!geometry.boundingBox) return

    meshBox.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld)
    if (hasMesh) {
      box.union(meshBox)
    } else {
      box.copy(meshBox)
      hasMesh = true
    }
  })

  if (!hasMesh) {
    return new THREE.Box3().setFromObject(object)
  }
  return box
}

export function centerAndScaleObject(
  object: THREE.Object3D,
  targetSize = 2
): { root: THREE.Object3D; box: THREE.Box3 } {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      child.geometry.computeBoundingBox()
    }
  })

  object.updateMatrixWorld(true)
  const initialBox = computeMeshBoundingBox(object)
  if (initialBox.isEmpty()) {
    throw new Error('模型包围盒为空')
  }

  const center = initialBox.getCenter(new THREE.Vector3())
  const size = initialBox.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)

  const root = new THREE.Group()
  root.add(object)
  root.position.sub(center)

  if (maxDim > 0) {
    root.scale.setScalar(targetSize / maxDim)
  }

  root.updateMatrixWorld(true)
  const box = computeMeshBoundingBox(root)
  return { root, box }
}

export function setupDefaultMaterials(object: THREE.Object3D): void {
  const textureSlots: Array<{ key: string; srgb: boolean }> = [
    { key: 'map', srgb: true },
    { key: 'emissiveMap', srgb: true },
    { key: 'normalMap', srgb: false },
    { key: 'roughnessMap', srgb: false },
    { key: 'metalnessMap', srgb: false },
    { key: 'aoMap', srgb: false },
    { key: 'alphaMap', srgb: false },
    { key: 'bumpMap', srgb: false }
  ]

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (!child.material || (Array.isArray(child.material) && child.material.length === 0)) {
        child.material = new THREE.MeshPhongMaterial({
          color: 0x8899aa,
          side: THREE.FrontSide,
          flatShading: true
        })
      } else {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((mat) => {
          // 不透明材质强制 FrontSide，避免柜体共面薄板双面 z-fighting 闪烁
          if ('side' in mat) {
            const transparent = 'transparent' in mat && !!(mat as THREE.Material).transparent
            if (!transparent) {
              mat.side = THREE.FrontSide
            }
          }

          for (const { key, srgb } of textureSlots) {
            const texture = (mat as Record<string, unknown>)[key]
            if (texture instanceof THREE.Texture) {
              const targetColorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
              if (texture.colorSpace !== targetColorSpace) {
                texture.colorSpace = targetColorSpace
              }
            }
          }
        })
      }
      configureMeshTextureWrapping(child)
    }
  })
  normalizePreviewMaterials(object)
}

export interface PreviewSceneObjects {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  ambientLight: THREE.AmbientLight
  keyLight: THREE.DirectionalLight
  fillLight: THREE.DirectionalLight
}

export function lightPositionFromAngles(
  azimuthDeg: number,
  elevationDeg: number,
  distance = 12
): THREE.Vector3 {
  const azimuth = (azimuthDeg * Math.PI) / 180
  const elevation = (elevationDeg * Math.PI) / 180
  const horizontal = distance * Math.cos(elevation)
  return new THREE.Vector3(
    horizontal * Math.sin(azimuth),
    distance * Math.sin(elevation),
    horizontal * Math.cos(azimuth)
  )
}

export function applyPreviewLighting(
  objects: Pick<PreviewSceneObjects, 'ambientLight' | 'keyLight' | 'fillLight'>,
  settings: PreviewSettings
): void {
  objects.ambientLight.intensity = settings.ambientIntensity
  objects.keyLight.intensity = settings.keyLightIntensity

  const keyPos = lightPositionFromAngles(settings.lightAzimuth, settings.lightElevation)
  objects.keyLight.position.copy(keyPos)

  objects.fillLight.position.set(-keyPos.x * 0.5, keyPos.y * 0.35, -keyPos.z * 0.5)
  objects.fillLight.intensity = settings.keyLightIntensity * 0.35
}

export function applyPreviewSettings(
  objects: Pick<PreviewSceneObjects, 'scene' | 'ambientLight' | 'keyLight' | 'fillLight'>,
  settings: PreviewSettings
): void {
  objects.scene.background = new THREE.Color(settings.backgroundColor)
  applyPreviewLighting(objects, settings)
}

export function createPreviewScene(
  settings: PreviewSettings = DEFAULT_PREVIEW_SETTINGS
): PreviewSceneObjects {
  const scene = new THREE.Scene()

  // near/far 过宽会导致深度缓冲精度不足，柜体共面贴图出现闪烁（z-fighting）
  const camera = new THREE.PerspectiveCamera(45, 1, 0.08, 200)
  camera.position.set(3, 2, 4)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    logarithmicDepthBuffer: true
  })

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.65)
  scene.add(ambientLight)

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0x8899ff, 0.5)
  scene.add(fillLight)

  const objects: PreviewSceneObjects = {
    scene,
    camera,
    renderer,
    ambientLight,
    keyLight,
    fillLight
  }
  applyPreviewSettings(objects, settings)
  return objects
}

/** 导入模型默认显示缩放（相对基准尺寸，当前为基准 1:1） */
export const MODEL_IMPORTED_DISPLAY_SCALE = 1

export const PREVIEW_MODEL_TARGET_SIZE = 4.5 * MODEL_IMPORTED_DISPLAY_SCALE
export const PREVIEW_CAMERA_PADDING = 1.08
export const THUMBNAIL_MODEL_TARGET_SIZE = 2.5 * MODEL_IMPORTED_DISPLAY_SCALE
export const THUMBNAIL_CAMERA_PADDING = 1.12
/** 缩略图内模型视觉偏移（相对包围盒最大边，负 x 向左、正 y 向上） */
export const THUMBNAIL_POSITION_NUDGE = { x: -0.06, y: 0.05, z: 0 }

/** 按模型尺寸与观察距离收紧深度范围，减轻共面贴图 z-fighting */
export function configureCameraDepthRange(
  camera: THREE.PerspectiveCamera,
  focus: THREE.Vector3,
  radius: number,
  options?: { minDistance?: number; maxDistance?: number }
): void {
  const minDistance = options?.minDistance ?? 0.5
  const maxDistance = options?.maxDistance ?? 50
  const safeRadius = Math.max(radius, 0.001)
  const distance = Math.max(camera.position.distanceTo(focus), safeRadius)

  // near 需小于 OrbitControls.minDistance，同时尽量大以保证深度精度
  camera.near = Math.min(0.08, Math.max(0.04, minDistance * 0.15))
  camera.far = Math.max(
    distance + safeRadius * 12,
    maxDistance + safeRadius * 6,
    80
  )
  camera.updateProjectionMatrix()
}

export function frameCameraToBox(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  aspect: number,
  padding = 1.6
): THREE.Vector3 {
  camera.aspect = aspect

  const center = box.getCenter(new THREE.Vector3())
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 0.001)

  const fovRad = (camera.fov * Math.PI) / 180
  const verticalFov = fovRad
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)

  const distanceV = radius / Math.sin(verticalFov / 2)
  const distanceH = radius / Math.sin(horizontalFov / 2)
  const distance = Math.max(distanceV, distanceH) * padding

  const viewDir = new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(distance)
  camera.position.copy(center).add(viewDir)
  camera.lookAt(center)
  configureCameraDepthRange(camera, center, radius)

  return center
}

export type StandardViewDirection = 'top' | 'front' | 'left'

const STANDARD_VIEW_UP: Record<StandardViewDirection, THREE.Vector3> = {
  top: new THREE.Vector3(0, 0, -1),
  front: new THREE.Vector3(0, 1, 0),
  left: new THREE.Vector3(0, 1, 0)
}

function computeFitDistance(
  radius: number,
  aspect: number,
  fovDeg: number,
  padding: number
): number {
  const fovRad = (fovDeg * Math.PI) / 180
  const distanceV = radius / Math.sin(fovRad / 2)
  const distanceH = radius / Math.sin(2 * Math.atan(Math.tan(fovRad / 2) * aspect) / 2)
  return Math.max(distanceV, distanceH) * padding
}

/** 保持当前观察方向，将相机目标与距离调整为容纳给定包围盒。 */
export function fitCameraToBoxPreservingView(
  camera: THREE.PerspectiveCamera,
  currentTarget: THREE.Vector3,
  box: THREE.Box3,
  aspect: number,
  padding = PREVIEW_CAMERA_PADDING
): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } {
  const center = box.getCenter(new THREE.Vector3())
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 0.001)

  const viewDir = camera.position.clone().sub(currentTarget)
  if (viewDir.lengthSq() < 1e-8) {
    viewDir.set(1, 0.75, 1).normalize()
  } else {
    viewDir.normalize()
  }

  const requiredDistance = computeFitDistance(radius, aspect, camera.fov, padding)
  const position = center.clone().add(viewDir.multiplyScalar(requiredDistance))

  return {
    position,
    target: center,
    up: camera.up.clone()
  }
}

export function computeStandardViewCamera(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  aspect: number,
  direction: StandardViewDirection,
  padding = PREVIEW_CAMERA_PADDING
): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } {
  const center = box.getCenter(new THREE.Vector3())
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 0.001)
  const distance = computeFitDistance(radius, aspect, camera.fov, padding)

  const offset = new THREE.Vector3()
  switch (direction) {
    case 'top':
      offset.set(0, distance, 0)
      break
    case 'front':
      offset.set(0, 0, distance)
      break
    case 'left':
      offset.set(-distance, 0, 0)
      break
  }

  return {
    position: center.clone().add(offset),
    target: center.clone(),
    up: STANDARD_VIEW_UP[direction].clone()
  }
}
