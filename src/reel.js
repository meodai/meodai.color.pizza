const reel = document.querySelector(".reel");
const track = reel.querySelector(".reel__track");
const videos = [...reel.querySelectorAll(".reel__video")];
const highlights = [...document.querySelectorAll(".highlight")];
const intro = reel.closest(".intro");
const home = reel.parentElement;
const homeNext = reel.nextElementSibling;
const motion = "(prefers-reduced-motion: no-preference)";
const wide = matchMedia(`(min-width: 48.8125em) and (min-height: 45.0625em) and ${motion}`);
const tablet = matchMedia(`(max-width: 48.75em) and ${motion}`);

let ready = false;
let hovered = null;
let inView = null;
let pointer = null;

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

function place() {
  if (!hovered || !wide.matches) return;
  const natural = intro.getBoundingClientRect().top + reel.offsetTop;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const top = hovered.querySelector(".highlight__text").getBoundingClientRect().top;
  const clamped = Math.min(Math.max(top, rem), innerHeight - rem - reel.offsetHeight);
  reel.style.setProperty("--reel-shift", `${clamped - natural}px`);
}

function show(index) {
  reel.classList.toggle("reel--visible", index >= 0);
  if (index >= 0) track.style.setProperty("--reel-index", index);
  videos.forEach((video, i) => {
    if (i !== index) return video.pause();
    load(video);
    video.play().catch(() => {});
  });
}

function update() {
  const focus = tablet.matches ? inView : hovered;
  const index =
    ready && (wide.matches || tablet.matches)
      ? videos.findIndex((v) => v.dataset.video === focus?.dataset.video)
      : -1;
  const slot = tablet.matches ? focus?.querySelector(".highlight__media") : home;
  if (index < 0 || !slot || reel.parentElement === slot) return show(index);
  reel.classList.remove("reel--visible");
  reel.style.removeProperty("--reel-shift");
  slot.insertBefore(reel, slot === home ? homeNext : null);
  void track.offsetHeight;
  place();
  show(index);
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
  place();
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

document.documentElement.addEventListener("pointerleave", () => {
  pointer = null;
  hover(null);
});

addEventListener(
  "scroll",
  () => {
    if (tablet.matches) {
      const previous = inView;
      focusFromScroll();
      if (inView !== previous) update();
      return;
    }
    if (!pointer) return;
    hover(document.elementFromPoint(pointer.clientX, pointer.clientY));
    place();
  },
  { passive: true },
);

const reset = () => {
  focusFromScroll();
  update();
};
wide.addEventListener("change", reset);
tablet.addEventListener("change", reset);

const idle = (callback) =>
  "requestIdleCallback" in window ? requestIdleCallback(callback) : setTimeout(callback, 200);
const start = () =>
  idle(() => {
    videos.forEach((video) => (video.poster = `/videos/${video.dataset.video}.webp`));
    ready = true;
    reset();
  });
if (document.readyState === "complete") start();
else addEventListener("load", start, { once: true });
