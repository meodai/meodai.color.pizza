import portrait from "./portrait.svg?url";
import elastiq from "./elastiq.svg?url";
import parrot from "./parrot.svg?url";
import { Poline, positionFunctions } from "poline";

const moving = matchMedia("(prefers-reduced-motion: no-preference)");
const hovering = matchMedia("(hover: hover) and (pointer: fine)");
const narrow = matchMedia("(max-width: 48.75em)");
const dark = matchMedia("(prefers-color-scheme: dark)");

const STIFFNESS = 70;
const DAMPING = 11;
const TRAIL_LIFE = 8000;
const GRAVITY = 2600;
const JUMP = 760;
const BOUNCE = 0.4;
const THIN = 0.2;
const WIDE = 1.1;
const SWELL = 0.8;
const NARROW = 0.1;
const CAP_HEIGHT = 1523 / 2000;
const UNWIND = 4;
const GROW = 3;
const HOLD = 1 - Math.log(2) / Math.log(GROW);
const KEEP = 20;
const LABEL = 256;
const BANDS = 8;
const STAMPS = { face: portrait, elastiq, parrot };
const INITIALS_SPAN = 0.6;
const WHITE = [1, 1, 1];
const BLACK = [0, 0, 0];
const POKEBALL = "#ff4100";
const SEAM = 0.07;
const RING = 0.035;
const TURN = 2000;
const TILT = 2400;
const FRICTION = 0.9;
const TOP_SPEED = 2500;
const BAND = 1.6;
const LIGHT = normalize([-0.45, -0.55, -0.7]);
const LAMP = 240;

const trail = document.createElement("canvas");
const sphere = document.createElement("canvas");
const shadow = document.createElement("div");
const handle = document.createElement("button");
const dock = document.createElement("div");
trail.className = "ball__trail";
sphere.className = "ball__sphere";
shadow.className = "ball__shadow";
handle.className = "ball__handle";
handle.type = "button";
handle.setAttribute("aria-label", "Play with the ball");
trail.setAttribute("aria-hidden", "true");
sphere.setAttribute("aria-hidden", "true");
shadow.setAttribute("aria-hidden", "true");
dock.className = "ball__dock";
dock.setAttribute("aria-hidden", "true");

const sphereGl = sphere.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
const trailGl = trail.getContext("webgl2", { antialias: false });

const number = (value) => value.toFixed(6);
const CLIP = `
  uniform vec2 view;
  uniform float scroll;
  vec4 toClip(vec2 at) {
    return vec4(at.x / view.x * 2.0 - 1.0, 1.0 - (at.y - scroll) / view.y * 2.0, 0.0, 1.0);
  }`;
const LETTER = `
  uniform float span;
  uniform float shrink;
  uniform bool stamped;
  uniform sampler2D label;
  float crown() {
    return sqrt(1.0 - span * span);
  }
  float letter(vec3 body) {
    if (!stamped || span <= 0.0 || body.z <= crown()) return 0.0;
    vec2 uv = vec2(body.x, -body.y) / span;
    if (abs(uv.x) >= 1.0 || abs(uv.y) >= 1.0) return 0.0;
    return texture(label, (uv + 1.0) / 2.0).a;
  }
  uniform sampler2D initials;
  uniform bool lettered;
  float initial(vec3 body) {
    if (!lettered || body.z >= 0.0) return 0.0;
    vec2 uv = body.xy * shrink / ${number(INITIALS_SPAN)};
    if (abs(uv.x) >= 1.0 || abs(uv.y) >= 1.0) return 0.0;
    return texture(initials, (uv + 1.0) / 2.0).a;
  }`;
const BALL_VERTEX = `#version 300 es
  in vec2 corner;
  out vec2 p;
  void main() {
    p = vec2(corner.x, -corner.y);
    gl_Position = vec4(corner, 0.0, 1.0);
  }`;
const BALL_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 p;
  out vec4 color;
  uniform mat3 orient;
  uniform vec3 paint;
  uniform vec3 bands[${BANDS}];
  uniform int count;
  uniform bool blended;
  uniform bool poke;
  uniform vec3 paper;
  uniform vec3 mark;
  uniform float extent;
  uniform vec3 lamp;
  uniform float spotlight;
  uniform float shading;
  ${LETTER}
  vec3 toGamma(vec3 v) {
    v = clamp(v, 0.0, 1.0);
    return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v));
  }
  void main() {
    float d = dot(p, p);
    if (d >= 1.0) discard;
    vec3 n = vec3(p, -sqrt(1.0 - d));
    vec3 body = orient * n;
    float t = acos(clamp(-body.z, -1.0, 1.0)) / ${number(Math.PI)};
    float rim = span > 0.0 ? acos(-crown()) / ${number(Math.PI)} : 1.0;
    vec3 tint = paint;
    if (count > 1 && blended) {
      float f = clamp(t / rim, 0.0, 1.0) * float(count - 1);
      int i = min(int(f), count - 2);
      tint = mix(bands[i], bands[i + 1], f - float(i));
    } else if (count > 0) {
      float f = t / rim * float(count);
      int i = min(int(f), count - 1);
      float edge = smoothstep(1.0 - fwidth(f), 1.0, fract(f));
      tint = mix(bands[i], bands[min(i + 1, count - 1)], edge);
    }
    if (poke) {
      float seam = fwidth(body.y);
      tint = mix(vec3(1.0), paint, smoothstep(-seam, seam, body.y));
      tint = mix(tint, vec3(0.0), 1.0 - smoothstep(${number(SEAM)} - seam, ${number(SEAM)} + seam, abs(body.y)));
    }
    if (span > 0.0) {
      if (poke) tint = mix(tint, vec3(0.0), smoothstep(rim - ${number(RING)} - 0.005, rim - ${number(RING)}, t));
      tint = mix(tint, poke && stamped ? vec3(1.0) : paper, smoothstep(rim - 0.005, rim, t));
    }
    tint = mix(tint, mark, letter(body));
    tint = mix(tint, vec3(1.0), initial(body));
    float light = mix(1.0, 0.4 + 0.75 * max(0.0, dot(n, lamp)), shading);
    float glow =
      pow(max(0.0, dot(n, normalize(lamp - vec3(0.0, 0.0, 1.0)))), 12.0) * 0.15 * spotlight +
      pow(1.0 + n.z, 3.0) * 0.15 * shading;
    float alpha = min(1.0, (1.0 - sqrt(d)) * extent * 1.5);
    color = vec4(toGamma(min(tint * light + glow, 1.0)) * alpha, alpha);
  }`;
const STROKE_VERTEX = `#version 300 es
  in vec2 corner;
  in vec2 center;
  in float size;
  in vec2 facing;
  in float cut;
  in vec3 tint;
  uniform float ratio;
  out vec2 local;
  flat out float vSize;
  flat out vec2 vFacing;
  flat out float vCut;
  flat out vec3 vTint;
  ${CLIP}
  void main() {
    local = corner * (size + 1.0 / ratio);
    vSize = size;
    vFacing = facing;
    vCut = cut;
    vTint = tint;
    gl_Position = toClip(center + local);
  }`;
const STROKE_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 local;
  flat in float vSize;
  flat in vec2 vFacing;
  flat in float vCut;
  flat in vec3 vTint;
  out vec4 color;
  uniform float ratio;
  void main() {
    float a = clamp((vSize - length(local)) * ratio + 0.5, 0.0, 1.0) *
      clamp((dot(local, vFacing) - vCut) * ratio + 0.5, 0.0, 1.0);
    if (a <= 0.0) discard;
    color = vec4(vTint * a, a);
  }`;
const SPRITE_VERTEX = `#version 300 es
  in vec2 corner;
  uniform vec4 rect;
  out vec2 uv;
  ${CLIP}
  void main() {
    uv = corner * 0.5 + 0.5;
    gl_Position = toClip(rect.xy + corner * rect.zw * 0.5);
  }`;
const SPRITE_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 uv;
  out vec4 color;
  uniform sampler2D sprite;
  uniform float alpha;
  void main() {
    color = texture(sprite, uv) * alpha;
  }`;
const PRINT_VERTEX = `#version 300 es
  in vec2 corner;
  in vec2 center;
  in vec2 direction;
  in float along;
  in float fade;
  in vec3 axisX;
  in vec3 axisY;
  in vec3 axisZ;
  in vec3 tint;
  uniform float across;
  out vec2 ground;
  flat out float vFade;
  flat out vec3 vX;
  flat out vec3 vY;
  flat out vec3 vZ;
  flat out vec3 vTint;
  ${CLIP}
  void main() {
    ground = direction * corner.x * along + vec2(-direction.y, direction.x) * corner.y * across;
    vFade = fade;
    vTint = tint;
    vX = axisX;
    vY = axisY;
    vZ = axisZ;
    gl_Position = toClip(center + ground);
  }`;
const PRINT_FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 ground;
  flat in float vFade;
  flat in vec3 vX;
  flat in vec3 vY;
  flat in vec3 vZ;
  flat in vec3 vTint;
  out vec4 color;
  uniform float radius;
  uniform bool cut;
  ${LETTER}
  void main() {
    vec2 at = ground / radius;
    vec3 body = normalize(vX * at.x + vY * at.y + vZ);
    float a = (cut ? initial(body) : letter(body)) * vFade;
    if (a <= 0.0) discard;
    color = vec4(vTint * a, a);
  }`;

let radius = 0;
let unit = 0;
let grow = 1;
let pixelRatio = 1;
let labels = {};
let initials = null;
let accent = [0, 0, 1];
let themed = [0, 0, 1];
let hue = 0;
let palettes = { poline: [], gradient: [] };
let panel = null;
let trigger = null;
let settings = {
  spotlight: false,
  shading: false,
  shadow: false,
  initials: true,
  stamp: "face",
  size: 25,
  color: "theme",
  custom: "#0000ee",
};
let paint = [0, 0, 0];
let paper = [1, 1, 1];
let mark = [0, 0, 0];
let ink = [0, 0, 0];
let drawn = null;
let band = null;
let bandWidth = 0;
let bandHeight = 0;
let pageHeight = 0;
let runout = 0;
let deepest = 0;
let nudge = 0;
let ball = null;
let floor = null;
const STROKE_SIZE = 9;
const PRINT_SIZE = 18;
let strokeData = new Float32Array(STROKE_SIZE * 4096);
let printData = new Float32Array(PRINT_SIZE * 1024);
let position = null;
let velocity = [0, 0];
let height = 0;
let lift = 0;
let spinning = [0, 0, 0];
let target = null;
let parked = true;
let armed = false;
let pointer = null;
let glare = null;
let lamp = LIGHT;
let rotation = [0, 0, 0, 1];
let points = [];
let splashes = [];
let prints = [];
let stroke = 0;
let tilt = null;
let level = null;
let last = 0;
let lastScroll = 0;
let depth = 0;
let plunge = 0;
let unwind = 0;
let swipe = null;
let fling = 0;
let glide = 0;
let flow = null;
let touching = false;
let wheeling = false;
let handed = false;
let frame = 0;

function normalize([x, y, z]) {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function toLinear(v) {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function toGamma(v) {
  v = Math.min(Math.max(v, 0), 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

function readColor(color) {
  const probe = document.createElement("i");
  probe.style.color = color;
  document.body.append(probe);
  const channels = getComputedStyle(probe)
    .color.match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  probe.remove();
  return channels.map((v) => toLinear(v / 255));
}

function stamps(gl) {
  return Object.fromEntries(Object.keys(STAMPS).map((name) => [name, texture(gl, labels[name])]));
}

async function buildLabel(name) {
  const image = new Image(LABEL, LABEL);
  image.src = STAMPS[name];
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LABEL;
  const context = canvas.getContext("2d");
  context.beginPath();
  context.arc(LABEL / 2, LABEL / 2, LABEL / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, 0, 0, LABEL, LABEL);
  labels[name] = canvas;
  ball.labels[name] = texture(sphereGl, canvas, ball.labels[name]);
  floor.labels[name] = texture(trailGl, canvas, floor.labels[name]);
  drawn = null;
  wake();
}

async function buildInitials() {
  const family = getComputedStyle(document.body).fontFamily;
  const size = LABEL * 0.6;
  await document.fonts.load(`${size}px ${family}`, "DA");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LABEL;
  const context = canvas.getContext("2d");
  context.font = `${size}px ${family}`;
  context.textAlign = "center";
  const { actualBoundingBoxAscent } = context.measureText("DA");
  context.fillText("DA", LABEL / 2, (LABEL + actualBoundingBoxAscent) / 2);
  initials = canvas;
  ball.initials = texture(sphereGl, initials, ball.initials);
  floor.initials = texture(trailGl, initials, floor.initials);
  drawn = null;
  wake();
}

function buildColors() {
  paper = readColor(getComputedStyle(document.body).backgroundColor);
  const root = getComputedStyle(document.documentElement);
  themed = readColor(root.getPropertyValue(dark.matches ? "--color-underline" : "--color-accent"));
  accent = chosen();
  mixPaint();
  drawn = null;
}

function chosen() {
  const { color, custom } = settings;
  if (color === "theme" || color === "cycle") return themed;
  if (color === "pokeball") return readColor(POKEBALL);
  if (color in palettes) return swatches()[0] ?? themed;
  return readColor(color === "custom" ? custom : color);
}

function swatches() {
  return palettes[settings.color] ?? [];
}

function shuffle(kind) {
  const shapes = Object.values(positionFunctions);
  const pick = () => shapes[Math.floor(Math.random() * shapes.length)];
  const palette = new Poline({
    numPoints: 2 + Math.floor(Math.random() * 4),
    positionFunctionX: pick(),
    positionFunctionY: pick(),
    positionFunctionZ: pick(),
  }).colorsCSS;
  palettes[kind] = palette.map(readColor);
  const step = 100 / palette.length;
  const stops =
    kind === "gradient"
      ? palette
      : palette.map((color, i) => `${color} ${i * step}% ${(i + 1) * step}%`);
  return `conic-gradient(${stops.join(", ")})`;
}

function contact() {
  if (settings.color === "pokeball") return pokeContact();
  const t = Math.acos(Math.min(Math.max(rotate(rotation, [0, 0, -1])[2], -1), 1)) / Math.PI;
  const top = Math.acos(rim()) / Math.PI;
  const colors = swatches();
  const n = colors.length;
  if (settings.color === "gradient") {
    const f = Math.min(Math.max((t / top) * (n - 1), 0), n - 1);
    const i = Math.min(Math.floor(f), n - 2);
    return colors[i].map((v, c) => v + (colors[i + 1][c] - v) * (f - i));
  }
  return colors[Math.max(Math.min(Math.floor((t / top) * n), n - 1), 0)];
}

function pokeContact() {
  const [, y, z] = rotate(conjugate(rotation), [0, 0, 1]);
  const t = Math.acos(Math.min(Math.max(-z, -1), 1)) / Math.PI;
  const top = Math.acos(rim()) / Math.PI;
  if (span() > 0 && t > top) return settings.stamp === "hole" ? paper : WHITE;
  if (span() > 0 && t > top - RING) return BLACK;
  if (Math.abs(y) < SEAM) return BLACK;
  return y > 0 ? paint : WHITE;
}

function toOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function cycle(distance) {
  if (distance <= 0 || settings.color !== "cycle") return;
  hue += distance * 0.0015;
  const [lightness, a, b] = toOklab(themed);
  const L = Math.min(lightness + 0.15, 0.9);
  const angle = Math.atan2(b, a) + hue;
  let chroma = Math.hypot(a, b);
  let color = fromOklab([L, chroma * Math.cos(angle), chroma * Math.sin(angle)]);
  while (color.some((v) => v < 0 || v > 1) && chroma > 0.001) {
    chroma *= 0.95;
    color = fromOklab([L, chroma * Math.cos(angle), chroma * Math.sin(angle)]);
  }
  accent = color.map((v) => Math.min(Math.max(v, 0), 1));
  mixPaint();
}

function darkest() {
  const light = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return swatches().reduce((a, b) => (light(b) < light(a) ? b : a));
}

function mixPaint() {
  paint = accent;
  ink = paint.map(toGamma);
  mark =
    settings.color === "pokeball"
      ? BLACK
      : settings.color in palettes
        ? darkest()
        : dark.matches
          ? WHITE
          : paint;
}

function compile(gl, vertex, fragment, names) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  const uniforms = Object.fromEntries(
    names.map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  return { program, uniforms };
}

function attributes(gl, program, buffer, layout, divisor) {
  const stride = layout.reduce((sum, [, size]) => sum + size, 0) * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  let offset = 0;
  for (const [name, size] of layout) {
    const location = gl.getAttribLocation(program, name);
    if (location >= 0) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, divisor);
    }
    offset += size * 4;
  }
}

function shape(gl, { program, uniforms }, layout = null) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  attributes(gl, program, corners, [["corner", 2]], 0);
  const instances = layout && gl.createBuffer();
  if (layout) attributes(gl, program, instances, layout, 1);
  gl.bindVertexArray(null);
  return { program, uniforms, vao, instances };
}

function texture(gl, source, previous = null) {
  if (previous) gl.deleteTexture(previous);
  const result = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, result);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }
  return result;
}

function setupBall() {
  const gl = sphereGl;
  ball = {
    ...shape(
      gl,
      compile(gl, BALL_VERTEX, BALL_FRAGMENT, [
        "orient",
        "paint",
        "bands",
        "count",
        "blended",
        "poke",
        "paper",
        "mark",
        "extent",
        "lamp",
        "spotlight",
        "shading",
        "span",
        "shrink",
        "stamped",
        "lettered",
        "label",
        "initials",
      ]),
    ),
    labels: stamps(gl),
    initials: texture(gl, initials),
  };
  drawn = null;
}

function setupFloor() {
  const gl = trailGl;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  floor = {
    strokes: shape(gl, compile(gl, STROKE_VERTEX, STROKE_FRAGMENT, ["view", "scroll", "ratio"]), [
      ["center", 2],
      ["size", 1],
      ["facing", 2],
      ["cut", 1],
      ["tint", 3],
    ]),
    sprites: shape(
      gl,
      compile(gl, SPRITE_VERTEX, SPRITE_FRAGMENT, ["view", "scroll", "rect", "sprite", "alpha"]),
    ),
    prints: shape(
      gl,
      compile(gl, PRINT_VERTEX, PRINT_FRAGMENT, [
        "view",
        "scroll",
        "across",
        "radius",
        "span",
        "shrink",
        "stamped",
        "lettered",
        "label",
        "initials",
        "cut",
      ]),
      [
        ["center", 2],
        ["direction", 2],
        ["along", 1],
        ["fade", 1],
        ["axisX", 3],
        ["axisY", 3],
        ["axisZ", 3],
        ["tint", 3],
      ],
    ),
    labels: stamps(gl),
    initials: texture(gl, initials),
  };
  splashes = splashes.filter((splash) => !splash.texture);
}

function rotate([qx, qy, qz, qw], [x, y, z]) {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + qy * tz - qz * ty,
    y + qw * ty + qz * tx - qx * tz,
    z + qw * tz + qx * ty - qy * tx,
  ];
}

function conjugate([x, y, z, w]) {
  return [-x, -y, -z, w];
}

function spin(q, [wx, wy, wz], dt) {
  const angle = Math.hypot(wx, wy, wz) * dt;
  if (angle < 1e-6) return q;
  const s = Math.sin(angle / 2) / (angle / dt);
  const [ax, ay, az, aw] = [wx * s, wy * s, wz * s, Math.cos(angle / 2)];
  const [bx, by, bz, bw] = q;
  const r = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  const length = Math.hypot(...r);
  return r.map((v) => v / length);
}

function shrink() {
  return grow ** HOLD;
}

function span() {
  const crown = 1 - settings.size / 50;
  return Math.sqrt(1 - crown * crown) / shrink();
}

function rim() {
  return -Math.sqrt(1 - span() ** 2);
}

function face(gl, holder, uniforms) {
  gl.uniform1f(uniforms.span, span());
  gl.uniform1f(uniforms.shrink, shrink());
  gl.uniform1i(uniforms.stamped, settings.stamp === "hole" ? 0 : 1);
  gl.uniform1i(uniforms.lettered, settings.initials ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, holder.labels[settings.stamp] ?? holder.labels.face);
  gl.uniform1i(uniforms.label, 0);
}

function inked() {
  return rotate(rotation, [0, 0, -1])[2] > rim() - 0.3;
}

function splash(angle, spread, count, reach, now) {
  const drops = Array.from({ length: count }, () => {
    const direction = angle + (Math.random() - 0.5) * spread;
    const distance = radius * 0.5 + unit * Math.random() * reach;
    const size = unit * (0.03 + Math.random() ** 2 * 0.14);
    const flick = Math.random() < 0.25;
    return {
      x: Math.cos(direction) * distance,
      y: Math.sin(direction) * distance,
      angle: direction,
      size,
      stretch: flick ? unit * (0.3 + Math.random() * 0.6) : size * (1 + Math.random() * 1.5),
      bend: (Math.random() - 0.5) * unit * 0.6,
      flick,
    };
  });
  const extent =
    Math.max(...drops.map((drop) => Math.hypot(drop.x, drop.y) + drop.stretch)) + radius;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.ceil(extent * 2 * pixelRatio);
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, extent * pixelRatio, extent * pixelRatio);
  context.fillStyle = context.strokeStyle = `rgb(${ink.map((v) => Math.round(v * 255)).join(" ")})`;
  context.lineCap = "round";
  for (const drop of drops) paintSplat(context, drop);
  splashes.push({
    x: position[0],
    y: position[1],
    texture: texture(trailGl, canvas),
    size: extent * 2,
    time: now,
  });
}

function paintSplat(context, { x, y, angle, size, stretch, bend, flick }) {
  context.beginPath();
  if (flick) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    context.lineWidth = size;
    context.moveTo(x, y);
    context.quadraticCurveTo(
      x + dx * stretch * 0.5 - dy * bend,
      y + dy * stretch * 0.5 + dx * bend,
      x + dx * stretch,
      y + dy * stretch,
    );
    context.stroke();
  } else {
    context.ellipse(x, y, stretch, size, angle, 0, Math.PI * 2);
    context.fill();
  }
}

function center(element) {
  const { top, bottom } = element.getBoundingClientRect();
  return (top + bottom) / 2;
}

function capCenter(element) {
  const probe = document.createElement("span");
  probe.style.cssText = "display: inline-block; inline-size: 0; block-size: 0";
  element.prepend(probe);
  const baseline = probe.getBoundingClientRect().bottom;
  probe.remove();
  return baseline - (parseFloat(getComputedStyle(element).fontSize) * CAP_HEIGHT) / 2;
}

function resize() {
  pixelRatio = devicePixelRatio || 1;
  unit = sphere.offsetWidth / 2;
  radius = unit * grow;
  pageHeight = Math.max(document.body.offsetHeight, innerHeight);
  runout = document.querySelector(".runout")?.offsetHeight ?? 0;
  const name = document.querySelector(".intro__name");
  nudge = name ? center(name) - capCenter(name) : 0;
  const width = document.documentElement.clientWidth;
  const height = Math.min(Math.ceil(innerHeight * BAND), pageHeight);
  if (width !== bandWidth || height !== bandHeight || trail.width !== width * pixelRatio) {
    bandWidth = width;
    bandHeight = height;
    trail.width = width * pixelRatio;
    trail.height = height * pixelRatio;
    trail.style.width = `${width}px`;
    trail.style.height = `${height}px`;
  }
  band = null;
  const size = Math.ceil(unit * 2 * GROW * pixelRatio);
  if (sphere.width !== size) {
    sphere.width = sphere.height = size;
    drawn = null;
  }
}

function lasting(item) {
  item.kept ??= runout > 0 && item.y >= pageHeight - runout;
  return item.kept && !item.expired;
}

function retire(now) {
  deepest = Math.max(deepest, position[1]);
  const limit = deepest - KEEP * innerHeight;
  for (const items of [points, splashes, prints]) {
    for (const item of items) {
      if (item.y >= limit || !lasting(item)) continue;
      item.expired = true;
      item.time = now;
    }
  }
}

function life(item, now) {
  return lasting(item) ? 1 : 1 - (now - item.time) / TRAIL_LIFE;
}

function swell() {
  grow = 1 + (GROW - 1) * (1 - Math.exp(-overrun() / (innerHeight * 4)));
  radius = unit * grow;
}

function camera() {
  return scrollY + depth;
}

function slide() {
  const view = camera();
  const limit = Math.max(0, pageHeight - bandHeight) + depth;
  if (band === null || band > limit || view < band || view + innerHeight > band + bandHeight) {
    const centered = view - (bandHeight - innerHeight) / 2;
    band = Math.min(Math.max(centered, 0), limit);
  }
  trail.style.translate = `0 ${band - depth}px`;
}

function axes() {
  const inverse = conjugate(rotation);
  return [
    ...rotate(inverse, [1, 0, 0]),
    ...rotate(inverse, [0, 1, 0]),
    ...rotate(inverse, [0, 0, 1]),
  ];
}

function paintSphere() {
  const key = `${rotation.join()},${height},${lamp.join()},${grow},${paint.join()},${swatches().join()},${JSON.stringify(settings)}`;
  if (key === drawn || sphereGl.isContextLost()) return;
  drawn = key;
  const gl = sphereGl;
  const { program, uniforms, vao } = ball;
  gl.viewport(0, 0, sphere.width, sphere.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.uniformMatrix3fv(uniforms.orient, false, axes());
  gl.uniform3fv(uniforms.paint, paint);
  const striped = swatches().slice(0, BANDS);
  gl.uniform1i(uniforms.count, striped.length);
  gl.uniform1i(uniforms.blended, settings.color === "gradient" ? 1 : 0);
  gl.uniform1i(uniforms.poke, settings.color === "pokeball" ? 1 : 0);
  if (striped.length) gl.uniform3fv(uniforms.bands, striped.flat());
  gl.uniform3fv(uniforms.paper, paper);
  gl.uniform3fv(uniforms.mark, mark);
  gl.uniform1f(uniforms.extent, sphere.width / 2);
  gl.uniform3fv(uniforms.lamp, lamp);
  gl.uniform1f(uniforms.spotlight, settings.spotlight ? 1 : 0);
  gl.uniform1f(uniforms.shading, settings.shading ? 1 : 0);
  face(gl, ball, uniforms);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, ball.initials);
  gl.uniform1i(uniforms.initials, 1);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function place() {
  const x = position[0];
  const y = position[1] - camera();
  const reach = shadow.offsetWidth / 2;
  sphere.style.translate = `${x - unit}px ${y - unit}px`;
  sphere.style.scale = (1 + height / 500) * grow;
  const slant = Math.min(1.6, Math.hypot(lamp[0], lamp[1]) / Math.max(-lamp[2], 0.01));
  const angle = Math.atan2(-lamp[1], -lamp[0]);
  const cast = slant * (radius * 0.55 + height * 0.7);
  shadow.style.translate = `${x - reach + Math.cos(angle) * cast}px ${y - reach + Math.sin(angle) * cast}px`;
  shadow.style.scale = (1 + (height * 0.25) / reach) * grow;
  shadow.style.opacity = 1 / (1 + height / 70);
  handle.style.translate = `${x - unit}px ${y - unit}px`;
  handle.style.scale = grow;
  const [dockX, dockY] = corner();
  const dockRadius = dock.offsetWidth / 2;
  dock.style.translate = `${dockX - dockRadius}px ${dockY - dockRadius}px`;
}

function stamp(count, x, y, size, [px, py, pz], edge, fade, color) {
  const reach = Math.hypot(px, py);
  const cut =
    reach < 1e-6 ? -Math.sign(pz - edge) * Infinity : (radius * fade * (edge - pz)) / reach;
  if (cut >= size) return count;
  if (strokeData.length < (count + 1) * STROKE_SIZE) {
    const grown = new Float32Array(strokeData.length * 2);
    grown.set(strokeData);
    strokeData = grown;
  }
  const whole = cut <= -size;
  strokeData.set(
    [x, y, size, whole ? 0 : px / reach, whole ? 0 : py / reach, whole ? -1e6 : cut, ...color],
    count * STROKE_SIZE,
  );
  return count + 1;
}

function press(now, ground) {
  const speed = Math.hypot(...ground);
  if (!initials || speed < 1) return;
  const orient = axes();
  const last = prints.at(-1);
  const travelled = last ? Math.hypot(position[0] - last.x, position[1] - last.y) : 0;
  const reach = travelled < radius ? travelled : Math.min(Math.max(1.5, speed / 60), 6);
  prints.push({
    x: position[0],
    y: position[1],
    direction: [ground[0] / speed, ground[1] / speed],
    along: reach / 2 + 0.4,
    orient,
    color: (orient[8] < 0 ? WHITE : mark).map(toGamma),
    time: now,
  });
}

function spline(p0, p1, p2, p3) {
  const knot = (a, b) => Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)) || 1e-4;
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const lerp = (u, v, from, to, t) => u + ((v - u) * (t - from)) / (to - from);
  const axis = (a, b, c, d, t) => {
    const ab = lerp(a, b, 0, t1, t);
    const bc = lerp(b, c, t1, t2, t);
    const cd = lerp(c, d, t2, t3, t);
    return lerp(lerp(ab, bc, 0, t2, t), lerp(bc, cd, t1, t3, t), t1, t2, t);
  };
  return (k) => {
    const t = t1 + (t2 - t1) * k;
    return [axis(p0.x, p1.x, p2.x, p3.x, t), axis(p0.y, p1.y, p2.y, p3.y, t)];
  };
}

function paintTrail(now) {
  const gl = trailGl;
  if (gl.isContextLost()) return;
  slide();
  gl.viewport(0, 0, trail.width, trail.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const top = band - radius * 2;
  const bottom = band + bandHeight + radius * 2;
  let count = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const from = a && !b.gap ? a : b;
    if (Math.max(from.y, b.y) < top || Math.min(from.y, b.y) > bottom) continue;
    const fade = Math.sqrt(life(b, now));
    const spacing = Math.max(1.5, Math.min(from.width, b.width) * fade * 0.25);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - from.x, b.y - from.y) / spacing));
    const next = points[i + 1];
    const curve = spline(
      (!from.gap && points[i - 2]) || from,
      from,
      b,
      next && !next.gap ? next : b,
    );
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      const mix = (u, v) => u + (v - u) * k;
      const [x, y] = curve(k);
      count = stamp(
        count,
        x,
        y,
        (mix(from.width, b.width) / 2) * fade,
        [mix(from.pole[0], b.pole[0]), mix(from.pole[1], b.pole[1]), mix(from.pole[2], b.pole[2])],
        mix(from.edge, b.edge),
        fade,
        b.color,
      );
    }
  }
  if (count) {
    const { program, uniforms, vao, instances } = floor.strokes;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, strokeData.subarray(0, count * STROKE_SIZE), gl.STREAM_DRAW);
    gl.uniform2f(uniforms.view, bandWidth, bandHeight);
    gl.uniform1f(uniforms.scroll, band);
    gl.uniform1f(uniforms.ratio, pixelRatio);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }
  const visible = splashes.filter(({ y, size }) => y + size / 2 >= top && y - size / 2 <= bottom);
  if (visible.length) {
    const { program, uniforms, vao } = floor.sprites;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(uniforms.view, bandWidth, bandHeight);
    gl.uniform1f(uniforms.scroll, band);
    gl.uniform1i(uniforms.sprite, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const item of visible) {
      const { x, y, texture, size } = item;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform4f(uniforms.rect, x, y, size, size);
      gl.uniform1f(uniforms.alpha, life(item, now));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  const pressed = prints.filter(({ y }) => y >= top && y <= bottom);
  if (pressed.length) {
    if (printData.length < pressed.length * PRINT_SIZE) {
      printData = new Float32Array(pressed.length * PRINT_SIZE * 2);
    }
    pressed.forEach((item, i) => {
      const { x, y, direction, along, orient, color } = item;
      printData.set(
        [x, y, ...direction, along, life(item, now), ...orient, ...color],
        i * PRINT_SIZE,
      );
    });
    const { program, uniforms, vao, instances } = floor.prints;
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      printData.subarray(0, pressed.length * PRINT_SIZE),
      gl.STREAM_DRAW,
    );
    gl.uniform2f(uniforms.view, bandWidth, bandHeight);
    gl.uniform1f(uniforms.scroll, band);
    gl.uniform1f(uniforms.across, radius * 0.9);
    gl.uniform1f(uniforms.radius, radius);
    face(gl, floor, uniforms);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, floor.initials);
    gl.uniform1i(uniforms.initials, 1);
    gl.uniform1i(uniforms.cut, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pressed.length);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(uniforms.cut, 1);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pressed.length);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}

function step(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  coast(dt);
  const climbing = plunge < depth;
  handed &&= glide > 0;
  depth =
    handed || Math.abs(plunge - depth) < 0.5
      ? plunge
      : depth + (plunge - depth) * (1 - Math.exp(-dt / 0.12));
  swell();
  const shift = camera() - lastScroll;
  lastScroll = camera();
  const jumped = parked && Math.abs(shift) > innerHeight / 2;
  const carried = parked && !jumped && dt > 0 ? shift / dt : 0;
  if (parked) position = [position[0], position[1] + shift];

  if (parked) target = corner(focused());
  else homing();
  const [tx, ty] = target ? [target[0], target[1] + camera()] : position;
  const grounded = height === 0;
  if (grounded) {
    const ax = tilt
      ? TILT * tilt[0] - FRICTION * velocity[0]
      : STIFFNESS * (tx - position[0]) - DAMPING * velocity[0];
    const ay = tilt
      ? TILT * tilt[1] - FRICTION * velocity[1]
      : STIFFNESS * (ty - position[1]) - DAMPING * velocity[1];
    velocity = [velocity[0] + ax * dt, velocity[1] + ay * dt];
    turn(ax, ay, now);
    spinning = [(velocity[1] + carried) / radius, -velocity[0] / radius, 0];
  } else {
    lift -= GRAVITY * dt;
    height += lift * dt;
    if (height <= 0) land(now);
  }
  const rush = Math.hypot(...velocity) / TOP_SPEED;
  if (rush > 1) velocity = velocity.map((v) => v / rush);
  position = [position[0] + velocity[0] * dt, position[1] + velocity[1] * dt];
  if (tilt) bounce(now);
  rotation = spin(rotation, spinning, dt);

  const ground = [velocity[0], velocity[1] + carried];
  const speed = Math.hypot(...ground);
  if (height === 0) cycle(speed * dt);
  if (settings.color in palettes || settings.color === "pokeball") ink = contact().map(toGamma);
  const previous = points.at(-1);
  if (height === 0) {
    const gap = jumped || !grounded || !previous || previous.lifted;
    const pace = climbing && unwind ? speed / unwind : speed;
    const goal = radius * (THIN + (WIDE - THIN) * Math.exp(-pace / 200));
    if (gap) stroke = radius * THIN;
    const ease = goal > stroke ? SWELL : NARROW;
    stroke += (goal - stroke) * (1 - Math.exp(-dt / ease));
    const width = stroke;
    if (gap || Math.hypot(position[0] - previous.x, position[1] - previous.y) > 1.5) {
      const pole = rotate(rotation, [0, 0, -1]);
      points.push({
        x: position[0],
        y: position[1],
        width,
        pole,
        edge: rim(),
        gap,
        color: ink,
        time: now,
      });
      press(now, ground);
    } else {
      previous.width = width;
      previous.time = now;
    }
  } else if (previous) {
    previous.lifted = true;
  }
  retire(now);
  let broken = false;
  points = points.filter((point) => {
    if (life(point, now) <= 0) return !(broken = true);
    if (broken) point.gap = true;
    broken = false;
    return true;
  });
  splashes = splashes.filter((splash) => {
    const alive = life(splash, now) > 0;
    if (!alive) trailGl.deleteTexture(splash.texture);
    return alive;
  });
  prints = prints.filter((print) => life(print, now) > 0);

  const lit = aim(dt);
  paintTrail(now);
  paintSphere();
  place();
  reveal();

  const resting =
    !glide &&
    depth === plunge &&
    lit &&
    height === 0 &&
    speed < 0.5 &&
    Math.hypot(tx - position[0], ty - position[1]) < 0.5;
  frame =
    resting && [points, splashes, prints].every((items) => items.every(lasting))
      ? 0
      : requestAnimationFrame(step);
}

function aim(dt) {
  const goal = glare
    ? normalize([(glare[0] - position[0]) / LAMP, (glare[1] - position[1] + camera()) / LAMP, -1])
    : LIGHT;
  if (Math.hypot(...goal.map((v, i) => v - lamp[i])) < 0.002) {
    lamp = goal;
    return true;
  }
  lamp = normalize(lamp.map((v, i) => v + (goal[i] - v) * (1 - Math.exp(-dt / 0.08))));
  return false;
}

function turn(ax, ay, now) {
  const speed = Math.hypot(...velocity);
  if (speed < 80 || !inked()) return;
  const along = (ax * velocity[0] + ay * velocity[1]) / speed;
  const px = ax - (along * velocity[0]) / speed;
  const py = ay - (along * velocity[1]) / speed;
  const lateral = Math.hypot(px, py);
  if (lateral < TURN || Math.random() > (lateral - TURN) / (TURN * 3)) return;
  const outward = Math.atan2(-py, -px);
  const forward = Math.atan2(velocity[1], velocity[0]);
  const angle = outward + Math.atan2(Math.sin(forward - outward), Math.cos(forward - outward)) / 3;
  splash(angle, 0.9, 1 + Math.floor(Math.random() * 3), 0.5 + speed / 700, now);
}

function bounce(now) {
  const walls = [
    [0, radius, innerWidth - radius],
    [1, camera() + radius, camera() + innerHeight - radius],
  ];
  for (const [axis, min, max] of walls) {
    const side = position[axis] < min ? -1 : position[axis] > max ? 1 : 0;
    if (!side) continue;
    position[axis] = side < 0 ? min : max;
    const impact = Math.abs(velocity[axis]);
    velocity[axis] = impact > 60 ? -velocity[axis] * 0.45 : 0;
    if (height === 0 && impact > 250 && inked()) {
      const angle = axis ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
      splash(angle, 2, Math.min(16, Math.round(impact / 60)), 0.3 + impact / 900, now);
    }
  }
}

function land(now) {
  height = 0;
  const impact = -lift;
  if (inked() && impact > 450) {
    const count = Math.min(28, Math.round(impact / 35));
    splash(0, Math.PI * 2, count, 0.4 + impact / 450, now);
  }
  lift = impact * BOUNCE > 120 ? impact * BOUNCE : 0;
  if (lift) height = 0.01;
  const rolling = [-spinning[1] * radius, spinning[0] * radius];
  velocity = velocity.map((v, i) => (5 * v + 2 * rolling[i]) / 7);
}

function jump(event) {
  if (parked || event.pointerType !== "mouse" || event.button !== 0) return;
  hop();
}

function twirl() {
  const speed = Math.hypot(...velocity);
  const roll = 1.2 + Math.random() * 0.8;
  const twist = (Math.random() < 0.5 ? -1 : 1) * (speed * 0.6 + lift * 0.4);
  spinning = [(velocity[1] / radius) * roll, (-velocity[0] / radius) * roll, twist / radius];
}

function hop(power = 1) {
  if (!position || height > 0) return;
  lift = JUMP * power;
  height = 0.01;
  twirl();
  wake();
}

function wake() {
  if (frame) return;
  last = performance.now();
  frame = requestAnimationFrame(step);
}

function focused() {
  if (narrow.matches) return null;
  if (hovering.matches) {
    if (!pointer) return null;
    return document
      .elementsFromPoint(...pointer)
      .map((element) => element.closest(".highlight"))
      .find(Boolean);
  }
  const line = document.documentElement.clientHeight / 2;
  return [...document.querySelectorAll(".highlight")].find((highlight) => {
    const { top, bottom } = highlight.getBoundingClientRect();
    return top <= line && bottom > line;
  });
}

function groove() {
  const intro = document.querySelector(".shell__intro")?.getBoundingClientRect();
  const content = document.querySelector(".shell__content")?.getBoundingClientRect();
  if (!intro || !content || content.left - intro.right < unit * 2) return null;
  return intro.right;
}

function corner(highlight = null) {
  const inset = unit * 2.5;
  const floor = document.documentElement.clientHeight - radius * 2.5;
  const lane = narrow.matches ? null : groove();
  const x = narrow.matches ? unit * 1.5 : (lane ?? document.documentElement.clientWidth - inset);
  if (highlight) {
    const { top, bottom } = highlight.getBoundingClientRect();
    return [x, Math.min(Math.max((top + bottom) / 2, inset), floor)];
  }
  const title =
    (lane || narrow.matches) && document.querySelector(".intro__name")?.getBoundingClientRect();
  const end = Math.max(1, pageHeight - runout - innerHeight);
  const scrolled = Math.min(Math.max(scrollY / end, 0), 1);
  const start = title
    ? (title.top + title.bottom) / 2 - nudge + (narrow.matches ? scrollY : 0)
    : floor;
  const y = start + (floor - start) * scrolled;
  return [ski(x), y + (innerHeight / 2 - y) * slope(innerHeight * 8)];
}

function slope(length = runout + innerHeight) {
  const t = Math.min(overrun() / length, 1);
  return t * t * (3 - 2 * t);
}

function overrun() {
  if (!runout) return 0;
  return Math.max(0, scrollY - (pageHeight - runout - innerHeight)) + depth;
}

function ski(x) {
  const run = overrun();
  if (!run) return x;
  const width = document.documentElement.clientWidth;
  const ease = slope();
  const noise =
    Math.sin(run / 310) * 0.5 + Math.sin(run / 170 + 1.7) * 0.3 + Math.sin(run / 530 + 4.1) * 0.2;
  const drift = x + (width / 2 - x) * ease + noise * width * 0.3 * ease;
  return Math.min(Math.max(drift, radius * 1.5), width - radius * 1.5);
}

function homing() {
  const [x, y] = corner();
  const distance = Math.hypot(position[0] - x, position[1] - camera() - y);
  if (distance > radius * 3) armed = true;
  if (armed && height === 0 && distance < radius * 0.5) park();
}

function park() {
  parked = true;
  armed = false;
  tilt = null;
  dock.classList.remove("ball__dock--visible");
  document.body.append(handle);
}

function release() {
  parked = false;
  handle.remove();
  dock.classList.add("ball__dock--visible");
  target = null;
  if (typeof window.DeviceOrientationEvent?.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => state === "granted" && listen())
      .catch(() => {});
  } else {
    listen();
  }
  hop();
}

function follow(event) {
  if (event.pointerType !== "mouse") return;
  glare = [event.clientX, event.clientY];
  if (parked) {
    pointer = [event.clientX, event.clientY];
    wake();
    return;
  }
  target = [event.clientX, event.clientY];
  wake();
}

function bottomed() {
  return scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
}

function shove(distance) {
  if (distance > 0) unwind = 0;
  else unwind ||= Math.max(UNWIND, plunge / (2 * innerHeight));
  plunge = Math.max(0, plunge + (distance < 0 ? distance * unwind : distance));
}

function travel(distance, event) {
  if (!bottomed() || (distance <= 0 && !depth)) return false;
  if (event.cancelable) event.preventDefault();
  shove(distance);
  wake();
  return true;
}

function coast(dt) {
  if (!glide) return;
  shove(glide * dt);
  glide *= Math.exp(-dt / 0.5);
  if (Math.abs(glide) < 20 || (glide < 0 && !plunge)) glide = 0;
}

function carry() {
  const now = performance.now();
  const dt = flow ? (now - flow.time) / 1000 : 0;
  const speed = dt > 0 && dt < 0.1 ? flow.speed * 0.2 + ((scrollY - flow.y) / dt) * 0.8 : 0;
  const arrived = bottomed() && flow && !flow.bottomed;
  const carried = arrived ? Math.max(flow.speed, speed) : 0;
  flow = { y: scrollY, time: now, speed, bottomed: bottomed() };
  if (plunge && runout && scrollY <= pageHeight - runout - innerHeight) {
    plunge = 0;
    glide = 0;
    unwind = 0;
  }
  const bounce = overrun() > 0 ? "none" : "";
  if (document.documentElement.style.overscrollBehaviorY !== bounce)
    document.documentElement.style.overscrollBehaviorY = bounce;
  if (!arrived || touching || wheeling || carried <= 0 || depth) return;
  glide = carried;
  handed = true;
  wake();
}

function dive(event) {
  wheeling = true;
  travel(event.deltaY * (event.deltaMode === 1 ? 16 : 1), event);
}

function drag(event) {
  touching = event.type !== "touchend";
  wheeling = false;
  if (event.type === "touchend") {
    glide = swipe && performance.now() - swipe.time < 100 ? fling : 0;
    if (glide) wake();
    return;
  }
  const y = event.touches[0].clientY;
  const time = performance.now();
  if (event.type === "touchstart") {
    glide = 0;
    fling = 0;
  } else if (swipe) {
    const moved = travel(swipe.y - y, event);
    const dt = Math.max(time - swipe.time, 1) / 1000;
    fling = moved ? fling * 0.2 + ((swipe.y - y) / dt) * 0.8 : 0;
  }
  swipe = { y, time };
}

function touch(event) {
  if (parked) return;
  if (tilt) {
    if (event.type === "touchstart") hop();
    return;
  }
  const { clientX, clientY } = event.touches[0];
  target = [clientX, clientY];
  wake();
}

function orient({ beta, gamma }) {
  if (parked || beta == null || gamma == null) return;
  level ??= beta;
  const x = Math.sin((gamma * Math.PI) / 180);
  const y = Math.sin(((beta - level) * Math.PI) / 180);
  const turned = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(turned);
  const sin = Math.sin(turned);
  tilt = [x * cos + y * sin, y * cos - x * sin].map((v) => (Math.abs(v) < 0.03 ? 0 : v));
  target = null;
  wake();
}

function listen() {
  addEventListener("deviceorientation", orient);
}

function apply() {
  shadow.hidden = !settings.shadow;
  hue = 0;
  accent = chosen();
  mixPaint();
  drawn = null;
  wake();
}

function configure() {
  const form = document.querySelector(".settings");
  if (!form) return;
  const { elements } = form;
  elements.spotlight.checked = settings.spotlight;
  elements.shading.checked = settings.shading;
  elements.shadow.checked = settings.shadow;
  elements.initials.checked = settings.initials;
  elements.stamp.value = settings.stamp;
  elements.size.value = settings.size;
  elements.custom.value = settings.custom;
  elements.color.value = settings.color;
  form.style.setProperty("--settings-custom", settings.custom);
  for (const kind of Object.keys(palettes))
    form.style.setProperty(`--settings-${kind}`, shuffle(kind));
  form.addEventListener("click", (event) => {
    const kind = event.target.value;
    if (!(kind in palettes)) return;
    form.style.setProperty(`--settings-${kind}`, shuffle(kind));
    if (settings.color === kind) apply();
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target === elements.custom) elements.color.value = "custom";
    if (event.target.value === "pokeball") {
      elements.size.value = 5;
      elements.initials.checked = false;
      elements.spotlight.checked = true;
      elements.shading.checked = true;
      elements.shadow.checked = true;
    }
    settings = {
      spotlight: elements.spotlight.checked,
      shading: elements.shading.checked,
      shadow: elements.shadow.checked,
      initials: elements.initials.checked,
      stamp: elements.stamp.value,
      size: Number(elements.size.value),
      color: elements.color.value,
      custom: elements.custom.value,
    };
    form.style.setProperty("--settings-custom", settings.custom);
    apply();
  });
  const stamp = form.querySelector(".settings__stamp");
  const names = { face: "David", elastiq: "Elastiq", parrot: "Parrot", hole: "Hole" };
  const order = Object.keys(names);
  const show = () => {
    const value = elements.stamp.value;
    stamp.style.setProperty("--stamp", STAMPS[value] ? `url("${STAMPS[value]}")` : "none");
    stamp.classList.toggle("settings__stamp--hole", value === "hole");
    stamp.setAttribute("aria-label", `${names[value]}, click for the next stamp`);
  };
  show();
  stamp.addEventListener("click", () => {
    elements.stamp.value = order[(order.indexOf(elements.stamp.value) + 1) % order.length];
    show();
    form.dispatchEvent(new Event("input"));
  });
  const rows = [...form.children];
  rows.forEach((row, i) => {
    row.style.setProperty("--rank", i);
    row.style.setProperty("--order", rows.length - 1 - i);
  });
  const dots = [...form.querySelectorAll(".settings__swatch")];
  dots.forEach((swatch, i) => swatch.style.setProperty("--step", i));
  form.hidden = false;
  trigger = document.querySelector(".settings-trigger");
  if (!trigger) return;
  panel = form;
  trigger.hidden = false;
  trigger.addEventListener("click", () => expand(!panel.classList.contains("settings--open")));
}

function expand(open) {
  panel.classList.toggle("settings--open", open);
  trigger.setAttribute("aria-expanded", open);
}

function reveal() {
  if (!trigger) return;
  const deep = overrun() > innerHeight * 0.75;
  if (deep === trigger.classList.contains("settings-trigger--visible")) return;
  trigger.classList.toggle("settings-trigger--visible", deep);
  if (!deep) expand(false);
}

function start() {
  if (!moving.matches || !sphereGl || !trailGl) return;
  (document.querySelector(".shell") ?? document.body).prepend(trail);
  document.body.append(dock, shadow, sphere, handle);
  resize();
  buildColors();
  setupBall();
  setupFloor();
  for (const name of Object.keys(STAMPS)) buildLabel(name);
  buildInitials();
  configure();
  apply();
  const [x, y] = corner(focused());
  position = [x, y + camera()];
  lastScroll = camera();
  paintSphere();
  place();
  wake();
  handle.addEventListener("click", release);
  handle.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse" && Math.hypot(...velocity) < 150) hop(0.55);
  });
  addEventListener("pointermove", follow, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    pointer = null;
    glare = null;
    wake();
  });
  addEventListener("pointerdown", jump, { passive: true });
  addEventListener("touchstart", touch, { passive: true });
  addEventListener("touchmove", touch, { passive: true });
  addEventListener("wheel", dive, { passive: false });
  addEventListener("touchstart", drag, { passive: true });
  addEventListener("touchmove", drag, { passive: false });
  addEventListener("touchend", drag, { passive: true });
  addEventListener(
    "scroll",
    () => {
      carry();
      if (position) wake();
    },
    { passive: true },
  );
  addEventListener("load", wake);
  document.fonts.ready.then(() => {
    resize();
    wake();
  });
  new ResizeObserver(() => {
    resize();
    wake();
  }).observe(document.body);
  addEventListener("resize", () => {
    resize();
    if (parked && height === 0) {
      const [x, y] = corner(focused());
      position = [x, y + camera()];
      velocity = [0, 0];
    }
    wake();
  });
  for (const target of [dark, window])
    target.addEventListener(target === dark ? "change" : "themechange", () => {
      buildColors();
      wake();
    });
  for (const [canvas, setup] of [
    [sphere, setupBall],
    [trail, setupFloor],
  ]) {
    canvas.addEventListener("webglcontextlost", (event) => event.preventDefault());
    canvas.addEventListener("webglcontextrestored", () => {
      setup();
      wake();
    });
  }
}

start();
