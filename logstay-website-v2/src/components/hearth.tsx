"use client";

import { useEffect, useRef } from "react";

/**
 * Hearth — Atelier Noir's ambient WebGL aurora layer.
 *
 * A full-viewport fragment shader rendering slow-moving fractal Brownian
 * noise tinted by two uniforms: occupancy (0-1) and timeOfDay (0-24).
 *
 * - Raw WebGL, no Three.js. < 4kb shader source.
 * - 30fps fixed raf loop, decoupled from interaction loop.
 * - Pauses on document.hidden and prefers-reduced-motion.
 * - Max 8% luminance contribution — sets mood, never distracts.
 */
const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_occupancy;
uniform float u_timeOfDay;

// Hash + value noise (Ashima)
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Two-octave FBM with domain warp
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  // Slow drift
  float t = u_time * 0.04;

  // Domain warp
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) + t));
  float n = fbm(p + 2.0 * q);

  // Color mix: sage (low occupancy) → ember (high occupancy)
  vec3 sage = vec3(0.42, 0.48, 0.36);    // #6B7A5A normalized
  vec3 ember = vec3(0.76, 0.41, 0.24);   // #C2683D normalized
  vec3 emberLight = vec3(0.91, 0.60, 0.41); // #E89968

  vec3 col = mix(sage, ember, smoothstep(0.2, 0.85, n + u_occupancy * 0.4));
  col = mix(col, emberLight, smoothstep(0.6, 1.0, n) * 0.4);

  // Time-of-day dimming: late night hours (18-6) dim by up to 60%
  float dim = 1.0;
  if (u_timeOfDay >= 18.0 || u_timeOfDay < 6.0) {
    float nightT = u_timeOfDay >= 18.0
      ? (u_timeOfDay - 18.0) / 6.0
      : (6.0 - u_timeOfDay) / 6.0;
    dim = mix(1.0, 0.4, smoothstep(0.0, 1.0, nightT));
  }

  // Vignette to keep edges dark
  float vig = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5));

  // Clamp alpha to 0.16 max — more visible but still atmospheric
  float alpha = smoothstep(0.25, 0.85, n) * 0.16 * dim * vig;

  gl_FragColor = vec4(col, alpha);
}
`;

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Hearth shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function Hearth({
  occupancy = 0.45,
  timeOfDay = 14,
  className = "",
}: {
  occupancy?: number;
  timeOfDay?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const reduceMotionRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    reduceMotionRef.current = reduceMotion;
    if (reduceMotion) return; // Static — don't init WebGL

    const gl =
      (canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
      }) as WebGLRenderingContext) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext);
    if (!gl) return;

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(
        "Hearth program link error:",
        gl.getProgramInfoLog(program),
      );
      return;
    }
    gl.useProgram(program);

    // Full-viewport quad
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uOccupancy = gl.getUniformLocation(program, "u_occupancy");
    const uTimeOfDay = gl.getUniformLocation(program, "u_timeOfDay");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let isHidden = false;
    const onVisibility = () => {
      isHidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    // 30fps loop (decoupled from 60fps interaction)
    const FRAME_INTERVAL = 1000 / 30;
    let lastFrame = 0;

    const render = (now: number) => {
      rafRef.current = requestAnimationFrame(render);
      if (isHidden) return;
      if (now - lastFrame < FRAME_INTERVAL) return;
      lastFrame = now;

      const t = (now - start) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform1f(uOccupancy, occupancy);
      gl.uniform1f(uTimeOfDay, timeOfDay);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [occupancy, timeOfDay]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 h-full w-full ${className}`}
      style={{
        background:
          "radial-gradient(ellipse 70% 50% at 50% 30%, rgba(194,104,61,0.06), transparent 70%)",
      }}
    />
  );
}
