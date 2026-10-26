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
const RAMP = 2048;
const COVER = 0.75;
const EDGE = 1 - 2 * COVER;
const RIM = Math.acos(EDGE) / Math.PI;
const LABEL = 128;
const LABEL_SPAN = 0.6;
const TURN = 2000;
const TILT = 2400;
const FRICTION = 0.9;
const TOP_SPEED = 2500;
const LIGHT = normalize([-0.45, -0.55, -0.7]);
const HALF = normalize([LIGHT[0], LIGHT[1], LIGHT[2] - 1]);

const trail = document.createElement("canvas");
const sphere = document.createElement("canvas");
const shadow = document.createElement("div");
const handle = document.createElement("button");
const dock = document.createElement("div");
const icon = document.createElement("canvas");
icon.width = icon.height = 64;
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

const trailContext = trail.getContext("2d");
const sphereContext = sphere.getContext("2d");

let radius = 0;
let pixelRatio = 1;
let ramp = [];
let label = null;
let lettering = [0, 0, 0];
let image = null;
let pixels = [];
let drawn = null;
const GAMMA = 4096;
const gamma = Uint8ClampedArray.from({ length: GAMMA + 1 }, (_, i) => toGamma(i / GAMMA) * 255);
let position = null;
let velocity = [0, 0];
let height = 0;
let lift = 0;
let spinning = [0, 0, 0];
let target = null;
let parked = true;
let armed = false;
let pointer = null;
let rotation = [1, 0, 0, 0];
let points = [];
let stamps = [];
let stroke = 0;
let iconTime = -Infinity;
let iconBusy = false;
let iconStale = false;
let tilt = null;
let level = null;
let last = 0;
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
  const family = getComputedStyle(document.body).fontFamily;
  const size = LABEL * 0.6;
  await document.fonts.load(`${size}px ${family}`, "DA");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = LABEL;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.font = `${size}px ${family}`;
  context.textAlign = "center";
  const { actualBoundingBoxAscent } = context.measureText("DA");
  context.fillText("DA", LABEL / 2, (LABEL + actualBoundingBoxAscent) / 2);
  const { data } = context.getImageData(0, 0, LABEL, LABEL);
  drawn = null;
  label = Float32Array.from({ length: LABEL * LABEL }, (_, i) => data[i * 4 + 3] / 255);
  wake();
}

function buildRamp() {
  const paper = readColor(getComputedStyle(document.body).backgroundColor);
  const paintColor = readColor(
    getComputedStyle(document.documentElement).getPropertyValue("--color-ink"),
  );
  lettering = paintColor;
  drawn = null;
  const stops = [
    [0, paintColor],
    [RIM - 0.005, paintColor],
    [RIM, paper],
    [1, paper],
  ];
  ramp = Array.from({ length: RAMP + 1 }, (_, i) => {
    const t = Math.acos(1 - (2 * i) / RAMP) / Math.PI;
    const next = stops.findIndex(([at]) => at >= t);
    if (next <= 0) return stops[0][1];
    const [from, a] = stops[next - 1];
    const [to, b] = stops[next];
    const k = (t - from) / (to - from);
    const s = k * k * (3 - 2 * k);
    return a.map((v, j) => v + (b[j] - v) * s);
  });
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

function ink() {
  const dot = Math.max(-rotate(conjugate(rotation), [0, 0, 1])[2], EDGE + 0.02);
  const [r, g, b] = ramp[Math.round(((1 - dot) / 2) * RAMP)].map((v) =>
    Math.round(toGamma(v) * 255),
  );
  return `rgb(${r} ${g} ${b})`;
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
  context.fillStyle = context.strokeStyle = ink();
  context.lineCap = "round";
  for (const drop of drops) paintSplat(context, drop);
  stamps.push({
    x: position[0],
    y: position[1],
    canvas,
    width: extent * 2,
    height: extent * 2,
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

function resize() {
  pixelRatio = devicePixelRatio || 1;
  radius = sphere.offsetWidth / 2;
  trail.width = innerWidth * pixelRatio;
  trail.height = innerHeight * pixelRatio;
  trail.style.width = `${innerWidth}px`;
  trail.style.height = `${innerHeight}px`;
  const size = Math.ceil(radius * 2 * pixelRatio);
  sphere.width = sphere.height = size;
  image = sphereContext.createImageData(size, size);
  pixels = [];
  const half = size / 2;
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5 - half) / half;
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - half) / half;
      const d = x * x + y * y;
      if (d >= 1) continue;
      const z = -Math.sqrt(1 - d);
      const diffuse = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
      pixels.push({
        i: (py * size + px) * 4,
        x,
        y,
        z,
        light: 0.4 + 0.75 * diffuse,
        glow:
          Math.max(0, x * HALF[0] + y * HALF[1] + z * HALF[2]) ** 48 * 0.6 + (1 + z) ** 3 * 0.15,
        alpha: Math.min(1, (1 - Math.sqrt(d)) * half * 1.5) * 255,
      });
    }
  }
  drawn = null;
}

function paintSphere() {
  const key = `${rotation.join()},${height}`;
  if (key === drawn) return;
  drawn = key;
  const inverse = conjugate(rotation);
  const [ax, ay, az] = rotate(inverse, [1, 0, 0]);
  const [bx, by, bz] = rotate(inverse, [0, 1, 0]);
  const [cx, cy, cz] = rotate(inverse, [0, 0, 1]);
  const data = image.data;
  for (const { i, x, y, z, light, glow, alpha } of pixels) {
    const bodyZ = az * x + bz * y + cz * z;
    const color = ramp[(((1 + bodyZ) / 2) * RAMP + 0.5) | 0];
    let red = color[0];
    let green = color[1];
    let blue = color[2];
    if (label && bodyZ > -EDGE) {
      const a = letter(ax * x + bx * y + cx * z, ay * x + by * y + cy * z, bodyZ);
      if (a) {
        red += (lettering[0] - red) * a;
        green += (lettering[1] - green) * a;
        blue += (lettering[2] - blue) * a;
      }
    }
    data[i] = gamma[(Math.min(red * light + glow, 1) * GAMMA) | 0];
    data[i + 1] = gamma[(Math.min(green * light + glow, 1) * GAMMA) | 0];
    data[i + 2] = gamma[(Math.min(blue * light + glow, 1) * GAMMA) | 0];
    data[i + 3] = alpha;
  }
  sphereContext.putImageData(image, 0, 0);
}

function place() {
  const x = position[0];
  const y = position[1] - scrollY;
  const reach = radius * 1.15;
  sphere.style.translate = `${x - radius}px ${y - radius}px`;
  sphere.style.scale = 1 + height / 500;
  shadow.style.translate = `${x - reach + radius * 0.35 + height * 0.45}px ${y - reach + radius * 0.45 + height * 0.55}px`;
  shadow.style.scale = 1 + (height * 0.25) / reach;
  shadow.style.opacity = 1 / (1 + height / 70);
  handle.style.translate = `${x - radius}px ${y - radius}px`;
}

function stamp(x, y, size, [px, py, pz], fade) {
  const reach = Math.hypot(px, py);
  const cut =
    reach < 1e-6 ? -Math.sign(pz - EDGE) * Infinity : (radius * fade * (EDGE - pz)) / reach;
  if (cut >= size) return;
  const facing = cut <= -size ? 0 : Math.atan2(py, px);
  const spread = cut <= -size ? Math.PI : Math.acos(cut / size);
  trailContext.beginPath();
  trailContext.arc(x, y, size, facing - spread, facing + spread);
  trailContext.fill();
}

function letter(x, y, z) {
  if (!label || z <= -EDGE) return 0;
  const u = x / LABEL_SPAN;
  const v = -y / LABEL_SPAN;
  if (Math.abs(u) >= 1 || Math.abs(v) >= 1) return 0;
  const row = (((v + 1) / 2) * LABEL) | 0;
  const column = (((u + 1) / 2) * LABEL) | 0;
  return label[row * LABEL + column];
}

function press(now) {
  const speed = Math.hypot(...velocity);
  if (!label || speed < 1) return;
  const inverse = conjugate(rotation);
  const [ax, ay, az] = rotate(inverse, [1, 0, 0]);
  const [bx, by, bz] = rotate(inverse, [0, 1, 0]);
  const [cx, cy, cz] = rotate(inverse, [0, 0, 1]);
  if (cz < 0) return;
  const mx = velocity[0] / speed;
  const my = velocity[1] / speed;
  const along = Math.min(Math.max(1.5, speed / 60), 6) / 2 + 0.4;
  const across = radius * 0.9;
  const halfWidth = Math.abs(mx) * along + Math.abs(my) * across;
  const halfHeight = Math.abs(my) * along + Math.abs(mx) * across;
  const columns = Math.ceil(halfWidth * 2 * pixelRatio) + 2;
  const rows = Math.ceil(halfHeight * 2 * pixelRatio) + 2;
  const step = 0.5 / pixelRatio;
  let image = null;
  for (let p = -across; p <= across; p += step) {
    for (let q = -along; q <= along; q += step) {
      const dx = q * mx - p * my;
      const dy = q * my + p * mx;
      const u = dx / radius;
      const v = dy / radius;
      const length = Math.sqrt(u * u + v * v + 1);
      const a = letter(
        (ax * u + bx * v + cx) / length,
        (ay * u + by * v + cy) / length,
        (az * u + bz * v + cz) / length,
      );
      if (!a) continue;
      image ??= new ImageData(columns, rows);
      const column = ((dx + halfWidth) * pixelRatio + 1) | 0;
      const row = ((dy + halfHeight) * pixelRatio + 1) | 0;
      const i = (row * columns + column) * 4;
      image.data[i + 3] = Math.max(image.data[i + 3], a * 255);
    }
  }
  if (!image) return;
  const [red, green, blue] = lettering.map((value) => Math.round(toGamma(value) * 255));
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = red;
    image.data[i + 1] = green;
    image.data[i + 2] = blue;
  }
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  canvas.getContext("2d").putImageData(image, 0, 0);
  stamps.push({
    x: position[0],
    y: position[1],
    canvas,
    width: columns / pixelRatio,
    height: rows / pixelRatio,
    time: now,
  });
}

function paintIcon(now, force) {
  if (iconBusy) iconStale ||= force;
  if (iconBusy || (!force && now - iconTime < 250)) return;
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  iconTime = now;
  iconBusy = true;
  const context = icon.getContext("2d");
  context.clearRect(0, 0, icon.width, icon.height);
  context.drawImage(sphere, 0, 0, icon.width, icon.height);
  icon.toBlob((blob) => {
    iconBusy = false;
    if (!blob) return;
    if (link.href.startsWith("blob:")) URL.revokeObjectURL(link.href);
    link.type = "image/png";
    link.href = URL.createObjectURL(blob);
    if (iconStale) {
      iconStale = false;
      paintIcon(performance.now(), true);
    }
  });
}

function paintTrail(now) {
  trailContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, -scrollY * pixelRatio);
  trailContext.clearRect(0, scrollY, innerWidth, innerHeight);
  const top = scrollY - radius * 2;
  const bottom = scrollY + innerHeight + radius * 2;
  let color = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const from = a && !b.gap ? a : b;
    if (Math.max(from.y, b.y) < top || Math.min(from.y, b.y) > bottom) continue;
    if (b.color !== color) trailContext.fillStyle = color = b.color;
    const fade = Math.sqrt(1 - (now - b.time) / TRAIL_LIFE);
    const spacing = Math.max(1.5, Math.min(from.width, b.width) * fade * 0.25);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - from.x, b.y - from.y) / spacing));
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      const mix = (u, v) => u + (v - u) * k;
      stamp(
        mix(from.x, b.x),
        mix(from.y, b.y),
        (mix(from.width, b.width) / 2) * fade,
        [mix(from.pole[0], b.pole[0]), mix(from.pole[1], b.pole[1]), mix(from.pole[2], b.pole[2])],
        fade,
      );
    }
  }
  for (const { x, y, canvas, width, height, time } of stamps) {
    if (y + height / 2 < top || y - height / 2 > bottom) continue;
    trailContext.globalAlpha = 1 - (now - time) / TRAIL_LIFE;
    trailContext.drawImage(canvas, x - width / 2, y - height / 2, width, height);
  }
  trailContext.globalAlpha = 1;
}

function step(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;

  if (parked) target = corner(focused());
  else homing();
  const [tx, ty] = target ? [target[0], target[1] + scrollY] : position;
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
    spinning = [velocity[1] / radius, -velocity[0] / radius, 0];
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

  const speed = Math.hypot(...velocity);
  const previous = points.at(-1);
  if (height === 0) {
    const gap = !grounded || !previous || previous.lifted;
    const goal = radius * (THIN + (WIDE - THIN) * Math.exp(-speed / 200));
    if (gap) stroke = radius * THIN;
    const ease = goal > stroke ? SWELL : NARROW;
    stroke += (goal - stroke) * (1 - Math.exp(-dt / ease));
    const width = stroke;
    if (gap || Math.hypot(position[0] - previous.x, position[1] - previous.y) > 1.5) {
      const color = ink();
      const pole = rotate(rotation, [0, 0, -1]);
      points.push({ x: position[0], y: position[1], color, width, pole, gap, time: now });
      press(now);
    } else {
      previous.width = width;
      previous.time = now;
    }
  } else if (previous) {
    previous.lifted = true;
  }
  points = points.filter((point) => now - point.time < TRAIL_LIFE);
  stamps = stamps.filter((stamp) => now - stamp.time < TRAIL_LIFE);

  paintTrail(now);
  paintSphere();
  place();

  const resting =
    height === 0 && speed < 0.5 && Math.hypot(tx - position[0], ty - position[1]) < 0.5;
  paintIcon(now, resting);
  frame = resting && !points.length && !stamps.length ? 0 : requestAnimationFrame(step);
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
    [1, scrollY + radius, scrollY + innerHeight - radius],
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
  if (!hovering.matches || !pointer) return null;
  return document
    .elementsFromPoint(...pointer)
    .map((element) => element.closest(".highlight"))
    .find(Boolean);
}

function corner(highlight = null) {
  const inset = radius * 2.5;
  const x = narrow.matches ? radius * 1.25 : document.documentElement.clientWidth - inset;
  if (!highlight) return [x, innerHeight - inset];
  const { top, bottom } = highlight.getBoundingClientRect();
  return [x, Math.min(Math.max((top + bottom) / 2, inset), innerHeight - inset)];
}

function homing() {
  const [x, y] = corner();
  const distance = Math.hypot(position[0] - x, position[1] - scrollY - y);
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
  if (parked) {
    pointer = [event.clientX, event.clientY];
    wake();
    return;
  }
  target = [event.clientX, event.clientY];
  wake();
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
  if (!moving.matches) return;
  document.body.append(trail, dock, shadow, sphere, handle);
  resize();
  buildRamp();
  buildLabel();
  const [x, y] = corner();
  position = [x, y + scrollY];
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
    wake();
  });
  addEventListener("pointerdown", jump, { passive: true });
  addEventListener("touchstart", touch, { passive: true });
  addEventListener("touchmove", touch, { passive: true });
  addEventListener("scroll", () => position && wake(), { passive: true });
  addEventListener("resize", () => {
    resize();
    wake();
  });
  dark.addEventListener("change", () => {
    buildRamp();
    wake();
  });
}

start();
