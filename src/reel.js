const reel = document.querySelector(".reel");
const track = reel.querySelector(".reel__track");
const videos = [...reel.querySelectorAll(".reel__video")];
const intro = reel.closest(".intro");
const wide = matchMedia(
  "(min-width: 48.8125em) and (min-height: 45.0625em) and (prefers-reduced-motion: no-preference)",
);

let ready = false;
let hovered = null;
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

function update() {
  const index =
    ready && wide.matches
      ? videos.findIndex((v) => v.dataset.video === hovered?.dataset.video)
      : -1;
  reel.classList.toggle("reel--visible", index >= 0);
  if (index >= 0) track.style.setProperty("--reel-index", index);
  videos.forEach((video, i) => {
    if (i !== index) return video.pause();
    load(video);
    video.play().catch(() => {});
  });
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
    if (!pointer) return;
    hover(document.elementFromPoint(pointer.clientX, pointer.clientY));
    place();
  },
  { passive: true },
);

wide.addEventListener("change", update);

const idle = (callback) =>
  "requestIdleCallback" in window ? requestIdleCallback(callback) : setTimeout(callback, 200);
const start = () =>
  idle(() => {
    ready = true;
    update();
  });
if (document.readyState === "complete") start();
else addEventListener("load", start, { once: true });
