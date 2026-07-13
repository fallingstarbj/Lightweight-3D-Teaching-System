export type UvTextureWrapMode = 'repeat' | 'clamp' | 'mirror'

export interface UvBounds {
  minU: number
  maxU: number
  minV: number
  maxV: number
}

export interface MeshUvLayoutPayload {
  meshName: string
  materialIndex: number
  materialLabel: string
  hasUv: boolean
  /** 交错 [u, v, u, v, ...] */
  uv: number[]
  /** 三角面顶点索引；非 indexed 几何为空数组 */
  index: number[]
  triangleCount: number
  textureDataUrl?: string | null
  textureWrapS?: UvTextureWrapMode
  textureWrapT?: UvTextureWrapMode
  uvBounds?: UvBounds
}
