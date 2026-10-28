import { themed } from "./theme.js";

const cover = document.querySelector(".cover");
const disc = cover?.querySelector(".cover__disc");
const initials = cover?.querySelector(".cover__initials");
const name = cover?.querySelector(".cover__name");
const moving = matchMedia("(prefers-reduced-motion: no-preference)");
const patience = new Promise((resolve) => setTimeout(resolve, 3000));
const DURATION = 800;
const MARGIN = 16;

const ease = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function target() {
  const box = document.querySelector(".ball__sphere")?.getBoundingClientRect();
  return box?.width
    ? { x: box.left + box.width / 2, y: box.top + box.height / 2, size: box.width }
    : { x: innerWidth / 2, y: innerHeight / 2, size: 0 };
}

function place(element, { x, y }) {
  const { width, height } = element.getBoundingClientRect();
  const left = Math.min(Math.max(x - width / 2, MARGIN), innerWidth - MARGIN - width);
  element.style.translate = `${left}px ${y - height / 2}px`;
}

function center({ x, y }) {
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  Object.assign(disc.style, {
    insetBlockStart: `${y - reach}px`,
    insetInlineStart: `${x - reach}px`,
    inlineSize: `${reach * 2}px`,
    blockSize: `${reach * 2}px`,
    margin: "0",
  });
  return reach * 2;
}

async function gather(goal) {
  initials.style.translate = `calc(${goal.x}px - 50%) calc(${goal.y}px - 50%)`;
  place(name, goal);
  name.style.visibility = "visible";
  await pause(400);
  for (const rest of name.querySelectorAll(".cover__rest"))
    rest.animate({ opacity: [1, 0] }, { duration: 300, fill: "forwards" });
  const finals = [...initials.children].map((letter) => letter.getBoundingClientRect());
  const letters = [...name.querySelectorAll(".cover__letter")];
  const done = pause(150).then(() =>
    Promise.all(
      letters.map((letter, index) => {
        const from = letter.getBoundingClientRect();
        const to = finals[index];
        return letter.animate(
          { translate: ["0 0", `${to.left - from.left}px ${to.top - from.top}px`] },
          { duration: 450, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
        ).finished;
      }),
    ),
  );
  return { done };
}

function shrink() {
  const size = center(target());
  const start = performance.now();
  return new Promise((resolve) => {
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      disc.style.scale = 1 + (target().size / size - 1) * ease(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

async function reveal() {
  const { fontSize, fontFamily } = getComputedStyle(cover);
  const font = `${fontSize} ${fontFamily}`;
  await Promise.race([Promise.all([themed, document.fonts.load(font, "David Aerne")]), patience]);
  if (!moving.matches) return cover.remove();
  const { done } = await gather(target());
  await Promise.all([done, shrink()]);
  await cover.animate({ opacity: [1, 0] }, { duration: 250, fill: "forwards" }).finished;
  cover.remove();
}

if (cover) reveal();
