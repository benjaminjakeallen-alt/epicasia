// Voxel mesher: turns a voxel function into one BufferGeometry with only the
// visible faces, per-face normals and vertex colours that carry baked ambient
// occlusion (the soft contact shading that makes voxel art read as "3D toy").
//
//   const b = new VoxBuilder();
//   b.add(nx, ny, nz, (x, y, z) => colourOrNull, { size, offset: [x, y, z] });
//   const geo = b.geometry();
//
// Colours are sRGB hex numbers. A voxel function returns null/0 for empty.
import * as THREE from 'three';

const AO = [0.52, 0.7, 0.86, 1];
const tmp = new THREE.Color();

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export { hash3 };

export class VoxBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }

  /**
   * Adds a voxel grid. opts.size = world size of one voxel (default 1);
   * opts.offset = world position of voxel (0,0,0)'s min corner;
   * opts.jitter = per-voxel brightness variation (default 0.035).
   */
  add(nx, ny, nz, fn, opts = {}) {
    const size = opts.size ?? 1;
    const off = opts.offset ?? [0, 0, 0];
    const jitter = opts.jitter ?? 0.035;
    const cells = new Int32Array(nx * ny * nz);
    const at = (x, y, z) => x + nx * (y + ny * z);
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const c = fn(x, y, z);
          if (c !== null && c !== undefined && c !== false) cells[at(x, y, z)] = (c & 0xffffff) + 1;
        }
    const occ = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? 0 : cells[at(x, y, z)] ? 1 : 0);
    const P = [0, 0, 0];
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const v = cells[at(x, y, z)];
          if (!v) continue;
          tmp.setHex(v - 1);
          const j = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter;
          const r = tmp.r * j, g = tmp.g * j, bl = tmp.b * j;
          const cell = [x, y, z];
          for (let d = 0; d < 3; d++)
            for (let s = -1; s <= 1; s += 2) {
              const n = [0, 0, 0];
              n[d] = s;
              if (occ(x + n[0], y + n[1], z + n[2])) continue;
              const u = (d + 1) % 3, w = (d + 2) % 3;
              const corners = s > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
              const base = this.pos.length / 3;
              const aos = [];
              for (const [du, dv] of corners) {
                // AO from the three voxels around this corner in the layer outside the face.
                const L = [x + n[0], y + n[1], z + n[2]];
                const su = [0, 0, 0], sv = [0, 0, 0];
                su[u] = du ? 1 : -1;
                sv[w] = dv ? 1 : -1;
                const s1 = occ(L[0] + su[0], L[1] + su[1], L[2] + su[2]);
                const s2 = occ(L[0] + sv[0], L[1] + sv[1], L[2] + sv[2]);
                const c3 = occ(L[0] + su[0] + sv[0], L[1] + su[1] + sv[1], L[2] + su[2] + sv[2]);
                const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + c3);
                aos.push(ao);
                P[d] = cell[d] + (s > 0 ? 1 : 0);
                P[u] = cell[u] + du;
                P[w] = cell[w] + dv;
                this.pos.push(off[0] + P[0] * size, off[1] + P[1] * size, off[2] + P[2] * size);
                this.nor.push(n[0], n[1], n[2]);
                const k = AO[ao];
                this.col.push(r * k, g * k, bl * k);
              }
              if (aos[0] + aos[2] >= aos[1] + aos[3]) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
              else this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            }
        }
    return this;
  }

  /** Adds a solid box of one colour (world units), e.g. for simple props. */
  box(x0, y0, z0, w, h, d, color, size = 1) {
    return this.add(Math.round(w / size), Math.round(h / size), Math.round(d / size), () => color, { size, offset: [x0, y0, z0] });
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** One voxel grid → geometry, translated so `pivot` (in voxels) sits at the origin. */
export function vox(nx, ny, nz, fn, size = 1, pivot = [nx / 2, 0, nz / 2], jitter) {
  return new VoxBuilder()
    .add(nx, ny, nz, fn, { size, offset: [-pivot[0] * size, -pivot[1] * size, -pivot[2] * size], jitter })
    .geometry();
}
