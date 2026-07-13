export interface ModelPreviewPrefs {
  fbxDefaultClipIndex: number
  fbxAutoPlay: boolean
  /** 部件树显示名覆盖，key 为 objectUuid */
  partDisplayNames?: Record<string, string>
  previewSettings?: {
    backgroundColor: string
    lightAzimuth: number
    lightElevation: number
    ambientIntensity: number
    keyLightIntensity: number
  }
}
