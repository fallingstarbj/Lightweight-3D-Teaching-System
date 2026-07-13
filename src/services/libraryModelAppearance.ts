import * as THREE from 'three'
import {
  applyLibraryMaterialOverrides,
  applyMaterialOverrideEntries
} from './materialOverrideApply'
import { isMaterialOverrideApiReady } from '../utils/materialOverrideApi'
import type { ModelTeachingStateDocument } from '../types/modelTeachingState'

async function applyLibraryMaterialOverridesForId(
  root: THREE.Object3D,
  libraryId: string
): Promise<void> {
  if (!isMaterialOverrideApiReady()) return

  try {
    const overrides = await window.electronAPI.getMaterialOverrides(libraryId)
    if (overrides?.entries.length) {
      await applyLibraryMaterialOverrides(root, overrides, libraryId)
    }
  } catch {
    /* ignore */
  }
}

function resolveInitialTeachingStateId(document: ModelTeachingStateDocument): string | null {
  if (document.initialStateId) {
    return document.initialStateId
  }
  if (document.states.length === 0) return null
  return [...document.states].sort((a, b) => a.order - b.order)[0]?.id ?? null
}

async function applyTeachingStateAppearance(
  root: THREE.Object3D,
  libraryId: string
): Promise<boolean> {
  if (typeof window.electronAPI?.getTeachingStates !== 'function') return false

  try {
    const savedTeaching = await window.electronAPI.getTeachingStates(libraryId)
    if (!savedTeaching?.states.length) return false

    const stateId = resolveInitialTeachingStateId(savedTeaching)
    if (!stateId) return false

    const state = savedTeaching.states.find((item) => item.id === stateId)
    if (!state) return false

    await applyLibraryMaterialOverridesForId(root, libraryId)

    if (state.materials.length > 0) {
      await applyMaterialOverrideEntries(root, state.materials, (relativePath) =>
        window.electronAPI.readTeachingStateTexture(libraryId, relativePath)
      )
    }

    return true
  } catch {
    return false
  }
}

export async function applyLibraryModelAppearance(
  root: THREE.Object3D,
  libraryId: string,
  options?: { thumbnail?: boolean }
): Promise<void> {
  if (!libraryId) return

  if (options?.thumbnail) {
    await applyLibraryMaterialOverridesForId(root, libraryId)
    return
  }

  const appliedTeachingState = await applyTeachingStateAppearance(root, libraryId)
  if (!appliedTeachingState) {
    await applyLibraryMaterialOverridesForId(root, libraryId)
  }
}

export async function resolveLibraryAppearanceCacheSuffix(libraryId: string): Promise<string> {
  if (!libraryId || !isMaterialOverrideApiReady()) return ''

  const parts: string[] = []

  try {
    const overrides = await window.electronAPI.getMaterialOverrides(libraryId)
    if (overrides?.updatedAt) {
      parts.push(`mo:${overrides.updatedAt}`)
    }
  } catch {
    /* ignore */
  }

  if (typeof window.electronAPI?.getTeachingStates === 'function') {
    try {
      const teaching = await window.electronAPI.getTeachingStates(libraryId)
      if (teaching?.states.length) {
        const stateId = resolveInitialTeachingStateId(teaching)
        const state = stateId ? teaching.states.find((item) => item.id === stateId) : null
        if (state) {
          const materialKeys = state.materials
            .map((entry) => `${entry.meshKey}:${entry.materialIndex}`)
            .sort()
            .join(',')
          parts.push(`ts:${stateId}:${state.materials.length}:${materialKeys}`)
        }
      }
    } catch {
      /* ignore */
    }
  }

  return parts.length > 0 ? `:${parts.join(':')}` : ''
}
