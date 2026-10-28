import portrait from "./portrait.svg?url";

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
const KEEP = 20;
const COVER = 0.75;
const EDGE = 1 - 2 * COVER;
const RIM = Math.acos(EDGE) / Math.PI;
const LABEL = 256;
const LABEL_SPAN = Math.sqrt(1 - EDGE * EDGE);
const INITIALS_SPAN = 0.6;
const WHITE = [1, 1, 1];
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
  uniform sampler2D label;
  float letter(vec3 body) {
    if (body.z <= ${number(-EDGE)}) return 0.0;
    vec2 uv = vec2(body.x, -body.y) / ${number(LABEL_SPAN)};
    if (abs(uv.x) >= 1.0 || abs(uv.y) >= 1.0) return 0.0;
    return texture(label, (uv + 1.0) / 2.0).a;
  }
  uniform sampler2D initials;
  float initial(vec3 body) {
    if (body.z >= 0.0) return 0.0;
    vec2 uv = body.xy / ${number(INITIALS_SPAN)};
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
  uniform vec3 paper;
  uniform vec3 mark;
  uniform float extent;
  uniform vec3 lamp;
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
    vec3 tint = mix(paint, paper, smoothstep(${number(RIM - 0.005)}, ${number(RIM)}, t));
    tint = mix(tint, mark, letter(body));
    tint = mix(tint, vec3(1.0), initial(body));
    float light = 0.4 + 0.75 * max(0.0, dot(n, lamp));
    float glow =
      pow(max(0.0, dot(n, normalize(lamp - vec3(0.0, 0.0, 1.0)))), 12.0) * 0.15 +
      pow(1.0 + n.z, 3.0) * 0.15;
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
let label = null;
let initials = null;
let accent = [0, 0, 1];
let base = [0, 0, 0];
let tone = 0;
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

async function buildLabel() {
  const image = new Image(LABEL, LABEL);
  image.src = portrait;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LABEL;
  const context = canvas.getContext("2d");
  context.beginPath();
  context.arc(LABEL / 2, LABEL / 2, LABEL / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(image, 0, 0, LABEL, LABEL);
  label = canvas;
  ball.label = texture(sphereGl, label, ball.label);
  floor.label = texture(trailGl, label, floor.label);
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
  accent = readColor(root.getPropertyValue(dark.matches ? "--color-underline" : "--color-accent"));
  base = readColor(root.getPropertyValue("--color-ink"));
  mixPaint();
  drawn = null;
}

function mixPaint() {
  paint = accent.map((v, i) => v + (base[i] - v) * tone);
  ink = paint.map(toGamma);
  mark = dark.matches ? WHITE : paint;
}

function blend(dt) {
  const root = document.documentElement;
  const goal = scrollY + innerHeight >= root.scrollHeight - 2 ? 1 : 0;
  if (tone === goal) return true;
  tone = Math.abs(goal - tone) < 0.01 ? goal : tone + (goal - tone) * (1 - Math.exp(-dt / 0.15));
  mixPaint();
  return false;
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
        "paper",
        "mark",
        "extent",
        "lamp",
        "label",
        "initials",
      ]),
    ),
    label: texture(gl, label),
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
    label: texture(gl, label),
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

function inked() {
  return rotate(rotation, [0, 0, -1])[2] > EDGE - 0.3;
}

function splash(angle, spread, count, reach, now) {
  const drops = Array.from({ length: count }, () => {
    const direction = angle + (Math.random() - 0.5) * spread;
    const distance = radius * (0.5 + Math.random() * reach);
    const size = radius * (0.03 + Math.random() ** 2 * 0.14);
    const flick = Math.random() < 0.25;
    return {
      x: Math.cos(direction) * distance,
      y: Math.sin(direction) * distance,
      angle: direction,
      size,
      stretch: flick ? radius * (0.3 + Math.random() * 0.6) : size * (1 + Math.random() * 1.5),
      bend: (Math.random() - 0.5) * radius * 0.6,
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

function lasting({ y, expired }) {
  return runout > 0 && !expired && y >= pageHeight - runout;
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
  const key = `${rotation.join()},${height},${lamp.join()},${tone}`;
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
  gl.uniform3fv(uniforms.paper, paper);
  gl.uniform3fv(uniforms.mark, mark);
  gl.uniform1f(uniforms.extent, sphere.width / 2);
  gl.uniform3fv(uniforms.lamp, lamp);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ball.label);
  gl.uniform1i(uniforms.label, 0);
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

function stamp(count, x, y, size, [px, py, pz], fade, color) {
  const reach = Math.hypot(px, py);
  const cut =
    reach < 1e-6 ? -Math.sign(pz - EDGE) * Infinity : (radius * fade * (EDGE - pz)) / reach;
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
  if (!label || !initials || speed < 1) return;
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
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      const mix = (u, v) => u + (v - u) * k;
      count = stamp(
        count,
        mix(from.x, b.x),
        mix(from.y, b.y),
        (mix(from.width, b.width) / 2) * fade,
        [mix(from.pole[0], b.pole[0]), mix(from.pole[1], b.pole[1]), mix(from.pole[2], b.pole[2])],
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
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, floor.label);
    gl.uniform1i(uniforms.label, 0);
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
  const climbing = plunge < depth;
  depth =
    Math.abs(plunge - depth) < 0.5 ? plunge : depth + (plunge - depth) * (1 - Math.exp(-dt / 0.12));
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
      points.push({ x: position[0], y: position[1], width, pole, gap, color: ink, time: now });
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
  const toned = blend(dt);
  paintTrail(now);
  paintSphere();
  place();

  const resting =
    depth === plunge &&
    lit &&
    toned &&
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
  const floor = document.documentElement.clientHeight - inset;
  const lane = narrow.matches ? null : groove();
  const x = narrow.matches ? unit * 1.25 : (lane ?? document.documentElement.clientWidth - inset);
  if (highlight) {
    const { top, bottom } = highlight.getBoundingClientRect();
    return [x, Math.min(Math.max((top + bottom) / 2, inset), floor)];
  }
  const title =
    (lane || narrow.matches) && document.querySelector(".intro__name")?.getBoundingClientRect();
  if (!title) return [x, floor];
  const end = Math.max(1, pageHeight - runout - innerHeight);
  const scrolled = Math.min(Math.max(scrollY / end, 0), 1);
  const start = (title.top + title.bottom) / 2 - nudge + (narrow.matches ? scrollY : 0);
  const y = start + (floor - start) * scrolled;
  if (!runout) return [x, y];
  const past = Math.min(Math.max((scrollY - end) / runout, 0), 1);
  return [ski(x), y + (innerHeight - runout / 2 - y) * past];
}

function overrun() {
  if (!runout) return 0;
  return Math.max(0, scrollY - (pageHeight - runout - innerHeight)) + depth;
}

function ski(x) {
  const run = overrun();
  if (!run) return x;
  const width = document.documentElement.clientWidth;
  const ease = Math.min(run / (runout + innerHeight), 1);
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

function travel(distance, event) {
  if (!bottomed() || (distance <= 0 && !depth)) return;
  if (event.cancelable) event.preventDefault();
  if (distance > 0) unwind = 0;
  else unwind ||= Math.max(UNWIND, plunge / (2 * innerHeight));
  plunge = Math.max(0, plunge + (distance < 0 ? distance * unwind : distance));
  wake();
}

function dive(event) {
  travel(event.deltaY * (event.deltaMode === 1 ? 16 : 1), event);
}

function drag(event) {
  const y = event.touches[0].clientY;
  if (event.type === "touchmove" && swipe !== null) travel(swipe - y, event);
  swipe = y;
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

function start() {
  if (!moving.matches || !sphereGl || !trailGl) return;
  (document.querySelector(".shell") ?? document.body).prepend(trail);
  document.body.append(dock, shadow, sphere, handle);
  resize();
  buildColors();
  setupBall();
  setupFloor();
  buildLabel();
  buildInitials();
  const [x, y] = corner(focused());
  position = [x, y + camera()];
  lastScroll = camera();
  paintSphere();
  place();
  wake();
  handle.addEventListener("click", release);
  handle.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") hop(0.55);
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
  addEventListener("scroll", () => position && wake(), { passive: true });
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
