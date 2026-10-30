// Sushi Conveyor's pictures: hyper-real miniatures made like the app's menu icons (Higgsfield Qwen
// Image 3; prompts in tools/menu-icons/README.md), cut out and saved as small WebPs. esbuild inlines
// each one as a data URL, so the game needs nothing from the network.
import salmon from './art/salmon.webp';
import tuna from './art/tuna.webp';
import tamago from './art/tamago.webp';
import maki from './art/maki.webp';
import ebi from './art/ebi.webp';
import edamame from './art/edamame.webp';
import ikura from './art/ikura.webp';
import uni from './art/uni.webp';
import wasabi from './art/wasabi.webp';
import luckycat from './art/luckycat.webp';
import chef from './art/chef.webp';
import bgDay from './art/bg-day.webp';
import bgNight from './art/bg-night.webp';

export const SRC = { salmon, tuna, tamago, maki, ebi, edamame, ikura, uni, wasabi, luckycat, chef, bgDay, bgNight };

/** Loads every picture; resolves once all have loaded (or failed — a missing one is skipped when drawn). */
export function loadArt() {
  const imgs = {};
  return Promise.all(
    Object.entries(SRC).map(([k, src]) => new Promise((done) => {
      const im = new Image();
      im.onload = () => { imgs[k] = im; done(); };
      im.onerror = () => done();
      im.src = src;
    })),
  ).then(() => imgs);
}
