/**
 * CameraRig.ts —— 相机与轨道控制
 * ------------------------------------------------------------------
 * · OrbitControls：旋转 / 缩放 / 平移，带阻尼；
 * · 自动环绕：可开关的缓慢环绕展示（autoRotate）；
 * · 爆炸联动：整体拉远，保证散开后的构件仍在画面内；
 * · 一键复位：位置与目标点同时缓动回初始机位。
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const HOME_POS = new Vector3(46, 32, 64);
const HOME_TARGET = new Vector3(0, 18.5, 0);

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private appliedScale = 1;
  private appliedLift = 0;
  private tween: { t: number; dur: number; p0: Vector3; p1: Vector3; t0: Vector3; t1: Vector3 } | null = null;

  constructor(canvas: HTMLCanvasElement, aspect: number) {
    this.camera = new PerspectiveCamera(42, aspect, 0.5, 4000);
    this.camera.position.copy(HOME_POS);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(HOME_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.6;
    this.controls.minDistance = 22;
    this.controls.maxDistance = 460;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.492;
    this.controls.autoRotateSpeed = 0.8;
    this.controls.autoRotate = false;
    this.controls.update();
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
  }

  get isAutoRotating(): boolean {
    return this.controls.autoRotate;
  }

  /**
   * 爆炸联动：整体拉远并抬高注视点，保证散开后的构件仍在画面内。
   * 只按"增量"修改相机与目标，用户随时缩放/平移都不会被覆盖。
   */
  applyExplode(amount: number): void {
    const scale = 1 + 0.6 * amount;
    const lift = 8.5 * amount;
    if (Math.abs(scale - this.appliedScale) < 1e-4 && Math.abs(lift - this.appliedLift) < 1e-4) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.multiplyScalar(scale / this.appliedScale);
    this.controls.target.y += lift - this.appliedLift;
    this.camera.position.copy(this.controls.target).add(offset);
    this.appliedScale = scale;
    this.appliedLift = lift;
  }

  resetView(instant = false): void {
    const p0 = this.camera.position.clone();
    const t0 = this.controls.target.clone();
    if (instant) {
      this.camera.position.copy(HOME_POS);
      this.controls.target.copy(HOME_TARGET);
      this.appliedScale = 1;
      this.appliedLift = 0;
      this.controls.update();
      return;
    }
    this.tween = { t: 0, dur: 0.9, p0, p1: HOME_POS.clone(), t0, t1: HOME_TARGET.clone() };
    this.appliedScale = 1;
    this.appliedLift = 0;
  }

  update(dt: number): void {
    if (this.tween) {
      this.tween.t += dt;
      const k = Math.min(1, this.tween.t / this.tween.dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, e);
      this.controls.target.lerpVectors(this.tween.t0, this.tween.t1, e);
      if (k >= 1) this.tween = null;
    }
    // 传入 dt：自动环绕速度与帧率无关
    this.controls.update(dt);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
