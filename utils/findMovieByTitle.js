const PREFERRED_EXTS = [".mp4", ".m4v", ".mkv", ".mov", ".avi"]; // order = preference
const fsp = require("fs").promises;
const path = require('path'); 

async function findMovieByTitle(dir, title) {
  // normalize to just the basename (no slashes)
  const safeTitle = path.basename(title);

  const entries = await fsp.readdir(dir, { withFileTypes: true });

  // collect files whose basename (without ext) equals the title (case-insensitive)
  const candidates = entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(name => {
      const { name: base, ext } = path.parse(name);
      return base.toLowerCase() === safeTitle.toLowerCase() && ext;
    });

  if (candidates.length === 0) return null;

  // prefer by extension order above
  candidates.sort((a, b) => {
    const aExt = path.extname(a).toLowerCase();
    const bExt = path.extname(b).toLowerCase();
    return PREFERRED_EXTS.indexOf(aExt) - PREFERRED_EXTS.indexOf(bExt);
  });

  return path.join(dir, candidates[0]); // absolute path to the chosen file
}

module.exports = findMovieByTitle