import * as THREE from 'three'

export interface GlassParams {
  enabled: boolean
  thickness: number
  color: string
  /** 透射比例，1 为完全通透，越小越接近不透明 */
  opacity: number
  ior: number
}

export const DEFAULT_GLASS_STATE: GlassParams = {
  enabled: false,
  thickness: 0.4,
  color: '#bfeee8',
  opacity: 0.95,
  ior: 1.5
}

export type FlowDirection = 'up' | 'down' | 'left' | 'right' | 'forward' | 'backward'

export const DEFAULT_FLOW_DIRECTION: FlowDirection = 'up'

const FLOW_AXES: Record<FlowDirection, THREE.Vector3> = {
  up: new THREE.Vector3(0, 1, 0),
  down: new THREE.Vector3(0, -1, 0),
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  forward: new THREE.Vector3(0, 0, 1),
  backward: new THREE.Vector3(0, 0, -1)
}

export function normalizeFlowDirection(value: unknown): FlowDirection {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FLOW_AXES, value)
    ? (value as FlowDirection)
    : DEFAULT_FLOW_DIRECTION
}

export function getFlowAxis(direction: FlowDirection): THREE.Vector3 {
  return FLOW_AXES[normalizeFlowDirection(direction)]
}

export interface MaterialFlowState {
  enabled: boolean
  color: string
  speed: number
  intensity: number
  direction: FlowDirection
}

export interface MaterialEffectsState {
  glass: boolean
  glassThickness: number
  glassColor: string
  glassOpacity: number
  glassIor: number
  flow: MaterialFlowState
}

export const DEFAULT_FLOW_STATE: MaterialFlowState = {
  enabled: false,
  color: '#00e5ff',
  speed: 1,
  intensity: 2,
  direction: DEFAULT_FLOW_DIRECTION
}

const FLOW_UNIFORMS_KEY = '__circuitFlowUniforms'
const FLOW_STATE_KEY = '__circuitFlowState'
const GLASS_STATE_KEY = '__glassState'

interface FlowUniforms {
  uFlowEnabled: { value: number }
  uFlowColor: { value: THREE.Color }
  uFlowSpeed: { value: number }
  uFlowTime: { value: number }
  uFlowIntensity: { value: number }
  uFlowScale: { value: number }
  uFlowAxis: { value: THREE.Vector3 }
  lastObjectId: number
}

function createFlowUniforms(): FlowUniforms {
  return {
    uFlowEnabled: { value: 0 },
    uFlowColor: { value: new THREE.Color(DEFAULT_FLOW_STATE.color) },
    uFlowSpeed: { value: DEFAULT_FLOW_STATE.speed },
    uFlowTime: { value: 0 },
    uFlowIntensity: { value: DEFAULT_FLOW_STATE.intensity },
    uFlowScale: { value: 1 },
    uFlowAxis: { value: new THREE.Vector3(0, 1, 0) },
    lastObjectId: -1
  }
}

function installFlowShader(material: THREE.Material, uniforms: FlowUniforms): void {
  const previousCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer)

    shader.uniforms.uFlowEnabled = uniforms.uFlowEnabled
    shader.uniforms.uFlowColor = uniforms.uFlowColor
    shader.uniforms.uFlowSpeed = uniforms.uFlowSpeed
    shader.uniforms.uFlowTime = uniforms.uFlowTime
    shader.uniforms.uFlowIntensity = uniforms.uFlowIntensity
    shader.uniforms.uFlowScale = uniforms.uFlowScale
    shader.uniforms.uFlowAxis = uniforms.uFlowAxis

    shader.vertexShader = `varying vec3 vFlowWorldPosition;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  vFlowWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    )

    shader.fragmentShader = `varying vec3 vFlowWorldPosition;
uniform float uFlowEnabled;
uniform vec3 uFlowColor;
uniform float uFlowSpeed;
uniform float uFlowTime;
uniform float uFlowIntensity;
uniform float uFlowScale;
uniform vec3 uFlowAxis;
${shader.fragmentShader}`.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  if (uFlowEnabled > 0.5) {
    float coord = dot(vFlowWorldPosition, uFlowAxis) * uFlowScale - uFlowTime * uFlowSpeed;
    float wave = 0.5 + 0.5 * sin(coord * 6.2831853);
    float pulse = pow(wave, 24.0);
    float fine = pow(0.5 + 0.5 * sin(coord * 6.2831853 * 6.0), 10.0) * 0.22;
    totalEmissiveRadiance += uFlowColor * (pulse * 2.2 + fine + 0.04) * uFlowIntensity;
  }`
    )
  }

  const previousRender = material.onBeforeRender
  material.onBeforeRender = (renderer, scene, camera, geometry, object, group) => {
    previousRender.call(material, renderer, scene, camera, geometry, object, group)
    uniforms.uFlowTime.value = performance.now() * 0.001
    if (uniforms.lastObjectId !== object.id) {
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      const axis = uniforms.uFlowAxis.value
      // 沿流动方向的包围盒跨度，保证不同轴向的光带密度一致
      const span = Math.abs(size.x * axis.x) + Math.abs(size.y * axis.y) + Math.abs(size.z * axis.z)
      uniforms.uFlowScale.value = 4 / Math.max(span, 1e-4)
      uniforms.lastObjectId = object.id
    }
  }

  material.needsUpdate = true
}

function getFlowUniforms(material: THREE.Material, create: boolean): FlowUniforms | null {
  const existing = material.userData[FLOW_UNIFORMS_KEY] as FlowUniforms | undefined
  if (existing) return existing
  if (!create) return null

  const uniforms = createFlowUniforms()
  material.userData[FLOW_UNIFORMS_KEY] = uniforms
  installFlowShader(material, uniforms)
  return uniforms
}

/** 玻璃质感：仅 MeshPhysicalMaterial 支持折射透射 */
export function applyGlassEffect(material: THREE.Material, params: GlassParams): void {
  if (!(material instanceof THREE.MeshPhysicalMaterial)) return

  const enabled = params.enabled
  material.userData[GLASS_STATE_KEY] = { ...params }
  material.transmission = enabled ? clampUnit(params.opacity) : 0
  material.ior = clampIor(params.ior)
  material.thickness = enabled ? clampThickness(params.thickness) : 0
  // 玻璃颜色通过体积衰减呈现，厚度越大颜色越明显
  material.attenuationColor.set(enabled ? params.color : '#ffffff')
  material.attenuationDistance = enabled ? clampThickness(params.thickness) * 4 : Infinity
  // 透射材质需要开启透明混合，否则玻璃不会取样背面场景
  material.transparent = enabled ? true : material.opacity < 1
  material.needsUpdate = true
}

function clampThickness(value: number): number {
  return Math.min(Math.max(value, 0.01), 4)
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0.01), 1)
}

function clampIor(value: number): number {
  return Math.min(Math.max(value, 1), 2.5)
}

/** 电路流动：在材质着色器里叠加沿指定方向循环流动的发光条纹 */
export function applyFlowEffect(material: THREE.Material, state: MaterialFlowState): void {
  const normalized: MaterialFlowState = {
    ...state,
    direction: normalizeFlowDirection(state.direction)
  }
  material.userData[FLOW_STATE_KEY] = normalized
  const uniforms = getFlowUniforms(material, normalized.enabled)
  if (!uniforms) return

  uniforms.uFlowEnabled.value = normalized.enabled ? 1 : 0
  uniforms.uFlowColor.value.set(normalized.color)
  uniforms.uFlowSpeed.value = Math.max(normalized.speed, 0.01)
  uniforms.uFlowIntensity.value = Math.max(normalized.intensity, 0)
  uniforms.uFlowAxis.value.copy(getFlowAxis(normalized.direction))
  // 方向变化后需要按新轴向重新计算跨度
  uniforms.lastObjectId = -1
}

export function readMaterialEffects(material: THREE.Material): MaterialEffectsState {
  const storedFlow = material.userData[FLOW_STATE_KEY] as Partial<MaterialFlowState> | undefined
  const storedGlass = material.userData[GLASS_STATE_KEY] as Partial<GlassParams> | undefined
  const isPhysical = material instanceof THREE.MeshPhysicalMaterial
  const glass = isPhysical && material.transmission > 0.01

  return {
    glass,
    glassThickness: clampThickness(
      storedGlass?.thickness ??
        (isPhysical && material.thickness > 0
          ? material.thickness
          : DEFAULT_GLASS_STATE.thickness)
    ),
    glassColor:
      storedGlass?.color ??
      (isPhysical && material.attenuationDistance !== Infinity
        ? `#${material.attenuationColor.getHexString()}`
        : DEFAULT_GLASS_STATE.color),
    glassOpacity: glass
      ? material.transmission
      : clampUnit(storedGlass?.opacity ?? DEFAULT_GLASS_STATE.opacity),
    glassIor: isPhysical ? material.ior : DEFAULT_GLASS_STATE.ior,
    flow: storedFlow
      ? {
          ...DEFAULT_FLOW_STATE,
          ...storedFlow,
          direction: normalizeFlowDirection(storedFlow.direction)
        }
      : { ...DEFAULT_FLOW_STATE }
  }
}
