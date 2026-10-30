const root = document.documentElement;
const reel = document.querySelector(".reel");
const track = reel.querySelector(".reel__track");
const videos = [...reel.querySelectorAll(".reel__video")];
const highlights = [...document.querySelectorAll(".highlight")];
const intro = document.querySelector(".intro");
const stacked = matchMedia("(max-width: 48.75em)");
const phone = matchMedia("(max-width: 33.75em)");
const moving = matchMedia("(prefers-reduced-motion: no-preference)");
const hovering = matchMedia("(hover: hover) and (pointer: fine)");

const STIFFNESS = 60;
const DAMPING = 6;
const FALL = 0.09;
const LIFT = 0.035;
const PULL = 30000;
const DROP = 110;
const LIMIT = 16;

let ready = false;
let hovered = null;
let inView = null;
let pointer = null;
let inline = [];
let ball = null;
let flipped = false;
let droop = 0;
let sway = 0;
let swinging = 0;
let swung = 0;
let held = null;
let pace = { x: 0, y: 0 };

track.style.setProperty("--reel-count", videos.length);

function load(video) {
  if (video.childElementCount) return;
  for (const type of ["webm", "mp4"]) {
    const source = document.createElement("source");
    source.src = `/videos/${video.dataset.video}.${type}`;
    source.type = `video/${type}`;
    video.append(source);
  }
  video.load();
}

function attached() {
  return ball && moving.matches && !phone.matches;
}

function chase() {
  const rem = parseFloat(getComputedStyle(root).fontSize);
  const title = highlights[0].querySelector(".highlight__title");
  const width = stacked.matches
    ? root.clientWidth - rem * 6 - title.getBoundingClientRect().left
    : intro.offsetWidth - rem * 2.25;
  reel.style.setProperty("--reel-width", `${width}px`);
  const height = reel.offsetHeight;
  root.style.setProperty("--reel-height", `${height}px`);
  const room = width + rem * 3.25;
  if (ball.x < room) flipped = true;
  else if (ball.x > room + rem * 0.5) flipped = false;
  const top = Math.min(Math.max(ball.y - height / 2, rem), innerHeight - rem - height);
  reel.classList.toggle("reel--flipped", flipped);
  reel.style.translate = `${ball.x}px ${ball.y}px`;
  const point = Math.min(Math.max(ball.y - top, rem), height - rem);
  reel.style.setProperty("--reel-point", `${point}px`);
}

function swing(now) {
  if (!attached()) {
    droop = sway = swinging = 0;
    reel.style.removeProperty("rotate");
    return;
  }
  const dt = Math.min((now - swung) / 1000, 1 / 30);
  swung = now;
  if (dt > 0) {
    const ease = 1 - Math.exp(-dt / 0.03);
    const ax = (((ball.x - held.x) / dt - pace.x) * ease) / dt;
    const ay = (((ball.y - held.y) / dt - pace.y) * ease) / dt;
    pace = { x: pace.x + ax * dt, y: pace.y + ay * dt };
    held = ball;
    const side = flipped ? 1 : -1;
    const tug = Math.min(Math.max(-ay - side * ax * 0.5, -PULL), PULL);
    sway += (tug * (tug > 0 ? FALL : LIFT) - STIFFNESS * droop - DAMPING * sway) * dt;
    droop += sway * dt;
    if (Math.abs(droop) > LIMIT) {
      droop = Math.sign(droop) * LIMIT;
      sway = 0;
    }
    reel.style.rotate = `${droop * side}deg`;
  }
  const settled = Math.abs(droop) < 0.02 && Math.abs(sway) < 0.2 && Math.hypot(pace.x, pace.y) < 1;
  if (settled) reel.style.removeProperty("rotate");
  swinging = settled ? 0 : requestAnimationFrame(swing);
}

function wake() {
  if (swinging) return;
  swung = performance.now();
  swinging = requestAnimationFrame(swing);
}

function show(index) {
  const opening = index >= 0 && !reel.classList.contains("reel--visible");
  reel.classList.toggle("reel--visible", index >= 0);
  videos.forEach((video, i) => i !== index && video.pause());
  if (index < 0) return;
  track.style.setProperty("--reel-index", index);
  run(videos[index]);
  if (!opening) return;
  droop = 0;
  sway = DROP;
  wake();
}

function run(video) {
  load(video);
  video.play().catch(() => {});
}

const nearby = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && phone.matches && moving.matches) run(entry.target);
      else entry.target.pause();
    }
  },
  { rootMargin: "50% 0px" },
);

function inlineVideos() {
  if (!inline.length) {
    inline = highlights.map((highlight) => {
      const video = videos.find((v) => v.dataset.video === highlight.dataset.video).cloneNode();
      video.classList.add("highlight__video");
      video.muted = true;
      highlight.querySelector(".highlight__media").append(video);
      nearby.observe(video);
      return video;
    });
  }
  return inline;
}

function update() {
  if (ready && phone.matches) {
    show(-1);
    return inlineVideos();
  }
  const focus = hovering.matches ? hovered : inView;
  show(
    ready && attached() ? videos.findIndex((v) => v.dataset.video === focus?.dataset.video) : -1,
  );
}

function focusFromScroll() {
  const line = innerHeight / 2;
  inView =
    highlights.find((highlight) => {
      const { top, bottom } = highlight.getBoundingClientRect();
      return top <= line && bottom > line;
    }) ?? null;
}

function hover(target) {
  const highlight = target?.closest?.(".highlight") ?? null;
  if (highlight === hovered) return;
  hovered = highlight;
  update();
}

addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType !== "mouse") return;
    pointer = event;
    hover(event.target);
  },
  { passive: true },
);

addEventListener("ballmove", ({ detail }) => {
  held ??= detail;
  ball = detail;
  if (!attached()) return root.style.removeProperty("--reel-height");
  chase();
  wake();
});

root.addEventListener("pointerleave", () => {
  pointer = null;
  hover(null);
});

addEventListener(
  "scroll",
  () => {
    if (!hovering.matches) {
      const previous = inView;
      focusFromScroll();
      if (inView !== previous) update();
      return;
    }
    if (!pointer) return;
    hover(document.elementFromPoint(pointer.clientX, pointer.clientY));
  },
  { passive: true },
);

const reset = () => {
  focusFromScroll();
  update();
};
addEventListener("resize", reset);
moving.addEventListener("change", reset);
hovering.addEventListener("change", reset);

const idle = (callback) =>
  "requestIdleCallback" in window ? requestIdleCallback(callback) : setTimeout(callback, 200);
const start = () =>
  idle(() => {
    videos.forEach((video) => {
      video.poster = `/videos/${video.dataset.video}.webp`;
      video.style.background = `url("${video.poster}") center / cover`;
    });
    ready = true;
    reset();
  });
if (document.readyState === "complete") start();
else addEventListener("load", start, { once: true });
