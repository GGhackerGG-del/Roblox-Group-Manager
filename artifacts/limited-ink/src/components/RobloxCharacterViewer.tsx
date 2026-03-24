import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  clothingUrl: string | null;
  clothingType: "shirt" | "pants" | "tshirt" | "custom";
  skinColor?: string;
}

const TW = 585;
const TH = 559;
const SPX = TW / 14;
const SPY = TH / 4;

function sp(studs: number, axis: "x" | "y") {
  return Math.round(studs * (axis === "x" ? SPX : SPY));
}

interface Rect { x: number; y: number; w: number; h: number }
interface CrossFaces { left: Rect; front: Rect; right: Rect; back: Rect; top: Rect; bottom: Rect }

function crossLayout(sx: number, pw: number, ph: number, pd: number): CrossFaces {
  const dx = sp(pd, "x"), wx = sp(pw, "x"), dy = sp(pd, "y"), hy = sp(ph, "y");
  return {
    left:   { x: sx,                    y: dy,       w: dx, h: hy },
    front:  { x: sx + dx,               y: dy,       w: wx, h: hy },
    right:  { x: sx + dx + wx,          y: dy,       w: dx, h: hy },
    back:   { x: sx + dx + wx + dx,     y: dy,       w: wx, h: hy },
    top:    { x: sx + dx,               y: 0,        w: wx, h: dy },
    bottom: { x: sx + dx,               y: dy + hy,  w: wx, h: dy },
  };
}

const SHIRT = {
  rightArm: crossLayout(0, 1, 2, 1),
  torso:    crossLayout(sp(4, "x"), 2, 2, 1),
  leftArm:  crossLayout(sp(10, "x"), 1, 2, 1),
};
const PANTS = {
  rightLeg: crossLayout(0, 1, 2, 1),
  torso:    crossLayout(sp(4, "x"), 2, 2, 1),
  leftLeg:  crossLayout(sp(10, "x"), 1, 2, 1),
};

function extractTex(src: HTMLCanvasElement, r: Rect, res = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = res; c.height = res;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, res, res);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  return t;
}

function faceMats(src: HTMLCanvasElement, faces: CrossFaces): THREE.MeshStandardMaterial[] {
  const order: (keyof CrossFaces)[] = ["right", "left", "top", "bottom", "front", "back"];
  return order.map(f => {
    const tex = extractTex(src, faces[f]);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
  });
}

function tshirtFrontMat(src: HTMLCanvasElement): THREE.MeshStandardMaterial {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.05 });
}

function skinMat(c: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, metalness: 0.02 });
}
function skinArr(c: THREE.Color): THREE.MeshStandardMaterial[] {
  return Array.from({ length: 6 }, () => skinMat(c));
}

function disposeGroup(g: THREE.Group) {
  g.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m: THREE.MeshStandardMaterial) => { m.map?.dispose(); m.dispose(); });
      obj.geometry.dispose();
    }
  });
}

function createR6(
  tpl: HTMLCanvasElement | null,
  type: string,
  skin: THREE.Color
): THREE.Group {
  const g = new THREE.Group();
  const isShirt = type === "shirt";
  const isTshirt = type === "tshirt";
  const isPants = type === "pants";

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), skinArr(skin));
  head.position.set(0, 2.65, 0);
  head.castShadow = true;
  g.add(head);

  let torsoMats: THREE.MeshStandardMaterial[];
  if (tpl && isShirt) torsoMats = faceMats(tpl, SHIRT.torso);
  else if (tpl && isTshirt) { torsoMats = skinArr(skin); torsoMats[4] = tshirtFrontMat(tpl); }
  else if (tpl && isPants) torsoMats = faceMats(tpl, PANTS.torso);
  else torsoMats = skinArr(skin);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), torsoMats);
  torso.position.set(0, 1, 0);
  torso.castShadow = true;
  g.add(torso);

  const armGeo = new THREE.BoxGeometry(1, 2, 1);
  const rArmMats = (tpl && isShirt) ? faceMats(tpl, SHIRT.rightArm) : skinArr(skin);
  const rArm = new THREE.Mesh(armGeo, rArmMats);
  rArm.position.set(1.5, 1, 0);
  rArm.castShadow = true;
  g.add(rArm);

  const lArmMats = (tpl && isShirt) ? faceMats(tpl, SHIRT.leftArm) : skinArr(skin);
  const lArm = new THREE.Mesh(armGeo, lArmMats);
  lArm.position.set(-1.5, 1, 0);
  lArm.castShadow = true;
  g.add(lArm);

  const legGeo = new THREE.BoxGeometry(1, 2, 1);
  const defLeg = new THREE.Color(0x1a1a2e);
  const rLegMats = (tpl && isPants) ? faceMats(tpl, PANTS.rightLeg) : skinArr(defLeg);
  const rLeg = new THREE.Mesh(legGeo, rLegMats);
  rLeg.position.set(0.5, -1, 0);
  rLeg.castShadow = true;
  g.add(rLeg);

  const lLegMats = (tpl && isPants) ? faceMats(tpl, PANTS.leftLeg) : skinArr(defLeg);
  const lLeg = new THREE.Mesh(legGeo, lLegMats);
  lLeg.position.set(-0.5, -1, 0);
  lLeg.castShadow = true;
  g.add(lLeg);

  return g;
}

function loadImageToCanvas(url: string, forceSize?: { w: number; h: number }): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = forceSize?.w ?? img.naturalWidth;
      const h = forceSize?.h ?? img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function RobloxCharacterViewer({ clothingUrl, clothingType, skinColor = "#d4a574" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    character: THREE.Group | null;
    platform: THREE.Group;
    animId: number;
  } | null>(null);
  const dragRef = useRef({ down: false, px: 0, py: 0, rx: 0, ry: 0.15 });
  const verRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const w = el.clientWidth || 400;
    const h = el.clientHeight || 420;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x141414, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x141414, 10, 22);

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 2, 8);
    camera.lookAt(0, 0.5, 0);

    const ambLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambLight);

    const spot1 = new THREE.SpotLight(0xffffff, 12, 20, Math.PI / 5, 0.4, 1);
    spot1.position.set(3, 5, 4);
    spot1.castShadow = true;
    spot1.shadow.mapSize.set(1024, 1024);
    spot1.shadow.bias = -0.001;
    scene.add(spot1);

    const spot2 = new THREE.SpotLight(0xc8d8ff, 6, 18, Math.PI / 4, 0.5, 1);
    spot2.position.set(-3, 4, -3);
    scene.add(spot2);

    const rimLight = new THREE.PointLight(0x8899ff, 3, 12);
    rimLight.position.set(-2, 1, -4);
    scene.add(rimLight);

    const platform = new THREE.Group();

    const discGeo = new THREE.CylinderGeometry(2.8, 3.0, 0.15, 64);
    const discMat = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.5, metalness: 0.3 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.receiveShadow = true;
    disc.position.y = -2.08;
    platform.add(disc);

    const ringGeo = new THREE.TorusGeometry(2.9, 0.03, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.6 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -2.0;
    platform.add(ring);

    const grid = new THREE.GridHelper(30, 60, 0x222222, 0x1a1a1a);
    grid.position.y = -2.15;
    platform.add(grid);

    scene.add(platform);

    const onResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    stateRef.current = { renderer, scene, camera, character: null, platform, animId: 0 };

    const animate = () => {
      if (!stateRef.current) return;
      stateRef.current.animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      if (stateRef.current) {
        cancelAnimationFrame(stateRef.current.animId);
        if (stateRef.current.character) {
          stateRef.current.scene.remove(stateRef.current.character);
          disposeGroup(stateRef.current.character);
        }
        stateRef.current.renderer.dispose();
        renderer.domElement.parentElement?.removeChild(renderer.domElement);
        stateRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const ver = ++verRef.current;

    (async () => {
      const s = stateRef.current;
      if (!s) return;

      let tpl: HTMLCanvasElement | null = null;
      if (clothingUrl) {
        try {
          const force = (clothingType === "shirt" || clothingType === "pants")
            ? { w: TW, h: TH } : undefined;
          tpl = await loadImageToCanvas(clothingUrl, force);
        } catch { tpl = null; }
      }

      if (verRef.current !== ver || !stateRef.current) return;

      if (s.character) {
        s.scene.remove(s.character);
        disposeGroup(s.character);
        s.character = null;
      }

      const color = new THREE.Color(skinColor);
      const ch = createR6(tpl, clothingType, color);
      s.scene.add(ch);
      s.character = ch;

      const d = dragRef.current;
      ch.rotation.y = d.rx;
      ch.rotation.x = d.ry;
    })();
  }, [clothingUrl, clothingType, skinColor]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      dragRef.current.down = true;
      dragRef.current.px = e.clientX;
      dragRef.current.py = e.clientY;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.down || !stateRef.current?.character) return;
      const dx = e.clientX - dragRef.current.px;
      const dy = e.clientY - dragRef.current.py;
      dragRef.current.px = e.clientX;
      dragRef.current.py = e.clientY;
      dragRef.current.rx += dx * 0.008;
      dragRef.current.ry += dy * 0.004;
      dragRef.current.ry = Math.max(-0.4, Math.min(0.4, dragRef.current.ry));
      stateRef.current.character.rotation.y = dragRef.current.rx;
      stateRef.current.character.rotation.x = dragRef.current.ry;
    };
    const onUp = () => { dragRef.current.down = false; };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onUp);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing rounded-2xl overflow-hidden"
      style={{ touchAction: "none", minHeight: 420 }}
    />
  );
}
