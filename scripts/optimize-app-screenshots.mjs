import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PhotonImage, SamplingFilter, resize } from "@cf-wasm/photon/node";

const screenshotsDir = fileURLToPath(new URL("../public/images/app/screenshots/", import.meta.url));
const targetWidth = 720;
const jpegQuality = 82;
const files = (await readdir(screenshotsDir)).filter((name) => extname(name).toLowerCase() === ".jpg");

for (const name of files) {
  const jpegPath = join(screenshotsDir, name);
  const beforeBytes = (await stat(jpegPath)).size;
  const inputBytes = new Uint8Array(await readFile(jpegPath));
  const input = PhotonImage.new_from_byteslice(inputBytes);
  const sourceWidth = input.get_width();
  const sourceHeight = input.get_height();
  const outputWidth = Math.min(sourceWidth, targetWidth);
  const outputHeight = Math.round(sourceHeight * (outputWidth / sourceWidth));
  const output = sourceWidth === outputWidth
    ? input
    : resize(input, outputWidth, outputHeight, SamplingFilter.Lanczos3);

  if (sourceWidth > targetWidth) {
    await writeFile(jpegPath, output.get_bytes_jpeg(jpegQuality));
  }

  if (output !== input) output.free();
  input.free();

  const afterBytes = (await stat(jpegPath)).size;
  console.log(`${name}: ${sourceWidth}x${sourceHeight} -> ${outputWidth}x${outputHeight}; ${Math.round(beforeBytes / 1024)} KiB -> ${Math.round(afterBytes / 1024)} KiB`);
}
