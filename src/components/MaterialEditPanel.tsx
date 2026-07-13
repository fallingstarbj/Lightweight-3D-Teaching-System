import type { ReactNode } from 'react'
import type {
  MaterialEditPatch,
  MaterialEditState,
  MaterialSlotInfo,
  MeshPartInfo,
  PbrMapSlot,
  TextureOption
} from '../services/modelMaterialEdit'

interface MaterialEditPanelProps {
  materialEditMode: boolean
  parts: MeshPartInfo[]
  textures: TextureOption[]
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
  embedded?: boolean
}

function SettingRow({
  label,
  value,
  children
}: {
  label: string
  value: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="preview-setting-row">
      <div className="preview-setting-label">
        <span>{label}</span>
        <span className="preview-setting-value">{value}</span>
      </div>
      {children}
    </div>
  )
}

export default function MaterialEditPanel({
  materialEditMode,
  parts,
  textures,
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
  embedded = false
}: MaterialEditPanelProps): JSX.Element {
  const selectedPart = parts.find((part) => part.meshUuid === selectedPartUuid) ?? null
  const hasMultipleMaterials = materialSlots.length > 1

  return (
    <div className="material-edit-panel">
      {!embedded ? (
        <div className="material-edit-panel-header">
          <div className="material-edit-panel-title">材质编辑</div>
          <div className="material-edit-panel-desc">
            {materialEditMode
              ? '点击模型零部件进行编辑'
              : '点击右侧「渲染」标签进入编辑模式'}
          </div>
          {canSaveMaterials && (materialSaving || materialSaveError) && (
            <div className="material-edit-save-row">
              {materialSaving && <div className="material-edit-save-status">保存中…</div>}
              {materialSaveError && <div className="material-edit-save-error">{materialSaveError}</div>}
            </div>
          )}
          {canSaveMaterials && (
            <button
              type="button"
              className="material-edit-save-btn"
              disabled={
                !materialHasUnsavedChanges ||
                materialSaving ||
                !materialEditMode
              }
              onClick={onSaveMaterials}
            >
              {materialSaving ? '保存中…' : '保存材质'}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="material-edit-panel-desc embedded-desc">
            点击模型零部件进行编辑
          </div>
          {canSaveMaterials && (materialSaving || materialSaveError) && (
            <div className="material-edit-save-row">
              {materialSaving && <div className="material-edit-save-status">保存中…</div>}
              {materialSaveError && <div className="material-edit-save-error">{materialSaveError}</div>}
            </div>
          )}
          {canSaveMaterials && (
            <button
              type="button"
              className="material-edit-save-btn"
              disabled={
                !materialHasUnsavedChanges ||
                materialSaving ||
                (!materialEditMode && !embedded)
              }
              onClick={onSaveMaterials}
            >
              {materialSaving ? '保存中…' : '保存材质'}
            </button>
          )}
        </>
      )}

      {parts.length === 0 && (
        <div className="material-edit-empty">当前模型没有可编辑的零部件</div>
      )}

      {selectedPart && materialState ? (
        <div className="material-edit-controls">
          {hasMultipleMaterials && (
            <div className="material-edit-slot-list">
              {materialSlots.map((slot) => (
                <button
                  key={slot.index}
                  type="button"
                  className={`material-edit-slot-item ${selectedMaterialIndex === slot.index ? 'selected' : ''}`}
                  disabled={!materialEditMode && !embedded}
                  onClick={() => onSelectMaterial(slot.index)}
                >
                  <span className="material-edit-slot-name">{slot.name}</span>
                  <span className="material-edit-slot-index">#{slot.index + 1}</span>
                </button>
              ))}
            </div>
          )}

          {materialState.pbrMapSlots.length > 0 && (
            <div className="material-edit-pbr-maps">
              <label className="material-edit-section-title material-edit-pbr-toggle">
                <input
                  type="checkbox"
                  checked={materialState.pbrMapsEnabled}
                  disabled={!materialEditMode && !embedded}
                  onChange={(e) => onMaterialChange({ pbrMapsEnabled: e.target.checked })}
                />
                <span>材质贴图</span>
              </label>
              {materialState.pbrMapsEnabled &&
                materialState.pbrMapSlots.map((slotInfo) => (
                  <div key={slotInfo.slot}>
                    <SettingRow
                      label={slotInfo.label}
                      value={
                        slotInfo.textureId
                          ? textures.find((item) => item.id === slotInfo.textureId)?.label ?? '已指定'
                          : '无'
                      }
                    >
                      <select
                        className="material-edit-texture-select"
                        value={slotInfo.textureId ?? ''}
                        disabled={!materialEditMode && !embedded}
                        onChange={(e) =>
                          onMaterialChange({
                            pbrMapPatches: {
                              [slotInfo.slot]: e.target.value ? e.target.value : null
                            }
                          })
                        }
                      >
                        <option value="">无贴图</option>
                        {textures.map((texture) => (
                          <option key={texture.id} value={texture.id}>
                            {texture.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="material-edit-pick-texture-btn material-edit-pick-texture-btn-inline"
                        disabled={!materialEditMode && !embedded}
                        onClick={() => onPickMapFile(slotInfo.slot)}
                      >
                        选择文件…
                      </button>
                    </SettingRow>

                    {slotInfo.slot === 'normalMap' && materialState.supportsNormalMap && (
                      <label className="material-edit-normal-invert">
                        <input
                          type="checkbox"
                          checked={materialState.normalMapInverted}
                          disabled={!materialEditMode && !embedded}
                          onChange={(e) =>
                            onMaterialChange({ normalMapInverted: e.target.checked })
                          }
                        />
                        <span>反转法线（Y 轴）</span>
                      </label>
                    )}
                  </div>
                ))}
            </div>
          )}

          <SettingRow label="颜色" value={materialState.color}>
            <div className="preview-color-row">
              <input
                type="color"
                className="preview-color-input"
                value={materialState.color}
                disabled={!materialEditMode && !embedded}
                onChange={(e) => onMaterialChange({ color: e.target.value })}
              />
              <input
                type="text"
                className="preview-color-text"
                value={materialState.color}
                spellCheck={false}
                disabled={!materialEditMode && !embedded}
                onChange={(e) => onMaterialChange({ color: e.target.value })}
              />
            </div>
          </SettingRow>

          <SettingRow label="不透明度" value={`${Math.round(materialState.opacity * 100)}%`}>
            <input
              type="range"
              className="preview-setting-slider"
              min={0}
              max={1}
              step={0.01}
              value={materialState.opacity}
              disabled={!materialEditMode && !embedded}
              onChange={(e) => onMaterialChange({ opacity: Number(e.target.value) })}
            />
          </SettingRow>

          {materialState.metalness != null && materialState.roughness != null && (
            <>
              <SettingRow
                label="金属度"
                value={`${Math.round(materialState.metalness * 100)}%`}
              >
                <input
                  type="range"
                  className="preview-setting-slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={materialState.metalness}
                  disabled={!materialEditMode && !embedded}
                  onChange={(e) => onMaterialChange({ metalness: Number(e.target.value) })}
                />
              </SettingRow>

              <SettingRow
                label="粗糙度"
                value={`${Math.round(materialState.roughness * 100)}%`}
              >
                <input
                  type="range"
                  className="preview-setting-slider"
                  min={0}
                  max={1}
                  step={0.01}
                  value={materialState.roughness}
                  disabled={!materialEditMode && !embedded}
                  onChange={(e) => onMaterialChange({ roughness: Number(e.target.value) })}
                />
              </SettingRow>
            </>
          )}

          {materialState.kind === 'phong' && materialState.shininess != null && (
            <SettingRow label="高光" value={Math.round(materialState.shininess).toString()}>
              <input
                type="range"
                className="preview-setting-slider"
                min={0}
                max={100}
                step={1}
                value={materialState.shininess}
                disabled={!materialEditMode && !embedded}
                onChange={(e) => onMaterialChange({ shininess: Number(e.target.value) })}
              />
            </SettingRow>
          )}

          {materialState.kind === 'other' && (
            <div className="material-edit-note">该材质类型仅支持颜色和透明度调整</div>
          )}

          <button
            type="button"
            className="preview-settings-reset"
            disabled={!materialEditMode && !embedded}
            onClick={onResetMaterial}
          >
            {hasMultipleMaterials ? '恢复当前材质' : '恢复该零部件材质'}
          </button>
          {materialResetHint && (
            <div className="material-edit-reset-hint">{materialResetHint}</div>
          )}
        </div>
      ) : (
        materialEditMode &&
        parts.length > 0 && <div className="material-edit-empty">请点击模型中的零部件</div>
      )}
    </div>
  )
}
