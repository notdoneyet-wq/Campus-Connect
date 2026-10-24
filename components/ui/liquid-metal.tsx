"use client";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export type LiquidMetalVariant = "chrome" | "gold" | "mercury" | "oil";

export interface LiquidMetalProps {
  /** Content rendered above the metal surface, or clipped to it when `maskText` is on. */
  children?: ReactNode;
  className?: string;
  /** Strength of the domain warp. `0` is an almost flat sheet, `2` is molten. */
  distortion?: number;
  /** Clip the material to the shape of the text instead of filling the box. */
  maskText?: boolean;
  /** Freeze the surface on its current frame. */
  paused?: boolean;
  /** Let the pointer push the flow field around. */
  pointerInfluence?: boolean;
  /** Time multiplier for the flow. */
  speed?: number;
  variant?: LiquidMetalVariant;
}

const DEFAULT_SPEED = 1;
const DEFAULT_DISTORTION = 1;
const MAX_DPR = 2;
const MS_PER_SECOND = 1000;
const MAX_FRAME_DELTA = 1 / 20;
const POINTER_EASE = 0.08;
const POINTER_RANGE = 2;
const POINTER_CENTER = 0.5;
const TEXT_SWEEP_SECONDS = 9;
const TEXT_SWEEP_RANGE = 100;
const TEXT_POINTER_SHIFT = 18;
const TEXT_BACKGROUND_SIZE = "300% 100%";
const HALF = 0.5;

const VARIANT_INDEX: Record<LiquidMetalVariant, number> = {
  chrome: 0,
  gold: 1,
  mercury: 2,
  oil: 3,
};

/**
 * Static CSS stand-ins used when WebGL2 is unavailable or motion is reduced.
 * Hex is intentional here: these mirror the shader palettes, which are not
 * expressible with theme tokens.
 */
const FALLBACK_SURFACE: Record<LiquidMetalVariant, string> = {
  chrome:
    "conic-gradient(from 210deg at 50% 50%, #0c2d42, #3882a6, #d8f1fa, #1b5c7a, #bae6f7, #0f3852, #7cc2de, #0c2d42)",
  gold: "conic-gradient(from 210deg at 50% 50%, #3a2708, #b3832a, #f6dd8f, #8a5f16, #ffeeb5, #2a1c05, #d9a842, #3a2708)",
  mercury:
    "conic-gradient(from 200deg at 50% 50%, #0e3247, #4895b8, #e0f5fc, #1e6b8c, #f0faff, #134059, #8fd0eb, #0e3247)",
  oil: "conic-gradient(from 190deg at 50% 50%, #0c3547, #0e7490, #2dd4bf, #38bdf8, #bae6fd, #0284c7, #0d9488, #0c3547)",
};

const TEXT_SURFACE: Record<LiquidMetalVariant, string> = {
  chrome:
    "linear-gradient(100deg, #4a545f 0%, #e9eef5 16%, #8f9aa8 32%, #ffffff 46%, #6f7b8c 62%, #dfe6ef 78%, #3c454f 100%)",
  gold: "linear-gradient(100deg, #7a5410 0%, #f6dd8f 16%, #b3832a 32%, #fff6d0 46%, #8a5f16 62%, #edc862 78%, #6a460b 100%)",
  mercury:
    "linear-gradient(100deg, #55606d 0%, #dbe4ee 16%, #8f9aa8 32%, #ffffff 46%, #6b7684 62%, #cfd9e5 78%, #454f5b 100%)",
  oil: "linear-gradient(100deg, #3f7fd6 0%, #38d0c0 16%, #b9e05f 32%, #f2a03d 46%, #e0509b 62%, #6b3fd6 78%, #3f7fd6 100%)",
};

const VERTEX_SHADER = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uDistortion;
uniform float uVariant;
uniform vec2 uPointer;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p){
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++){
    value += amplitude * noise(p);
    p = turn * p;
    amplitude *= 0.5;
  }
  return value;
}

vec3 palette(float t, float v){
  if (v < 0.5) {
    // Coastal Chrome Blue
    vec3 dark = vec3(0.07, 0.25, 0.36);
    vec3 mid = vec3(0.22, 0.56, 0.72);
    vec3 bright = vec3(0.86, 0.96, 0.99);
    float band = 0.5 + 0.5 * sin(t * 12.0);
    return mix(mix(dark, mid, smoothstep(0.08, 0.58, band)), bright, smoothstep(0.62, 0.97, band));
  } else if (v < 1.5) {
    // Gold
    vec3 dark = vec3(0.22, 0.14, 0.03);
    vec3 mid = vec3(0.76, 0.56, 0.18);
    vec3 bright = vec3(1.0, 0.93, 0.68);
    float band = 0.5 + 0.5 * sin(t * 12.0 + 0.8);
    return mix(mix(dark, mid, smoothstep(0.1, 0.6, band)), bright, smoothstep(0.68, 0.98, band));
  } else if (v < 2.5) {
    // Coastal Mercury Mist Blue
    vec3 dark = vec3(0.10, 0.32, 0.44);
    vec3 mid = vec3(0.36, 0.68, 0.82);
    vec3 bright = vec3(0.92, 0.98, 1.0);
    float band = 0.5 + 0.5 * cos(t * 13.0);
    return mix(mix(dark, mid, smoothstep(0.12, 0.55, band)), bright, smoothstep(0.58, 0.95, band));
  } else {
    // Coastal Teal & Sky Blue Liquid Metal
    vec3 dark = vec3(0.06, 0.34, 0.46);
    vec3 mid = vec3(0.08, 0.58, 0.72);
    vec3 teal = vec3(0.16, 0.76, 0.78);
    vec3 bright = vec3(0.84, 0.95, 0.99);
    float wave1 = 0.5 + 0.5 * sin(t * 10.5);
    float wave2 = 0.5 + 0.5 * cos(t * 7.5 + 1.1);
    vec3 base = mix(dark, mid, smoothstep(0.1, 0.65, wave1));
    base = mix(base, teal, smoothstep(0.35, 0.8, wave2) * 0.55);
    return mix(base, bright, smoothstep(0.66, 0.98, wave1));
  }
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes.xy) / min(uRes.x, uRes.y);
  vec2 p = uv * 2.0 - uPointer * 0.42;
  float t = uTime * 0.32;

  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0) + t * 0.38),
    fbm(p + vec2(5.2, 1.3) - t * 0.28)
  );

  vec2 r = vec2(
    fbm(p + 3.0 * uDistortion * q + vec2(1.7, 9.2) + 0.22 * t),
    fbm(p + 3.0 * uDistortion * q + vec2(8.3, 2.8) - 0.18 * t)
  );

  float field = fbm(p + 2.6 * uDistortion * r);
  float spec = pow(clamp(dot(normalize(vec3(r.x - q.x, r.y - q.y, 0.38)), normalize(vec3(-uPointer.x, uPointer.y, 1.0))), 0.0, 1.0), 6.0);
  vec3 col = palette(field + 0.25 * length(q), uVariant);
  col += spec * 0.28;
  fragColor = vec4(col, 1.0);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function LiquidMetal({
  children,
  className,
  distortion = DEFAULT_DISTORTION,
  maskText = false,
  paused = false,
  pointerInfluence = true,
  speed = DEFAULT_SPEED,
  variant = "chrome",
}: LiquidMetalProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const [webglSupported, setWebglSupported] = useState(true);
  const [textPointerOffset, setTextPointerOffset] = useState(0);

  const shouldAnimate = !paused && !prefersReducedMotion;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pointerInfluence) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((event.clientX - rect.left) / rect.width - POINTER_CENTER) * POINTER_RANGE;
      const ny = ((event.clientY - rect.top) / rect.height - POINTER_CENTER) * POINTER_RANGE;
      pointerTargetRef.current = { x: nx, y: -ny };
      if (maskText) {
        setTextPointerOffset(nx * TEXT_POINTER_SHIFT);
      }
    };

    const handlePointerLeave = () => {
      pointerTargetRef.current = { x: 0, y: 0 };
      if (maskText) {
        setTextPointerOffset(0);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [pointerInfluence, maskText]);

  useEffect(() => {
    if (maskText || prefersReducedMotion) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });

    if (!gl) {
      setWebglSupported(false);
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();

    if (!vs || !fs || !program) {
      setWebglSupported(false);
      return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setWebglSupported(false);
      return;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aLoc = gl.getAttribLocation(program, "a");
    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uDistortion = gl.getUniformLocation(program, "uDistortion");
    const uVariant = gl.getUniformLocation(program, "uVariant");
    const uPointer = gl.getUniformLocation(program, "uPointer");

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let rafId = 0;
    let elapsed = 0;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min((now - lastTime) / MS_PER_SECOND, MAX_FRAME_DELTA);
      lastTime = now;

      if (shouldAnimate) {
        elapsed += dt * speed;
      }

      pointerCurrentRef.current.x +=
        (pointerTargetRef.current.x - pointerCurrentRef.current.x) * POINTER_EASE;
      pointerCurrentRef.current.y +=
        (pointerTargetRef.current.y - pointerCurrentRef.current.y) * POINTER_EASE;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aLoc);
      gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform1f(uDistortion, distortion);
      gl.uniform1f(uVariant, VARIANT_INDEX[variant]);
      gl.uniform2f(
        uPointer,
        pointerCurrentRef.current.x,
        pointerCurrentRef.current.y
      );

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (shouldAnimate) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [distortion, maskText, prefersReducedMotion, shouldAnimate, speed, variant]);

  if (maskText) {
    const sweepDuration = Math.max(1, TEXT_SWEEP_SECONDS / Math.max(0.2, speed));
    const textStyle: CSSProperties = {
      backgroundImage: TEXT_SURFACE[variant],
      backgroundSize: TEXT_BACKGROUND_SIZE,
      backgroundPosition: `${HALF * TEXT_SWEEP_RANGE + textPointerOffset}% 50%`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      animation: shouldAnimate
        ? `liquidMetalTextSweep ${sweepDuration}s ease-in-out infinite alternate`
        : undefined,
    };

    return (
      <div
        ref={containerRef}
        className={cn("relative inline-block select-none", className)}
      >
        <style>{`
          @keyframes liquidMetalTextSweep {
            0% { background-position: 0% 50%; }
            100% { background-position: 100% 50%; }
          }
        `}</style>
        <span className="block" style={textStyle}>
          {children}
        </span>
      </div>
    );
  }

  const showFallback = !webglSupported || Boolean(prefersReducedMotion);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden isolate", className)}
      style={
        showFallback
          ? { backgroundImage: FALLBACK_SURFACE[variant] }
          : undefined
      }
    >
      {!showFallback && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full block"
        />
      )}
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  );
}

export default LiquidMetal;
