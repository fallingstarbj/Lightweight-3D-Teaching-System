import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { PreviewSettings } from '../utils/previewSettings'

/**
 * 预览画面调整（曝光/色温/对比度/饱和度）。
 *
 * 曝光通过 renderer.toneMappingExposure 生效（OutputPass 内做 ACES 映射）；
 * 色温/对比度/饱和度在色调映射前的线性空间用一个 ShaderPass 处理，
 * 最后由 OutputPass 完成色调映射与 sRGB 输出。
 */

const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTemperature: { value: 0 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    // -1（冷）~ 1（暖）
    uniform float uTemperature;
    uniform float uContrast;
    uniform float uSaturation;
    varying vec2 vUv;

    vec3 applyTemperature(vec3 c, float t) {
      float rGain = 1.0 + 0.18 * t;
      float gGain = 1.0 + 0.04 * t;
      float bGain = 1.0 - 0.18 * t;
      return max(c * vec3(rGain, gGain, bGain), vec3(0.0));
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = applyTemperature(texel.rgb, uTemperature);
      // 围绕线性空间中间灰 0.18 拉伸对比度
      c = max((c - 0.18) * uContrast + 0.18, vec3(0.0));
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);
      gl_FragColor = vec4(max(c, vec3(0.0)), texel.a);
    }
  `
}

export class PreviewColorGradeController {
  private readonly renderer: THREE.WebGLRenderer
  private readonly composer: EffectComposer
  private readonly gradePass: ShaderPass
  private disposed = false

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.renderer = renderer

    const size = renderer.getSize(new THREE.Vector2())
    const ratio = renderer.getPixelRatio()
    // 带 MSAA 的 HalfFloat 目标，避免后期处理丢失抗锯齿
    const target = new THREE.WebGLRenderTarget(
      Math.max(size.x * ratio, 1),
      Math.max(size.y * ratio, 1),
      { type: THREE.HalfFloatType, samples: 4 }
    )

    this.composer = new EffectComposer(renderer, target)
    this.composer.setPixelRatio(ratio)
    this.composer.setSize(size.x, size.y)
    this.composer.addPass(new RenderPass(scene, camera))
    this.gradePass = new ShaderPass(ColorGradeShader)
    this.composer.addPass(this.gradePass)
    this.composer.addPass(new OutputPass())
  }

  update(settings: PreviewSettings): void {
    if (this.disposed) return
    this.gradePass.uniforms.uTemperature.value = settings.colorTemperature / 100
    this.gradePass.uniforms.uContrast.value = settings.contrast
    this.gradePass.uniforms.uSaturation.value = settings.saturation
    this.renderer.toneMappingExposure = settings.exposure
  }

  setSize(width: number, height: number): void {
    if (this.disposed) return
    // 模型面数过高时运行中会降 pixelRatio，这里每次都同步一次
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(width, height)
  }

  render(): void {
    if (this.disposed) return
    this.composer.render()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.composer.dispose()
  }
}
