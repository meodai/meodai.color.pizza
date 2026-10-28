const eyes = [...document.querySelectorAll(".intro .portrait__eye")];
const desktop = matchMedia(
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
);
const reach = 0.6;
const falloff = 240;

let frame = 0;
let pointer = null;

function look() {
  frame = 0;
  for (const eye of eyes) {
    const box = eye.getBoundingClientRect();
    const dx = pointer.x - (box.left + box.width / 2);
    const dy = pointer.y - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy);
    if (!distance) continue;
    const pull = (reach * Math.min(distance, falloff)) / falloff / distance;
    eye.style.translate = `${(dx * pull).toFixed(3)}px ${(dy * pull).toFixed(3)}px`;
  }
}

function track(event) {
  pointer = { x: event.clientX, y: event.clientY };
  if (!frame) frame = requestAnimationFrame(look);
}

function rest() {
  for (const eye of eyes) eye.style.translate = "";
}

function sync() {
  if (desktop.matches) {
    addEventListener("pointermove", track, { passive: true });
    document.documentElement.addEventListener("pointerleave", rest);
  } else {
    removeEventListener("pointermove", track);
    document.documentElement.removeEventListener("pointerleave", rest);
    rest();
  }
}

if (eyes.length) {
  sync();
  desktop.addEventListener("change", sync);
}
