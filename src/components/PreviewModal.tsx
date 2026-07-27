import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { AssetFile } from '../types'
import type { MarkerCollection, ModelMarker, ModelMarkerInput, ModelMarkerKind } from '../types/marker'
import {
  PREVIEW_MARKER_ID,
  addMarkerToCollection,
  getCollectionMarkers,
  isAnchorMarkerKind,
  normalizeMarkerCollections,
  removeMarkerFromCollections,
  updateMarkerInCollections
} from '../types/marker'
import { isMarkerImageFile } from '../utils/markerImage'
import {
  getViewPlaneFromLocalAnchor,
  intersectPointerOnViewPlane,
  markerPointsEqual
} from '../services/modelMarkerGeometry'
import { applyTwoFingerPanZoomTolerance } from '../utils/orbitTouchPanZoomTolerance'
import {
  isTextureAsset,
  isAudioAsset,
  isVideoAsset,
  isDocumentAsset,
  isModelAsset,
  getUnsupportedPreviewMessage
} from '../types'
import {
  loadModelFromPath,
  centerAndScaleObject,
  setupDefaultMaterials,
  waitForModelTextures,
  createPreviewScene,
  applyPreviewSettings,
  applyPreviewLighting,
  frameCameraToBox,
  configureCameraDepthRange,
  resolvePreviewOptimization,
  computeMeshBoundingBox,
  computeStandardViewCamera,
  fitCameraToBoxPreservingView,
  PREVIEW_MODEL_TARGET_SIZE,
  PREVIEW_CAMERA_PADDING,
  type PreviewSceneObjects,
  type StandardViewDirection
} from '../services/modelLoader'
import {
  applyPreviewBackground,
  disposePreviewBackgroundTexture
} from '../services/previewBackground'
import {
  ModelMarkerLayer,
  computeMarkerVisualScale,
  getMarkerWorldPosition
} from '../services/modelMarkerView'
import {
  ModelAnimationController,
  getFbxAnimationClips,
  isFbxFilePath,
  type AnimationClipInfo
} from '../services/modelAnimation'
import ModelAnimationBar from './ModelAnimationBar'
import AnimationTimeline from './AnimationTimeline'
import {
  type PreviewSettings,
  clampPreviewSettings,
  getStoredPreviewSettings,
  hydratePreviewSettingsFromDisk,
  setStoredPreviewSettings
} from '../utils/previewSettings'
import ImagePreview from './ImagePreview'
import AudioPreview from './AudioPreview'
import VideoPreview from './VideoPreview'
import DocumentPreview from './DocumentPreview'
import PreviewSidebar, { type PreviewSidebarTab } from './PreviewSidebar'
import PreviewPdfViewer from './PreviewPdfViewer'
import PreviewBottomToolbar from './PreviewBottomToolbar'
import { computeViewportCaptureRect, hideViewportOverlays, waitForViewportPaint } from '../utils/viewportScreenshot'
import { getViewportNavigationHint, getPreviewToolbarHint } from '../utils/previewOperationHints'
import type { ModelDisplayMode, PreviewInputMode } from '../services/modelPreviewView'
import {
  computeDefaultGridSpacing,
  disposePreviewFloorGrid,
  syncPreviewFloorGrid,
  setModelDisplayMode
} from '../services/modelPreviewView'
import {
  ModelPartsVisibilityController,
  updateAllTreeVisibility,
  updateTreeNodeVisibility,
  updateTreeNodeName,
  type ModelPartTreeNode
} from '../services/modelPartsVisibility'
import ModelPartsPanel from './ModelPartsPanel'
import { getMarkerApiUnavailableMessage, isMarkerApiReady } from '../utils/markerApi'
import type { SaveMaterialOverridesPayload } from '../types/materialOverride'
import {
  getMaterialOverrideApiUnavailableMessage,
  isMaterialOverrideApiReady
} from '../utils/materialOverrideApi'
import { getModelThumbnailCacheKey, requestThumbnailRefresh } from '../utils/previewSettings'
import { generateModelThumbnail, invalidateAppearanceSuffixCache, resolveModelThumbnailSettingsKey } from '../services/thumbnailGenerator'
import { ModelExplodeController, EXPLODE_ANIMATION_DURATION } from '../services/modelExplode'
import {
  ModelSectionClipController,
  type SectionAxis
} from '../services/modelSectionClip'
import { ModelTransparentPeekController } from '../services/modelTransparentPeek'
import {
  ModelMaterialEditController,
  type MaterialEditPatch,
  type MaterialEditState,
  type MaterialSlotInfo,
  type MeshPartInfo,
  type PbrMapSlot,
  type TextureOption
} from '../services/modelMaterialEdit'
import {
  ModelMeasureController,
  formatMeasureDistance,
  projectLocalPointToScreen,
  type MeasureState
} from '../services/modelMeasure'
import { extractMeshUvLayout } from '../services/modelUvLayout'
import type { MeshUvLayoutPayload } from '../types/meshUvLayout'
import { PartAnimationEditorController } from '../services/modelPartAnimation'
import { ModelTeachingStateController } from '../services/modelTeachingState'
import {
  createDefaultPartAnimation,
  DEFAULT_PART_ANIMATION_CHANNELS,
  findStageRangeById,
  hasPartAnimationContent,
  type PartAnimationChannel,
  type PartAnimationDocument,
  type PartAnimationKeyframeMarker
} from '../types/partAnimation'
import {
  createDefaultTeachingStateDocument,
  hasTeachingStateContent,
  sortTeachingStates,
  type ModelTeachingState,
  type ModelTeachingStateDocument
} from '../types/modelTeachingState'
import {
  createDefaultModelDocumentManifest,
  type ModelDocumentManifest
} from '../types/modelDocument'
import { isModelDocumentApiReady, resolveModelDocumentUrl } from '../utils/modelDocument'

const CAMERA_TRANSITION_DURATION = 0.9
const PART_ANIMATION_AUTO_SAVE_DELAY_MS = 650
const TEACHING_STATE_AUTO_SAVE_DELAY_MS = 650

interface PreviewModalProps {
  asset: AssetFile | null
  onClose: () => void
}

interface PendingPlacement {
  kind: ModelMarkerKind
  position: { x: number; y: number; z: number }
  endPosition?: { x: number; y: number; z: number }
  meshName?: string
}

interface PlacementStart {
  position: { x: number; y: number; z: number }
  meshName?: string
}

interface ModelPreviewProps {
  asset: AssetFile
  settings: PreviewSettings
  markers: ModelMarker[]
  selectedMarkerId: string | null
  markerDragEnabled: boolean
  markersVisible: boolean
  markerCollections: MarkerCollection[]
  visibleCollectionId: string | null
  showMarkerCollectionPicker: boolean
  placementMode: boolean
  placementKind: ModelMarkerKind
  placementStart: PlacementStart | null
  measureMode: boolean
  materialEditMode: boolean
  animationEditMode: boolean
  animationGizmoMode: 'translate' | 'rotate'
  teachingStateEditMode: boolean
  teachingTransformMode: 'translate' | 'rotate' | 'scale'
  selectedModelPartUuid: string | null
  selectedModelPartName?: string | null
  partAnimationChannels: PartAnimationChannel[]
  onPartAnimationSync?: (source?: 'disk' | 'edit') => void
  onPartAnimationTransformCommit?: () => void
  onPartAnimationTransformLive?: () => void
  teachingStates: ModelTeachingState[]
  activeTeachingStateId: string | null
  showTeachingStatePicker: boolean
  onSelectTeachingState: (stateId: string) => void
  onTeachingStateSync?: (source?: 'disk' | 'edit') => void
  canExplode: boolean
  exploded: boolean
  measureState: MeasureState
  focusMarkerId: string | null
  allMarkersForFocus: ModelMarker[]
  onModelPick: (payload: { position: { x: number; y: number; z: number }; meshName?: string }) => void
  onMarkerSelect: (markerId: string) => void
  onMarkerReposition?: (
    markerId: string,
    position: { x: number; y: number; z: number },
    meshName?: string
  ) => void
  onMarkerEndpointReposition?: (
    markerId: string,
    position: { x: number; y: number; z: number },
    endPosition: { x: number; y: number; z: number }
  ) => void
  onLoadStatusChange?: (status: ModelPreviewLoadStatus) => void
  onExplodedChange?: (exploded: boolean) => void
  onCanExplodeChange?: (canExplode: boolean) => void
  onMeasureStateChange?: (state: MeasureState) => void
  activeStandardView: StandardViewDirection | null
  onSetStandardView: (view: StandardViewDirection) => void
  onResetView: () => void
  onToggleExplode: () => void
  onToggleMeasureMode: () => void
  onClearMeasure: () => void
  onSelectVisibleCollection: (collectionId: string | null) => void
  onMeshPick?: (meshUuid: string, materialIndex: number) => void
  onModelPartPick?: (meshUuid: string) => void
  onViewportBlankPick?: () => void
  onMeshPartsReady?: (parts: MeshPartInfo[]) => void
  onModelPartsListReady?: (parts: ModelPartTreeNode[]) => void
  onStandardViewChange?: (view: StandardViewDirection | null) => void
  onSectionModeChange?: (active: boolean) => void
  onTransparentModeChange?: (active: boolean) => void
  viewportFullscreen?: boolean
  onToggleViewportFullscreen?: () => void
  libraryId?: string
}

export interface ModelPreviewHandle {
  resetView: () => void
  setStandardView: (view: StandardViewDirection) => void
  toggleExplode: () => boolean
  restoreExplode: () => void
  clearMeasure: () => void
  listMeshParts: () => MeshPartInfo[]
  listMaterials: (meshUuid: string) => MaterialSlotInfo[]
  listTextures: () => TextureOption[]
  selectMesh: (meshUuid: string, materialIndex?: number) => MaterialEditState | null
  applyMaterialPatch: (patch: MaterialEditPatch) => MaterialEditState | null
  applyMapFromFile: (filePath: string, slot?: PbrMapSlot) => Promise<MaterialEditState | null>
  buildMaterialSavePayload: () => Promise<SaveMaterialOverridesPayload>
  commitMaterialBaseline: () => void
  hasMaterialUnsavedChanges: () => boolean
  hasOpenedBaselineChangesForSelection: () => boolean
  resetSelectedMaterial: () => MaterialEditState | null
  clearMaterialSelection: () => void
  listModelParts: () => ModelPartTreeNode[]
  setPartVisible: (objectUuid: string, visible: boolean) => boolean
  setAllPartsVisible: (visible: boolean) => void
  selectModelPart: (meshUuid: string) => boolean
  clearModelPartSelection: () => void
  renameModelPart: (objectUuid: string, name: string) => boolean
  getPartDisplayNames: () => Record<string, string>
  getPartAnimationDocument: () => PartAnimationDocument | null
  getPartAnimationMarkers: () => PartAnimationKeyframeMarker[]
  getPartAnimationTime: () => number
  getPartAnimationPlaying: () => boolean
  setPartAnimationTime: (time: number, clampToStageId?: string | null) => void
  setPartAnimationPlaying: (playing: boolean) => void
  stopPartAnimation: () => void
  setPartAnimationDuration: (duration: number) => void
  setPartAnimationName: (name: string) => void
  addPartAnimationStage: (name?: string, duration?: number) => string | null
  updatePartAnimationStage: (
    stageId: string,
    patch: { name?: string; duration?: number }
  ) => boolean
  removePartAnimationStage: (stageId: string) => boolean
  playPartAnimationStage: (stageId: string) => boolean
  playAllPartAnimation: () => void
  addPartAnimationKeyframe: (channels: PartAnimationChannel[]) => void
  removePartAnimationKeyframeAtCurrent: () => void
  selectPartAnimationTarget: (meshUuid: string | null) => void
  getPartAnimationMeshTransform: (
    meshUuid: string
  ) => { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } } | null
  applyPartAnimationMeshTransform: (
    meshUuid: string,
    patch: {
      position?: Partial<{ x: number; y: number; z: number }>
      rotation?: Partial<{ x: number; y: number; z: number }>
    }
  ) => boolean
  getMeshUvLayout: (meshUuid: string, materialIndex?: number) => MeshUvLayoutPayload | null
  loadPartAnimationDocument: (document: PartAnimationDocument) => void
  setPartAnimationPreviewEnabled: (
    enabled: boolean,
    options?: { preserveScenePose?: boolean }
  ) => void
  getTeachingStateDocument: () => ModelTeachingStateDocument | null
  getActiveTeachingStateId: () => string | null
  addTeachingState: (name: string) => ModelTeachingState | null
  updateTeachingStateName: (stateId: string, name: string) => boolean
  deleteTeachingState: (stateId: string) => boolean
  setInitialTeachingState: (stateId: string) => void
  captureTeachingState: (stateId: string) => Promise<MaterialOverrideTexturePayload[]>
  applyTeachingState: (stateId: string) => Promise<boolean>
  buildTeachingStateSavePayload: () => Promise<{
    document: ModelTeachingStateDocument
    textures: import('../types/materialOverride').MaterialOverrideTexturePayload[]
  }>
}

export interface ModelPreviewLoadStatus {
  state: 'loading' | 'ready' | 'error'
  message?: string
}

function formatTriangleCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 10_000) return `${Math.round(count / 1000)}K`
  return String(count)
}

function formatViewportStatsLine(
  count: number,
  fps: number | null,
  original?: number
): string {
  const faceText =
    original && original > count
      ? `${formatTriangleCount(count)} 面（原 ${formatTriangleCount(original)}）`
      : `${formatTriangleCount(count)} 面`
  const fpsText = fps === null ? '— FPS' : `${fps} FPS`
  return `${faceText} | ${fpsText}`
}

const ModelPreview = forwardRef<ModelPreviewHandle, ModelPreviewProps>(function ModelPreview(
  {
    asset,
    settings,
    markers,
    selectedMarkerId,
    markerDragEnabled,
    markersVisible,
    markerCollections,
    visibleCollectionId,
    showMarkerCollectionPicker,
    placementMode,
    placementKind,
    placementStart,
    measureMode,
    materialEditMode,
    animationEditMode,
    animationGizmoMode,
    teachingStateEditMode,
    teachingTransformMode,
    selectedModelPartUuid,
    selectedModelPartName = null,
    partAnimationChannels,
    onPartAnimationSync,
    onPartAnimationTransformCommit,
    onPartAnimationTransformLive,
    teachingStates,
    activeTeachingStateId,
    showTeachingStatePicker,
    onSelectTeachingState,
    onTeachingStateSync,
    canExplode,
    exploded,
    measureState,
    focusMarkerId,
    allMarkersForFocus,
    onModelPick,
    onMarkerSelect,
    onMarkerReposition,
    onMarkerEndpointReposition,
    onLoadStatusChange,
    onExplodedChange,
    onCanExplodeChange,
    onMeasureStateChange,
    activeStandardView,
    onSetStandardView,
    onResetView,
    onToggleExplode,
    onToggleMeasureMode,
    onClearMeasure,
    onSelectVisibleCollection,
    onMeshPick,
    onModelPartPick,
    onViewportBlankPick,
    onMeshPartsReady,
    onModelPartsListReady,
    onStandardViewChange,
    onSectionModeChange,
    onTransparentModeChange,
    viewportFullscreen = false,
    onToggleViewportFullscreen,
    libraryId
  },
  ref
): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PreviewSceneObjects | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRootRef = useRef<THREE.Object3D | null>(null)
  const markerLayerRef = useRef<ModelMarkerLayer | null>(null)
  const pickTargetsRef = useRef<THREE.Object3D[]>([])
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const placementModeRef = useRef(placementMode)
  const placementKindRef = useRef(placementKind)
  const placementStartRef = useRef(placementStart)
  const markerDragEnabledRef = useRef(markerDragEnabled)
  const markersVisibleRef = useRef(markersVisible)
  const markerDraggingRef = useRef(false)
  const onMarkerRepositionRef = useRef(onMarkerReposition)
  const onMarkerEndpointRepositionRef = useRef(onMarkerEndpointReposition)
  const onModelPickRef = useRef(onModelPick)
  const onMarkerSelectRef = useRef(onMarkerSelect)
  const markersRef = useRef(markers)
  const animationControllerRef = useRef<ModelAnimationController | null>(null)
  const explodeControllerRef = useRef<ModelExplodeController | null>(null)
  const sectionClipControllerRef = useRef<ModelSectionClipController | null>(null)
  const transparentPeekControllerRef = useRef<ModelTransparentPeekController | null>(null)
  const measureControllerRef = useRef<ModelMeasureController | null>(null)
  const materialEditControllerRef = useRef<ModelMaterialEditController | null>(null)
  const partsVisibilityControllerRef = useRef<ModelPartsVisibilityController | null>(null)
  const partAnimationControllerRef = useRef<PartAnimationEditorController | null>(null)
  const teachingStateControllerRef = useRef<ModelTeachingStateController | null>(null)
  const transformControlsRef = useRef<TransformControls | null>(null)
  const transformDraggingRef = useRef(false)
  const transformDragJustEndedRef = useRef(false)
  const animationEditModeRef = useRef(animationEditMode)
  const animationGizmoModeRef = useRef(animationGizmoMode)
  const teachingStateEditModeRef = useRef(teachingStateEditMode)
  const teachingTransformModeRef = useRef(teachingTransformMode)
  const partAnimationChannelsRef = useRef(partAnimationChannels)
  const selectedModelPartUuidRef = useRef(selectedModelPartUuid)
  const onPartAnimationSyncRef = useRef(onPartAnimationSync)
  const onPartAnimationTransformCommitRef = useRef(onPartAnimationTransformCommit)
  const onPartAnimationTransformLiveRef = useRef(onPartAnimationTransformLive)
  const onTeachingStateSyncRef = useRef(onTeachingStateSync)
  const attachTransformControlsRef = useRef<() => void>(() => {})
  const syncOrbitForTransformEditRef = useRef<() => void>(() => {})
  const disposeTouchPanZoomToleranceRef = useRef<(() => void) | null>(null)
  const initialViewRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null>(
    null
  )
  const modelBoxRef = useRef<THREE.Box3 | null>(null)
  const onStandardViewChangeRef = useRef(onStandardViewChange)
  const onSectionModeChangeRef = useRef(onSectionModeChange)
  const onTransparentModeChangeRef = useRef(onTransparentModeChange)
  const measureModeRef = useRef(measureMode)
  const explodedRef = useRef(exploded)
  const materialEditModeRef = useRef(materialEditMode)
  const onMeasureStateChangeRef = useRef(onMeasureStateChange)
  const onMeshPickRef = useRef(onMeshPick)
  const onModelPartPickRef = useRef(onModelPartPick)
  const onViewportBlankPickRef = useRef(onViewportBlankPick)
  const onMeshPartsReadyRef = useRef(onMeshPartsReady)
  const onModelPartsListReadyRef = useRef(onModelPartsListReady)
  const [animationClips, setAnimationClips] = useState<AnimationClipInfo[]>([])
  const [activeClipIndex, setActiveClipIndex] = useState(0)
  const [animationPlaying, setAnimationPlaying] = useState(false)
  const fbxPrefsReadyRef = useRef(false)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadMessage, setLoadMessage] = useState('正在加载模型…')
  const [displayMode, setDisplayMode] = useState<ModelDisplayMode>('normal')
  const [inputMode, setInputMode] = useState<PreviewInputMode>('mouse')
  const [showGrid, setShowGrid] = useState(false)
  const [gridSizeScale, setGridSizeScale] = useState(1)
  const [gridSpacing, setGridSpacing] = useState(0.35)
  const [sectionMode, setSectionMode] = useState(false)
  const [transparentMode, setTransparentMode] = useState(false)
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>('x')
  const [sectionPosition, setSectionPosition] = useState(0.5)
  const floorGridRef = useRef<THREE.GridHelper | null>(null)
  const syncFloorGridRef = useRef<(() => void) | null>(null)
  const displayModeRef = useRef<ModelDisplayMode>('normal')
  const inputModeRef = useRef<PreviewInputMode>('mouse')
  const showGridRef = useRef(false)
  const gridSizeScaleRef = useRef(1)
  const gridSpacingRef = useRef(0.35)
  const sectionModeRef = useRef(false)
  const transparentModeRef = useRef(false)
  const sectionAxisRef = useRef<SectionAxis>('x')
  const sectionPositionRef = useRef(0.5)
  const measureLabelRef = useRef<HTMLDivElement>(null)
  const viewportStatsRef = useRef<HTMLSpanElement>(null)
  const viewportStatsDataRef = useRef<{ count: number; original?: number; fps: number | null }>({
    count: 0,
    fps: null
  })
  const viewportFpsTrackerRef = useRef({ frames: 0, lastTime: performance.now() })
  const [viewportTriangleInfo, setViewportTriangleInfo] = useState<{
    count: number
    original?: number
  } | null>(null)
  const [screenshotHint, setScreenshotHint] = useState('')
  const [screenshotSaving, setScreenshotSaving] = useState(false)
  const screenshotHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshViewportStatsLine = useCallback(() => {
    const el = viewportStatsRef.current
    if (!el) return
    const data = viewportStatsDataRef.current
    el.textContent = formatViewportStatsLine(data.count, data.fps, data.original)
  }, [])
  const onLoadStatusChangeRef = useRef(onLoadStatusChange)
  const focusAnimRef = useRef<{
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
    fromCam: THREE.Vector3
    toCam: THREE.Vector3
    fromUp: THREE.Vector3
    toUp: THREE.Vector3
    elapsed: number
    duration: number
  } | null>(null)

  placementModeRef.current = placementMode
  placementKindRef.current = placementKind
  placementStartRef.current = placementStart
  markerDragEnabledRef.current = markerDragEnabled
  markersVisibleRef.current = markersVisible
  onMarkerRepositionRef.current = onMarkerReposition
  onMarkerEndpointRepositionRef.current = onMarkerEndpointReposition
  measureModeRef.current = measureMode
  materialEditModeRef.current = materialEditMode
  animationEditModeRef.current = animationEditMode
  animationGizmoModeRef.current = animationGizmoMode
  teachingStateEditModeRef.current = teachingStateEditMode
  teachingTransformModeRef.current = teachingTransformMode
  partAnimationChannelsRef.current = partAnimationChannels
  selectedModelPartUuidRef.current = selectedModelPartUuid
  onPartAnimationSyncRef.current = onPartAnimationSync
  onPartAnimationTransformCommitRef.current = onPartAnimationTransformCommit
  onPartAnimationTransformLiveRef.current = onPartAnimationTransformLive
  onTeachingStateSyncRef.current = onTeachingStateSync
  displayModeRef.current = displayMode
  inputModeRef.current = inputMode
  showGridRef.current = showGrid
  gridSizeScaleRef.current = gridSizeScale
  gridSpacingRef.current = gridSpacing
  sectionModeRef.current = sectionMode
  transparentModeRef.current = transparentMode
  sectionAxisRef.current = sectionAxis
  sectionPositionRef.current = sectionPosition
  onModelPickRef.current = onModelPick
  onMarkerSelectRef.current = onMarkerSelect
  markersRef.current = markers
  onLoadStatusChangeRef.current = onLoadStatusChange
  onMeasureStateChangeRef.current = onMeasureStateChange
  onMeshPickRef.current = onMeshPick
  onModelPartPickRef.current = onModelPartPick
  onViewportBlankPickRef.current = onViewportBlankPick
  onMeshPartsReadyRef.current = onMeshPartsReady
  onModelPartsListReadyRef.current = onModelPartsListReady
  onStandardViewChangeRef.current = onStandardViewChange
  onSectionModeChangeRef.current = onSectionModeChange
  onTransparentModeChangeRef.current = onTransparentModeChange
  explodedRef.current = exploded

  useEffect(() => {
    setDisplayMode('normal')
    setShowGrid(false)
    setGridSizeScale(1)
    setGridSpacing(0.35)
    setSectionMode(false)
    setTransparentMode(false)
    setSectionAxis('x')
    setSectionPosition(0.5)
    displayModeRef.current = 'normal'
    showGridRef.current = false
    gridSizeScaleRef.current = 1
    gridSpacingRef.current = 0.35
    sectionModeRef.current = false
    transparentModeRef.current = false
    sectionAxisRef.current = 'x'
    sectionPositionRef.current = 0.5
    onSectionModeChangeRef.current?.(false)
    onTransparentModeChangeRef.current?.(false)
  }, [asset.path])

  useEffect(() => {
    const root = modelRootRef.current
    if (!root || loadState !== 'ready') return
    setModelDisplayMode(root, displayMode)
  }, [displayMode, loadState])

  useEffect(() => {
    if (floorGridRef.current) {
      floorGridRef.current.visible = showGrid
    }
  }, [showGrid, loadState])

  useEffect(() => {
    if (!showGrid || loadState !== 'ready') return
    syncFloorGridRef.current?.()
  }, [gridSizeScale, gridSpacing, showGrid, loadState])

  const handleToggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => (prev === 'normal' ? 'facewire' : 'normal'))
  }, [])

  const handleToggleInputMode = useCallback(() => {
    setInputMode((prev) => (prev === 'mouse' ? 'touch' : 'mouse'))
  }, [])

  useEffect(() => {
    syncOrbitForTransformEditRef.current()
  }, [inputMode])

  const handleToggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev)
  }, [])

  const handleGridSizeScaleChange = useCallback((scale: number) => {
    setGridSizeScale(scale)
    gridSizeScaleRef.current = scale
  }, [])

  const handleGridSpacingChange = useCallback((spacing: number) => {
    setGridSpacing(spacing)
    gridSpacingRef.current = spacing
  }, [])

  const handleToggleSectionMode = useCallback(() => {
    setSectionMode((prev) => {
      const next = !prev
      sectionModeRef.current = next
      sectionClipControllerRef.current?.setEnabled(next)
      onSectionModeChangeRef.current?.(next)
      if (next) {
        setTransparentMode(false)
        transparentModeRef.current = false
        transparentPeekControllerRef.current?.setEnabled(false)
        transparentPeekControllerRef.current?.clearAll()
        onTransparentModeChangeRef.current?.(false)
      }
      return next
    })
  }, [])

  const handleToggleTransparentMode = useCallback(() => {
    setTransparentMode((prev) => {
      const next = !prev
      transparentModeRef.current = next
      transparentPeekControllerRef.current?.setEnabled(next)
      if (!next) {
        transparentPeekControllerRef.current?.clearAll()
      }
      if (next) {
        setSectionMode(false)
        sectionModeRef.current = false
        sectionClipControllerRef.current?.setEnabled(false)
        onSectionModeChangeRef.current?.(false)
      }
      onTransparentModeChangeRef.current?.(next)
      return next
    })
  }, [])

  const toolModeActive = exploded || measureMode || sectionMode || transparentMode

  useEffect(() => {
    if (!toolModeActive) return
    setAnimationPlaying(false)
    animationControllerRef.current?.stop()
    animationControllerRef.current?.setPlaying(false)
  }, [toolModeActive])

  useEffect(() => {
    if (!measureMode) return
    setTransparentMode(false)
    transparentModeRef.current = false
    transparentPeekControllerRef.current?.setEnabled(false)
    transparentPeekControllerRef.current?.clearAll()
    onTransparentModeChangeRef.current?.(false)
  }, [measureMode])

  useEffect(() => {
    if (!placementMode) return
    setTransparentMode(false)
    transparentModeRef.current = false
    transparentPeekControllerRef.current?.setEnabled(false)
    transparentPeekControllerRef.current?.clearAll()
    onTransparentModeChangeRef.current?.(false)
  }, [placementMode])

  const handleSectionAxisChange = useCallback((axis: SectionAxis) => {
    setSectionAxis(axis)
    sectionAxisRef.current = axis
    sectionClipControllerRef.current?.setAxis(axis)
  }, [])

  const handleSectionPositionChange = useCallback((position: number) => {
    setSectionPosition(position)
    sectionPositionRef.current = position
    sectionClipControllerRef.current?.setPosition(position)
  }, [])

  const getCurrentModelBox = useCallback((): THREE.Box3 | null => {
    const root = modelRootRef.current
    if (root) {
      return computeMeshBoundingBox(root)
    }
    return modelBoxRef.current
  }, [])

  const animateCameraTo = useCallback(
    (
      target: THREE.Vector3,
      position: THREE.Vector3,
      up?: THREE.Vector3,
      duration = CAMERA_TRANSITION_DURATION
    ) => {
      const controls = controlsRef.current
      const camera = sceneRef.current?.camera
      if (!controls || !camera) return

      focusAnimRef.current = {
        fromTarget: controls.target.clone(),
        toTarget: target.clone(),
        fromCam: camera.position.clone(),
        toCam: position.clone(),
        fromUp: camera.up.clone(),
        toUp: (up ?? camera.up).clone(),
        elapsed: 0,
        duration
      }
    },
    []
  )

  const fitCameraToExplodeBounds = useCallback(
    (factor: number, duration = EXPLODE_ANIMATION_DURATION) => {
      const controller = explodeControllerRef.current
      const root = modelRootRef.current
      const container = containerRef.current
      const camera = sceneRef.current?.camera
      const controls = controlsRef.current
      if (!controller || !root || !container || !camera || !controls) return

      root.updateMatrixWorld(true)
      const box = controller.computeBoundingBoxAtFactor(factor)
      if (box.isEmpty()) return

      const aspect = container.clientWidth / Math.max(container.clientHeight, 1)
      const padding = factor > 1e-4 ? PREVIEW_CAMERA_PADDING * 1.15 : PREVIEW_CAMERA_PADDING
      const { position, target, up } = fitCameraToBoxPreservingView(
        camera,
        controls.target,
        box,
        aspect,
        padding
      )
      animateCameraTo(target, position, up, duration)
    },
    [animateCameraTo]
  )

  const restoreLibraryMaterials = useCallback(async () => {
    const controller = materialEditControllerRef.current
    if (!controller) return

    if (libraryId && isMaterialOverrideApiReady()) {
      try {
        const overrides = await window.electronAPI.getMaterialOverrides(libraryId)
        if (overrides?.entries.length) {
          await controller.applySavedOverrides(overrides, libraryId)
          return
        }
      } catch {
        /* ignore material override restore errors */
      }
    }

    controller.restoreOpenedBaseline()
  }, [libraryId])

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => {
        const initial = initialViewRef.current
        if (!initial) return
        animateCameraTo(initial.target, initial.position, initial.up)
        onStandardViewChangeRef.current?.(null)
      },
      setStandardView: (view: StandardViewDirection) => {
        const camera = sceneRef.current?.camera
        const container = containerRef.current
        const box = getCurrentModelBox()
        if (!camera || !container || !box) return

        const aspect = container.clientWidth / Math.max(container.clientHeight, 1)
        const { position, target, up } = computeStandardViewCamera(
          camera,
          box,
          aspect,
          view,
          PREVIEW_CAMERA_PADDING
        )
        animateCameraTo(target, position, up)
        onStandardViewChangeRef.current?.(view)
      },
      toggleExplode: () => {
        const controller = explodeControllerRef.current
        if (!controller || controller.partCount === 0) return false
        const next = !controller.exploded
        controller.setExploded(next)
        syncFloorGridRef.current?.()
        fitCameraToExplodeBounds(next ? 1 : 0)
        onExplodedChange?.(next)
        return next
      },
      restoreExplode: () => {
        const controller = explodeControllerRef.current
        if (!controller) return
        controller.setExploded(false)
        syncFloorGridRef.current?.()
        onExplodedChange?.(false)
      },
      clearMeasure: () => {
        const controller = measureControllerRef.current
        if (!controller) return
        const state = controller.clear()
        onMeasureStateChangeRef.current?.(state)
        if (measureLabelRef.current) {
          measureLabelRef.current.style.display = 'none'
        }
      },
      listMeshParts: () => materialEditControllerRef.current?.listParts() ?? [],
      listMaterials: (meshUuid) => materialEditControllerRef.current?.listMaterials(meshUuid) ?? [],
      listTextures: () => materialEditControllerRef.current?.listTextures() ?? [],
      selectMesh: (meshUuid, materialIndex) =>
        materialEditControllerRef.current?.selectMesh(meshUuid, materialIndex) ?? null,
      applyMaterialPatch: (patch) =>
        materialEditControllerRef.current?.applyPatch(patch) ?? null,
      applyMapFromFile: (filePath, slot) =>
        materialEditControllerRef.current?.applyMapFromFile(filePath, slot) ?? Promise.resolve(null),
      buildMaterialSavePayload: () =>
        materialEditControllerRef.current?.buildSavePayload() ??
        Promise.resolve({ entries: [], textures: [] }),
      commitMaterialBaseline: () => {
        materialEditControllerRef.current?.commitBaseline()
      },
      hasMaterialUnsavedChanges: () =>
        materialEditControllerRef.current?.hasUnsavedChanges() ?? false,
      hasOpenedBaselineChangesForSelection: () =>
        materialEditControllerRef.current?.hasOpenedBaselineChangesForSelection() ?? false,
      resetSelectedMaterial: () => materialEditControllerRef.current?.resetSelectedMaterial() ?? null,
      clearMaterialSelection: () => {
        materialEditControllerRef.current?.clearSelection()
      },
      listModelParts: () => partsVisibilityControllerRef.current?.listPartsTree() ?? [],
      setPartVisible: (objectUuid, visible) =>
        partsVisibilityControllerRef.current?.setVisible(objectUuid, visible) ?? false,
      setAllPartsVisible: (visible) => {
        partsVisibilityControllerRef.current?.setAllVisible(visible)
      },
      selectModelPart: (meshUuid) => {
        if (materialEditModeRef.current) {
          partsVisibilityControllerRef.current?.clearSelection()
          materialEditControllerRef.current?.selectMesh(meshUuid)
          return true
        }
        materialEditControllerRef.current?.clearSelection()
        return partsVisibilityControllerRef.current?.selectMesh(meshUuid) ?? false
      },
      clearModelPartSelection: () => {
        partsVisibilityControllerRef.current?.clearSelection()
      },
      renameModelPart: (objectUuid, name) => {
        const controller = partsVisibilityControllerRef.current
        if (!controller?.setDisplayName(objectUuid, name)) return false

        if (partAnimationControllerRef.current?.updateMeshDisplayName(objectUuid, name)) {
          onPartAnimationSyncRef.current?.()
        }
        return true
      },
      getPartDisplayNames: () => partsVisibilityControllerRef.current?.getDisplayNames() ?? {},
      getPartAnimationDocument: () => partAnimationControllerRef.current?.getDocument() ?? null,
      getPartAnimationMarkers: () => partAnimationControllerRef.current?.listKeyframeMarkers() ?? [],
      getPartAnimationTime: () => partAnimationControllerRef.current?.getCurrentTime() ?? 0,
      getPartAnimationPlaying: () => partAnimationControllerRef.current?.playingState ?? false,
      setPartAnimationTime: (time, clampToStageId) => {
        partAnimationControllerRef.current?.setTime(time, { clampToStageId })
        onPartAnimationSyncRef.current?.()
      },
      setPartAnimationPlaying: (playing) => {
        if (playing) {
          partAnimationControllerRef.current?.setPreviewEnabled(true)
          partAnimationControllerRef.current?.playAll()
        } else {
          partAnimationControllerRef.current?.setPlaying(false)
        }
        if (playing) {
          animationControllerRef.current?.setPlaying(false)
        }
        onPartAnimationSyncRef.current?.()
      },
      stopPartAnimation: () => {
        partAnimationControllerRef.current?.setPlaying(false)
        partAnimationControllerRef.current?.clearPlaybackRange()
        partAnimationControllerRef.current?.setTime(0)
        onPartAnimationSyncRef.current?.()
      },
      setPartAnimationDuration: (duration) => {
        partAnimationControllerRef.current?.setDuration(duration)
        onPartAnimationSyncRef.current?.()
      },
      setPartAnimationName: (name) => {
        partAnimationControllerRef.current?.setName(name)
        onPartAnimationSyncRef.current?.()
      },
      addPartAnimationStage: (name, duration) => {
        const stageId = partAnimationControllerRef.current?.addStage(name, duration) ?? null
        if (stageId) onPartAnimationSyncRef.current?.()
        return stageId
      },
      updatePartAnimationStage: (stageId, patch) => {
        const ok = partAnimationControllerRef.current?.updateStage(stageId, patch) ?? false
        if (ok) onPartAnimationSyncRef.current?.()
        return ok
      },
      removePartAnimationStage: (stageId) => {
        const ok = partAnimationControllerRef.current?.removeStage(stageId) ?? false
        if (ok) onPartAnimationSyncRef.current?.()
        return ok
      },
      playPartAnimationStage: (stageId) => {
        const ok = partAnimationControllerRef.current?.playStage(stageId) ?? false
        if (ok) onPartAnimationSyncRef.current?.()
        return ok
      },
      playAllPartAnimation: () => {
        partAnimationControllerRef.current?.playAll()
        onPartAnimationSyncRef.current?.()
      },
      addPartAnimationKeyframe: (channels) => {
        const meshUuid = selectedModelPartUuidRef.current
        if (!meshUuid || channels.length === 0) return
        partAnimationControllerRef.current?.addKeyframe(meshUuid, channels)
        onPartAnimationSyncRef.current?.()
      },
      removePartAnimationKeyframeAtCurrent: () => {
        const meshUuid = selectedModelPartUuidRef.current
        if (!meshUuid) return
        partAnimationControllerRef.current?.removeKeyframesAtCurrentTime(meshUuid)
        onPartAnimationSyncRef.current?.()
      },
      selectPartAnimationTarget: (meshUuid) => {
        partAnimationControllerRef.current?.setSelectedMesh(meshUuid)
        attachTransformControlsRef.current()
      },
      getPartAnimationMeshTransform: (meshUuid) => {
        return partAnimationControllerRef.current?.getMeshLocalTransform(meshUuid) ?? null
      },
      applyPartAnimationMeshTransform: (meshUuid, patch) => {
        const channels = partAnimationChannelsRef.current
        const changed =
          partAnimationControllerRef.current?.applyMeshLocalTransform(meshUuid, patch, channels) ??
          false
        onPartAnimationSyncRef.current?.('edit')
        return changed
      },
      getMeshUvLayout: (meshUuid, materialIndex = 0) => {
        const mesh = partsVisibilityControllerRef.current?.getMeshByUuid(meshUuid)
        if (!mesh) return null
        return extractMeshUvLayout(mesh, materialIndex, mesh.name?.trim() || meshUuid)
      },
      loadPartAnimationDocument: (document) => {
        partAnimationControllerRef.current?.loadDocument(document)
        onPartAnimationSyncRef.current?.()
      },
      setPartAnimationPreviewEnabled: (enabled, options) => {
        partAnimationControllerRef.current?.setPreviewEnabled(enabled, options)
        if (!enabled && !partAnimationControllerRef.current?.playingState) {
          partAnimationControllerRef.current?.setPlaying(false)
        }
        onPartAnimationSyncRef.current?.()
      },
      getTeachingStateDocument: () => teachingStateControllerRef.current?.getDocument() ?? null,
      getActiveTeachingStateId: () => teachingStateControllerRef.current?.getActiveStateId() ?? null,
      addTeachingState: (name) => {
        const state = teachingStateControllerRef.current?.addState(name) ?? null
        if (state) onTeachingStateSyncRef.current?.('edit')
        return state
      },
      updateTeachingStateName: (stateId, name) => {
        const ok = teachingStateControllerRef.current?.updateStateName(stateId, name) ?? false
        if (ok) onTeachingStateSyncRef.current?.('edit')
        return ok
      },
      deleteTeachingState: (stateId) => {
        const ok = teachingStateControllerRef.current?.deleteState(stateId) ?? false
        if (ok) onTeachingStateSyncRef.current?.('edit')
        return ok
      },
      setInitialTeachingState: (stateId) => {
        teachingStateControllerRef.current?.setInitialState(stateId)
        onTeachingStateSyncRef.current?.('edit')
      },
      captureTeachingState: async (stateId) => {
        const textures = (await teachingStateControllerRef.current?.captureState(stateId)) ?? []
        onTeachingStateSyncRef.current?.('edit')
        return textures
      },
      applyTeachingState: async (stateId) => {
        partAnimationControllerRef.current?.setPlaying(false)
        partAnimationControllerRef.current?.setPreviewEnabled(false, {
          preserveScenePose: true
        })
        const ok =
          (await teachingStateControllerRef.current?.applyState(stateId, {
            restoreLibraryMaterials
          })) ?? false
        if (ok) {
          partAnimationControllerRef.current?.setPreviewEnabled(false, {
            preserveScenePose: true
          })
          materialEditControllerRef.current?.rebuildBaselineFromScene()
          onTeachingStateSyncRef.current?.('edit')
          onModelPartsListReadyRef.current?.(
            partsVisibilityControllerRef.current?.listPartsTree() ?? []
          )
          syncFloorGridRef.current?.()
        }
        return ok
      },
      buildTeachingStateSavePayload: () =>
        teachingStateControllerRef.current?.buildSavePayload() ??
        Promise.resolve({
          document: createDefaultTeachingStateDocument(),
          textures: []
        })
    }),
    [animateCameraTo, fitCameraToExplodeBounds, getCurrentModelBox, onExplodedChange, restoreLibraryMaterials]
  )

  useEffect(() => {
    return () => {
      if (screenshotHintTimerRef.current) {
        clearTimeout(screenshotHintTimerRef.current)
      }
    }
  }, [])

  const showScreenshotHint = useCallback((message: string) => {
    setScreenshotHint(message)
    if (screenshotHintTimerRef.current) {
      clearTimeout(screenshotHintTimerRef.current)
    }
    screenshotHintTimerRef.current = setTimeout(() => {
      setScreenshotHint('')
      screenshotHintTimerRef.current = null
    }, 4000)
  }, [])

  const handleCaptureScreenshot = useCallback(async () => {
    const container = containerRef.current
    const sceneObjects = sceneRef.current
    if (!container || !sceneObjects || loadState !== 'ready') {
      showScreenshotHint('模型尚未加载完成，无法截图')
      return
    }

    setScreenshotSaving(true)
    const restoreOverlays = hideViewportOverlays(container, measureLabelRef.current)

    try {
      const { scene, camera, renderer } = sceneObjects
      renderer.render(scene, camera)
      try {
        markerLayerRef.current?.render(scene, camera)
      } catch (err) {
        console.error('标注渲染失败', err)
      }

      await waitForViewportPaint()

      const captureRect = computeViewportCaptureRect(container)
      if (!captureRect) {
        showScreenshotHint('截图区域无效')
        return
      }

      const savedPath = await window.electronAPI.saveViewportScreenshot(captureRect)
      const fileName = savedPath.split(/[/\\]/).pop() ?? '截图.png'
      showScreenshotHint(`截图已保存到桌面：${fileName}`)
    } catch (err) {
      showScreenshotHint(err instanceof Error ? err.message : '截图失败')
    } finally {
      restoreOverlays()
      setScreenshotSaving(false)
    }
  }, [loadState, showScreenshotHint])

  const reportLoadStatus = useCallback((status: ModelPreviewLoadStatus) => {
    setLoadState(status.state)
    setLoadMessage(status.message ?? '')
    onLoadStatusChangeRef.current?.(status)
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    setLoadState('loading')
    setLoadMessage('正在加载模型…')
    setViewportTriangleInfo(null)
    viewportFpsTrackerRef.current = { frames: 0, lastTime: performance.now() }
    viewportStatsDataRef.current = { count: 0, fps: null }
    if (viewportStatsRef.current) {
      viewportStatsRef.current.textContent = formatViewportStatsLine(0, null)
    }
    onLoadStatusChangeRef.current?.({ state: 'loading', message: '正在加载模型…' })

    setAnimationClips([])
    setActiveClipIndex(0)
    setAnimationPlaying(false)
    animationControllerRef.current?.dispose()
    animationControllerRef.current = null
    explodeControllerRef.current?.dispose()
    explodeControllerRef.current = null
    sectionClipControllerRef.current?.dispose()
    sectionClipControllerRef.current = null
    transparentPeekControllerRef.current?.dispose()
    transparentPeekControllerRef.current = null
    measureControllerRef.current?.dispose()
    measureControllerRef.current = null
    materialEditControllerRef.current?.dispose()
    materialEditControllerRef.current = null
    partsVisibilityControllerRef.current?.dispose()
    partsVisibilityControllerRef.current = null
    partAnimationControllerRef.current?.dispose()
    partAnimationControllerRef.current = null
    teachingStateControllerRef.current?.dispose()
    teachingStateControllerRef.current = null
    transformControlsRef.current?.dispose()
    transformControlsRef.current = null
    attachTransformControlsRef.current = () => {}
    syncOrbitForTransformEditRef.current = () => {}
    syncFloorGridRef.current = null
    disposePreviewFloorGrid(floorGridRef.current)
    floorGridRef.current = null
    initialViewRef.current = null
    modelBoxRef.current = null
    onExplodedChange?.(false)
    onCanExplodeChange?.(false)
    onMeasureStateChangeRef.current?.({ pointCount: 0, distance: null, points: [] })
    if (measureLabelRef.current) {
      measureLabelRef.current.style.display = 'none'
    }

    const container = containerRef.current
    let animationId = 0
    let disposed = false
    const clock = new THREE.Clock()

    const sceneObjects = createPreviewScene(settings)
    sceneRef.current = sceneObjects
    const { scene, camera, renderer } = sceneObjects
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controlsRef.current = controls
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 0.5
    controls.maxDistance = 50
    controls.target.set(0, 0, 0)
    controls.enableZoom = true

    const syncTouchPanZoomTolerance = (): void => {
      disposeTouchPanZoomToleranceRef.current?.()
      disposeTouchPanZoomToleranceRef.current = null
      if (inputModeRef.current === 'touch') {
        disposeTouchPanZoomToleranceRef.current = applyTwoFingerPanZoomTolerance(controls)
      }
    }

    const syncOrbitInteraction = (): void => {
      const transformEditing =
        (animationEditModeRef.current || teachingStateEditModeRef.current) &&
        !!selectedModelPartUuidRef.current
      const interactionLocked =
        placementModeRef.current ||
        measureModeRef.current ||
        markerDraggingRef.current

      if (transformEditing) {
        controls.mouseButtons.LEFT = null
        controls.enableRotate = false
        controls.enablePan = true
        controls.enableZoom = true
      } else {
        controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
        controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
        controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
        controls.enableRotate = !interactionLocked
        controls.enablePan = !interactionLocked
        controls.enableZoom = !interactionLocked
      }

      if (inputModeRef.current === 'touch') {
        controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
      } else {
        controls.touches = { ONE: undefined, TWO: undefined }
      }
      syncTouchPanZoomTolerance()
    }

    const handleOrbitStart = (): void => {
      onStandardViewChangeRef.current?.(null)
    }

    controls.addEventListener('start', handleOrbitStart)

    syncOrbitForTransformEditRef.current = syncOrbitInteraction
    syncOrbitInteraction()

    const raycastHit = (
      clientX: number,
      clientY: number
    ): { point: THREE.Vector3; object: THREE.Mesh; materialIndex: number } | null => {
      const root = modelRootRef.current
      if (!root) return null

      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObjects(pickTargetsRef.current, false)
      if (hits.length === 0) return null

      const hit = hits[0]
      if (!(hit.object instanceof THREE.Mesh)) return null

      return {
        point: root.worldToLocal(hit.point.clone()),
        object: hit.object,
        materialIndex: hit.materialIndex ?? 0
      }
    }

    let markerDragState: {
      markerId: string
      dragTarget: 'pin' | 'start' | 'end'
      active: boolean
      startX: number
      startY: number
      pointerId: number
      dragOffset: THREE.Vector3
      useViewPlaneDrag?: boolean
      planeNormalWorld?: THREE.Vector3
      planePointWorld?: THREE.Vector3
      pointerStartLocal?: THREE.Vector3
      dragAnchor?: { x: number; y: number; z: number }
      lastPosition: { x: number; y: number; z: number; meshName?: string } | null
      lastStart: { x: number; y: number; z: number } | null
      lastEnd: { x: number; y: number; z: number } | null
      onDragFinished?: (dragged: boolean) => void
    } | null = null

    const updateInteractionLock = (): void => {
      markerDraggingRef.current = !!markerDragState?.active
      syncOrbitInteraction()
      const locked =
        placementModeRef.current ||
        measureModeRef.current ||
        !!markerDragState?.active
      renderer.domElement.style.cursor = markerDragState?.active
        ? 'grabbing'
        : locked
          ? 'crosshair'
          : 'default'
    }

    const finishMarkerDrag = (): void => {
      if (!markerDragState) return

      const state = markerDragState
      markerDragState = null
      markerLayer.setDragging(null)
      markerLayer.setEndpointDragging(null)
      window.removeEventListener('pointermove', handleMarkerDragMove)
      window.removeEventListener('pointerup', handleMarkerDragEnd)
      window.removeEventListener('pointercancel', handleMarkerDragEnd)
      updateInteractionLock()

      if (state.active) {
        if (state.dragTarget === 'pin') {
          const marker = markersRef.current.find((item) => item.id === state.markerId)
          if (marker?.kind === 'arrow' && state.lastStart && state.lastEnd) {
            onMarkerEndpointRepositionRef.current?.(state.markerId, state.lastStart, state.lastEnd)
          } else if (state.lastPosition) {
            onMarkerRepositionRef.current?.(
              state.markerId,
              {
                x: state.lastPosition.x,
                y: state.lastPosition.y,
                z: state.lastPosition.z
              },
              state.lastPosition.meshName
            )
          }
        } else if (state.lastStart && state.lastEnd) {
          onMarkerEndpointRepositionRef.current?.(state.markerId, state.lastStart, state.lastEnd)
        }
      }

      state.onDragFinished?.(state.active)
    }

    const handleMarkerDragMove = (event: PointerEvent): void => {
      if (!markerDragState || event.pointerId !== markerDragState.pointerId) return

      const moved = Math.hypot(event.clientX - markerDragState.startX, event.clientY - markerDragState.startY)
      if (!markerDragState.active) {
        if (moved < 6) return

        const marker = markersRef.current.find((item) => item.id === markerDragState!.markerId)
        if (!marker) return

        if (markerDragState.dragTarget === 'pin') {
          const current = markerLayer.getMarkerPosition(markerDragState.markerId)
          if (!current) return

          markerDragState.active = true
          markerDragState.lastPosition = { ...current, meshName: marker.meshName }
          markerDragState.lastStart = { ...marker.position }
          if (marker.endPosition) {
            markerDragState.lastEnd = { ...marker.endPosition }
          }

          const root = modelRootRef.current
          const useViewPlaneDrag = isAnchorMarkerKind(marker.kind) && !!root
          markerDragState.useViewPlaneDrag = useViewPlaneDrag

          if (useViewPlaneDrag && root) {
            const { planeNormalWorld, planePointWorld } = getViewPlaneFromLocalAnchor(
              root,
              camera,
              current
            )
            markerDragState.planeNormalWorld = planeNormalWorld
            markerDragState.planePointWorld = planePointWorld
            markerDragState.dragAnchor = { ...current }
            markerDragState.pointerStartLocal =
              intersectPointerOnViewPlane(
                event.clientX,
                event.clientY,
                camera,
                container,
                planeNormalWorld,
                planePointWorld,
                root
              ) ?? new THREE.Vector3(current.x, current.y, current.z)
          } else {
            markerDragState.dragOffset.set(0, 0, 0)
            const hit = raycastHit(event.clientX, event.clientY)
            if (hit) {
              markerDragState.dragOffset.set(
                hit.point.x - current.x,
                hit.point.y - current.y,
                hit.point.z - current.z
              )
            }
          }

          markerLayer.setDragging(markerDragState.markerId)
        } else if (marker.endPosition) {
          markerDragState.active = true
          markerDragState.lastStart = { ...marker.position }
          markerDragState.lastEnd = { ...marker.endPosition }
          markerDragState.dragOffset.set(0, 0, 0)

          const anchor =
            markerDragState.dragTarget === 'start' ? marker.position : marker.endPosition
          const hit = raycastHit(event.clientX, event.clientY)
          if (hit) {
            markerDragState.dragOffset.set(
              hit.point.x - anchor.x,
              hit.point.y - anchor.y,
              hit.point.z - anchor.z
            )
          }

          markerLayer.setEndpointDragging(markerDragState.markerId, markerDragState.dragTarget)
        }

        updateInteractionLock()
        return
      }

      const marker = markersRef.current.find((item) => item.id === markerDragState!.markerId)
      if (!marker?.endPosition && markerDragState.dragTarget !== 'pin') return

      if (markerDragState.dragTarget === 'pin') {
        if (
          markerDragState.useViewPlaneDrag &&
          marker?.kind &&
          isAnchorMarkerKind(marker.kind) &&
          markerDragState.dragAnchor &&
          markerDragState.pointerStartLocal &&
          markerDragState.planeNormalWorld &&
          markerDragState.planePointWorld
        ) {
          const root = modelRootRef.current
          if (!root) return

          const currentLocal = intersectPointerOnViewPlane(
            event.clientX,
            event.clientY,
            camera,
            container,
            markerDragState.planeNormalWorld,
            markerDragState.planePointWorld,
            root
          )
          if (!currentLocal) return

          const position = {
            x:
              markerDragState.dragAnchor.x +
              (currentLocal.x - markerDragState.pointerStartLocal.x),
            y:
              markerDragState.dragAnchor.y +
              (currentLocal.y - markerDragState.pointerStartLocal.y),
            z:
              markerDragState.dragAnchor.z +
              (currentLocal.z - markerDragState.pointerStartLocal.z)
          }
          markerLayer.setMarkerPosition(markerDragState.markerId, position)
          markerDragState.lastPosition = {
            ...position,
            meshName: marker.meshName
          }
          return
        }

        const hit = raycastHit(event.clientX, event.clientY)
        if (!hit) return

        const position = {
          x: hit.point.x - markerDragState.dragOffset.x,
          y: hit.point.y - markerDragState.dragOffset.y,
          z: hit.point.z - markerDragState.dragOffset.z
        }
        markerLayer.setMarkerPosition(markerDragState.markerId, position)
        markerDragState.lastPosition = {
          ...position,
          meshName: hit.object.name?.trim() || undefined
        }

        if (marker?.kind === 'arrow' && marker.endPosition) {
          const prevStart = markerDragState.lastStart ?? marker.position
          const prevEnd = markerDragState.lastEnd ?? marker.endPosition
          const dx = position.x - prevStart.x
          const dy = position.y - prevStart.y
          const dz = position.z - prevStart.z
          const end = {
            x: prevEnd.x + dx,
            y: prevEnd.y + dy,
            z: prevEnd.z + dz
          }
          markerLayer.setArrowEndpoints(markerDragState.markerId, position, end)
          markerDragState.lastStart = position
          markerDragState.lastEnd = end
        }
        return
      }

      const hit = raycastHit(event.clientX, event.clientY)
      if (!hit) return
      if (!marker) return

      const point = {
        x: hit.point.x - markerDragState.dragOffset.x,
        y: hit.point.y - markerDragState.dragOffset.y,
        z: hit.point.z - markerDragState.dragOffset.z
      }

      if (markerDragState.dragTarget === 'start') {
        const end = markerDragState.lastEnd ?? marker.endPosition!
        markerLayer.setArrowEndpoints(markerDragState.markerId, point, end)
        markerDragState.lastStart = point
        markerDragState.lastEnd = end
      } else {
        const start = markerDragState.lastStart ?? marker.position
        markerLayer.setArrowEndpoints(markerDragState.markerId, start, point)
        markerDragState.lastStart = start
        markerDragState.lastEnd = point
      }
    }

    const handleMarkerDragEnd = (event: PointerEvent): void => {
      if (!markerDragState || event.pointerId !== markerDragState.pointerId) return
      finishMarkerDrag()
    }

    const markerLayer = new ModelMarkerLayer(
      container,
      (markerId) => {
        onMarkerSelectRef.current(markerId)
      },
      ({ markerId, clientX, clientY, pointerId, onDragFinished }) => {
        if (!markerDragEnabledRef.current) return
        if (placementModeRef.current || measureModeRef.current) return

        markerDragState = {
          markerId,
          dragTarget: 'pin',
          active: false,
          startX: clientX,
          startY: clientY,
          pointerId,
          dragOffset: new THREE.Vector3(),
          lastPosition: null,
          lastStart: null,
          lastEnd: null,
          onDragFinished
        }
        window.addEventListener('pointermove', handleMarkerDragMove)
        window.addEventListener('pointerup', handleMarkerDragEnd)
        window.addEventListener('pointercancel', handleMarkerDragEnd)
      },
      ({ markerId, endpoint, clientX, clientY, pointerId, onDragFinished }) => {
        if (!markerDragEnabledRef.current) return
        if (placementModeRef.current || measureModeRef.current) return

        markerDragState = {
          markerId,
          dragTarget: endpoint,
          active: false,
          startX: clientX,
          startY: clientY,
          pointerId,
          dragOffset: new THREE.Vector3(),
          lastPosition: null,
          lastStart: null,
          lastEnd: null,
          onDragFinished
        }
        window.addEventListener('pointermove', handleMarkerDragMove)
        window.addEventListener('pointerup', handleMarkerDragEnd)
        window.addEventListener('pointercancel', handleMarkerDragEnd)
      }
    )
    markerLayerRef.current = markerLayer
    markerLayer.setDragEnabled(markerDragEnabledRef.current)

    const resize = (): void => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    void loadModelFromPath(
      asset.path,
      asset.source === 'library' ? asset.extension : undefined,
      { upAxis: settings.stlUpAxis }
    )
      .then(async (object) => {
        if (disposed) return

        reportLoadStatus({ state: 'loading', message: '正在处理模型数据…' })

        const optimization = await resolvePreviewOptimization(object, async (message) => {
          reportLoadStatus({ state: 'loading', message: '模型面数较高，请选择是否减面…' })
          if (typeof window.electronAPI?.showConfirmDialog === 'function') {
            return window.electronAPI.showConfirmDialog(message, '模型面数较高')
          }
          return window.confirm(message)
        })

        const totalTriangles = optimization.optimizedTriangles
        if (totalTriangles > 300_000) {
          renderer.setPixelRatio(1)
        }

        const { root, box } = centerAndScaleObject(object, PREVIEW_MODEL_TARGET_SIZE)
        modelRootRef.current = root
        modelBoxRef.current = box.clone()
        pickTargetsRef.current = []
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            pickTargetsRef.current.push(child)
          }
        })

        const partsVisibilityController = new ModelPartsVisibilityController()
        partsVisibilityController.init(root)
        partsVisibilityControllerRef.current = partsVisibilityController

        const materialEditController = new ModelMaterialEditController()
        materialEditController.init(root)
        materialEditControllerRef.current = materialEditController

        const teachingStateController = new ModelTeachingStateController()
        teachingStateController.init(root, partsVisibilityController)
        if (libraryId) {
          teachingStateController.setLibraryId(libraryId)
        }
        teachingStateControllerRef.current = teachingStateController

        if (asset.libraryId && isMaterialOverrideApiReady()) {
          try {
            const overrides = await window.electronAPI.getMaterialOverrides(asset.libraryId)
            if (disposed) return
            if (overrides?.entries.length) {
              await materialEditController.applySavedOverrides(overrides, asset.libraryId)
            }
          } catch (error: unknown) {
            const message =
              error instanceof Error && error.message
                ? error.message
                : '材质覆盖加载失败'
            console.warn(message, error)
          }
        }
        if (disposed) return

        const partAnimationController = new PartAnimationEditorController()
        partAnimationController.init(root)
        partAnimationControllerRef.current = partAnimationController

        teachingStateController.captureBaseline()

        if (asset.libraryId && typeof window.electronAPI?.getTeachingStates === 'function') {
          try {
            const savedTeaching = await window.electronAPI.getTeachingStates(asset.libraryId)
            if (disposed) return
            if (savedTeaching) {
              teachingStateController.loadDocument(savedTeaching)
              teachingStateController.setLibraryId(asset.libraryId)
              if (savedTeaching.initialStateId) {
                await teachingStateController.applyState(savedTeaching.initialStateId, {
                  restoreLibraryMaterials
                })
              }
              onTeachingStateSyncRef.current?.('disk')
            }
          } catch {
            /* ignore teaching state load errors in preview */
          }
        }
        if (disposed) return

        setupDefaultMaterials(root)
        await waitForModelTextures(root, { modelFilePath: asset.path })
        if (disposed) return

        scene.add(root)
        root.add(markerLayer.group)
        markerLayer.setVisualScale(computeMarkerVisualScale(root, box))
        try {
          markerLayer.sync(markersRef.current)
        } catch (err) {
          console.error('标注同步失败', err)
        }

        syncFloorGridRef.current = null
        disposePreviewFloorGrid(floorGridRef.current)
        const initialGridSpacing = computeDefaultGridSpacing(box)
        gridSpacingRef.current = initialGridSpacing
        setGridSpacing(initialGridSpacing)
        setGridSizeScale(1)
        gridSizeScaleRef.current = 1
        floorGridRef.current = syncPreviewFloorGrid(scene, null, box, showGridRef.current, {
          sizeScale: gridSizeScaleRef.current,
          spacing: gridSpacingRef.current
        })
        setModelDisplayMode(root, displayModeRef.current)

        syncFloorGridRef.current = () => {
          const currentRoot = modelRootRef.current
          if (!currentRoot) return
          currentRoot.updateMatrixWorld(true)
          const nextBox = computeMeshBoundingBox(currentRoot)
          modelBoxRef.current = nextBox.clone()
          floorGridRef.current = syncPreviewFloorGrid(
            scene,
            floorGridRef.current,
            nextBox,
            showGridRef.current,
            {
              sizeScale: gridSizeScaleRef.current,
              spacing: gridSpacingRef.current
            }
          )
        }

        const target = frameCameraToBox(
          camera,
          box,
          container.clientWidth / container.clientHeight,
          PREVIEW_CAMERA_PADDING
        )
        controls.target.copy(target)
        controls.update()
        initialViewRef.current = {
          position: camera.position.clone(),
          target: controls.target.clone(),
          up: camera.up.clone()
        }

        const explodeController = new ModelExplodeController()
        explodeController.init(root)
        explodeControllerRef.current = explodeController
        onCanExplodeChange?.(explodeController.partCount > 1)
        onExplodedChange?.(false)

        const sectionClipController = new ModelSectionClipController()
        sectionClipController.init(root, renderer, scene)
        sectionClipController.setAxis(sectionAxisRef.current)
        sectionClipController.setPosition(sectionPositionRef.current)
        sectionClipController.setEnabled(sectionModeRef.current)
        sectionClipControllerRef.current = sectionClipController

        const transparentPeekController = new ModelTransparentPeekController()
        transparentPeekController.init(root)
        transparentPeekController.setEnabled(transparentModeRef.current)
        transparentPeekControllerRef.current = transparentPeekController

        const measureController = new ModelMeasureController()
        measureController.attach(root, box)
        measureControllerRef.current = measureController
        onMeasureStateChangeRef.current?.({ pointCount: 0, distance: null, points: [] })

        const transformControls = new TransformControls(camera, renderer.domElement)
        transformControls.addEventListener('dragging-changed', (event) => {
          const dragging = Boolean(event.value)
          transformDraggingRef.current = dragging
          controls.enabled = !dragging
          if (dragging) return

          transformDragJustEndedRef.current = true
          syncOrbitForTransformEditRef.current()

          if (teachingStateEditModeRef.current) {
            partsVisibilityControllerRef.current?.getSelectedMesh()?.updateMatrixWorld(true)
            return
          }

          if (!animationEditModeRef.current) return

          const mesh = partAnimationControllerRef.current?.getSelectedMesh()
          if (!mesh) return

          const documentChanged = partAnimationControllerRef.current?.syncTransformFromMesh(
            mesh.uuid,
            partAnimationChannelsRef.current
          )
          onPartAnimationSyncRef.current?.('edit')
          if (documentChanged) {
            onPartAnimationTransformCommitRef.current?.()
          }
        })
        transformControls.addEventListener('change', () => {
          if (!transformDraggingRef.current) return
          if (teachingStateEditModeRef.current) return
          const mesh = partAnimationControllerRef.current?.getSelectedMesh()
          if (!mesh) return
          partAnimationControllerRef.current?.captureLiveTransform(
            mesh.uuid,
            partAnimationChannelsRef.current
          )
          onPartAnimationTransformLiveRef.current?.()
        })
        scene.add(transformControls.getHelper())
        transformControls.visible = false
        transformControlsRef.current = transformControls

        attachTransformControlsRef.current = () => {
          const tc = transformControlsRef.current
          const animMode = animationEditModeRef.current
          const stateMode = teachingStateEditModeRef.current
          if (!tc || (!animMode && !stateMode)) {
            tc?.detach()
            if (tc) tc.visible = false
            syncOrbitForTransformEditRef.current()
            return
          }

          let mesh: THREE.Mesh | null = null
          if (animMode) {
            mesh = partAnimationControllerRef.current?.getSelectedMesh() ?? null
            const gizmoMode = animationGizmoModeRef.current
            tc.setMode(gizmoMode === 'rotate' ? 'rotate' : 'translate')
          } else {
            mesh = partsVisibilityControllerRef.current?.getSelectedMesh() ?? null
            const mode = teachingTransformModeRef.current
            tc.setMode(mode === 'rotate' ? 'rotate' : mode === 'scale' ? 'scale' : 'translate')
          }

          if (!mesh) {
            tc.detach()
            tc.visible = false
            syncOrbitForTransformEditRef.current()
            return
          }
          tc.attach(mesh)
          tc.visible = true
          syncOrbitForTransformEditRef.current()
        }

        void (async () => {
          if (disposed) return
          if (asset.libraryId && typeof window.electronAPI?.getModelPrefs === 'function') {
            try {
              const prefs = await window.electronAPI.getModelPrefs(asset.libraryId)
              if (!disposed && prefs?.partDisplayNames) {
                partsVisibilityController.loadDisplayNames(prefs.partDisplayNames)
                onModelPartsListReadyRef.current?.(partsVisibilityController.listPartsTree())
              }
            } catch {
              /* ignore part display name load errors */
            }
          }
          if (asset.libraryId && typeof window.electronAPI?.getPartAnimation === 'function') {
            try {
              const saved = await window.electronAPI.getPartAnimation(asset.libraryId)
              if (!disposed && saved) {
                const teachingActiveId = teachingStateController.getActiveStateId()
                partAnimationController.loadDocument(saved, {
                  applyInitialPose: !teachingActiveId
                })
                onPartAnimationSyncRef.current?.('disk')
                if (teachingActiveId) {
                  await teachingStateController.applyState(teachingActiveId, {
                    restoreLibraryMaterials
                  })
                  materialEditController.rebuildBaselineFromScene()
                }
              }
            } catch {
              /* ignore animation load errors in preview */
            }
          }
        })()

        onMeshPartsReadyRef.current?.(materialEditController.listParts())
        onModelPartsListReadyRef.current?.(partsVisibilityController.listPartsTree())
        materialEditController.rebuildBaselineFromScene()

        if (isFbxFilePath(asset.path)) {
          const clips = getFbxAnimationClips(object)
          if (clips.length > 0) {
            const controller = new ModelAnimationController(object, clips)
            let clipIndex = 0
            let autoPlay = false
            if (libraryId) {
              try {
                const prefs = await window.electronAPI.getModelPrefs(libraryId)
                if (prefs) {
                  clipIndex = Math.max(0, Math.min(prefs.fbxDefaultClipIndex, clips.length - 1))
                  autoPlay = prefs.fbxAutoPlay
                }
              } catch {
                /* ignore prefs load errors */
              }
            }
            if (disposed) return
            controller.playClip(clipIndex, 0)
            controller.setPlaying(autoPlay)
            animationControllerRef.current = controller
            setAnimationClips(controller.getClipInfos())
            setActiveClipIndex(clipIndex)
            setAnimationPlaying(autoPlay)
            fbxPrefsReadyRef.current = true
          }
        }

        const displayTriangles = optimization.simplified
          ? optimization.optimizedTriangles
          : totalTriangles
        setViewportTriangleInfo({
          count: displayTriangles,
          original: optimization.simplified ? optimization.originalTriangles : undefined
        })
        viewportStatsDataRef.current = {
          count: displayTriangles,
          original: optimization.simplified ? optimization.originalTriangles : undefined,
          fps: viewportStatsDataRef.current.fps
        }
        refreshViewportStatsLine()

        renderer.render(scene, camera)

        const readyMessage = '模型已加载'
        reportLoadStatus({ state: 'ready', message: readyMessage })
      })
      .catch((error: unknown) => {
        if (disposed) return
        const message =
          error instanceof Error && error.message
            ? error.message
            : '模型加载失败，文件可能过大或格式不受支持'
        reportLoadStatus({ state: 'error', message })
      })

    const raycastLocalPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
      return raycastHit(clientX, clientY)?.point ?? null
    }

    const handlePointerDown = (event: PointerEvent): void => {
      pointerDownRef.current = { x: event.clientX, y: event.clientY }
    }

    const handlePointerMove = (event: PointerEvent): void => {
      if (
        placementModeRef.current &&
        placementKindRef.current !== 'point' &&
        placementStartRef.current
      ) {
        const point = raycastLocalPoint(event.clientX, event.clientY)
        markerLayer.setPlacementPreview(
          placementStartRef.current.position,
          point ? { x: point.x, y: point.y, z: point.z } : null
        )
        return
      }

      if (!measureModeRef.current) return

      const controller = measureControllerRef.current
      if (!controller || controller.getPoints().length !== 1) return

      const localPoint = raycastLocalPoint(event.clientX, event.clientY)
      controller.setPreviewPoint(localPoint)
    }

    const handlePointerUp = (event: PointerEvent): void => {
      const start = pointerDownRef.current
      pointerDownRef.current = null
      if (!start || !modelRootRef.current) return

      if (transformDraggingRef.current || transformDragJustEndedRef.current) {
        transformDragJustEndedRef.current = false
        return
      }

      const tapThreshold = event.pointerType === 'touch' ? 12 : 6
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y)
      if (moved > tapThreshold) return

      const hit = raycastHit(event.clientX, event.clientY)
      if (!hit) {
        if (
          !measureModeRef.current &&
          !placementModeRef.current &&
          !transparentModeRef.current
        ) {
          onViewportBlankPickRef.current?.()
        }
        return
      }

      if (measureModeRef.current) {
        const controller = measureControllerRef.current
        if (!controller) return
        const state = controller.addPoint(hit.point)
        onMeasureStateChangeRef.current?.(state)
        return
      }

      if (transparentModeRef.current) {
        transparentPeekControllerRef.current?.toggleMesh(hit.object.uuid)
        return
      }

      if (materialEditModeRef.current) {
        onMeshPickRef.current?.(hit.object.uuid, hit.materialIndex)
        return
      }

      if (placementModeRef.current) {
        const meshName = hit.object.name?.trim() || undefined
        onModelPickRef.current({
          position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          meshName
        })
        return
      }

      onModelPartPickRef.current?.(hit.object.uuid)
    }

    const handlePointerLeave = (): void => {
      if (
        placementModeRef.current &&
        placementKindRef.current !== 'point' &&
        placementStartRef.current
      ) {
        markerLayer.clearPlacementPreview()
        return
      }

      if (!measureModeRef.current) return
      const controller = measureControllerRef.current
      if (!controller || controller.getPoints().length !== 1) return
      controller.setPreviewPoint(null)
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave)

    const animate = (): void => {
      animationId = requestAnimationFrame(animate)

      const delta = clock.getDelta()
      const controls = controlsRef.current
      const anim = focusAnimRef.current
      if (controls && anim) {
        anim.elapsed += delta
        const raw = Math.min(anim.elapsed / anim.duration, 1)
        const t = raw * raw * (3 - 2 * raw)
        controls.target.lerpVectors(anim.fromTarget, anim.toTarget, t)
        camera.position.lerpVectors(anim.fromCam, anim.toCam, t)
        camera.up.lerpVectors(anim.fromUp, anim.toUp, t).normalize()
        if (raw >= 1) {
          controls.target.copy(anim.toTarget)
          camera.position.copy(anim.toCam)
          camera.up.copy(anim.toUp).normalize()
          focusAnimRef.current = null
          const box = modelBoxRef.current
          if (box && !box.isEmpty()) {
            const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.001)
            configureCameraDepthRange(camera, controls.target, radius, {
              minDistance: controls.minDistance,
              maxDistance: controls.maxDistance
            })
          }
        }
      }

      controls?.update()

      const toolModeActive =
        explodedRef.current ||
        measureModeRef.current ||
        sectionModeRef.current ||
        transparentModeRef.current
      const partAnim = partAnimationControllerRef.current
      if (!toolModeActive) {
        if (partAnim?.playingState) {
          partAnim.update(delta)
          animationControllerRef.current?.setPlaying(false)
          onPartAnimationSyncRef.current?.()
        } else {
          animationControllerRef.current?.update(delta)
        }
      }

      const explodeController = explodeControllerRef.current
      const explodeOffsetActive = explodeController && explodeController.currentFactor > 1e-4
      if (explodeOffsetActive && partAnim?.previewActive) {
        partAnim.refreshPreviewPose()
      }

      if (explodeController) {
        explodeController.update(delta)
        if (explodeOffsetActive) {
          explodeController.reapply()
        }
        if (explodeController.animating) {
          syncFloorGridRef.current?.()
          sectionClipControllerRef.current?.refreshBox()
        }
      }

      const fpsTracker = viewportFpsTrackerRef.current
      fpsTracker.frames += 1
      const fpsNow = performance.now()
      if (fpsNow - fpsTracker.lastTime >= 500) {
        viewportStatsDataRef.current.fps = Math.round(
          fpsTracker.frames / ((fpsNow - fpsTracker.lastTime) / 1000)
        )
        refreshViewportStatsLine()
        fpsTracker.frames = 0
        fpsTracker.lastTime = fpsNow
      }

      renderer.render(scene, camera)
      try {
        markerLayer.render(scene, camera)
      } catch (err) {
        console.error('标注渲染失败', err)
      }

      const measureController = measureControllerRef.current
      const root = modelRootRef.current
      const labelEl = measureLabelRef.current

      if (measureController && root && labelEl && measureModeRef.current) {
        const midpoint = measureController.getMidpoint()
        const distance = measureController.getDistance()
        if (midpoint && distance !== null) {
          const screen = projectLocalPointToScreen(midpoint, root, camera, container)
          if (screen) {
            labelEl.style.display = 'block'
            labelEl.style.left = `${screen.x}px`
            labelEl.style.top = `${screen.y}px`
            labelEl.textContent = formatMeasureDistance(distance)
          } else {
            labelEl.style.display = 'none'
          }
        } else {
          labelEl.style.display = 'none'
        }
      } else if (labelEl) {
        labelEl.style.display = 'none'
      }
    }
    animate()

    return () => {
      disposed = true
      onSectionModeChangeRef.current?.(false)
      onTransparentModeChangeRef.current?.(false)
      disposePreviewBackgroundTexture()
      finishMarkerDrag()
      sceneRef.current = null
      controlsRef.current = null
      modelRootRef.current = null
      markerLayerRef.current = null
      pickTargetsRef.current = []
      animationControllerRef.current?.dispose()
      animationControllerRef.current = null
      explodeControllerRef.current?.dispose()
      explodeControllerRef.current = null
      sectionClipControllerRef.current?.dispose()
      sectionClipControllerRef.current = null
      transparentPeekControllerRef.current?.dispose()
      transparentPeekControllerRef.current = null
      measureControllerRef.current?.dispose()
      measureControllerRef.current = null
      materialEditControllerRef.current?.dispose()
      materialEditControllerRef.current = null
      partsVisibilityControllerRef.current?.dispose()
      partsVisibilityControllerRef.current = null
      partAnimationControllerRef.current?.dispose()
      partAnimationControllerRef.current = null
      transformControlsRef.current?.dispose()
      transformControlsRef.current = null
      attachTransformControlsRef.current = () => {}
    syncOrbitForTransformEditRef.current = () => {}
      syncFloorGridRef.current = null
      disposePreviewFloorGrid(floorGridRef.current)
      floorGridRef.current = null
      cancelAnimationFrame(animationId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
      controls.removeEventListener('start', handleOrbitStart)
      disposeTouchPanZoomToleranceRef.current?.()
      disposeTouchPanZoomToleranceRef.current = null
      controls.dispose()
      markerLayer.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach((m) => m?.dispose())
        }
      })
    }
  }, [asset.path, settings.stlUpAxis])

  useEffect(() => {
    if (!sceneRef.current) return
    applyPreviewLighting(sceneRef.current, settings)
    void applyPreviewBackground(sceneRef.current.scene, settings)
  }, [settings])

  useEffect(() => {
    const layer = markerLayerRef.current
    const root = modelRootRef.current
    if (!layer) return

    try {
      layer.sync(markers)
    } catch (err) {
      console.error('标注同步失败', err)
    }
    if (root && layer.group.parent !== root) {
      root.add(layer.group)
    }
  }, [markers])

  useEffect(() => {
    if (!placementMode || placementKind === 'point' || !placementStart) {
      markerLayerRef.current?.clearPlacementPreview()
    }
  }, [placementMode, placementKind, placementStart])

  useEffect(() => {
    markerLayerRef.current?.setSelected(selectedMarkerId)
  }, [selectedMarkerId])

  useEffect(() => {
    if (!viewportTriangleInfo) return
    viewportStatsDataRef.current = {
      ...viewportStatsDataRef.current,
      count: viewportTriangleInfo.count,
      original: viewportTriangleInfo.original
    }
    refreshViewportStatsLine()
  }, [refreshViewportStatsLine, viewportTriangleInfo])

  useEffect(() => {
    markerLayerRef.current?.setVisible(markersVisible)
  }, [markersVisible])

  useEffect(() => {
    const controls = controlsRef.current
    const root = modelRootRef.current
    const camera = sceneRef.current?.camera
    if (!controls || !root || !camera || !focusMarkerId) return

    const marker = allMarkersForFocus.find((item) => item.id === focusMarkerId)
    if (!marker) return

    const worldPos = getMarkerWorldPosition(root, marker)
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target)
    const distance = Math.max(Math.min(offset.length(), 3.2), 1.2)
    offset.normalize().multiplyScalar(distance)

    focusAnimRef.current = {
      fromTarget: controls.target.clone(),
      toTarget: worldPos.clone(),
      fromCam: camera.position.clone(),
      toCam: worldPos.clone().add(offset),
      fromUp: camera.up.clone(),
      toUp: camera.up.clone(),
      elapsed: 0,
      duration: CAMERA_TRANSITION_DURATION
    }
  }, [focusMarkerId, allMarkersForFocus])

  useEffect(() => {
    markerLayerRef.current?.setDragEnabled(markerDragEnabled)
  }, [markerDragEnabled])

  useEffect(() => {
    const controls = controlsRef.current
    const canvas = sceneRef.current?.renderer.domElement
    if (!controls || !canvas) return

    syncOrbitForTransformEditRef.current()
    const interactionLocked =
      placementMode || measureMode || markerDraggingRef.current
    if (!markerDraggingRef.current) {
      canvas.style.cursor = interactionLocked ? 'crosshair' : 'default'
    }
  }, [
    placementMode,
    measureMode,
    materialEditMode,
    animationEditMode,
    teachingStateEditMode,
    selectedModelPartUuid
  ])

  useEffect(() => {
    if (animationEditMode) {
      partAnimationControllerRef.current?.setSelectedMesh(selectedModelPartUuid)
    }
    attachTransformControlsRef.current()
    syncOrbitForTransformEditRef.current()
  }, [
    animationEditMode,
    animationGizmoMode,
    teachingStateEditMode,
    teachingTransformMode,
    selectedModelPartUuid,
    partAnimationChannels,
    loadState
  ])

  useEffect(() => {
    fbxPrefsReadyRef.current = false
  }, [asset.path, libraryId])

  useEffect(() => {
    const controller = animationControllerRef.current
    if (!controller) return

    if (controller.activeClipIndex !== activeClipIndex) {
      controller.playClip(activeClipIndex)
    }
    controller.setPlaying(animationPlaying)
  }, [activeClipIndex, animationPlaying])

  useEffect(() => {
    if (!libraryId || !fbxPrefsReadyRef.current || animationClips.length === 0) return
    void window.electronAPI.saveModelPrefs(libraryId, {
      fbxDefaultClipIndex: activeClipIndex,
      fbxAutoPlay: animationPlaying
    })
  }, [libraryId, activeClipIndex, animationPlaying, animationClips.length])

  const viewportNavigationHint = useMemo(
    () => (loadState === 'ready' ? getViewportNavigationHint(inputMode) : null),
    [loadState, inputMode]
  )

  const toolbarHint = useMemo(
    () =>
      loadState === 'ready'
        ? getPreviewToolbarHint({
            measureMode,
            measureState,
            screenshotHint
          })
        : null,
    [loadState, measureMode, measureState, screenshotHint]
  )

  return (
    <div
      className={`preview-canvas-container ${placementMode || measureMode ? 'marker-placement-mode' : ''}`}
      ref={containerRef}
    >
      {loadState === 'loading' && (
        <div className="preview-canvas-overlay">
          <div className="thumb-loading" />
          <p className="preview-canvas-overlay-title">{loadMessage || '正在加载模型…'}</p>
          <p className="preview-canvas-overlay-hint">大型 FBX 文件解析可能需要数分钟，请耐心等待</p>
        </div>
      )}
      {loadState === 'error' && (
        <div className="preview-canvas-overlay preview-canvas-overlay-error">
          <div className="unsupported-preview-icon">⚠</div>
          <p className="preview-canvas-overlay-title">模型加载失败</p>
          <p className="preview-canvas-overlay-hint">{loadMessage}</p>
        </div>
      )}
      {loadState === 'ready' && (
        <div className="preview-viewport-hud">
          <div className="preview-viewport-stats" aria-hidden="true">
            <span ref={viewportStatsRef} className="preview-viewport-stats-line">
              {formatViewportStatsLine(0, null)}
            </span>
          </div>
          {selectedModelPartName && (
            <div className="preview-viewport-selected-part" role="status">
              {selectedModelPartName}
            </div>
          )}
          {onToggleViewportFullscreen && (
            <button
              type="button"
              className={`preview-viewport-fullscreen-btn ${viewportFullscreen ? 'active' : ''}`}
              onClick={onToggleViewportFullscreen}
              title={viewportFullscreen ? '退出全屏' : '全屏查看'}
              aria-label={viewportFullscreen ? '退出全屏' : '全屏查看'}
            >
              {viewportFullscreen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span>{viewportFullscreen ? '退出全屏' : '全屏'}</span>
            </button>
          )}
        </div>
      )}
      {loadState === 'ready' && viewportNavigationHint && (
        <div className="preview-viewport-operation-hint" role="status">
          {viewportNavigationHint}
        </div>
      )}
      {loadState === 'ready' && (
        <PreviewBottomToolbar
          canExplode={canExplode}
          exploded={exploded}
          measureMode={measureMode}
          transparentMode={transparentMode}
          sectionMode={sectionMode}
          sectionAxis={sectionAxis}
          sectionPosition={sectionPosition}
          displayMode={displayMode}
          showGrid={showGrid}
          gridSizeScale={gridSizeScale}
          gridSpacing={gridSpacing}
          markerCollections={markerCollections}
          visibleCollectionId={visibleCollectionId}
          showMarkerCollectionPicker={showMarkerCollectionPicker}
          teachingStates={teachingStates}
          activeTeachingStateId={activeTeachingStateId}
          showTeachingStatePicker={showTeachingStatePicker}
          measureState={measureState}
          activeStandardView={activeStandardView}
          onSetStandardView={onSetStandardView}
          onResetView={onResetView}
          onToggleDisplayMode={handleToggleDisplayMode}
          onToggleGrid={handleToggleGrid}
          onGridSizeScaleChange={handleGridSizeScaleChange}
          onGridSpacingChange={handleGridSpacingChange}
          onSelectVisibleCollection={onSelectVisibleCollection}
          onSelectTeachingState={onSelectTeachingState}
          onToggleExplode={onToggleExplode}
          onToggleMeasureMode={onToggleMeasureMode}
          onClearMeasure={onClearMeasure}
          onToggleTransparentMode={handleToggleTransparentMode}
          onToggleSectionMode={handleToggleSectionMode}
          onSectionAxisChange={handleSectionAxisChange}
          onSectionPositionChange={handleSectionPositionChange}
          operationHint={toolbarHint}
          screenshotSaving={screenshotSaving}
          onCaptureScreenshot={() => void handleCaptureScreenshot()}
          inputMode={inputMode}
          onToggleInputMode={handleToggleInputMode}
        />
      )}
      {loadState === 'ready' && !animationEditMode && !toolModeActive && animationClips.length > 0 && (
        <ModelAnimationBar
          clips={animationClips}
          activeClipIndex={activeClipIndex}
          playing={animationPlaying}
          onTogglePlaying={() => setAnimationPlaying((prev) => !prev)}
          onStop={() => {
            animationControllerRef.current?.stop()
            setAnimationPlaying(false)
          }}
          onSelectClip={setActiveClipIndex}
        />
      )}
      <div ref={measureLabelRef} className="preview-measure-label" style={{ display: 'none' }} />
    </div>
  )
})

function UnsupportedPreview({ message }: { message: string }): JSX.Element {
  return (
    <div className="preview-loading">
      <div className="unsupported-preview-icon">⚠</div>
      <p className="unsupported-preview-text">{message}</p>
    </div>
  )
}

export default function PreviewModal({
  asset,
  onClose
}: PreviewModalProps): JSX.Element | null {
  const [previewSettings, setPreviewSettings] = useState(getStoredPreviewSettings)
  const [collections, setCollections] = useState<MarkerCollection[]>([])
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)
  const [visibleCollectionId, setVisibleCollectionId] = useState<string | null>(null)

  useEffect(() => {
    if (!asset) return
    void hydratePreviewSettingsFromDisk().then(setPreviewSettings)
  }, [asset?.path])
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [focusMarkerId, setFocusMarkerId] = useState<string | null>(null)
  const [placementMode, setPlacementMode] = useState(false)
  const [draftKind, setDraftKind] = useState<ModelMarkerKind>('point')
  const [placementStart, setPlacementStart] = useState<PlacementStart | null>(null)
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftImagePath, setDraftImagePath] = useState('')
  const [markerError, setMarkerError] = useState('')
  const [markerSaving, setMarkerSaving] = useState(false)
  const previewRef = useRef<ModelPreviewHandle>(null)
  const [exploded, setExploded] = useState(false)
  const [canExplode, setCanExplode] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [sectionMode, setSectionMode] = useState(false)
  const [transparentMode, setTransparentMode] = useState(false)
  const [viewportFullscreen, setViewportFullscreen] = useState(false)
  const [materialEditMode, setMaterialEditMode] = useState(true)
  const [meshParts, setMeshParts] = useState<MeshPartInfo[]>([])
  const [modelPartsList, setModelPartsList] = useState<ModelPartTreeNode[]>([])
  const [selectedModelPartUuid, setSelectedModelPartUuid] = useState<string | null>(null)
  const [uvViewerHint, setUvViewerHint] = useState('')
  const [availableTextures, setAvailableTextures] = useState<TextureOption[]>([])
  const [selectedPartUuid, setSelectedPartUuid] = useState<string | null>(null)
  const [selectedMaterialIndex, setSelectedMaterialIndex] = useState(0)
  const [materialSlots, setMaterialSlots] = useState<MaterialSlotInfo[]>([])
  const [materialState, setMaterialState] = useState<MaterialEditState | null>(null)
  const [materialSaving, setMaterialSaving] = useState(false)
  const [materialSaveError, setMaterialSaveError] = useState('')
  const [materialResetHint, setMaterialResetHint] = useState('')
  const [materialHasUnsavedChanges, setMaterialHasUnsavedChanges] = useState(false)
  const materialSaveInFlightRef = useRef(false)
  const materialSaveQueuedRef = useRef(false)
  const [measureState, setMeasureState] = useState<MeasureState>({
    pointCount: 0,
    distance: null,
    points: []
  })
  const [activeStandardView, setActiveStandardView] = useState<StandardViewDirection | null>(null)
  const [sidebarTab, setSidebarTab] = useState<PreviewSidebarTab>('render')
  const [partAnimDocument, setPartAnimDocument] = useState<PartAnimationDocument>(() =>
    createDefaultPartAnimation()
  )
  const [partAnimCurrentTime, setPartAnimCurrentTime] = useState(0)
  const [partAnimPlaying, setPartAnimPlaying] = useState(false)
  const [partAnimMarkers, setPartAnimMarkers] = useState<PartAnimationKeyframeMarker[]>([])
  const [partAnimSaving, setPartAnimSaving] = useState(false)
  const [partAnimSaveError, setPartAnimSaveError] = useState('')
  const [activePartAnimStageId, setActivePartAnimStageId] = useState<string | null>(null)
  const partAnimationAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partAnimationSaveInFlightRef = useRef(false)
  const partAnimationSaveQueuedRef = useRef(false)
  const partAnimationSavedSnapshotRef = useRef('')

  const [teachingStateDocument, setTeachingStateDocument] = useState<ModelTeachingStateDocument>(() =>
    createDefaultTeachingStateDocument()
  )
  const [activeTeachingStateId, setActiveTeachingStateId] = useState<string | null>(null)
  const [editingTeachingStateId, setEditingTeachingStateId] = useState<string | null>(null)
  const [teachingStateSaving, setTeachingStateSaving] = useState(false)
  const [teachingStateSaveError, setTeachingStateSaveError] = useState('')
  const [teachingStateSaveHint, setTeachingStateSaveHint] = useState('')
  const [teachingStateBusy, setTeachingStateBusy] = useState(false)
  const teachingStateAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const teachingStateSaveInFlightRef = useRef(false)
  const teachingStateSaveQueuedRef = useRef(false)
  const teachingStateSavedSnapshotRef = useRef('')

  const [documentManifest, setDocumentManifest] = useState<ModelDocumentManifest>(() =>
    createDefaultModelDocumentManifest()
  )
  const [activePdfUrl, setActivePdfUrl] = useState<string | null>(null)
  const [documentBusy, setDocumentBusy] = useState(false)
  const [documentError, setDocumentError] = useState('')

  const animationEditMode = sidebarTab === 'animation'
  const statesEditMode = sidebarTab === 'states'
  const [teachingTransformMode, setTeachingTransformMode] = useState<'translate' | 'rotate' | 'scale'>(
    'translate'
  )
  const [animationGizmoMode, setAnimationGizmoMode] = useState<'translate' | 'rotate'>('translate')
  const [selectedPartTransform, setSelectedPartTransform] = useState<{
    position: { x: number; y: number; z: number }
    rotationDeg: { x: number; y: number; z: number }
  } | null>(null)

  const syncSelectedPartTransform = useCallback(() => {
    if (!animationEditMode || !selectedModelPartUuid) {
      setSelectedPartTransform(null)
      return
    }
    const values = previewRef.current?.getPartAnimationMeshTransform(selectedModelPartUuid)
    if (!values) {
      setSelectedPartTransform(null)
      return
    }
    setSelectedPartTransform({
      position: { ...values.position },
      rotationDeg: {
        x: THREE.MathUtils.radToDeg(values.rotation.x),
        y: THREE.MathUtils.radToDeg(values.rotation.y),
        z: THREE.MathUtils.radToDeg(values.rotation.z)
      }
    })
  }, [animationEditMode, selectedModelPartUuid])

  useEffect(() => {
    syncSelectedPartTransform()
  }, [partAnimCurrentTime, syncSelectedPartTransform])

  const previewToolModeActive = exploded || measureMode || sectionMode || transparentMode
  const activeCollectionMarkers = useMemo(
    () => getCollectionMarkers(collections, activeCollectionId),
    [collections, activeCollectionId]
  )
  const visibleCollectionMarkers = useMemo(
    () => getCollectionMarkers(collections, visibleCollectionId),
    [collections, visibleCollectionId]
  )
  const effectiveMarkersVisible = !!visibleCollectionId && !previewToolModeActive
  const sceneMarkersVisible = effectiveMarkersVisible || !!pendingPlacement

  const handleSectionModeChange = useCallback((active: boolean) => {
    setSectionMode(active)
  }, [])

  const handleTransparentModeChange = useCallback((active: boolean) => {
    setTransparentMode(active)
    if (!active) return
    setMeasureMode(false)
    previewRef.current?.clearMeasure()
    setMeasureState({ pointCount: 0, distance: null, points: [] })
    setPlacementMode(false)
    setPendingPlacement(null)
    setPlacementStart(null)
    setMaterialEditMode(false)
    setSelectedPartUuid(null)
    setSelectedMaterialIndex(0)
    setMaterialSlots([])
    setMaterialState(null)
    setMaterialSaveError('')
    setMaterialResetHint('')
    previewRef.current?.clearMaterialSelection()
  }, [])

  const serializePartAnimationDocument = useCallback((document: PartAnimationDocument) => {
    return JSON.stringify(document)
  }, [])

  const syncPartAnimationUi = useCallback((source: 'disk' | 'edit' = 'edit') => {
    const doc = previewRef.current?.getPartAnimationDocument()
    if (doc) {
      setPartAnimDocument(doc)
      setActivePartAnimStageId((prev) => {
        if (prev && doc.stages.some((stage) => stage.id === prev)) return prev
        return doc.stages[0]?.id ?? null
      })
    }
    setPartAnimCurrentTime(previewRef.current?.getPartAnimationTime() ?? 0)
    setPartAnimPlaying(previewRef.current?.getPartAnimationPlaying() ?? false)
    setPartAnimMarkers(previewRef.current?.getPartAnimationMarkers() ?? [])
    if (source === 'disk' && doc) {
      partAnimationSavedSnapshotRef.current = serializePartAnimationDocument(doc)
    }
    syncSelectedPartTransform()
  }, [serializePartAnimationDocument, syncSelectedPartTransform])

  const syncPartAnimationPreviewMode = useCallback(() => {
    if (previewToolModeActive) {
      previewRef.current?.setPartAnimationPreviewEnabled(false)
      previewRef.current?.setPartAnimationPlaying(false)
      return
    }

    if (previewRef.current?.getPartAnimationPlaying()) {
      return
    }

    const doc = previewRef.current?.getPartAnimationDocument() ?? partAnimDocument
    const hasContent = hasPartAnimationContent(doc)
    const activeTeachingStateId = previewRef.current?.getActiveTeachingStateId() ?? null
    const teachingPoseActive = !!activeTeachingStateId

    if (
      sidebarTab === 'animation' ||
      (sidebarTab === 'render' && hasContent && !teachingPoseActive)
    ) {
      previewRef.current?.setPartAnimationPreviewEnabled(true)
      return
    }

    previewRef.current?.setPartAnimationPreviewEnabled(false, {
      preserveScenePose: sidebarTab === 'states' || teachingPoseActive
    })
    previewRef.current?.setPartAnimationPlaying(false)
  }, [partAnimDocument, previewToolModeActive, sidebarTab])

  const hasPartAnimPlayback = useMemo(
    () => hasPartAnimationContent(partAnimDocument),
    [partAnimDocument]
  )

  const teachingStatesForPicker = useMemo(
    () => sortTeachingStates(teachingStateDocument.states),
    [teachingStateDocument]
  )

  const serializeTeachingStateDocument = useCallback((document: ModelTeachingStateDocument) => {
    return JSON.stringify(document)
  }, [])

  const syncTeachingStateUi = useCallback((source: 'disk' | 'edit' = 'edit') => {
    const doc = previewRef.current?.getTeachingStateDocument()
    if (doc) setTeachingStateDocument(doc)
    setActiveTeachingStateId(previewRef.current?.getActiveTeachingStateId() ?? null)
    if (source === 'disk' && doc) {
      teachingStateSavedSnapshotRef.current = serializeTeachingStateDocument(doc)
    }
  }, [serializeTeachingStateDocument])

  const syncMaterialDirtyState = useCallback(() => {
    setMaterialHasUnsavedChanges(previewRef.current?.hasMaterialUnsavedChanges() ?? false)
  }, [])

  const findModelPartName = useCallback(
    (meshUuid: string | null): string | null => {
      if (!meshUuid) return null
      const walk = (nodes: ModelPartTreeNode[]): string | null => {
        for (const node of nodes) {
          if (node.meshUuid === meshUuid) return node.name
          if (node.children.length > 0) {
            const found = walk(node.children)
            if (found) return found
          }
        }
        return null
      }
      return walk(modelPartsList) ?? meshParts.find((part) => part.meshUuid === meshUuid)?.name ?? null
    },
    [meshParts, modelPartsList]
  )

  const isLibraryModel =
    !!asset && isModelAsset(asset) && asset.source === 'library' && !!asset.libraryId

  const documentsSplitMode = sidebarTab === 'documents' && isLibraryModel

  const activeDocumentName = useMemo(() => {
    const activeId = documentManifest.activeDocumentId
    if (!activeId) return null
    return documentManifest.documents.find((item) => item.id === activeId)?.name ?? null
  }, [documentManifest])

  const updatePreviewSettings = useCallback((partial: Partial<PreviewSettings>) => {
    setPreviewSettings((prev) => {
      const next = clampPreviewSettings({ ...prev, ...partial })
      setStoredPreviewSettings(next)
      return next
    })
  }, [])

  const loadCollections = useCallback(async (libraryId: string) => {
    if (!isMarkerApiReady()) {
      setMarkerError(getMarkerApiUnavailableMessage())
      return
    }
    const data = await window.electronAPI.getMarkerCollections(libraryId)
    setCollections(normalizeMarkerCollections(data))
  }, [])

  useEffect(() => {
    if (!isLibraryModel || !asset?.libraryId) {
      setCollections([])
      setActiveCollectionId(null)
      setVisibleCollectionId(null)
      return
    }
    void loadCollections(asset.libraryId)
  }, [asset?.libraryId, isLibraryModel, loadCollections])

  const loadModelDocuments = useCallback(async (libraryId: string) => {
    if (!isModelDocumentApiReady()) return
    try {
      const manifest = await window.electronAPI.getModelDocuments(libraryId)
      setDocumentManifest(manifest)
      setDocumentError('')
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : '加载文档失败')
    }
  }, [])

  useEffect(() => {
    if (!isLibraryModel || !asset?.libraryId) {
      setDocumentManifest(createDefaultModelDocumentManifest())
      setActivePdfUrl(null)
      return
    }
    void loadModelDocuments(asset.libraryId)
  }, [asset?.libraryId, isLibraryModel, loadModelDocuments])

  useEffect(() => {
    if (!isLibraryModel || !asset?.libraryId) {
      setActivePdfUrl(null)
      return
    }

    const active = documentManifest.documents.find(
      (item) => item.id === documentManifest.activeDocumentId
    )
    if (!active) {
      setActivePdfUrl(null)
      return
    }

    let cancelled = false
    void resolveModelDocumentUrl(asset.libraryId!, active.fileName)
      .then((url) => {
        if (!cancelled) setActivePdfUrl(url)
      })
      .catch(() => {
        if (!cancelled) setActivePdfUrl(null)
      })

    return () => {
      cancelled = true
    }
  }, [asset?.libraryId, documentManifest, isLibraryModel])

  const handleUploadDocuments = useCallback(async () => {
    if (!asset?.libraryId || !isLibraryModel || !isModelDocumentApiReady()) return
    setDocumentBusy(true)
    setDocumentError('')
    try {
      const manifest = await window.electronAPI.selectAndAddModelDocuments(asset.libraryId)
      if (manifest) {
        setDocumentManifest(manifest)
      }
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : '上传文档失败')
    } finally {
      setDocumentBusy(false)
    }
  }, [asset?.libraryId, isLibraryModel])

  const handleSelectDocument = useCallback(
    async (documentId: string) => {
      if (!asset?.libraryId || !isLibraryModel || !isModelDocumentApiReady()) return
      setDocumentBusy(true)
      setDocumentError('')
      try {
        const manifest = await window.electronAPI.setActiveModelDocument(asset.libraryId, documentId)
        setDocumentManifest(manifest)
      } catch (err) {
        setDocumentError(err instanceof Error ? err.message : '切换文档失败')
      } finally {
        setDocumentBusy(false)
      }
    },
    [asset?.libraryId, isLibraryModel]
  )

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      if (!asset?.libraryId || !isLibraryModel || !isModelDocumentApiReady()) return
      if (!window.confirm('确定删除该文档？')) return
      setDocumentBusy(true)
      setDocumentError('')
      try {
        const manifest = await window.electronAPI.deleteModelDocument(asset.libraryId, documentId)
        setDocumentManifest(manifest)
      } catch (err) {
        setDocumentError(err instanceof Error ? err.message : '删除文档失败')
      } finally {
        setDocumentBusy(false)
      }
    },
    [asset?.libraryId, isLibraryModel]
  )

  useEffect(() => {
    setSelectedMarkerId(null)
    setFocusMarkerId(null)
    setPlacementMode(false)
    setMeasureMode(false)
    setMaterialEditMode(true)
    setMeshParts([])
    setModelPartsList([])
    setSelectedModelPartUuid(null)
    previewRef.current?.clearModelPartSelection()
    setAvailableTextures([])
    setSelectedPartUuid(null)
    setSelectedMaterialIndex(0)
    setMaterialSlots([])
    setMaterialState(null)
    setMaterialSaveError('')
    setMaterialResetHint('')
    setMaterialHasUnsavedChanges(false)
    setExploded(false)
    setCanExplode(false)
    setSectionMode(false)
    setViewportFullscreen(false)
    setMeasureState({ pointCount: 0, distance: null, points: [] })
    setActiveStandardView(null)
    setSidebarTab('render')
    setPartAnimDocument(createDefaultPartAnimation())
    setPartAnimCurrentTime(0)
    setPartAnimPlaying(false)
    setPartAnimMarkers([])
    setPartAnimSaveError('')
    partAnimationSavedSnapshotRef.current = ''
    if (partAnimationAutoSaveTimerRef.current) {
      clearTimeout(partAnimationAutoSaveTimerRef.current)
      partAnimationAutoSaveTimerRef.current = null
    }
    setTeachingStateDocument(createDefaultTeachingStateDocument())
    setActiveTeachingStateId(null)
    setEditingTeachingStateId(null)
    setTeachingStateSaveError('')
    setTeachingStateSaveHint('')
    teachingStateSavedSnapshotRef.current = ''
    if (teachingStateAutoSaveTimerRef.current) {
      clearTimeout(teachingStateAutoSaveTimerRef.current)
      teachingStateAutoSaveTimerRef.current = null
    }
    setPendingPlacement(null)
    setPlacementStart(null)
    setDraftKind('point')
    setDraftName('')
    setDraftDescription('')
    setDraftImagePath('')
    setMarkerError('')
    setCollections([])
    setActiveCollectionId(null)
    setVisibleCollectionId(null)
    setDocumentManifest(createDefaultModelDocumentManifest())
    setActivePdfUrl(null)
    setDocumentBusy(false)
    setDocumentError('')
  }, [asset?.path])

  const handleSelectCollection = useCallback((collectionId: string) => {
    setActiveCollectionId(collectionId)
    setSelectedMarkerId(null)
    setFocusMarkerId(null)
    setMarkerError('')
  }, [])

  const handleSelectVisibleCollection = useCallback((collectionId: string | null) => {
    setVisibleCollectionId(collectionId)
    if (collectionId) {
      setActiveCollectionId(collectionId)
    }
  }, [])

  const handleToggleCollectionVisible = useCallback((collectionId: string) => {
    setVisibleCollectionId((prev) => (prev === collectionId ? null : collectionId))
    setActiveCollectionId(collectionId)
  }, [])

  const handleCreateCollection = useCallback(
    async (name: string) => {
      if (!asset?.libraryId) return
      setMarkerSaving(true)
      setMarkerError('')
      try {
        if (!isMarkerApiReady()) {
          throw new Error(getMarkerApiUnavailableMessage())
        }
        const collection = await window.electronAPI.createMarkerCollection(asset.libraryId, name)
        setCollections((prev) => [...prev, collection])
        setActiveCollectionId(collection.id)
      } catch (err) {
        setMarkerError(err instanceof Error ? err.message : '创建集合失败')
      } finally {
        setMarkerSaving(false)
      }
    },
    [asset?.libraryId]
  )

  const handleUpdateCollection = useCallback(
    async (collectionId: string, name: string) => {
      if (!asset?.libraryId) return
      setMarkerSaving(true)
      setMarkerError('')
      try {
        const updated = await window.electronAPI.updateMarkerCollection(
          asset.libraryId,
          collectionId,
          name
        )
        if (!updated) {
          setMarkerError('更新集合失败')
          return
        }
        setCollections((prev) =>
          prev.map((item) => (item.id === collectionId ? updated : item))
        )
      } catch (err) {
        setMarkerError(err instanceof Error ? err.message : '更新集合失败')
      } finally {
        setMarkerSaving(false)
      }
    },
    [asset?.libraryId]
  )

  const handleDeleteCollection = useCallback(
    async (collectionId: string) => {
      if (!asset?.libraryId) return
      setMarkerSaving(true)
      setMarkerError('')
      try {
        const ok = await window.electronAPI.deleteMarkerCollection(asset.libraryId, collectionId)
        if (!ok) {
          setMarkerError('删除集合失败')
          return
        }
        setCollections((prev) => prev.filter((item) => item.id !== collectionId))
        if (activeCollectionId === collectionId) {
          setActiveCollectionId(null)
        }
        if (visibleCollectionId === collectionId) {
          setVisibleCollectionId(null)
        }
        setSelectedMarkerId(null)
        setFocusMarkerId(null)
      } catch (err) {
        setMarkerError(err instanceof Error ? err.message : '删除集合失败')
      } finally {
        setMarkerSaving(false)
      }
    },
    [asset?.libraryId, activeCollectionId, visibleCollectionId]
  )

  const handleTogglePlacementMode = useCallback(() => {
    setMeasureMode(false)
    setMaterialEditMode(false)
    setSelectedPartUuid(null)
    setSelectedMaterialIndex(0)
    setMaterialSlots([])
    setMaterialState(null)
    setMaterialSaveError('')
    setMaterialResetHint('')
    previewRef.current?.clearMaterialSelection()
    setPlacementMode((prev) => {
      const next = !prev
      if (next) {
        setSidebarTab('structure')
      } else {
        setPendingPlacement(null)
        setPlacementStart(null)
        setDraftName('')
        setDraftDescription('')
        setDraftImagePath('')
      }
      return next
    })
  }, [])

  const handleToggleViewportFullscreen = useCallback(() => {
    setViewportFullscreen((prev) => !prev)
  }, [])

  const handleToggleMeasureMode = useCallback(() => {
    setPlacementMode(false)
    setPendingPlacement(null)
    setPlacementStart(null)
    setMaterialEditMode(false)
    setSelectedPartUuid(null)
    setSelectedMaterialIndex(0)
    setMaterialSlots([])
    setMaterialState(null)
    setMaterialSaveError('')
    setMaterialResetHint('')
    previewRef.current?.clearMaterialSelection()
    setTransparentMode(false)
    setMeasureMode((prev) => {
      const next = !prev
      if (!next) {
        previewRef.current?.clearMeasure()
        setMeasureState({ pointCount: 0, distance: null, points: [] })
      }
      return next
    })
  }, [])

  const handleToggleExplode = useCallback(() => {
    const next = previewRef.current?.toggleExplode()
    if (typeof next === 'boolean') {
      setExploded(next)
    }
  }, [])

  const handleResetView = useCallback(() => {
    previewRef.current?.resetView()
    setActiveStandardView(null)
  }, [])

  const handleSetStandardView = useCallback((view: StandardViewDirection) => {
    previewRef.current?.setStandardView(view)
    setActiveStandardView(view)
  }, [])

  const handleClearMeasure = useCallback(() => {
    previewRef.current?.clearMeasure()
    setMeasureState({ pointCount: 0, distance: null, points: [] })
  }, [])

  const handleSidebarTabChange = useCallback(
    (tab: PreviewSidebarTab) => {
      setSidebarTab(tab)
      setMeasureMode(false)
      previewRef.current?.clearMeasure()
      setMeasureState({ pointCount: 0, distance: null, points: [] })

      if (tab === 'render') {
        setPlacementMode(false)
        setPendingPlacement(null)
        setPlacementStart(null)
        setMaterialEditMode(true)
        const meshUuid = selectedPartUuid ?? selectedModelPartUuid
        if (meshUuid) {
          const state = previewRef.current?.selectMesh(meshUuid, selectedMaterialIndex)
          setSelectedPartUuid(meshUuid)
          setMaterialSlots(previewRef.current?.listMaterials(meshUuid) ?? [])
          setMaterialState(state ?? null)
        }
        setMaterialHasUnsavedChanges(previewRef.current?.hasMaterialUnsavedChanges() ?? false)
        syncPartAnimationPreviewMode()
        return
      }

      setMaterialEditMode(false)
      previewRef.current?.clearMaterialSelection()

      if (tab === 'animation') {
        setPlacementMode(false)
        setPendingPlacement(null)
        setPlacementStart(null)
        previewRef.current?.setPartAnimationPreviewEnabled(true)
        previewRef.current?.selectPartAnimationTarget(selectedModelPartUuid)
        syncPartAnimationUi()
        return
      }

      if (tab === 'states') {
        setPlacementMode(false)
        setPendingPlacement(null)
        setPlacementStart(null)
        previewRef.current?.setPartAnimationPreviewEnabled(false, { preserveScenePose: true })
        previewRef.current?.setPartAnimationPlaying(false)
        setPartAnimPlaying(false)
        syncTeachingStateUi()
        return
      }

      if (tab === 'documents') {
        setPlacementMode(false)
        setPendingPlacement(null)
        setPlacementStart(null)
        previewRef.current?.setPartAnimationPreviewEnabled(false, { preserveScenePose: true })
        previewRef.current?.setPartAnimationPlaying(false)
        setPartAnimPlaying(false)
        return
      }

      previewRef.current?.setPartAnimationPreviewEnabled(false)
      previewRef.current?.setPartAnimationPlaying(false)
    },
    [selectedModelPartUuid, selectedPartUuid, selectedMaterialIndex, syncPartAnimationPreviewMode, syncPartAnimationUi, syncTeachingStateUi]
  )

  useEffect(() => {
    if (!isLibraryModel) return
    syncPartAnimationPreviewMode()
  }, [activeTeachingStateId, isLibraryModel, partAnimDocument, sidebarTab, syncPartAnimationPreviewMode])

  useEffect(() => {
    if (!previewToolModeActive) {
      syncPartAnimationPreviewMode()
      return
    }
    previewRef.current?.setPartAnimationPlaying(false)
    previewRef.current?.setPartAnimationPreviewEnabled(false)
    setPartAnimPlaying(false)
  }, [previewToolModeActive, syncPartAnimationPreviewMode])

  useEffect(() => {
    if (!selectedModelPartUuid) {
      previewRef.current?.clearModelPartSelection()
      return
    }
    previewRef.current?.selectModelPart(selectedModelPartUuid)
  }, [materialEditMode, selectedModelPartUuid])

  const handleMeshPartsReady = useCallback((parts: MeshPartInfo[]) => {
    setMeshParts(parts)
    setAvailableTextures(previewRef.current?.listTextures() ?? [])
    setSelectedPartUuid(null)
    setSelectedModelPartUuid(null)
    setSelectedMaterialIndex(0)
    setMaterialSlots([])
    setMaterialState(null)
    setMaterialSaveError('')
    setMaterialResetHint('')
    setMaterialHasUnsavedChanges(false)
    setMaterialEditMode(true)
    previewRef.current?.clearMaterialSelection()
    previewRef.current?.clearModelPartSelection()
  }, [])

  const handleModelPartsListReady = useCallback((parts: ModelPartTreeNode[]) => {
    setModelPartsList(parts)
  }, [])

  const handleTogglePartVisible = useCallback((objectUuid: string, visible: boolean) => {
    previewRef.current?.setPartVisible(objectUuid, visible)
    setModelPartsList((prev) => updateTreeNodeVisibility(prev, objectUuid, visible))
  }, [])

  const handleSetAllPartsVisible = useCallback((visible: boolean) => {
    previewRef.current?.setAllPartsVisible(visible)
    setModelPartsList((prev) => updateAllTreeVisibility(prev, visible))
  }, [])

  const handleRenameModelPart = useCallback(
    async (objectUuid: string, name: string) => {
      const renamed = previewRef.current?.renameModelPart(objectUuid, name)
      if (!renamed) return

      setModelPartsList((prev) => updateTreeNodeName(prev, objectUuid, name.trim()))

      if (!isLibraryModel || !asset?.libraryId) return

      try {
        const existing = await window.electronAPI.getModelPrefs(asset.libraryId)
        const partDisplayNames = previewRef.current?.getPartDisplayNames() ?? {}
        await window.electronAPI.saveModelPrefs(asset.libraryId, {
          fbxDefaultClipIndex: existing?.fbxDefaultClipIndex ?? 0,
          fbxAutoPlay: existing?.fbxAutoPlay ?? false,
          previewSettings: existing?.previewSettings,
          ...(Object.keys(partDisplayNames).length > 0 ? { partDisplayNames } : {})
        })
      } catch {
        /* ignore prefs save errors */
      }
    },
    [asset?.libraryId, isLibraryModel]
  )

  const handlePartAnimSetTime = useCallback(
    (time: number) => {
      const clampToStageId = animationEditMode ? activePartAnimStageId : null
      previewRef.current?.setPartAnimationTime(time, clampToStageId)
      syncPartAnimationUi()
    },
    [activePartAnimStageId, animationEditMode, syncPartAnimationUi]
  )

  const handlePartAnimTogglePlaying = useCallback(() => {
    const next = !(previewRef.current?.getPartAnimationPlaying() ?? false)
    if (next) {
      previewRef.current?.setPartAnimationPreviewEnabled(true)
      previewRef.current?.setPartAnimationPlaying(true)
    } else {
      previewRef.current?.setPartAnimationPlaying(false)
      const teachingStateId = previewRef.current?.getActiveTeachingStateId()
      if (teachingStateId) {
        void previewRef.current?.applyTeachingState(teachingStateId).then(() => {
          syncPartAnimationPreviewMode()
        })
      } else {
        syncPartAnimationPreviewMode()
      }
    }
    syncPartAnimationUi()
  }, [syncPartAnimationPreviewMode, syncPartAnimationUi])

  const handlePartAnimStop = useCallback(() => {
    previewRef.current?.stopPartAnimation()
    syncPartAnimationUi()
  }, [syncPartAnimationUi])

  const persistPartAnimation = useCallback(async () => {
    if (!asset?.libraryId || !isLibraryModel) return
    if (typeof window.electronAPI?.savePartAnimation !== 'function') {
      setPartAnimSaveError('动画保存 API 不可用')
      return
    }

    const document = previewRef.current?.getPartAnimationDocument()
    if (!document || !hasPartAnimationContent(document)) return

    const snapshot = serializePartAnimationDocument(document)
    if (snapshot === partAnimationSavedSnapshotRef.current) return

    if (partAnimationSaveInFlightRef.current) {
      partAnimationSaveQueuedRef.current = true
      return
    }

    partAnimationSaveInFlightRef.current = true
    setPartAnimSaving(true)
    setPartAnimSaveError('')
    try {
      await window.electronAPI.savePartAnimation(asset.libraryId, document)
      partAnimationSavedSnapshotRef.current = snapshot
      syncPartAnimationUi()
      syncPartAnimationPreviewMode()
    } catch (err) {
      setPartAnimSaveError(err instanceof Error ? err.message : '保存动画失败')
    } finally {
      setPartAnimSaving(false)
      partAnimationSaveInFlightRef.current = false
      if (partAnimationSaveQueuedRef.current) {
        partAnimationSaveQueuedRef.current = false
        const latest = previewRef.current?.getPartAnimationDocument()
        if (
          latest &&
          hasPartAnimationContent(latest) &&
          serializePartAnimationDocument(latest) !== partAnimationSavedSnapshotRef.current
        ) {
          void persistPartAnimation()
        }
      }
    }
  }, [
    asset?.libraryId,
    isLibraryModel,
    serializePartAnimationDocument,
    syncPartAnimationPreviewMode,
    syncPartAnimationUi
  ])

  const schedulePartAnimationAutoSave = useCallback(() => {
    if (!isLibraryModel) return

    const document = previewRef.current?.getPartAnimationDocument()
    if (!document || !hasPartAnimationContent(document)) return
    if (serializePartAnimationDocument(document) === partAnimationSavedSnapshotRef.current) return

    setPartAnimSaveError('')
    if (partAnimationAutoSaveTimerRef.current) {
      clearTimeout(partAnimationAutoSaveTimerRef.current)
    }
    partAnimationAutoSaveTimerRef.current = setTimeout(() => {
      partAnimationAutoSaveTimerRef.current = null
      void persistPartAnimation()
    }, PART_ANIMATION_AUTO_SAVE_DELAY_MS)
  }, [isLibraryModel, persistPartAnimation, serializePartAnimationDocument])

  const flushPartAnimationAutoSave = useCallback(async () => {
    if (partAnimationAutoSaveTimerRef.current) {
      clearTimeout(partAnimationAutoSaveTimerRef.current)
      partAnimationAutoSaveTimerRef.current = null
    }
    await persistPartAnimation()
  }, [persistPartAnimation])

  const handleAddPartAnimKeyframe = useCallback(() => {
    previewRef.current?.addPartAnimationKeyframe(DEFAULT_PART_ANIMATION_CHANNELS)
    syncPartAnimationUi()
    schedulePartAnimationAutoSave()
  }, [schedulePartAnimationAutoSave, syncPartAnimationUi])

  const handleRemovePartAnimKeyframe = useCallback(() => {
    previewRef.current?.removePartAnimationKeyframeAtCurrent()
    syncPartAnimationUi()
    schedulePartAnimationAutoSave()
  }, [schedulePartAnimationAutoSave, syncPartAnimationUi])

  const handlePartAnimTransformChange = useCallback(
    (patch: {
      position?: Partial<{ x: number; y: number; z: number }>
      rotationDeg?: Partial<{ x: number; y: number; z: number }>
    }) => {
      const meshUuid = selectedModelPartUuid
      if (!meshUuid) return

      const rotationPatch = patch.rotationDeg
        ? {
            x: patch.rotationDeg.x !== undefined ? THREE.MathUtils.degToRad(patch.rotationDeg.x) : undefined,
            y: patch.rotationDeg.y !== undefined ? THREE.MathUtils.degToRad(patch.rotationDeg.y) : undefined,
            z: patch.rotationDeg.z !== undefined ? THREE.MathUtils.degToRad(patch.rotationDeg.z) : undefined
          }
        : undefined

      previewRef.current?.applyPartAnimationMeshTransform(meshUuid, {
        position: patch.position,
        rotation: rotationPatch
      })
      syncSelectedPartTransform()
      syncPartAnimationUi()
      schedulePartAnimationAutoSave()
    },
    [
      schedulePartAnimationAutoSave,
      selectedModelPartUuid,
      syncPartAnimationUi,
      syncSelectedPartTransform
    ]
  )

  const handleSelectPartAnimStage = useCallback(
    (stageId: string) => {
      setActivePartAnimStageId(stageId)
      if (previewRef.current?.getPartAnimationPlaying()) {
        previewRef.current?.setPartAnimationPlaying(false)
      }
      previewRef.current?.setPartAnimationPreviewEnabled(true)
      const doc = previewRef.current?.getPartAnimationDocument()
      const range = findStageRangeById(doc?.stages ?? [], stageId)
      if (range) {
        previewRef.current?.setPartAnimationTime(range.startTime, stageId)
      }
      syncPartAnimationUi()
      syncSelectedPartTransform()
    },
    [syncPartAnimationUi, syncSelectedPartTransform]
  )

  const handleCreatePartAnimStage = useCallback(() => {
    const stageId = previewRef.current?.addPartAnimationStage()
    if (!stageId) return
    setActivePartAnimStageId(stageId)
    const doc = previewRef.current?.getPartAnimationDocument()
    const range = findStageRangeById(doc?.stages ?? [], stageId)
    if (range) {
      previewRef.current?.setPartAnimationTime(range.startTime, stageId)
    }
    syncPartAnimationUi()
    schedulePartAnimationAutoSave()
  }, [schedulePartAnimationAutoSave, syncPartAnimationUi])

  const handleRenamePartAnimStage = useCallback(
    (stageId: string, name: string) => {
      previewRef.current?.updatePartAnimationStage(stageId, { name })
      syncPartAnimationUi()
      schedulePartAnimationAutoSave()
    },
    [schedulePartAnimationAutoSave, syncPartAnimationUi]
  )

  const handleUpdatePartAnimStageDuration = useCallback(
    (stageId: string, duration: number) => {
      previewRef.current?.updatePartAnimationStage(stageId, { duration })
      syncPartAnimationUi()
      schedulePartAnimationAutoSave()
    },
    [schedulePartAnimationAutoSave, syncPartAnimationUi]
  )

  const handleDeletePartAnimStage = useCallback(
    (stageId: string) => {
      const removed = previewRef.current?.removePartAnimationStage(stageId)
      if (!removed) return
      const doc = previewRef.current?.getPartAnimationDocument()
      const nextStageId = doc?.stages[0]?.id ?? null
      setActivePartAnimStageId(nextStageId)
      if (nextStageId) {
        const range = findStageRangeById(doc?.stages ?? [], nextStageId)
        if (range) previewRef.current?.setPartAnimationTime(range.startTime, nextStageId)
      }
      syncPartAnimationUi()
      schedulePartAnimationAutoSave()
    },
    [schedulePartAnimationAutoSave, syncPartAnimationUi]
  )

  const handlePlayPartAnimStage = useCallback(
    (stageId: string) => {
      setActivePartAnimStageId(stageId)
      previewRef.current?.playPartAnimationStage(stageId)
      syncPartAnimationUi()
    },
    [syncPartAnimationUi]
  )

  const handlePlayAllPartAnimation = useCallback(() => {
    previewRef.current?.playAllPartAnimation()
    syncPartAnimationUi()
  }, [syncPartAnimationUi])

  const handleSelectPartAnimKeyframe = useCallback(
    (meshUuid: string, _channel: PartAnimationChannel, time: number) => {
      setSelectedModelPartUuid(meshUuid)
      previewRef.current?.selectPartAnimationTarget(meshUuid)
      previewRef.current?.setPartAnimationTime(time, activePartAnimStageId)
      syncPartAnimationUi()
    },
    [activePartAnimStageId, syncPartAnimationUi]
  )

  const handleSavePartAnimation = useCallback(async () => {
    await flushPartAnimationAutoSave()
  }, [flushPartAnimationAutoSave])

  const persistTeachingStates = useCallback(
    async (options?: {
      textures?: import('../types/materialOverride').MaterialOverrideTexturePayload[]
      skipUnchangedCheck?: boolean
    }) => {
      if (!asset?.libraryId || !isLibraryModel) return false
      if (typeof window.electronAPI?.saveTeachingStates !== 'function') {
        setTeachingStateSaveError('教学状态保存 API 不可用')
        return false
      }

      const document = previewRef.current?.getTeachingStateDocument()
      if (!document || !hasTeachingStateContent(document)) return false

      const snapshot = serializeTeachingStateDocument(document)
      if (!options?.skipUnchangedCheck && snapshot === teachingStateSavedSnapshotRef.current) {
        setTeachingStateSaveHint('内容未变化，无需重复保存')
        return true
      }

      if (teachingStateSaveInFlightRef.current) {
        teachingStateSaveQueuedRef.current = true
        return false
      }

      teachingStateSaveInFlightRef.current = true
      setTeachingStateSaving(true)
      setTeachingStateSaveError('')
    setTeachingStateSaveHint('')
      setTeachingStateSaveHint('')
      try {
        let textures = options?.textures
        if (!textures) {
          const payload = await previewRef.current?.buildTeachingStateSavePayload()
          textures = payload?.textures ?? []
        }
        await window.electronAPI.saveTeachingStates(asset.libraryId, { document, textures })
        teachingStateSavedSnapshotRef.current = snapshot
        syncTeachingStateUi()
        setTeachingStateSaveHint('已保存到本地')
        return true
      } catch (err) {
        setTeachingStateSaveError(err instanceof Error ? err.message : '保存教学状态失败')
        return false
      } finally {
        setTeachingStateSaving(false)
        teachingStateSaveInFlightRef.current = false
        if (teachingStateSaveQueuedRef.current) {
          teachingStateSaveQueuedRef.current = false
          const latest = previewRef.current?.getTeachingStateDocument()
          if (
            latest &&
            hasTeachingStateContent(latest) &&
            serializeTeachingStateDocument(latest) !== teachingStateSavedSnapshotRef.current
          ) {
            void persistTeachingStates()
          }
        }
      }
    },
    [asset?.libraryId, isLibraryModel, serializeTeachingStateDocument, syncTeachingStateUi]
  )

  const scheduleTeachingStateAutoSave = useCallback(() => {
    if (!isLibraryModel) return

    const document = previewRef.current?.getTeachingStateDocument()
    if (!document || !hasTeachingStateContent(document)) return
    if (serializeTeachingStateDocument(document) === teachingStateSavedSnapshotRef.current) return

    setTeachingStateSaveError('')
    setTeachingStateSaveHint('')
    if (teachingStateAutoSaveTimerRef.current) {
      clearTimeout(teachingStateAutoSaveTimerRef.current)
    }
    teachingStateAutoSaveTimerRef.current = setTimeout(() => {
      teachingStateAutoSaveTimerRef.current = null
      void persistTeachingStates()
    }, TEACHING_STATE_AUTO_SAVE_DELAY_MS)
  }, [isLibraryModel, persistTeachingStates, serializeTeachingStateDocument])

  const flushTeachingStateAutoSave = useCallback(async () => {
    if (teachingStateAutoSaveTimerRef.current) {
      clearTimeout(teachingStateAutoSaveTimerRef.current)
      teachingStateAutoSaveTimerRef.current = null
    }
    await persistTeachingStates()
  }, [persistTeachingStates])

  const handlePreviewTeachingState = useCallback(
    async (stateId: string) => {
      setTeachingStateBusy(true)
      setTeachingStateSaveError('')
    setTeachingStateSaveHint('')
      try {
        const ok = (await previewRef.current?.applyTeachingState(stateId)) ?? false
        if (!ok) {
          setTeachingStateSaveError('应用教学状态失败')
          return
        }
        syncTeachingStateUi()
        syncPartAnimationPreviewMode()
        setPartAnimPlaying(false)
        setModelPartsList(previewRef.current?.listModelParts() ?? [])
        syncMaterialDirtyState()
      } catch (err) {
        setTeachingStateSaveError(err instanceof Error ? err.message : '应用教学状态失败')
      } finally {
        setTeachingStateBusy(false)
      }
    },
    [syncMaterialDirtyState, syncPartAnimationPreviewMode, syncTeachingStateUi]
  )

  const handleCreateTeachingState = useCallback(
    (name: string) => {
      const state = previewRef.current?.addTeachingState(name)
      if (state) {
        setEditingTeachingStateId(state.id)
        void handlePreviewTeachingState(state.id)
      }
      syncTeachingStateUi()
      scheduleTeachingStateAutoSave()
    },
    [handlePreviewTeachingState, scheduleTeachingStateAutoSave, syncTeachingStateUi]
  )

  const handleSelectTeachingStateForEdit = useCallback(
    (stateId: string) => {
      setEditingTeachingStateId(stateId)
      void handlePreviewTeachingState(stateId)
    },
    [handlePreviewTeachingState]
  )

  const handleRenameTeachingState = useCallback(
    (stateId: string, name: string) => {
      previewRef.current?.updateTeachingStateName(stateId, name)
      syncTeachingStateUi()
      void flushTeachingStateAutoSave()
    },
    [flushTeachingStateAutoSave, syncTeachingStateUi]
  )

  const handleDeleteTeachingState = useCallback(
    async (stateId: string) => {
      previewRef.current?.deleteTeachingState(stateId)
      setEditingTeachingStateId((prev) => (prev === stateId ? null : prev))
      syncTeachingStateUi()

      const activeStateId = previewRef.current?.getActiveTeachingStateId()
      if (activeStateId) {
        const ok = (await previewRef.current?.applyTeachingState(activeStateId)) ?? false
        if (ok) {
          syncTeachingStateUi()
          setModelPartsList(previewRef.current?.listModelParts() ?? [])
          syncMaterialDirtyState()
        }
      }

      void flushTeachingStateAutoSave()
    },
    [flushTeachingStateAutoSave, syncMaterialDirtyState, syncTeachingStateUi]
  )

  const handleSaveTeachingState = useCallback(
    async (stateId: string) => {
      setTeachingStateBusy(true)
      setTeachingStateSaveError('')
    setTeachingStateSaveHint('')
      setTeachingStateSaveHint('')
      try {
        const textures = (await previewRef.current?.captureTeachingState(stateId)) ?? []
        syncTeachingStateUi()
        setModelPartsList(previewRef.current?.listModelParts() ?? [])
        setTeachingStateBusy(false)
        await persistTeachingStates({ textures, skipUnchangedCheck: true })
      } catch (err) {
        setTeachingStateSaveError(err instanceof Error ? err.message : '保存教学状态失败')
      } finally {
        setTeachingStateBusy(false)
      }
    },
    [persistTeachingStates, syncTeachingStateUi]
  )

  const handleSetInitialTeachingState = useCallback(
    (stateId: string) => {
      previewRef.current?.setInitialTeachingState(stateId)
      syncTeachingStateUi()
      void flushTeachingStateAutoSave()
    },
    [flushTeachingStateAutoSave, syncTeachingStateUi]
  )

  const handleSelectTeachingState = useCallback(
    (stateId: string) => {
      void handlePreviewTeachingState(stateId)
    },
    [handlePreviewTeachingState]
  )

  useEffect(() => {
    if (!teachingStateSaveHint) return
    const timer = setTimeout(() => setTeachingStateSaveHint(''), 4000)
    return () => clearTimeout(timer)
  }, [teachingStateSaveHint])

  const handleOpenUvViewer = useCallback(() => {
    if (!selectedModelPartUuid) return
    if (typeof window.electronAPI?.openUvViewerWindow !== 'function') {
      setUvViewerHint('UV 查看器不可用')
      return
    }

    const layout = previewRef.current?.getMeshUvLayout(
      selectedModelPartUuid,
      materialEditMode ? selectedMaterialIndex : 0
    )
    if (!layout) {
      setUvViewerHint('无法读取该部件的 UV 数据')
      return
    }

    const displayName = findModelPartName(selectedModelPartUuid)
    const payload: MeshUvLayoutPayload = displayName
      ? { ...layout, meshName: displayName }
      : layout

    if (!payload.hasUv) {
      setUvViewerHint('该部件没有 UV 数据')
      return
    }

    setUvViewerHint('')
    void window.electronAPI.openUvViewerWindow(payload)
  }, [findModelPartName, materialEditMode, selectedMaterialIndex, selectedModelPartUuid])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }

      if (previewToolModeActive) return

      if (!event.repeat && event.code === 'KeyV' && selectedModelPartUuid) {
        event.preventDefault()
        handleOpenUvViewer()
        return
      }

      if (!event.repeat && event.code === 'KeyW' && selectedModelPartUuid) {
        if (animationEditMode) {
          event.preventDefault()
          setAnimationGizmoMode('translate')
          return
        }
        if (statesEditMode && editingTeachingStateId) {
          event.preventDefault()
          setTeachingTransformMode('translate')
          return
        }
      }

      if (!event.repeat && event.code === 'KeyE' && selectedModelPartUuid) {
        if (animationEditMode) {
          event.preventDefault()
          setAnimationGizmoMode('rotate')
          return
        }
        if (statesEditMode && editingTeachingStateId) {
          event.preventDefault()
          setTeachingTransformMode('rotate')
          return
        }
      }

      if (event.code !== 'Space' || event.repeat) return

      if (animationEditMode || (sidebarTab === 'render' && hasPartAnimPlayback)) {
        event.preventDefault()
        handlePartAnimTogglePlaying()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    animationEditMode,
    editingTeachingStateId,
    handlePartAnimTogglePlaying,
    hasPartAnimPlayback,
    previewToolModeActive,
    selectedModelPartUuid,
    sidebarTab,
    statesEditMode,
    handleOpenUvViewer
  ])

  useEffect(() => {
    if (!uvViewerHint) return
    const timer = setTimeout(() => setUvViewerHint(''), 3000)
    return () => clearTimeout(timer)
  }, [uvViewerHint])

  const handleDeselectModelPart = useCallback(() => {
    setSelectedModelPartUuid(null)
    previewRef.current?.clearModelPartSelection()
    previewRef.current?.selectPartAnimationTarget(null)
    previewRef.current?.clearMaterialSelection()
    setSelectedPartUuid(null)
    setSelectedMaterialIndex(0)
    setMaterialSlots([])
    setMaterialState(null)
  }, [])

  const handleSelectModelPart = useCallback(
    (meshUuid: string) => {
      if (selectedModelPartUuid === meshUuid) {
        handleDeselectModelPart()
        return
      }
      setSelectedModelPartUuid(meshUuid)
      previewRef.current?.selectModelPart(meshUuid)
      if (animationEditMode) {
        previewRef.current?.selectPartAnimationTarget(meshUuid)
      }
      if (materialEditMode) {
        const state = previewRef.current?.selectMesh(meshUuid, 0)
        setSelectedPartUuid(meshUuid)
        setSelectedMaterialIndex(0)
        setMaterialSlots(previewRef.current?.listMaterials(meshUuid) ?? [])
        setMaterialState(state)
      }
    },
    [selectedModelPartUuid, handleDeselectModelPart, animationEditMode, statesEditMode, materialEditMode]
  )

  const handleModelPartPick = useCallback(
    (meshUuid: string) => {
      handleSelectModelPart(meshUuid)
    },
    [handleSelectModelPart]
  )

  const handleSelectPart = useCallback(
    (meshUuid: string, materialIndex = 0) => {
      if (selectedPartUuid === meshUuid && selectedMaterialIndex === materialIndex) {
        handleDeselectModelPart()
        return
      }
      const state = previewRef.current?.selectMesh(meshUuid, materialIndex)
      setSelectedPartUuid(meshUuid)
      setSelectedModelPartUuid(meshUuid)
      setSelectedMaterialIndex(materialIndex)
      setMaterialSlots(previewRef.current?.listMaterials(meshUuid) ?? [])
      setMaterialState(state)
    },
    [selectedPartUuid, selectedMaterialIndex, handleDeselectModelPart]
  )

  const handleSelectMaterial = useCallback(
    (materialIndex: number) => {
      if (!selectedPartUuid) return
      const state = previewRef.current?.selectMesh(selectedPartUuid, materialIndex)
      setSelectedMaterialIndex(materialIndex)
      setMaterialState(state)
    },
    [selectedPartUuid]
  )

  const handleMeshPick = useCallback((meshUuid: string, materialIndex: number) => {
    handleSelectPart(meshUuid, materialIndex)
  }, [handleSelectPart])

  const persistMaterials = useCallback(async (): Promise<boolean> => {
    if (!asset?.libraryId || !isLibraryModel) return false
    if (!isMaterialOverrideApiReady()) {
      setMaterialSaveError(getMaterialOverrideApiUnavailableMessage())
      return false
    }
    if (!previewRef.current?.hasMaterialUnsavedChanges()) {
      setMaterialSaveError('没有需要保存的材质修改')
      return false
    }

    if (materialSaveInFlightRef.current) {
      materialSaveQueuedRef.current = true
      return false
    }

    materialSaveInFlightRef.current = true
    setMaterialSaving(true)
    setMaterialSaveError('')
    setMaterialResetHint('')
    try {
      const payload = await previewRef.current.buildMaterialSavePayload()
      await window.electronAPI.saveMaterialOverrides(asset.libraryId, payload)
      previewRef.current.commitMaterialBaseline()
      setMaterialHasUnsavedChanges(false)

      try {
        if (asset.libraryId) {
          invalidateAppearanceSuffixCache(asset.libraryId)
        }
        const dataUrl = await generateModelThumbnail(asset.path, asset.extension, asset.libraryId)
        if (dataUrl) {
          const settingsKey = await resolveModelThumbnailSettingsKey(
            asset.path,
            getModelThumbnailCacheKey(),
            asset.libraryId
          )
          await window.electronAPI.saveThumbnail(
            asset.path,
            asset.modifiedTime,
            dataUrl,
            settingsKey
          )
          requestThumbnailRefresh(asset.path)
        }
      } catch {
        /* 缩略图刷新失败不影响材质已保存 */
      }
      return true
    } catch (err) {
      setMaterialSaveError(err instanceof Error ? err.message : '材质保存失败')
      return false
    } finally {
      setMaterialSaving(false)
      materialSaveInFlightRef.current = false
      if (materialSaveQueuedRef.current) {
        materialSaveQueuedRef.current = false
        if (previewRef.current?.hasMaterialUnsavedChanges()) {
          void persistMaterials()
        }
      }
    }
  }, [asset?.libraryId, asset?.modifiedTime, asset?.path, isLibraryModel])

  const handleSaveMaterials = useCallback(() => {
    void persistMaterials()
  }, [persistMaterials])

  useEffect(() => {
    return () => {
      if (partAnimationAutoSaveTimerRef.current) {
        clearTimeout(partAnimationAutoSaveTimerRef.current)
      }
      if (teachingStateAutoSaveTimerRef.current) {
        clearTimeout(teachingStateAutoSaveTimerRef.current)
      }
    }
  }, [asset?.path])

  const handleMaterialChange = useCallback(
    (patch: MaterialEditPatch) => {
      setMaterialResetHint('')
      setMaterialSaveError('')
      const next = previewRef.current?.applyMaterialPatch(patch)
      if (next) {
        setMaterialState(next)
        syncMaterialDirtyState()
      }
    },
    [syncMaterialDirtyState]
  )

  const handlePickMapFile = useCallback(
    async (slot: PbrMapSlot) => {
      setMaterialResetHint('')
      setMaterialSaveError('')
      const paths = await window.electronAPI.selectFiles()
      if (!paths.length) return

      const next = await previewRef.current?.applyMapFromFile(paths[0], slot)
      if (next) {
        setMaterialState(next)
        setAvailableTextures(previewRef.current?.listTextures() ?? [])
        syncMaterialDirtyState()
      }
    },
    [syncMaterialDirtyState]
  )

  const handleResetMaterial = useCallback(() => {
    if (!previewRef.current?.hasOpenedBaselineChangesForSelection()) {
      setMaterialResetHint('当前材质与打开预览时一致，无需恢复')
      return
    }
    setMaterialResetHint('')
    setMaterialSaveError('')
    const next = previewRef.current?.resetSelectedMaterial()
    if (next) {
      setMaterialState(next)
      syncMaterialDirtyState()
    }
  }, [syncMaterialDirtyState])

  const handleClose = useCallback(async () => {
    if (
      isLibraryModel &&
      previewRef.current?.hasMaterialUnsavedChanges() &&
      !window.confirm('材质修改尚未保存，确定关闭预览？')
    ) {
      return
    }
    await flushPartAnimationAutoSave()
    await flushTeachingStateAutoSave()
    onClose()
  }, [flushPartAnimationAutoSave, flushTeachingStateAutoSave, isLibraryModel, onClose])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (viewportFullscreen) {
        setViewportFullscreen(false)
        return
      }
      void handleClose()
    },
    [handleClose, viewportFullscreen]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleModelPick = useCallback(
    (payload: { position: { x: number; y: number; z: number }; meshName?: string }) => {
      setMarkerError('')

      if (isAnchorMarkerKind(draftKind)) {
        setPendingPlacement({
          kind: draftKind,
          position: payload.position,
          meshName: payload.meshName
        })
        setDraftName(payload.meshName ?? '')
        setDraftDescription('')
        setDraftImagePath('')
        setPlacementMode(false)
        return
      }

      if (!placementStart) {
        setPlacementStart({
          position: payload.position,
          meshName: payload.meshName
        })
        return
      }

      if (markerPointsEqual(placementStart.position, payload.position)) {
        setMarkerError('标注起点与终点不能相同')
        return
      }

      setPendingPlacement({
        kind: draftKind,
        position: placementStart.position,
        endPosition: payload.position,
        meshName: placementStart.meshName
      })
      setPlacementStart(null)
      setDraftName(placementStart.meshName ?? '')
      setDraftDescription('')
      setPlacementMode(false)
    },
    [draftKind, placementStart]
  )

  const handlePickMarkerImage = useCallback(async (): Promise<string | null> => {
    const paths = await window.electronAPI.selectFiles()
    const imagePath = paths.find((path) => isMarkerImageFile(path))
    if (!imagePath) {
      setMarkerError('请选择图片文件（jpg、png、webp 等）')
      return null
    }
    setMarkerError('')
    return imagePath
  }, [])

  const handleConfirmPlacement = useCallback(async () => {
    if (!asset?.libraryId || !pendingPlacement) return
    const name = draftName.trim()
    if (!name) {
      setMarkerError('请输入标记名称')
      return
    }
    if (pendingPlacement.kind === 'image-text' && !draftImagePath.trim()) {
      setMarkerError('请选择配图')
      return
    }

    setMarkerSaving(true)
    setMarkerError('')
    try {
      if (!isMarkerApiReady()) {
        throw new Error(getMarkerApiUnavailableMessage())
      }

      const input: ModelMarkerInput = {
        kind: pendingPlacement.kind,
        name,
        description: draftDescription.trim() || undefined,
        imagePath:
          pendingPlacement.kind === 'image-text' ? draftImagePath.trim() : undefined,
        meshName: pendingPlacement.meshName,
        position: {
          x: pendingPlacement.position.x,
          y: pendingPlacement.position.y,
          z: pendingPlacement.position.z
        },
        endPosition: pendingPlacement.endPosition
          ? {
              x: pendingPlacement.endPosition.x,
              y: pendingPlacement.endPosition.y,
              z: pendingPlacement.endPosition.z
            }
          : undefined
      }

      if (!activeCollectionId) {
        setMarkerError('请先选择标注集合')
        return
      }

      const marker = await window.electronAPI.addModelMarker(
        asset.libraryId,
        activeCollectionId,
        input
      )
      setCollections((prev) => addMarkerToCollection(prev, activeCollectionId, marker))
      setVisibleCollectionId(activeCollectionId)
      setPendingPlacement(null)
      setDraftName('')
      setDraftDescription('')
      setDraftImagePath('')
      setSelectedMarkerId(marker.id)
      setFocusMarkerId(marker.id)
    } catch (err) {
      setMarkerError(err instanceof Error ? err.message : '保存标记失败')
    } finally {
      setMarkerSaving(false)
    }
  }, [
    asset?.libraryId,
    activeCollectionId,
    pendingPlacement,
    draftName,
    draftDescription,
    draftImagePath
  ])

  const handleCancelPlacement = useCallback(() => {
    setPendingPlacement(null)
    setPlacementStart(null)
    setDraftKind('point')
    setDraftName('')
    setDraftDescription('')
    setDraftImagePath('')
  }, [])

  const displayMarkers = useMemo(() => {
    const base = effectiveMarkersVisible ? visibleCollectionMarkers : []
    if (!pendingPlacement) return base
    const previewMarker: ModelMarker = {
      id: PREVIEW_MARKER_ID,
      kind: pendingPlacement.kind,
      name: draftName,
      description: draftDescription.trim() || undefined,
      imagePath: pendingPlacement.kind === 'image-text' ? draftImagePath.trim() || undefined : undefined,
      meshName: pendingPlacement.meshName,
      position: pendingPlacement.position,
      endPosition: pendingPlacement.endPosition,
      createdAt: 0
    }
    return [...base, previewMarker]
  }, [
    effectiveMarkersVisible,
    visibleCollectionMarkers,
    pendingPlacement,
    draftName,
    draftDescription,
    draftImagePath
  ])

  const allMarkersForFocus = useMemo(
    () => collections.flatMap((collection) => collection.markers),
    [collections]
  )

  const displaySelectedMarkerId = pendingPlacement ? PREVIEW_MARKER_ID : selectedMarkerId

  const handleSelectMarker = useCallback((markerId: string) => {
    setSelectedMarkerId((prev) => {
      if (prev === markerId) {
        setFocusMarkerId(null)
        return null
      }
      if (activeCollectionId) {
        setVisibleCollectionId(activeCollectionId)
      }
      setFocusMarkerId(markerId)
      return markerId
    })
  }, [activeCollectionId])

  const handleMarkerReposition = useCallback(
    async (
      markerId: string,
      position: { x: number; y: number; z: number },
      meshName?: string
    ) => {
      if (!asset?.libraryId || !isLibraryModel) return

      setMarkerError('')
      try {
        if (!isMarkerApiReady()) {
          throw new Error(getMarkerApiUnavailableMessage())
        }

        const patch: Parameters<typeof window.electronAPI.updateModelMarker>[2] = {
          position,
          meshName
        }

        const updated = await window.electronAPI.updateModelMarker(asset.libraryId, markerId, patch)
        if (!updated) {
          setMarkerError('更新标记位置失败')
          await loadCollections(asset.libraryId)
          return
        }

        setCollections((prev) => updateMarkerInCollections(prev, markerId, updated))
        setSelectedMarkerId(markerId)
      } catch (err) {
        setMarkerError(err instanceof Error ? err.message : '更新标记位置失败')
        await loadCollections(asset.libraryId)
      }
    },
    [asset?.libraryId, isLibraryModel, loadCollections]
  )

  const handleMarkerEndpointReposition = useCallback(
    async (
      markerId: string,
      position: { x: number; y: number; z: number },
      endPosition: { x: number; y: number; z: number }
    ) => {
      if (!asset?.libraryId || !isLibraryModel) return

      setMarkerError('')
      try {
        if (!isMarkerApiReady()) {
          throw new Error(getMarkerApiUnavailableMessage())
        }

        const updated = await window.electronAPI.updateModelMarker(asset.libraryId, markerId, {
          position,
          endPosition
        })
        if (!updated) {
          setMarkerError('更新箭头位置失败')
          await loadCollections(asset.libraryId)
          return
        }

        setCollections((prev) => updateMarkerInCollections(prev, markerId, updated))
        setSelectedMarkerId(markerId)
      } catch (err) {
        setMarkerError(err instanceof Error ? err.message : '更新箭头位置失败')
        await loadCollections(asset.libraryId)
      }
    },
    [asset?.libraryId, isLibraryModel, loadCollections]
  )

  const handleUpdateMarker = useCallback(
    async (markerId: string, name: string, description: string, imagePath?: string) => {
      if (!asset?.libraryId) return
      const trimmedName = name.trim()
      if (!trimmedName) {
        setMarkerError('标记名称不能为空')
        return
      }

      setMarkerSaving(true)
      setMarkerError('')
      try {
        const patch: Parameters<typeof window.electronAPI.updateModelMarker>[2] = {
          name: trimmedName,
          description
        }
        if (imagePath !== undefined) {
          patch.imagePath = imagePath
        }

        const updated = await window.electronAPI.updateModelMarker(asset.libraryId, markerId, patch)
        if (!updated) {
          setMarkerError('更新标记失败')
          return
        }
        setCollections((prev) => updateMarkerInCollections(prev, markerId, updated))
      } catch (err) {
        setMarkerError(err instanceof Error ? err.message : '更新标记失败')
      } finally {
        setMarkerSaving(false)
      }
    },
    [asset?.libraryId]
  )

  const handleDeleteMarker = useCallback(
    async (markerId: string) => {
      if (!asset?.libraryId) return
      setMarkerSaving(true)
      setMarkerError('')
      try {
        const ok = await window.electronAPI.removeModelMarker(asset.libraryId, markerId)
        if (!ok) {
          setMarkerError('删除标记失败')
          return
        }
        setCollections((prev) => removeMarkerFromCollections(prev, markerId))
        if (selectedMarkerId === markerId) {
          setSelectedMarkerId(null)
        }
        if (focusMarkerId === markerId) {
          setFocusMarkerId(null)
        }
      } catch (err) {
        setMarkerError(err instanceof Error ? err.message : '删除标记失败')
      } finally {
        setMarkerSaving(false)
      }
    },
    [asset?.libraryId, selectedMarkerId, focusMarkerId]
  )

  if (!asset) return null

  const isTexture = isTextureAsset(asset)
  const isAudio = isAudioAsset(asset)
  const isVideo = isVideoAsset(asset)
  const isDocument = isDocumentAsset(asset)
  const unsupportedMsg = getUnsupportedPreviewMessage(asset.extension)

  return (
    <div
      className={`preview-overlay${viewportFullscreen ? ' preview-viewport-fullscreen' : ''}`}
      onClick={(e) => e.target === e.currentTarget && void handleClose()}
    >
      <div className="preview-header">
        <div>
          <div className="preview-title">{asset.name}</div>
        </div>
        <button className="preview-close" onClick={() => void handleClose()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
          关闭 (ESC)
        </button>
      </div>
      {unsupportedMsg ? (
        <UnsupportedPreview message={unsupportedMsg} />
      ) : isVideo ? (
        <VideoPreview asset={asset} />
      ) : isAudio ? (
        <AudioPreview asset={asset} />
      ) : isDocument ? (
        <DocumentPreview asset={asset} />
      ) : isTexture ? (
        <ImagePreview asset={asset} />
      ) : (
        <div className="preview-main-column">
          <div className="preview-body">
            <aside className="preview-parts-panel">
              {uvViewerHint && <div className="preview-parts-hint">{uvViewerHint}</div>}
              <ModelPartsPanel
                parts={modelPartsList}
                selectedMeshUuid={selectedModelPartUuid}
                onSelectPart={handleSelectModelPart}
                onToggleVisible={handleTogglePartVisible}
                onSetAllVisible={handleSetAllPartsVisible}
                onRenamePart={(objectUuid, name) => void handleRenameModelPart(objectUuid, name)}
              />
            </aside>
            <div className={`preview-viewport-row ${documentsSplitMode ? 'with-document-split' : ''}`}>
              <div className="preview-model-pane">
                <ModelPreview
              ref={previewRef}
              asset={asset}
              settings={previewSettings}
              markers={isLibraryModel ? displayMarkers : []}
              selectedMarkerId={displaySelectedMarkerId}
              markerDragEnabled={isLibraryModel}
              markersVisible={sceneMarkersVisible}
              markerCollections={collections}
              visibleCollectionId={visibleCollectionId}
              showMarkerCollectionPicker={isLibraryModel && !previewToolModeActive}
              placementMode={placementMode}
              placementKind={draftKind}
              placementStart={placementStart}
              measureMode={measureMode}
              materialEditMode={materialEditMode}
              animationEditMode={animationEditMode}
              animationGizmoMode={animationGizmoMode}
              teachingStateEditMode={statesEditMode}
              teachingTransformMode={teachingTransformMode}
              selectedModelPartUuid={selectedModelPartUuid}
              selectedModelPartName={findModelPartName(selectedModelPartUuid)}
              partAnimationChannels={DEFAULT_PART_ANIMATION_CHANNELS}
              onPartAnimationSync={syncPartAnimationUi}
              onPartAnimationTransformCommit={schedulePartAnimationAutoSave}
              onPartAnimationTransformLive={syncSelectedPartTransform}
              teachingStates={teachingStatesForPicker}
              activeTeachingStateId={activeTeachingStateId}
              showTeachingStatePicker={isLibraryModel && !previewToolModeActive}
              onSelectTeachingState={handleSelectTeachingState}
              onTeachingStateSync={syncTeachingStateUi}
              canExplode={canExplode}
              exploded={exploded}
              measureState={measureState}
              focusMarkerId={focusMarkerId}
              allMarkersForFocus={allMarkersForFocus}
              onModelPick={handleModelPick}
              onMarkerSelect={handleSelectMarker}
              onMarkerReposition={handleMarkerReposition}
              onMarkerEndpointReposition={handleMarkerEndpointReposition}
              onExplodedChange={setExploded}
              onCanExplodeChange={setCanExplode}
              onMeasureStateChange={setMeasureState}
              onSectionModeChange={handleSectionModeChange}
              onTransparentModeChange={handleTransparentModeChange}
              activeStandardView={activeStandardView}
              onSetStandardView={handleSetStandardView}
              onResetView={handleResetView}
              onToggleExplode={handleToggleExplode}
              onToggleMeasureMode={handleToggleMeasureMode}
              onClearMeasure={handleClearMeasure}
              onSelectVisibleCollection={handleSelectVisibleCollection}
              onMeshPick={handleMeshPick}
              onModelPartPick={handleModelPartPick}
              onViewportBlankPick={handleDeselectModelPart}
              onMeshPartsReady={handleMeshPartsReady}
              onModelPartsListReady={handleModelPartsListReady}
              onStandardViewChange={setActiveStandardView}
              viewportFullscreen={viewportFullscreen}
              onToggleViewportFullscreen={handleToggleViewportFullscreen}
              libraryId={isLibraryModel ? asset.libraryId : undefined}
            />
              </div>
              {documentsSplitMode && (
                <div className="preview-document-pane">
                  <PreviewPdfViewer url={activePdfUrl} title={activeDocumentName ?? undefined} />
                </div>
              )}
            </div>
            <PreviewSidebar
              activeTab={sidebarTab}
              onTabChange={handleSidebarTabChange}
              showStructureTab={isLibraryModel}
              previewSettings={previewSettings}
              onPreviewSettingsChange={updatePreviewSettings}
              modelExtension={asset.extension}
              materialEditMode={materialEditMode}
              meshParts={meshParts}
              availableTextures={availableTextures}
              selectedPartUuid={selectedPartUuid}
              materialSlots={materialSlots}
              selectedMaterialIndex={selectedMaterialIndex}
              materialState={materialState}
              canSaveMaterials={isLibraryModel}
              materialSaving={materialSaving}
              materialSaveError={materialSaveError}
              materialResetHint={materialResetHint}
              materialHasUnsavedChanges={materialHasUnsavedChanges}
              onSaveMaterials={handleSaveMaterials}
              onSelectMaterial={handleSelectMaterial}
              onMaterialChange={handleMaterialChange}
              onPickMapFile={handlePickMapFile}
              onResetMaterial={handleResetMaterial}
              collections={collections}
              activeCollectionId={activeCollectionId}
              visibleCollectionId={visibleCollectionId}
              markers={activeCollectionMarkers}
              canEdit={isLibraryModel}
              placementMode={placementMode}
              draftKind={draftKind}
              placementStart={placementStart}
              selectedMarkerId={selectedMarkerId}
              pendingPlacement={pendingPlacement}
              draftName={draftName}
              draftDescription={draftDescription}
              draftImagePath={draftImagePath}
              markerError={markerError}
              markerSaving={markerSaving}
              onSelectCollection={handleSelectCollection}
              onToggleCollectionVisible={handleToggleCollectionVisible}
              onCreateCollection={handleCreateCollection}
              onUpdateCollection={handleUpdateCollection}
              onDeleteCollection={handleDeleteCollection}
              onTogglePlacementMode={handleTogglePlacementMode}
              onDraftKindChange={setDraftKind}
              onDraftNameChange={setDraftName}
              onDraftDescriptionChange={setDraftDescription}
              onDraftImagePathChange={setDraftImagePath}
              onPickMarkerImage={handlePickMarkerImage}
              onConfirmPlacement={handleConfirmPlacement}
              onCancelPlacement={handleCancelPlacement}
              onSelectMarker={handleSelectMarker}
              onUpdateMarker={handleUpdateMarker}
              onDeleteMarker={handleDeleteMarker}
              partAnimationDocument={partAnimDocument}
              activePartAnimationStageId={activePartAnimStageId}
              selectedModelPartName={findModelPartName(selectedModelPartUuid)}
              partAnimationChannels={DEFAULT_PART_ANIMATION_CHANNELS}
              canSavePartAnimation={isLibraryModel}
              partAnimationSaving={partAnimSaving}
              partAnimationSaveError={partAnimSaveError}
              animationGizmoMode={animationGizmoMode}
              selectedPartTransform={selectedPartTransform}
              onAnimationGizmoModeChange={setAnimationGizmoMode}
              onPartAnimationTransformChange={handlePartAnimTransformChange}
              onAddPartAnimationKeyframe={handleAddPartAnimKeyframe}
              onRemovePartAnimationKeyframeAtCurrent={handleRemovePartAnimKeyframe}
              onSavePartAnimation={() => void handleSavePartAnimation()}
              onSelectPartAnimationStage={handleSelectPartAnimStage}
              onCreatePartAnimationStage={handleCreatePartAnimStage}
              onRenamePartAnimationStage={handleRenamePartAnimStage}
              onUpdatePartAnimationStageDuration={handleUpdatePartAnimStageDuration}
              onDeletePartAnimationStage={handleDeletePartAnimStage}
              onPlayPartAnimationStage={handlePlayPartAnimStage}
              onPlayAllPartAnimation={handlePlayAllPartAnimation}
              teachingStateDocument={teachingStateDocument}
              editingTeachingStateId={editingTeachingStateId}
              canSaveTeachingStates={isLibraryModel}
              teachingStateSaving={teachingStateSaving}
              teachingStateSaveError={teachingStateSaveError}
              teachingStateSaveHint={teachingStateSaveHint}
              teachingStateBusy={teachingStateBusy}
              teachingTransformMode={teachingTransformMode}
              selectedTeachingPartName={findModelPartName(selectedModelPartUuid)}
              onTeachingTransformModeChange={setTeachingTransformMode}
              onCreateTeachingState={handleCreateTeachingState}
              onSelectTeachingStateForEdit={handleSelectTeachingStateForEdit}
              onRenameTeachingState={handleRenameTeachingState}
              onDeleteTeachingState={handleDeleteTeachingState}
              onSaveTeachingState={(stateId) => void handleSaveTeachingState(stateId)}
              onPreviewTeachingState={(stateId) => void handlePreviewTeachingState(stateId)}
              onSetInitialTeachingState={handleSetInitialTeachingState}
              documentManifest={documentManifest}
              documentBusy={documentBusy}
              documentError={documentError}
              onUploadDocuments={() => void handleUploadDocuments()}
              onSelectDocument={(documentId) => void handleSelectDocument(documentId)}
              onDeleteDocument={(documentId) => void handleDeleteDocument(documentId)}
            />
          </div>
          {sidebarTab === 'render' && hasPartAnimPlayback && (
            <AnimationTimeline
              mode="playback"
              disabled={previewToolModeActive}
              document={partAnimDocument}
              currentTime={partAnimCurrentTime}
              playing={partAnimPlaying}
              selectedMeshUuid={null}
              markers={partAnimMarkers}
              activeStageId={activePartAnimStageId}
              onSetTime={handlePartAnimSetTime}
              onTogglePlaying={handlePartAnimTogglePlaying}
              onStop={handlePartAnimStop}
              onAddKeyframe={() => {}}
              onRemoveKeyframeAtCurrent={() => {}}
              onSelectKeyframe={(_meshUuid, _channel, time) => handlePartAnimSetTime(time)}
              onSelectStage={handleSelectPartAnimStage}
            />
          )}
          {animationEditMode && (
            <AnimationTimeline
              disabled={previewToolModeActive}
              document={partAnimDocument}
              currentTime={partAnimCurrentTime}
              playing={partAnimPlaying}
              selectedMeshUuid={selectedModelPartUuid}
              markers={partAnimMarkers}
              activeStageId={activePartAnimStageId}
              onSetTime={handlePartAnimSetTime}
              onTogglePlaying={handlePartAnimTogglePlaying}
              onStop={handlePartAnimStop}
              onAddKeyframe={handleAddPartAnimKeyframe}
              onRemoveKeyframeAtCurrent={handleRemovePartAnimKeyframe}
              onSelectKeyframe={handleSelectPartAnimKeyframe}
              onSelectStage={handleSelectPartAnimStage}
            />
          )}
        </div>
      )}
    </div>
  )
}
