const reel = document.querySelector(".reel");
const track = reel.querySelector(".reel__track");
const videos = [...reel.querySelectorAll(".reel__video")];
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
  () => pointer && hover(document.elementFromPoint(pointer.clientX, pointer.clientY)),
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
