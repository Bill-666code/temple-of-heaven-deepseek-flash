/**
 * Hall.ts —— 祈年殿整座建筑的装配与爆炸层次定义
 * ------------------------------------------------------------------
 * 世界坐标：root 位于台基顶面（y = 6.6m），内部一切构件用"殿身局部坐标"。
 * 爆炸层次自下而上分层：台基 → 殿身 → 下檐斗拱 → 下檐 → 中层鼓身 →
 * 中檐斗拱 → 中檐 → 上层鼓身 → 上檐斗拱 → 攒尖顶 → 宝顶，
 * 每层抬升量为其下方各层抬升量之和，保证散开后仍能读出结构逻辑。
 */
import { Group, Object3D, Vector3 } from 'three';
import { PLATFORM } from '../config';
import type { ExplodeSpec } from '../animation/ExplodeController';
import { buildColumns } from './Columns';
import { buildDougong } from './Dougong';
import { buildFinial } from './Finial';
import type { MaterialLibrary } from './Materials';
import { buildOpenings } from './Openings';
import { buildPlatform } from './Platform';
import { buildAllRoofs } from './Roof';

const DOWN = new Vector3(0, -1, 0);
const UP = new Vector3(0, 1, 0);

function need(parent: Object3D, name: string): Object3D {
  const o = parent.getObjectByName(name);
  if (!o) throw new Error(`未找到构件: ${name}`);
  return o;
}

export interface HallBuild {
  root: Group;
  explode: ExplodeSpec[];
}

export function buildHall(mats: MaterialLibrary): HallBuild {
  const root = new Group();
  root.name = 'hall';
  root.position.y = PLATFORM.topY;
  const explode: ExplodeSpec[] = [];

  /* ---------------- 台基 ---------------- */
  const platform = buildPlatform(mats);
  root.add(platform.group);
  const tierDrop = [1.2, 4.8, 9.2];
  const railSpread = [5.6, 5.2, 4.8];
  platform.tiers.forEach((tier, i) => {
    explode.push({
      object: tier,
      mode: 'translate',
      dir: DOWN,
      amount: tierDrop[i],
      order: 0.0 + i * 0.06,
      label: `台基第 ${i + 1} 层`,
    });
    const posts = need(tier, `tier-${i}-posts`);
    const panels = need(tier, `tier-${i}-panels`);
    explode.push({
      object: posts,
      mode: 'instanced',
      amount: railSpread[i],
      order: 0.03 + i * 0.06,
      label: `望柱（第 ${i + 1} 层）`,
    });
    explode.push({
      object: panels,
      mode: 'instanced',
      amount: railSpread[i],
      order: 0.035 + i * 0.06,
      label: `栏板（第 ${i + 1} 层）`,
    });
    const stairPosts = tier.getObjectByName(`tier-${i}-stair-posts`);
    if (stairPosts) {
      explode.push({
        object: stairPosts,
        mode: 'radialScale',
        amount: 0.1,
        order: 0.05 + i * 0.06,
        label: `垂带抱鼓石（第 ${i + 1} 层）`,
      });
    }
  });

  /* ---------------- 柱网与室内 ---------------- */
  const columns = buildColumns(mats);
  root.add(columns.group);
  const colSpecs: { name: string; amount: number; order: number; label: string }[] = [
    { name: 'columns-eave', amount: 5.4, order: 0.3, label: '檐柱 ×12' },
    { name: 'columns-inner', amount: 2.6, order: 0.33, label: '金柱 ×12' },
    { name: 'columns-well', amount: 1.7, order: 0.35, label: '龙井柱 ×4' },
  ];
  colSpecs.forEach((c, i) => {
    explode.push({ object: need(columns.group, c.name), mode: 'instanced', amount: c.amount, order: c.order, label: c.label });
    const base = columns.group.getObjectByName(`column-bases-${['eave', 'inner', 'well'][i]}`);
    if (base) explode.push({ object: base, mode: 'instanced', amount: c.amount, order: c.order, durationScale: 1 });
  });

  /* ---------------- 门窗与墙体 ---------------- */
  const openings = buildOpenings(mats);
  root.add(openings.group);
  explode.push({
    object: need(openings.group, 'door-leaves'),
    mode: 'instanced',
    amount: 5.2,
    order: 0.26,
    label: '隔扇门 ×48',
  });
  explode.push({
    object: need(openings.group, 'door-frames'),
    mode: 'radialScale',
    amount: 0.62,
    order: 0.28,
    label: '门槛与走马板',
  });
  explode.push({
    object: openings.middle,
    mode: 'translate',
    dir: UP,
    amount: 9.0,
    order: 0.5,
    label: '中层鼓身',
  });
  explode.push({ object: need(openings.group, 'middle-wall'), mode: 'radialScale', amount: 0.42, order: 0.5 });
  explode.push({ object: need(openings.group, 'middle-windows'), mode: 'radialScale', amount: 0.42, order: 0.5 });
  explode.push({
    object: openings.upper,
    mode: 'translate',
    dir: UP,
    amount: 18.0,
    order: 0.66,
    label: '上层鼓身',
  });
  explode.push({ object: need(openings.group, 'upper-wall'), mode: 'radialScale', amount: 0.38, order: 0.66 });
  explode.push({ object: need(openings.group, 'upper-windows'), mode: 'radialScale', amount: 0.38, order: 0.66 });

  /* ---------------- 额枋彩画与斗拱 ---------------- */
  const dougong = buildDougong(mats);
  const dgLift = [2.5, 11.0, 20.0];
  const dgOrder = [0.38, 0.55, 0.7];
  dougong.groups.forEach((g, i) => {
    root.add(g);
    explode.push({
      object: g,
      mode: 'translate',
      dir: UP,
      amount: dgLift[i],
      order: dgOrder[i],
      label: `斗拱额枋（第 ${i + 1} 层檐）`,
    });
    const brackets = need(g, ['lower-brackets', 'middle-brackets', 'upper-brackets'][i]);
    explode.push({
      object: brackets,
      mode: 'instanced',
      amount: 3.4,
      order: dgOrder[i] + 0.015,
      label: `斗拱攒（第 ${i + 1} 层檐）`,
    });
    const arch = need(g, ['lower-architrave', 'middle-architrave', 'upper-architrave'][i]);
    explode.push({ object: arch, mode: 'radialScale', amount: 0.3, order: dgOrder[i] + 0.02 });
    const flat = need(g, ['lower-flat-beam', 'middle-flat-beam', 'upper-flat-beam'][i]);
    explode.push({ object: flat, mode: 'radialScale', amount: 0.3, order: dgOrder[i] + 0.02 });
  });

  /* ---------------- 三重檐与宝顶 ---------------- */
  const roofs = buildAllRoofs(mats);
  const roofLift = [6.5, 15.5, 24.5];
  const roofOrder = [0.44, 0.6, 0.74];
  roofs.forEach((r, i) => {
    root.add(r.group);
    explode.push({
      object: r.group,
      mode: 'translate',
      dir: UP,
      amount: roofLift[i],
      order: roofOrder[i],
      label: `${r.spec.label}屋面`,
    });
  });

  const finial = buildFinial(mats);
  finial.position.y = roofs[2].profile.outer[roofs[2].profile.outer.length - 1].y;
  root.add(finial);
  explode.push({ object: finial, mode: 'translate', dir: UP, amount: 29, order: 0.82, label: '鎏金宝顶' });

  return { root, explode };
}
