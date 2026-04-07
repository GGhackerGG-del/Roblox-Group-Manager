import { useEffect, useRef } from "react";

interface TiltOptions {
  maxTilt?: number;
  perspective?: number;
}

export function useTilt<T extends HTMLElement>(options: TiltOptions = {}) {
  const {
    maxTilt = 3,
    perspective = 1200,
  } = options;
  const ref = useRef<T>(null);
  const animRef = useRef<number>(0);
  const currentRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const activeRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.transformStyle = "preserve-3d";
    el.style.willChange = "transform";

    function applyTransform() {
      if (!el) return;
      el.style.transform = `perspective(${perspective}px) rotateX(${currentRef.current.x}deg) rotateY(${currentRef.current.y}deg)`;
    }

    function tick() {
      const dx = targetRef.current.x - currentRef.current.x;
      const dy = targetRef.current.y - currentRef.current.y;

      currentRef.current.x += dx * 0.08;
      currentRef.current.y += dy * 0.08;

      applyTransform();

      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current.x = targetRef.current.x;
        currentRef.current.y = targetRef.current.y;
        applyTransform();
        activeRef.current = false;
      }
    }

    function startAnimation() {
      if (!activeRef.current) {
        activeRef.current = true;
        animRef.current = requestAnimationFrame(tick);
      }
    }

    const handleMove = (e: MouseEvent) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const percentX = Math.max(-1, Math.min(1, (e.clientX - centerX) / (rect.width / 2)));
      const percentY = Math.max(-1, Math.min(1, (e.clientY - centerY) / (rect.height / 2)));
      targetRef.current = {
        x: -percentY * maxTilt,
        y: percentX * maxTilt,
      };
      startAnimation();
    };

    const handleLeave = () => {
      targetRef.current = { x: 0, y: 0 };
      startAnimation();
    };

    window.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", handleLeave);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
    };
  }, [maxTilt, perspective]);

  return ref;
}
