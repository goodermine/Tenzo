/* Greyline - the mission facility.
   An objective-based level needs interiors, so the compound at the end of
   the street is authored as a floorplan: one character per 2m cell. The
   generator turns it into walls, a ceiling, doors, props, lights, patrol
   nodes and the markers the mission system hangs objectives off. */
import * as THREE from 'three';

export const CELL = 2.6;          /* metres per floorplan character */
export const WALL_H = 3.6;

/*  #  wall            .  floor           ' '  outside
    D  door            L  locked door     E  entry shutter (opens on approach)
    C  data console    A  alarm panel     V  server rack
    K  key card        W  weapon pickup   M  ammo crate
    T  crate / cover   G  guard post      P  player entry
    X  extraction pad  o  ceiling light                                      */
const PLAN = [
  '##############################',
  '#....#.........#....#........#',
  '#.W..#...T.....#.C..#...V....#',
  '#..o.D....o....D.o..#..oV....#',
  '#....#.........#....#...V....#',
  '#....#....G....#....D........#',
  '#######.########....#####D####',
  '#..........o........D...o....#',
  '#..T...G............#...T....#',
  '#........#####D#####.........#',
  '####D#####....o....#####.#####',
  '#....#....#...T....#....#....#',
  '#.A..D....#...G....D....D..K.#',
  '#..o.#....#........#..o.#....#',
  '#....#....#........#....#....#',
  '#######.###...#..#.######D####',
  '#.........o..#....#..........#',
  '#...T..G.....#....#...T...G..#',
  '#............#....#..........#',
  '###L##########....########L###',
  '#....#........E....#.........#',
  '#.X..#...o.........#....o....#',
  '#....#.............#.........#',
  '##############P###############'
];

function key(x, y) {
  return y * 1000 + x;
}

export class Facility {
  /** @param world the World instance whose buckets/boxes we append into */
  constructor(world, originZ) {
    this.world = world;
    this.w = Math.max(...PLAN.map(r => r.length));
    this.h = PLAN.length;
    this.rows = PLAN.map(r => r.padEnd(this.w, ' '));
    /* the plan's row 0 is the far (north) end; the entry sits at the last
       row and lines up with the street's centre line */
    this.originX = -(this.w * CELL) / 2;
    this.originZ = originZ - (this.h - 1) * CELL;

    this.doors = [];
    this.consoles = [];
    this.servers = [];
    this.alarms = [];
    this.keycards = [];
    this.pickups = [];
    this.guardPosts = [];
    this.lightSpots = [];
    this.extraction = null;
    this.entry = null;
  }

  at(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '#';
    return this.rows[y][x];
  }
  solidCell(x, y) {
    return this.at(x, y) === '#';
  }
  worldPos(x, y, height = 0) {
    return new THREE.Vector3(
      this.originX + x * CELL + CELL / 2,
      height,
      this.originZ + y * CELL + CELL / 2
    );
  }

  build() {
    const w = this.world;
    const halfW = (this.w * CELL) / 2;
    const cz = this.originZ + ((this.h - 1) * CELL) / 2;
    const depth = this.h * CELL;

    /* slab and ceiling for the whole footprint */
    w.box('concrete', 0, -0.15, cz, this.w * CELL, 0.3, depth, { uvScale: 0.32 });
    w.box('concrete', 0, WALL_H + 0.25, cz, this.w * CELL, 0.5, depth, { uvScale: 0.28 });

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.at(x, y);
        const p = this.worldPos(x, y);
        if (c === '#') {
          this.wall(x, y, p);
          continue;
        }
        if (c === ' ') continue;
        switch (c) {
          case 'D': this.door(x, y, p, false); break;
          case 'L': this.door(x, y, p, true); break;
          case 'E': this.door(x, y, p, false, true); break;
          case 'C': this.console_(p); break;
          case 'A': this.alarmPanel(p); break;
          case 'V': this.serverRack(p); break;
          case 'K': this.keycard(p); break;
          case 'W': this.pickups.push({ pos: p.clone(), kind: 'weapon' }); break;
          case 'M': this.pickups.push({ pos: p.clone(), kind: 'ammo' }); break;
          case 'T': this.crate(p); break;
          case 'G': this.guardPosts.push(p.clone()); break;
          case 'o': this.ceilingLight(p); break;
          case 'X': this.extraction = p.clone(); break;
          case 'P': this.entry = p.clone(); break;
          default: break;
        }
      }
    }
    this.trim();
    return this;
  }

  /* Interior walls are only built where they face a walkable cell, so the
     solid blocks of the plan do not fill the level with hidden geometry. */
  wall(x, y, p) {
    const w = this.world;
    const exposed = ['.', 'D', 'L', 'E', 'C', 'A', 'V', 'K', 'W', 'M', 'T', 'G', 'o', 'X', 'P'];
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      exposed.includes(this.at(x + dx, y + dy)));
    if (!near) return;
    w.box('concrete', p.x, WALL_H / 2, p.z, CELL, WALL_H, CELL, { uvScale: 0.52 });
    /* skirting and a pipe run break up the flat surfaces */
    if ((x + y) % 3 === 0) {
      w.box('metal', p.x, WALL_H - 0.45, p.z, CELL * 1.01, 0.16, CELL * 1.01,
        { solid: false, uvScale: 0.9 });
    }
  }

  door(x, y, p, locked, shutter = false) {
    /* doors run along the axis with walls either side */
    const horizontal = this.solidCell(x - 1, y) && this.solidCell(x + 1, y);
    const width = CELL * 0.98;
    const geo = new THREE.BoxGeometry(horizontal ? width : 0.16, WALL_H - 0.15, horizontal ? 0.16 : width);
    const mat = new THREE.MeshStandardMaterial({
      color: locked ? 0x6d5a3a : 0x53585c,
      roughness: 0.55,
      metalness: 0.65
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p.x, (WALL_H - 0.15) / 2, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.world.group.add(mesh);

    /* frame */
    const w = this.world;
    if (horizontal) {
      w.box('metal', p.x - CELL / 2, WALL_H / 2, p.z, 0.18, WALL_H, 0.4, { solid: false, uvScale: 1.2 });
      w.box('metal', p.x + CELL / 2, WALL_H / 2, p.z, 0.18, WALL_H, 0.4, { solid: false, uvScale: 1.2 });
    } else {
      w.box('metal', p.x, WALL_H / 2, p.z - CELL / 2, 0.4, WALL_H, 0.18, { solid: false, uvScale: 1.2 });
      w.box('metal', p.x, WALL_H / 2, p.z + CELL / 2, 0.4, WALL_H, 0.18, { solid: false, uvScale: 1.2 });
    }

    const door = {
      mesh,
      pos: p.clone(),
      horizontal,
      locked,
      shutter,
      open: 0,
      opening: false,
      closedY: (WALL_H - 0.15) / 2,
      box: new THREE.Box3()
    };
    this.updateDoorBox(door);
    this.doors.push(door);
    this.world.dynamicBoxes.push(door.box);
  }

  updateDoorBox(d) {
    const half = CELL * 0.49;
    const lift = d.open * (WALL_H - 0.1);
    d.mesh.position.y = d.closedY + lift;
    const y0 = Math.max(0, d.closedY - (WALL_H - 0.15) / 2 + lift);
    const y1 = y0 + (WALL_H - 0.15);
    if (d.open > 0.92) {
      d.box.makeEmpty();
      d.box.min.set(0, 1e6, 0);
      d.box.max.set(0, 1e6, 0);
      return;
    }
    if (d.horizontal) {
      d.box.min.set(d.pos.x - half, y0, d.pos.z - 0.14);
      d.box.max.set(d.pos.x + half, y1, d.pos.z + 0.14);
    } else {
      d.box.min.set(d.pos.x - 0.14, y0, d.pos.z - half);
      d.box.max.set(d.pos.x + 0.14, y1, d.pos.z + half);
    }
  }

  console_(p) {
    const w = this.world;
    w.box('metal', p.x, 0.5, p.z, 1.5, 1.0, 0.75, { uvScale: 0.9 });
    w.box('metal', p.x, 1.15, p.z - 0.1, 1.35, 0.35, 0.5, { solid: false, uvScale: 0.9 });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x0d2a2a, emissive: 0x2fd4c4, emissiveIntensity: 1.4, roughness: 0.35
      })
    );
    screen.position.set(p.x, 1.28, p.z + 0.28);
    screen.rotation.x = -0.42;
    this.world.group.add(screen);
    this.consoles.push({ pos: p.clone(), screen, done: false });
  }

  alarmPanel(p) {
    const w = this.world;
    w.box('metal', p.x, 1.35, p.z, 1.1, 1.5, 0.4, { uvScale: 0.9 });
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x300b0b, emissive: 0xff2a1e, emissiveIntensity: 2.2 })
    );
    light.position.set(p.x, 1.95, p.z + 0.22);
    this.world.group.add(light);
    this.alarms.push({ pos: p.clone(), light, done: false });
  }

  serverRack(p) {
    const w = this.world;
    w.box('metal', p.x, 1.05, p.z, 1.0, 2.1, 0.85, { uvScale: 0.8 });
    const leds = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 1.5),
      new THREE.MeshStandardMaterial({
        color: 0x08160f, emissive: 0x35c463, emissiveIntensity: 0.9, roughness: 0.5
      })
    );
    leds.position.set(p.x, 1.15, p.z + 0.44);
    this.world.group.add(leds);
    this.servers.push({ pos: p.clone(), leds, mined: false, destroyed: false });
  }

  keycard(p) {
    this.keycards.push({ pos: p.clone().setY(1.0), taken: false });
    this.world.box('metal', p.x, 0.45, p.z, 0.8, 0.9, 0.6, { uvScale: 1.0 });
  }

  crate(p) {
    const w = this.world;
    const h = 0.9 + ((p.x * 7 + p.z * 13) % 5) * 0.12;
    w.box('metal', p.x, h / 2, p.z, 1.25, h, 1.25, { uvScale: 0.9 });
    if (h > 1.2) w.box('metal', p.x + 0.2, h + 0.3, p.z - 0.1, 0.9, 0.6, 0.9, { uvScale: 0.9 });
  }

  ceilingLight(p) {
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.12, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0xf2f0e6, emissive: 0xfff2d4, emissiveIntensity: 2.6, roughness: 0.4
      })
    );
    housing.position.set(p.x, WALL_H - 0.18, p.z);
    this.world.group.add(housing);
    this.lightSpots.push({ pos: new THREE.Vector3(p.x, WALL_H - 0.5, p.z), housing });
  }

  /* The plan's outer ring is solid, so the compound needs a shell that reads
     from the street: a facade with the entry shutter in it. */
  trim() {
    const w = this.world;
    const halfW = (this.w * CELL) / 2;
    const zFront = this.originZ + (this.h - 0.5) * CELL;
    w.box('concrete', 0, WALL_H + 1.6, this.originZ + ((this.h - 1) * CELL) / 2,
      this.w * CELL + 1.2, 2.4, this.h * CELL + 1.2, { uvScale: 0.2 });
    for (const sx of [-1, 1]) {
      w.box('concrete', sx * (halfW + 1.2), 3.2, this.originZ + ((this.h - 1) * CELL) / 2,
        2.4, 7.4, this.h * CELL, { uvScale: 0.25 });
    }
    w.box('metal', 0, 4.6, zFront + 1.0, 9, 0.5, 1.6, { solid: false, uvScale: 0.6 });
  }
  /* --- navigation ------------------------------------------------------ */

  walkable(x, y) {
    const c = this.at(x, y);
    return c !== '#' && c !== ' ';
  }

  cellOf(pos) {
    return {
      x: Math.floor((pos.x - this.originX) / CELL),
      y: Math.floor((pos.z - this.originZ) / CELL)
    };
  }

  inside(pos) {
    const c = this.cellOf(pos);
    return c.x >= 0 && c.y >= 0 && c.x < this.w && c.y < this.h && this.walkable(c.x, c.y);
  }

  /* A* over the floorplan. Guards use it to come round corners instead of
     grinding along the wall between them and you. */
  path(from, to) {
    const a = this.cellOf(from);
    const b = this.cellOf(to);
    if (!this.walkable(a.x, a.y) || !this.walkable(b.x, b.y)) return null;
    if (a.x === b.x && a.y === b.y) return [];

    const startKey = key(a.x, a.y);
    const goalKey = key(b.x, b.y);
    const open = [{ k: startKey, x: a.x, y: a.y, g: 0, f: 0 }];
    const cameFrom = new Map();
    const gScore = new Map([[startKey, 0]]);
    const closed = new Set();
    const h = (x, y) => Math.abs(x - b.x) + Math.abs(y - b.y);
    let guard = 0;

    while (open.length && guard++ < 4000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur.k === goalKey) {
        const out = [];
        let k = cur.k;
        while (cameFrom.has(k)) {
          const [cx, cy] = [k % 1000, Math.floor(k / 1000)];
          out.push(this.worldPos(cx, cy));
          k = cameFrom.get(k);
        }
        return out.reverse();
      }
      closed.add(cur.k);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!this.walkable(nx, ny)) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const g = cur.g + 1;
        if (gScore.has(nk) && gScore.get(nk) <= g) continue;
        gScore.set(nk, g);
        cameFrom.set(nk, cur.k);
        const existing = open.find(o => o.k === nk);
        const f = g + h(nx, ny);
        if (existing) {
          existing.g = g;
          existing.f = f;
        } else {
          open.push({ k: nk, x: nx, y: ny, g, f });
        }
      }
    }
    return null;
  }

  /** Walkable cells at least `minDist` from `avoid`, for guard placement. */
  spawnCells(avoid, minDist) {
    const out = [];
    for (let y = 1; y < this.h - 1; y++) {
      for (let x = 1; x < this.w - 1; x++) {
        const c = this.at(x, y);
        if (c !== '.' && c !== 'G') continue;
        const p = this.worldPos(x, y);
        if (!avoid || p.distanceTo(avoid) > minDist) out.push(p);
      }
    }
    return out;
  }
}

/* Six point lights are recycled between the nearest fixtures, so a corridor
   full of lamps costs the same as a corridor with six. */
export class LightPool {
  constructor(scene, count = 6) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffeccc, 0, 13, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }
  update(spots, target) {
    const near = spots
      .map(s => ({ s, d: s.pos.distanceToSquared(target) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lights.length);
    this.lights.forEach((l, i) => {
      if (i < near.length && near[i].d < 900) {
        l.position.copy(near[i].s.pos);
        l.intensity = 11;
      } else {
        l.intensity = 0;
      }
    });
  }
}
