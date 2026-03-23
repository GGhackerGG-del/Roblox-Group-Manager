import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  clothingUrl: string | null;
  clothingType: "shirt" | "pants" | "tshirt" | "custom";
  skinColor?: string;
}

const TEMPLATE_W = 585;
const TEMPLATE_H = 559;
const PX_PER_STUD_X = TEMPLATE_W / 14;
const PX_PER_STUD_Y = TEMPLATE_H / 4;

function studToPixel(studs: number, axis: "x" | "y") {
  return Math.round(studs * (axis === "x" ? PX_PER_STUD_X : PX_PER_STUD_Y));
}

interface FaceRegion { x: number; y: number; w: number; h: number }
interface BodyPartRegions { right: FaceRegion; left: FaceRegion; top: FaceRegion; bottom: FaceRegion; front: FaceRegion; back: FaceRegion }

function crossUnwrap(startX: number, partW: number, partH: number, partD: number): BodyPartRegions {
  const dX = studToPixel(partD, "x");
  const wX = studToPixel(partW, "x");
  const dY = studToPixel(partD, "y");
  const hY = studToPixel(partH, "y");
  return {
    left:   { x: startX,                  y: dY,       w: dX, h: hY },
    front:  { x: startX + dX,             y: dY,       w: wX, h: hY },
    right:  { x: startX + dX + wX,        y: dY,       w: dX, h: hY },
    back:   { x: startX + dX + wX + dX,   y: dY,       w: wX, h: hY },
    top:    { x: startX + dX,             y: 0,        w: wX, h: dY },
    bottom: { x: startX + dX,             y: dY + hY,  w: wX, h: dY },
  };
}

const SHIRT_REGIONS = {
  rightArm: crossUnwrap(0, 1, 2, 1),
  torso:    crossUnwrap(studToPixel(4, "x"), 2, 2, 1),
  leftArm:  crossUnwrap(studToPixel(10, "x"), 1, 2, 1),
};

const PANTS_REGIONS = {
  rightLeg: crossUnwrap(0, 1, 2, 1),
  torso:    crossUnwrap(studToPixel(4, "x"), 2, 2, 1),
  leftLeg:  crossUnwrap(studToPixel(10, "x"), 1, 2, 1),
};

function extractFaceTexture(source: HTMLCanvasElement, region: FaceRegion, res = 128): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = res; c.height = res;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, res, res);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFaceMaterials(templateCanvas: HTMLCanvasElement, regions: BodyPartRegions): THREE.MeshStandardMaterial[] {
  const order: (keyof BodyPartRegions)[] = ["right", "left", "top", "bottom", "front", "back"];
  return order.map((face) => {
    const tex = extractFaceTexture(templateCanvas, regions[face]);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
  });
}

function makeTshirtFrontMaterial(source: HTMLCanvasElement): THREE.MeshStandardMaterial {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
}

function skinMat(color: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });
}

function makeSkinMaterials(color: THREE.Color): THREE.MeshStandardMaterial[] {
  return Array.from({ length: 6 }, () => skinMat(color));
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m: THREE.MeshStandardMaterial) => {
          m.map?.dispose();
          m.dispose();
        });
      } else {
        (obj.material as THREE.MeshStandardMaterial).map?.dispose();
        obj.material.dispose();
      }
      obj.geometry.dispose();
    }
  });
}

function createR6Character(
  templateCanvas: HTMLCanvasElement | null,
  clothingType: string,
  skinColor: THREE.Color
): THREE.Group {
  const group = new THREE.Group();
  const isShirt = clothingType === "shirt";
  const isTshirt = clothingType === "tshirt";
  const isPants = clothingType === "pants";

  const headGeo = new THREE.BoxGeometry(2, 1.2, 1.2);
  const head = new THREE.Mesh(headGeo, makeSkinMaterials(skinColor));
  head.position.set(0, 2.6, 0);
  group.add(head);

  const torsoGeo = new THREE.BoxGeometry(2, 2, 1);
  let torsoMats: THREE.MeshStandardMaterial[];
  if (templateCanvas && isShirt) {
    torsoMats = makeFaceMaterials(templateCanvas, SHIRT_REGIONS.torso);
  } else if (templateCanvas && isTshirt) {
    torsoMats = makeSkinMaterials(skinColor);
    torsoMats[4] = makeTshirtFrontMaterial(templateCanvas);
  } else if (templateCanvas && isPants) {
    torsoMats = makeFaceMaterials(templateCanvas, PANTS_REGIONS.torso);
  } else {
    torsoMats = makeSkinMaterials(skinColor);
  }
  const torso = new THREE.Mesh(torsoGeo, torsoMats);
  torso.position.set(0, 1, 0);
  group.add(torso);

  const armGeo = new THREE.BoxGeometry(1, 2, 1);

  const rArmMats = (templateCanvas && isShirt)
    ? makeFaceMaterials(templateCanvas, SHIRT_REGIONS.rightArm)
    : makeSkinMaterials(skinColor);
  const rightArm = new THREE.Mesh(armGeo, rArmMats);
  rightArm.position.set(1.5, 1, 0);
  group.add(rightArm);

  const lArmMats = (templateCanvas && isShirt)
    ? makeFaceMaterials(templateCanvas, SHIRT_REGIONS.leftArm)
    : makeSkinMaterials(skinColor);
  const leftArm = new THREE.Mesh(armGeo, lArmMats);
  leftArm.position.set(-1.5, 1, 0);
  group.add(leftArm);

  const legGeo = new THREE.BoxGeometry(1, 2, 1);
  const defaultLegColor = new THREE.Color(0x1a1a2e);

  const rLegMats = (templateCanvas && isPants)
    ? makeFaceMaterials(templateCanvas, PANTS_REGIONS.rightLeg)
    : makeSkinMaterials(defaultLegColor);
  const rightLeg = new THREE.Mesh(legGeo, rLegMats);
  rightLeg.position.set(0.5, -1, 0);
  group.add(rightLeg);

  const lLegMats = (templateCanvas && isPants)
    ? makeFaceMaterials(templateCanvas, PANTS_REGIONS.leftLeg)
    : makeSkinMaterials(defaultLegColor);
  const leftLeg = new THREE.Mesh(legGeo, lLegMats);
  leftLeg.position.set(-0.5, -1, 0);
  group.add(leftLeg);

  return group;
}

function loadTemplateToCanvas(url: string, forceSize?: { w: number; h: number }): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = forceSize?.w ?? img.naturalWidth;
      const h = forceSize?.h ?? img.naturalHeight;
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function RobloxCharacterViewer({ clothingUrl, clothingType, skinColor = "#d4a574" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    character: THREE.Group | null;
    animationId: number;
    resizeHandler: (() => void) | null;
  } | null>(null);
  const mouseRef = useRef({ isDown: false, prevX: 0, prevY: 0, rotX: 0, rotY: 0.3 });
  const versionRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth || 400;
    const h = container.clientHeight || 420;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
    camera.position.set(0, 1.5, 10);
    camera.lookAt(0, 1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 5);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
    backLight.position.set(-3, 2, -3);
    scene.add(backLight);

    const onResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    sceneRef.current = { renderer, scene, camera, character: null, animationId: 0, resizeHandler: onResize };

    const animate = () => {
      if (!sceneRef.current) return;
      sceneRef.current.animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        if (sceneRef.current.character) {
          sceneRef.current.scene.remove(sceneRef.current.character);
          disposeGroup(sceneRef.current.character);
        }
        sceneRef.current.renderer.dispose();
        renderer.domElement.parentElement?.removeChild(renderer.domElement);
        sceneRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const ver = ++versionRef.current;

    (async () => {
      const s = sceneRef.current;
      if (!s) return;

      let templateCanvas: HTMLCanvasElement | null = null;
      if (clothingUrl) {
        try {
          const forceSize = (clothingType === "shirt" || clothingType === "pants")
            ? { w: TEMPLATE_W, h: TEMPLATE_H }
            : undefined;
          templateCanvas = await loadTemplateToCanvas(clothingUrl, forceSize);
        } catch {
          templateCanvas = null;
        }
      }

      if (versionRef.current !== ver || !sceneRef.current) return;

      if (s.character) {
        s.scene.remove(s.character);
        disposeGroup(s.character);
        s.character = null;
      }

      const color = new THREE.Color(skinColor);
      const character = createR6Character(templateCanvas, clothingType, color);
      s.scene.add(character);
      s.character = character;

      const m = mouseRef.current;
      character.rotation.y = m.rotX;
      character.rotation.x = m.rotY;
    })();
  }, [clothingUrl, clothingType, skinColor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      mouseRef.current.isDown = true;
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!mouseRef.current.isDown || !sceneRef.current?.character) return;
      const dx = e.clientX - mouseRef.current.prevX;
      const dy = e.clientY - mouseRef.current.prevY;
      mouseRef.current.prevX = e.clientX;
      mouseRef.current.prevY = e.clientY;
      mouseRef.current.rotX += dx * 0.01;
      mouseRef.current.rotY += dy * 0.005;
      mouseRef.current.rotY = Math.max(-0.5, Math.min(0.5, mouseRef.current.rotY));
      sceneRef.current.character.rotation.y = mouseRef.current.rotX;
      sceneRef.current.character.rotation.x = mouseRef.current.rotY;
    };

    const onPointerUp = () => { mouseRef.current.isDown = false; };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerUp);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointerleave", onPointerUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      style={{ touchAction: "none" }}
    />
  );
}
