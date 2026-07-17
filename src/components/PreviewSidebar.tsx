import type { ReactNode } from 'react'
import PreviewSettingsPanel from './PreviewSettingsPanel'
import MaterialEditPanel from './MaterialEditPanel'
import ModelMarkerPanel from './ModelMarkerPanel'
import PartAnimationPanel from './PartAnimationPanel'
import TeachingStatePanel, { type TeachingTransformMode } from './TeachingStatePanel'
import ModelDocumentPanel from './ModelDocumentPanel'
import type { PreviewSettings } from '../utils/previewSettings'
import type { MaterialEditPatch, MaterialEditState, MaterialSlotInfo, MeshPartInfo, PbrMapSlot, TextureOption } from '../services/modelMaterialEdit'
import type { MarkerCollection, ModelMarker, ModelMarkerKind } from '../types/marker'
import type { PartAnimationDocument } from '../types/partAnimation'
import type { ModelTeachingStateDocument } from '../types/modelTeachingState'
import type { ModelDocumentManifest } from '../types/modelDocument'

export type PreviewSidebarTab = 'render' | 'structure' | 'animation' | 'states' | 'documents'

interface PreviewSidebarProps {
  activeTab: PreviewSidebarTab
  onTabChange: (tab: PreviewSidebarTab) => void
  showStructureTab: boolean
  previewSettings: PreviewSettings
  onPreviewSettingsChange: (partial: Partial<PreviewSettings>) => void
  modelExtension?: string | null
  materialEditMode: boolean
  meshParts: MeshPartInfo[]
  availableTextures: TextureOption[]
  selectedPartUuid: string | null
  materialSlots: MaterialSlotInfo[]
  selectedMaterialIndex: number
  materialState: MaterialEditState | null
  canSaveMaterials: boolean
  materialSaving: boolean
  materialSaveError: string
  materialResetHint: string
  materialHasUnsavedChanges: boolean
  onSaveMaterials: () => void
  onSelectMaterial: (materialIndex: number) => void
  onMaterialChange: (patch: MaterialEditPatch) => void
  onPickMapFile: (slot: PbrMapSlot) => void
  onResetMaterial: () => void
  collections: MarkerCollection[]
  activeCollectionId: string | null
  visibleCollectionId: string | null
  markers: ModelMarker[]
  canEdit: boolean
  placementMode: boolean
  draftKind: ModelMarkerKind
  placementStart: { position: { x: number; y: number; z: number }; meshName?: string } | null
  selectedMarkerId: string | null
  pendingPlacement: { kind: ModelMarkerKind; meshName?: string } | null
  draftName: string
  draftDescription: string
  draftImagePath: string
  markerError: string
  markerSaving: boolean
  onSelectCollection: (collectionId: string) => void
  onToggleCollectionVisible: (collectionId: string) => void
  onCreateCollection: (name: string) => void
  onUpdateCollection: (collectionId: string, name: string) => void
  onDeleteCollection: (collectionId: string) => void
  onTogglePlacementMode: () => void
  onDraftKindChange: (kind: ModelMarkerKind) => void
  onDraftNameChange: (value: string) => void
  onDraftDescriptionChange: (value: string) => void
  onDraftImagePathChange: (value: string) => void
  onPickMarkerImage: () => Promise<string | null>
  onConfirmPlacement: () => void
  onCancelPlacement: () => void
  onSelectMarker: (markerId: string) => void
  onUpdateMarker: (
    markerId: string,
    name: string,
    description: string,
    imagePath?: string
  ) => void
  onDeleteMarker: (markerId: string) => void
  partAnimationDocument: PartAnimationDocument
  activePartAnimationStageId: string | null
  selectedModelPartName: string | null
  canSavePartAnimation: boolean
  partAnimationSaving: boolean
  partAnimationSaveError: string
  animationGizmoMode: 'translate' | 'rotate'
  selectedPartTransform: {
    position: { x: number; y: number; z: number }
    rotationDeg: { x: number; y: number; z: number }
  } | null
  onAnimationGizmoModeChange: (mode: 'translate' | 'rotate') => void
  onPartAnimationTransformChange: (patch: {
    position?: Partial<{ x: number; y: number; z: number }>
    rotationDeg?: Partial<{ x: number; y: number; z: number }>
  }) => void
  onAddPartAnimationKeyframe: () => void
  onRemovePartAnimationKeyframeAtCurrent: () => void
  onSavePartAnimation: () => void
  onSelectPartAnimationStage: (stageId: string) => void
  onCreatePartAnimationStage: () => void
  onRenamePartAnimationStage: (stageId: string, name: string) => void
  onUpdatePartAnimationStageDuration: (stageId: string, duration: number) => void
  onDeletePartAnimationStage: (stageId: string) => void
  onPlayPartAnimationStage: (stageId: string) => void
  onPlayAllPartAnimation: () => void
  teachingStateDocument: ModelTeachingStateDocument
  editingTeachingStateId: string | null
  canSaveTeachingStates: boolean
  teachingStateSaving: boolean
  teachingStateSaveError: string
  teachingStateSaveHint: string
  teachingStateBusy: boolean
  teachingTransformMode: TeachingTransformMode
  selectedTeachingPartName: string | null
  onTeachingTransformModeChange: (mode: TeachingTransformMode) => void
  onCreateTeachingState: (name: string) => void
  onSelectTeachingStateForEdit: (stateId: string) => void
  onRenameTeachingState: (stateId: string, name: string) => void
  onDeleteTeachingState: (stateId: string) => void
  onSaveTeachingState: (stateId: string) => void
  onPreviewTeachingState: (stateId: string) => void
  onSetInitialTeachingState: (stateId: string) => void
  documentManifest: ModelDocumentManifest
  documentBusy: boolean
  documentError: string
  onUploadDocuments: () => void
  onSelectDocument: (documentId: string) => void
  onDeleteDocument: (documentId: string) => void
}

const TABS: Array<{ id: PreviewSidebarTab; label: string; requiresLibrary?: boolean }> = [
  { id: 'render', label: '渲染' },
  { id: 'animation', label: '动画', requiresLibrary: true },
  { id: 'states', label: '状态', requiresLibrary: true },
  { id: 'documents', label: '文档', requiresLibrary: true },
  { id: 'structure', label: '标注', requiresLibrary: true }
]

function TabButton({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={`preview-sidebar-tab ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function TabPanel({ active, children }: { active: boolean; children: ReactNode }): JSX.Element | null {
  if (!active) return null
  return <div className="preview-sidebar-tab-panel">{children}</div>
}

export default function PreviewSidebar({
  activeTab,
  onTabChange,
  showStructureTab,
  previewSettings,
  onPreviewSettingsChange,
  modelExtension = null,
  materialEditMode,
  meshParts,
  availableTextures,
  selectedPartUuid,
  materialSlots,
  selectedMaterialIndex,
  materialState,
  canSaveMaterials,
  materialSaving,
  materialSaveError,
  materialResetHint,
  materialHasUnsavedChanges,
  onSaveMaterials,
  onSelectMaterial,
  onMaterialChange,
  onPickMapFile,
  onResetMaterial,
  collections,
  activeCollectionId,
  visibleCollectionId,
  markers,
  canEdit,
  placementMode,
  draftKind,
  placementStart,
  selectedMarkerId,
  pendingPlacement,
  draftName,
  draftDescription,
  draftImagePath,
  markerError,
  markerSaving,
  onSelectCollection,
  onToggleCollectionVisible,
  onCreateCollection,
  onUpdateCollection,
  onDeleteCollection,
  onTogglePlacementMode,
  onDraftKindChange,
  onDraftNameChange,
  onDraftDescriptionChange,
  onDraftImagePathChange,
  onPickMarkerImage,
  onConfirmPlacement,
  onCancelPlacement,
  onSelectMarker,
  onUpdateMarker,
  onDeleteMarker,
  partAnimationDocument,
  activePartAnimationStageId,
  selectedModelPartName,
  canSavePartAnimation,
  partAnimationSaving,
  partAnimationSaveError,
  animationGizmoMode,
  selectedPartTransform,
  onAnimationGizmoModeChange,
  onPartAnimationTransformChange,
  onAddPartAnimationKeyframe,
  onRemovePartAnimationKeyframeAtCurrent,
  onSavePartAnimation,
  onSelectPartAnimationStage,
  onCreatePartAnimationStage,
  onRenamePartAnimationStage,
  onUpdatePartAnimationStageDuration,
  onDeletePartAnimationStage,
  onPlayPartAnimationStage,
  onPlayAllPartAnimation,
  teachingStateDocument,
  editingTeachingStateId,
  canSaveTeachingStates,
  teachingStateSaving,
  teachingStateSaveError,
  teachingStateSaveHint,
  teachingStateBusy,
  teachingTransformMode,
  selectedTeachingPartName,
  onTeachingTransformModeChange,
  onCreateTeachingState,
  onSelectTeachingStateForEdit,
  onRenameTeachingState,
  onDeleteTeachingState,
  onSaveTeachingState,
  onPreviewTeachingState,
  onSetInitialTeachingState,
  documentManifest,
  documentBusy,
  documentError,
  onUploadDocuments,
  onSelectDocument,
  onDeleteDocument
}: PreviewSidebarProps): JSX.Element {
  const visibleTabs = TABS.filter((tab) => !tab.requiresLibrary || showStructureTab)

  return (
    <aside className="preview-sidebar">
      <div className="preview-sidebar-tabs">
        {visibleTabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            label={tab.label}
            onClick={() => onTabChange(tab.id)}
          />
        ))}
      </div>

      <div className="preview-sidebar-content">
        <TabPanel active={activeTab === 'render'}>
          <div className="preview-sidebar-render-panel">
            <PreviewSettingsPanel
              embedded
              settings={previewSettings}
              onChange={onPreviewSettingsChange}
              modelExtension={modelExtension}
            />
            <div className="preview-sidebar-render-divider" aria-hidden="true" />
            <MaterialEditPanel
              embedded
              materialEditMode={materialEditMode}
              parts={meshParts}
              textures={availableTextures}
              selectedPartUuid={selectedPartUuid}
              materialSlots={materialSlots}
              selectedMaterialIndex={selectedMaterialIndex}
              materialState={materialState}
              canSaveMaterials={canSaveMaterials}
              materialSaving={materialSaving}
              materialSaveError={materialSaveError}
              materialResetHint={materialResetHint}
              materialHasUnsavedChanges={materialHasUnsavedChanges}
              onSaveMaterials={onSaveMaterials}
              onSelectMaterial={onSelectMaterial}
              onMaterialChange={onMaterialChange}
              onPickMapFile={onPickMapFile}
              onResetMaterial={onResetMaterial}
            />
          </div>
        </TabPanel>

        <TabPanel active={activeTab === 'animation'}>
          <PartAnimationPanel
            embedded
            document={partAnimationDocument}
            activeStageId={activePartAnimationStageId}
            selectedMeshName={selectedModelPartName}
            canSave={canSavePartAnimation}
            saving={partAnimationSaving}
            saveError={partAnimationSaveError}
            gizmoMode={animationGizmoMode}
            partTransform={selectedPartTransform}
            onGizmoModeChange={onAnimationGizmoModeChange}
            onPartTransformChange={onPartAnimationTransformChange}
            onAddKeyframe={onAddPartAnimationKeyframe}
            onRemoveKeyframeAtCurrent={onRemovePartAnimationKeyframeAtCurrent}
            onSave={onSavePartAnimation}
            onSelectStage={onSelectPartAnimationStage}
            onCreateStage={onCreatePartAnimationStage}
            onRenameStage={onRenamePartAnimationStage}
            onUpdateStageDuration={onUpdatePartAnimationStageDuration}
            onDeleteStage={onDeletePartAnimationStage}
            onPlayStage={onPlayPartAnimationStage}
            onPlayAll={onPlayAllPartAnimation}
          />
        </TabPanel>

        <TabPanel active={activeTab === 'states'}>
          {showStructureTab ? (
            <TeachingStatePanel
              embedded
              document={teachingStateDocument}
              editingStateId={editingTeachingStateId}
              canSave={canSaveTeachingStates}
              saving={teachingStateSaving}
              saveError={teachingStateSaveError}
              saveHint={teachingStateSaveHint}
              busy={teachingStateBusy}
              transformMode={teachingTransformMode}
              selectedPartName={selectedTeachingPartName}
              onTransformModeChange={onTeachingTransformModeChange}
              onCreateState={onCreateTeachingState}
              onSelectStateForEdit={onSelectTeachingStateForEdit}
              onRenameState={onRenameTeachingState}
              onDeleteState={onDeleteTeachingState}
              onSaveState={onSaveTeachingState}
              onPreviewState={onPreviewTeachingState}
              onSetInitialState={onSetInitialTeachingState}
            />
          ) : (
            <div className="preview-sidebar-empty">当前模型不支持教学状态</div>
          )}
        </TabPanel>

        <TabPanel active={activeTab === 'documents'}>
          {showStructureTab ? (
            <ModelDocumentPanel
              manifest={documentManifest}
              busy={documentBusy}
              error={documentError}
              onUpload={onUploadDocuments}
              onSelectDocument={onSelectDocument}
              onDeleteDocument={onDeleteDocument}
            />
          ) : (
            <div className="preview-sidebar-empty">当前模型不支持关联文档</div>
          )}
        </TabPanel>

        <TabPanel active={activeTab === 'structure'}>
          {showStructureTab ? (
            <ModelMarkerPanel
              embedded
              collections={collections}
              activeCollectionId={activeCollectionId}
              visibleCollectionId={visibleCollectionId}
              markers={markers}
              canEdit={canEdit}
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
              onSelectCollection={onSelectCollection}
              onToggleCollectionVisible={onToggleCollectionVisible}
              onCreateCollection={onCreateCollection}
              onUpdateCollection={onUpdateCollection}
              onDeleteCollection={onDeleteCollection}
              onTogglePlacementMode={onTogglePlacementMode}
              onDraftKindChange={onDraftKindChange}
              onDraftNameChange={onDraftNameChange}
              onDraftDescriptionChange={onDraftDescriptionChange}
              onDraftImagePathChange={onDraftImagePathChange}
              onPickMarkerImage={onPickMarkerImage}
              onConfirmPlacement={onConfirmPlacement}
              onCancelPlacement={onCancelPlacement}
              onSelectMarker={onSelectMarker}
              onUpdateMarker={onUpdateMarker}
              onDeleteMarker={onDeleteMarker}
            />
          ) : (
            <div className="preview-sidebar-empty">当前模型不支持标注</div>
          )}
        </TabPanel>
      </div>
    </aside>
  )
}
