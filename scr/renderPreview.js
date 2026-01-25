import sharp from "sharp";

export async function renderPreviewBuffer(tg, opts = {}) {
  const size = opts.size ?? 512;
  const modelScale = opts.modelScale ?? 0.72;
  const modelY = opts.modelY ?? -18;
  const patternOpacity = opts.patternOpacity ?? 0.20;

  const center = tg?.backdrop?.center || "#363738";
  const edge   = tg?.backdrop?.edge   || "#0e0f0f";
  const pColor = tg?.backdrop?.patternColor || "#6c6868";

  const patternDataUrl = tg?.pattern?.image;
  const modelDataUrl   = tg?.model?.image;

  if (!patternDataUrl || !modelDataUrl) {
    throw new Error("Missing tg.pattern.image or tg.model.image");
  }

  const tile = 128; // у тебя pattern natural 128x128

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="45%" r="80%">
        <stop offset="0%" stop-color="${center}"/>
        <stop offset="100%" stop-color="${edge}"/>
      </radialGradient>

      <pattern id="pat" patternUnits="userSpaceOnUse" width="${tile}" height="${tile}">
        <image href="${esc(patternDataUrl)}" width="${tile}" height="${tile}" />
      </pattern>

      <mask id="patMask">
        <rect width="100%" height="100%" fill="url(#pat)"/>
      </mask>
    </defs>

    <rect width="100%" height="100%" fill="url(#bg)"/>
    <rect width="100%" height="100%" fill="${pColor}" mask="url(#patMask)" opacity="${patternOpacity}"/>

    <image href="${esc(modelDataUrl)}"
      x="${Math.round((size - size*modelScale)/2)}"
      y="${Math.round((size - size*modelScale)/2) + modelY}"
      width="${Math.round(size*modelScale)}"
      height="${Math.round(size*modelScale)}"
      preserveAspectRatio="xMidYMid meet"
    />
  </svg>`.trim();

  return sharp(Buffer.from(svg)).webp({ quality: 92 }).toBuffer();
}

function esc(s) {
  return String(s).replace(/"/g, "&quot;");
}
