import { app } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { getModelMarkers } from './markerService'
import { getPartAnimation } from './partAnimationService'
import { getTeachingStates, teachingStateFileExists } from './teachingStateService'
import { getMaterialOverrides } from './materialOverrideService'
import { getModelPrefs, modelPrefsFileExists } from './modelPrefsService'
import { getModelDocuments, modelDocumentsFileExists } from './modelDocumentService'

export const PACK_EDITS_PREFIX = 'edits/'

export interface PackFileEntry {
  path: string
  data: Buffer
}

export interface PackEditApplyOptions {
  skipExisting: boolean
}

export interface PackExportEditSummary {
  totalModels: number
  withMarkers: number
  withPartAnimation: number
  withTeachingStates: number
  withMaterialOverrides: number
  withModelPrefs: number
  withModelDocuments: number
}

function getLibraryRoot(): string {
  return join(app.getPath('userData'), 'asset-library')
}

function getMarkersDir(): string {
  return join(getLibraryRoot(), 'markers')
}

function getAnimationsDir(): string {
  return join(getLibraryRoot(), 'animations')
}

function getTeachingStatesDir(): string {
  return join(getLibraryRoot(), 'teaching-states')
}

function getMaterialOverridesRoot(): string {
  return join(getLibraryRoot(), 'material-overrides')
}

function getModelPrefsDir(): string {
  return join(getLibraryRoot(), 'model-prefs')
}

function getModelDocumentsDir(): string {
  return join(getLibraryRoot(), 'model-documents')
}

function getModelDocumentFilesDir(libraryId: string): string {
  return join(getModelDocumentsDir(), libraryId)
}

function getMarkerImagesDir(libraryId: string): string {
  return join(getLibraryRoot(), 'marker-images', libraryId)
}

export function getPackEditPath(libraryId: string, relative: string): string {
  return `${PACK_EDITS_PREFIX}${libraryId}/${relative}`
}

export function isPackEditPath(path: string): boolean {
  return path.startsWith(PACK_EDITS_PREFIX)
}

export function parsePackEditPath(
  path: string
): { libraryId: string; relative: string } | null {
  if (!isPackEditPath(path)) return null
  const rest = path.slice(PACK_EDITS_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) return null
  return {
    libraryId: rest.slice(0, slash),
    relative: rest.slice(slash + 1)
  }
}

async function walkDirectory(
  rootDir: string,
  pathPrefix: string
): Promise<PackFileEntry[]> {
  if (!existsSync(rootDir)) return []

  const entries: PackFileEntry[] = []

  async function walk(currentDir: string, relPath: string): Promise<void> {
    for (const item of await readdir(currentDir, { withFileTypes: true })) {
      const itemRel = relPath ? `${relPath}/${item.name}` : item.name
      const fullPath = join(currentDir, item.name)
      if (item.isDirectory()) {
        await walk(fullPath, itemRel)
      } else {
        const data = await readFile(fullPath)
        entries.push({
          path: `${pathPrefix}/${itemRel.replace(/\\/g, '/')}`,
          data
        })
      }
    }
  }

  await walk(rootDir, '')
  return entries
}

async function collectMaterialOverrideEntries(libraryId: string): Promise<PackFileEntry[]> {
  const dir = join(getMaterialOverridesRoot(), libraryId)
  if (!existsSync(dir)) return []

  const entries = await walkDirectory(dir, getPackEditPath(libraryId, 'material-overrides'))
  return entries
}

export async function collectEditsForLibraryIds(libraryIds: string[]): Promise<PackFileEntry[]> {
  const entries: PackFileEntry[] = []

  for (const libraryId of libraryIds) {
    const markersPath = join(getMarkersDir(), `${libraryId}.json`)
    if (existsSync(markersPath)) {
      entries.push({
        path: getPackEditPath(libraryId, 'markers.json'),
        data: await readFile(markersPath)
      })
    }

    const animationPath = join(getAnimationsDir(), `${libraryId}.json`)
    if (existsSync(animationPath)) {
      entries.push({
        path: getPackEditPath(libraryId, 'part-animation.json'),
        data: await readFile(animationPath)
      })
    }

    const teachingStatePath = join(getTeachingStatesDir(), `${libraryId}.json`)
    if (existsSync(teachingStatePath)) {
      entries.push({
        path: getPackEditPath(libraryId, 'teaching-states.json'),
        data: await readFile(teachingStatePath)
      })
    }

    const teachingStateTexturesDir = join(getTeachingStatesDir(), libraryId, 'textures')
    if (existsSync(teachingStateTexturesDir)) {
      entries.push(
        ...(await walkDirectory(teachingStateTexturesDir, getPackEditPath(libraryId, 'teaching-state-textures')))
      )
    }

    entries.push(...(await collectMaterialOverrideEntries(libraryId)))

    const markerImagesDir = getMarkerImagesDir(libraryId)
    if (existsSync(markerImagesDir)) {
      entries.push(
        ...(await walkDirectory(markerImagesDir, getPackEditPath(libraryId, 'marker-images')))
      )
    }

    const prefsPath = join(getModelPrefsDir(), `${libraryId}.json`)
    if (existsSync(prefsPath)) {
      entries.push({
        path: getPackEditPath(libraryId, 'model-prefs.json'),
        data: await readFile(prefsPath)
      })
    }

    const documentsPath = join(getModelDocumentsDir(), `${libraryId}.json`)
    if (existsSync(documentsPath)) {
      entries.push({
        path: getPackEditPath(libraryId, 'model-documents.json'),
        data: await readFile(documentsPath)
      })
    }

    const documentFilesDir = getModelDocumentFilesDir(libraryId)
    if (existsSync(documentFilesDir)) {
      entries.push(
        ...(await walkDirectory(documentFilesDir, getPackEditPath(libraryId, 'model-documents')))
      )
    }
  }

  return entries
}

export async function getPackExportEditSummary(
  libraryIds: string[]
): Promise<PackExportEditSummary> {
  let withMarkers = 0
  let withPartAnimation = 0
  let withTeachingStates = 0
  let withMaterialOverrides = 0
  let withModelPrefs = 0
  let withModelDocuments = 0

  for (const libraryId of libraryIds) {
    const markers = await getModelMarkers(libraryId)
    if (markers.length > 0) withMarkers += 1

    const animation = await getPartAnimation(libraryId)
    if (animation && animation.tracks.length > 0) withPartAnimation += 1

    const teachingStates = await getTeachingStates(libraryId)
    if (teachingStates && teachingStates.states.length > 0) withTeachingStates += 1

    const overrides = await getMaterialOverrides(libraryId)
    if (overrides && overrides.entries.length > 0) withMaterialOverrides += 1

    if (modelPrefsFileExists(libraryId)) withModelPrefs += 1

    const documents = await getModelDocuments(libraryId)
    if (documents.documents.length > 0) withModelDocuments += 1
  }

  return {
    totalModels: libraryIds.length,
    withMarkers,
    withPartAnimation,
    withTeachingStates,
    withMaterialOverrides,
    withModelPrefs,
    withModelDocuments
  }
}

function libraryEditExists(libraryId: string, relative: string): boolean {
  if (relative === 'markers.json') {
    return existsSync(join(getMarkersDir(), `${libraryId}.json`))
  }
  if (relative === 'part-animation.json') {
    return existsSync(join(getAnimationsDir(), `${libraryId}.json`))
  }
  if (relative === 'teaching-states.json') {
    return teachingStateFileExists(libraryId)
  }
  if (relative === 'model-prefs.json') {
    return modelPrefsFileExists(libraryId)
  }
  if (relative === 'model-documents.json') {
    return modelDocumentsFileExists(libraryId)
  }
  if (relative.startsWith('material-overrides/')) {
    const sub = relative.slice('material-overrides/'.length)
    return existsSync(join(getMaterialOverridesRoot(), libraryId, sub))
  }
  if (relative.startsWith('marker-images/')) {
    const sub = relative.slice('marker-images/'.length)
    return existsSync(join(getMarkerImagesDir(libraryId), sub))
  }
  if (relative.startsWith('teaching-state-textures/')) {
    const sub = relative.slice('teaching-state-textures/'.length)
    return existsSync(join(getTeachingStatesDir(), libraryId, 'textures', sub))
  }
  if (relative.startsWith('model-documents/')) {
    const sub = relative.slice('model-documents/'.length)
    return existsSync(join(getModelDocumentFilesDir(libraryId), sub))
  }
  return false
}

function libraryHasMaterialOverrides(libraryId: string): boolean {
  return existsSync(join(getMaterialOverridesRoot(), libraryId, 'overrides.json'))
}

async function writeEditToLibrary(libraryId: string, relative: string, data: Buffer): Promise<void> {
  if (relative === 'markers.json') {
    const dir = getMarkersDir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${libraryId}.json`), data)
    return
  }

  if (relative === 'part-animation.json') {
    const dir = getAnimationsDir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${libraryId}.json`), data)
    return
  }

  if (relative === 'teaching-states.json') {
    const dir = getTeachingStatesDir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${libraryId}.json`), data)
    return
  }

  if (relative === 'model-prefs.json') {
    const dir = getModelPrefsDir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${libraryId}.json`), data)
    return
  }

  if (relative.startsWith('material-overrides/')) {
    const sub = relative.slice('material-overrides/'.length)
    const dest = join(getMaterialOverridesRoot(), libraryId, sub)
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })
    await writeFile(dest, data)
    return
  }

  if (relative.startsWith('marker-images/')) {
    const sub = relative.slice('marker-images/'.length)
    const dest = join(getMarkerImagesDir(libraryId), sub)
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })
    await writeFile(dest, data)
    return
  }

  if (relative.startsWith('teaching-state-textures/')) {
    const sub = relative.slice('teaching-state-textures/'.length)
    const dest = join(getTeachingStatesDir(), libraryId, 'textures', sub)
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })
    await writeFile(dest, data)
    return
  }

  if (relative === 'model-documents.json') {
    const dir = getModelDocumentsDir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${libraryId}.json`), data)
    return
  }

  if (relative.startsWith('model-documents/')) {
    const sub = relative.slice('model-documents/'.length)
    const dest = join(getModelDocumentFilesDir(libraryId), sub)
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })
    await writeFile(dest, data)
  }
}

export async function applyPackEditEntries(
  entries: PackFileEntry[],
  options: PackEditApplyOptions
): Promise<void> {
  const skippedLibraries = new Set<string>()

  for (const entry of entries) {
    const parsed = parsePackEditPath(entry.path)
    if (!parsed) continue

    const { libraryId, relative } = parsed

    if (options.skipExisting) {
      if (relative.startsWith('material-overrides/')) {
        if (skippedLibraries.has(`${libraryId}:material`) || libraryHasMaterialOverrides(libraryId)) {
          skippedLibraries.add(`${libraryId}:material`)
          continue
        }
      } else if (libraryEditExists(libraryId, relative)) {
        continue
      }
    }

    await writeEditToLibrary(libraryId, relative, entry.data)
  }
}

async function readPackEditsDirEntries(packEditsDir: string): Promise<PackFileEntry[]> {
  const entries: PackFileEntry[] = []
  if (!existsSync(packEditsDir)) return entries

  async function walk(currentDir: string, rel: string): Promise<void> {
    for (const item of await readdir(currentDir, { withFileTypes: true })) {
      const itemRel = rel ? `${rel}/${item.name}` : item.name
      const fullPath = join(currentDir, item.name)
      if (item.isDirectory()) {
        await walk(fullPath, itemRel)
      } else {
        entries.push({
          path: `${PACK_EDITS_PREFIX}${itemRel.replace(/\\/g, '/')}`,
          data: await readFile(fullPath)
        })
      }
    }
  }

  await walk(packEditsDir, '')
  return entries
}

export async function restorePackBundledEditsFromDisk(packEditsDir: string): Promise<void> {
  const entries = await readPackEditsDirEntries(packEditsDir)
  if (entries.length === 0) {
    throw new Error('该数据包未包含可恢复的教学数据')
  }

  await applyPackEditEntries(entries, { skipExisting: false })
}

export async function removePackEditsForLibrary(
  packEditsDir: string,
  libraryId: string
): Promise<void> {
  const target = join(packEditsDir, libraryId)
  if (existsSync(target)) {
    await rm(target, { recursive: true, force: true })
  }
}

export async function syncPackEditsToDisk(
  packRoot: string,
  entries: PackFileEntry[]
): Promise<void> {
  const editsDir = join(packRoot, 'edits')
  if (existsSync(editsDir)) {
    await rm(editsDir, { recursive: true, force: true })
  }

  for (const entry of entries) {
    if (!isPackEditPath(entry.path)) continue
    const dest = join(packRoot, entry.path.replace(/\//g, '\\'))
    const destDir = join(dest, '..')
    if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })
    await writeFile(dest, entry.data)
  }
}
