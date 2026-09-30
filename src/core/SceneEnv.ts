/**
 * SceneEnv.ts —— 场景环境：天空、地面、绿化、光照、IBL
 * ------------------------------------------------------------------
 * · 天空：自定义 ShaderMaterial 大球，天顶—地平线渐变 + fbm 程序化云 + 太阳光晕；
 *   同一材质再经 PMREMGenerator 烘焙成环境贴图，为琉璃瓦与鎏金提供真实反射；
 * · 地面：圆形石铺广场 + 大尺度草地 + 广场外圈绿化带（InstancedMesh 树木，顶点色区分树干/树冠）；
 * · 光照：DirectionalLight（太阳，投影）+ HemisphereLight + AmbientLight，
 *   配合 ACES 电影级色调映射与线性雾。
 */
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  BackSide,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { SCENE_ENV } from '../config';
import { boxAt, latheFrom, mergeAll, mesh, uvTransform } from '../procgen/geometry';
import { Rng } from '../procgen/random';
import type { MaterialLibrary } from '../building/Materials';

const SKY = {
  zenith: '#1a5cc6',
  horizon: '#c9dff0',
  ground: '#9fabb4',
  sun: '#fff2d0',
} as const;

/* ------------------------------------------------------------------ */
/* 天空                                                                */
/* ------------------------------------------------------------------ */

const SKY_VERT = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uCloud;
varying vec3 vWorldDir;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + 7.3;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.40));
  sky = mix(sky, uGround, smoothstep(0.0, -0.14, dir.y));

  vec3 sd = normalize(uSunDir);
  float sdot = max(dot(dir, sd), 0.0);
  sky += uSunColor * pow(sdot, 1400.0) * 6.0;         // 日面
  sky += uSunColor * pow(sdot, 10.0) * 0.13;          // 大气辉光

  // 层积云：把方向投影到高空平面，避免地平线附近拉伸
  float h = max(dir.y, 0.03);
  vec2 uv = dir.xz / h * 0.19 + vec2(uTime * 0.0035, uTime * 0.0012);
  float n = fbm(uv * 1.35);
  float n2 = fbm(uv * 4.1 + 13.0);
  float cover = smoothstep(uCloud, uCloud + 0.3, n * 0.74 + n2 * 0.26);
  cover *= smoothstep(0.02, 0.2, dir.y);
  vec3 cloudCol = mix(vec3(0.72, 0.76, 0.82), vec3(1.0, 0.99, 0.96), n2);
  sky = mix(sky, cloudCol, cover * 0.9);

  gl_FragColor = vec4(sky, 1.0);
}
`;

export interface Environment {
  sky: Mesh;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  ambient: AmbientLight;
  envMap: Texture;
  ground: Group;
  update(elapsed: number): void;
}

export function createSkyMaterial(sunDir: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uZenith: { value: new Color(SKY.zenith) },
      uHorizon: { value: new Color(SKY.horizon) },
      uGround: { value: new Color(SKY.ground) },
      uSunColor: { value: new Color(SKY.sun) },
      uSunDir: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
      uCloud: { value: 0.58 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
}

/* ------------------------------------------------------------------ */
/* 树木（顶点色：树干褐色 / 树冠绿色，一次 draw call 一棵树）             */
/* ------------------------------------------------------------------ */

function paintVertexColor(geo: BufferGeometry, color: Color): BufferGeometry {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new BufferAttribute(arr, 3));
  return geo;
}

/** 顶点扰动：让程序化树冠摆脱"标准几何体"感 */
function jitter(geo: BufferGeometry, amount: number, seed: number, verticalBias = 0.4): void {
  const rng = new Rng(seed);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setXYZ(
      i,
      pos.getX(i) * (1 + rng.range(-amount, amount)),
      y + rng.range(-amount, amount) * verticalBias,
      pos.getZ(i) * (1 + rng.range(-amount, amount)),
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function cypressGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [paintVertexColor(new CylinderGeometry(0.16, 0.26, 1.6, 6), new Color('#4a3726'))];
  parts[0].translate(0, 0.8, 0);
  // 柏树：三层锥体层叠，形成天坛古柏那种层层收拢的剪影
  const tiers: [number, number, number, number][] = [
    // [半径, 高, 底部 y, 顶点 y]
    [1.05, 2.0, 1.0, 3.0],
    [0.82, 1.9, 2.3, 4.2],
    [0.52, 1.8, 3.6, 5.4],
  ];
  tiers.forEach(([r, h, y0, y1], i) => {
    const cone = new ConeGeometry(r, h, 7, 3);
    jitter(cone, 0.14, 991 + i * 37, 0.5);
    cone.translate(0, (y0 + y1) * 0.5, 0);
    parts.push(paintVertexColor(cone, new Color(i === 0 ? '#31502a' : i === 1 ? '#365831' : '#3d6136')));
  });
  return mergeAll(parts);
}

function broadleafGeometry(): BufferGeometry {
  const trunk = paintVertexColor(new CylinderGeometry(0.18, 0.3, 2.4, 6), new Color('#54402c'));
  trunk.translate(0, 1.2, 0);
  const canopy = new IcosahedronGeometry(1.9, 1);
  jitter(canopy, 0.2, 773);
  canopy.scale(1, 0.86, 1);
  canopy.translate(0, 3.4, 0);
  paintVertexColor(canopy, new Color('#527537'));
  const canopy2 = new IcosahedronGeometry(1.25, 1);
  jitter(canopy2, 0.22, 779);
  canopy2.translate(0.9, 4.3, -0.6);
  paintVertexColor(canopy2, new Color('#476a30'));
  return mergeAll([trunk, canopy, canopy2]);
}

/* ------------------------------------------------------------------ */
/* 环境搭建                                                            */
/* ------------------------------------------------------------------ */

export function buildEnvironment(
  scene: Scene,
  mats: MaterialLibrary,
  renderer: WebGLRenderer,
  camera: import('three').Camera,
): Environment {
  const sunDir = new Vector3(SCENE_ENV.sunDirection.x, SCENE_ENV.sunDirection.y, SCENE_ENV.sunDirection.z).normalize();

  /* --- 天空球 --- */
  const skyMat = createSkyMaterial(sunDir);
  const sky = new Mesh(new SphereGeometry(900, 48, 24), skyMat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  /* --- 环境贴图（由天空材质烘焙，供金属/琉璃反射） --- */
  const pmrem = new PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new Scene();
  const envSky = new Mesh(new SphereGeometry(500, 32, 16), skyMat);
  envScene.add(envSky);
  const envRT = pmrem.fromScene(envScene, 0, 1, 2000);
  envSky.geometry.dispose();
  pmrem.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.9;

  /* --- 雾 --- */
  scene.fog = new Fog(new Color(SKY.horizon).multiplyScalar(0.94), 190, 860);

  /* --- 地面 --- */
  const ground = new Group();
  ground.name = 'ground';

  const grass = new Mesh(new PlaneGeometry(SCENE_ENV.groundSize, SCENE_ENV.groundSize, 1, 1), mats.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.06;
  grass.receiveShadow = true;
  grass.name = 'grass';
  ground.add(grass);

  const plaza = new Mesh(new CircleGeometry(SCENE_ENV.plazaRadius, 160), mats.paving);
  plaza.rotation.x = -Math.PI / 2;
  plaza.receiveShadow = true;
  plaza.name = 'plaza';
  ground.add(plaza);

  // 四条甬路（御道）：自台基四向延伸，强化中轴与仪式感
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 2;
    const len = SCENE_ENV.plazaRadius - 26;
    const path = boxAt(13, 0.09, len, [0, 0.045, -(len * 0.5 + 26)]);
    uvTransform(path, 3, 22, 0, 0);
    path.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2 - a));
    const m = mesh(path, mats.pavingPath, `plaza-path-${i}`);
    m.castShadow = false;
    ground.add(m);
  }

  // 广场外圈石缘（低矮压边石，强化"坛"的边界）
  const curbProfile: Vector2[] = [
    new Vector2(SCENE_ENV.plazaRadius, -0.06),
    new Vector2(SCENE_ENV.plazaRadius, 0.22),
    new Vector2(SCENE_ENV.plazaRadius + 1.4, 0.22),
    new Vector2(SCENE_ENV.plazaRadius + 2.2, -0.06),
    new Vector2(SCENE_ENV.plazaRadius + 2.2, -0.2),
  ];
  const curb = mesh(latheFrom(curbProfile, 200), mats.marble, 'plaza-curb');
  curb.castShadow = false;
  ground.add(curb);

  scene.add(ground);

  /* --- 绿化带 --- */
  // 树木几何使用顶点色（树干褐 / 树冠绿），因此材质基色置白并开启 vertexColors
  const treeMat = mats.foliage;
  treeMat.color.setRGB(1, 1, 1);
  treeMat.vertexColors = true;
  treeMat.needsUpdate = true;

  const makeBelt = (
    geo: BufferGeometry,
    count: number,
    inner: number,
    outer: number,
    baseScale: number,
    seed: number,
  ): InstancedMesh => {
    const r = new Rng(seed);
    const inst = new InstancedMesh(geo, treeMat, count);
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const a = r.range(0, Math.PI * 2);
      const rad = inner + Math.pow(r.float(), 0.75) * (outer - inner);
      const sc = baseScale * r.range(0.62, 1.5);
      p.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      q.setFromAxisAngle(up, r.range(0, Math.PI * 2));
      s.set(sc * r.range(0.85, 1.15), sc, sc * r.range(0.85, 1.15));
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      // 每株树色彩轻微抖动，避免"一片同色"
      const tint = r.range(0.82, 1.16);
      inst.setColorAt(i, new Color(tint * r.range(0.94, 1.06), tint, tint * r.range(0.9, 1.04)));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = false;
    inst.name = `trees-${seed}`;
    inst.computeBoundingSphere();
    return inst;
  };

  // 远景柏树林 + 阔叶树点缀 + 近景古柏（三层绿化，衬托建筑）
  ground.add(makeBelt(cypressGeometry(), 240, SCENE_ENV.treeBelt.inner, SCENE_ENV.treeBelt.outer * 0.55, 1.5, 4242));
  ground.add(makeBelt(broadleafGeometry(), 90, SCENE_ENV.treeBelt.inner + 40, SCENE_ENV.treeBelt.outer * 0.5, 1.35, 8484));
  ground.add(makeBelt(cypressGeometry(), 46, SCENE_ENV.plazaRadius + 8, SCENE_ENV.plazaRadius + 26, 1.9, 1717));

  /* --- 光照 --- */
  const sun = new DirectionalLight(0xfff1dc, 2.7);
  sun.position.copy(sunDir).multiplyScalar(150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 60;
  sun.shadow.camera.far = 320;
  const S = 52;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 2.2;
  sun.target.position.set(0, 12, 0);
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new HemisphereLight(new Color('#c9dff5'), new Color('#9a8f7e'), 0.74);
  scene.add(hemi);
  const ambient = new AmbientLight(0xffffff, 0.14);
  scene.add(ambient);

  const update = (elapsed: number) => {
    skyMat.uniforms.uTime.value = elapsed;
    // 天空球跟随相机，避免视差导致地平线偏移
    sky.position.copy(camera.position);
  };

  return { sky, sun, hemi, ambient, envMap: envRT.texture, ground, update };
}
