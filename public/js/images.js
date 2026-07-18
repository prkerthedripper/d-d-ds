// Turn a picked file into a small data URI.
// Resizing happens in the browser so a 4 MB phone photo becomes ~40 KB before
// it ever touches the network or the database.

/**
 * @param {File} file
 * @param {number} max  longest edge in pixels
 * @param {number} quality  JPEG quality, 0-1
 * @returns {Promise<string>} data URI
 */
export function fileToDataUrl(file, max = 420, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file chosen'));
    if (!file.type.startsWith('image/')) return reject(new Error('That is not an image'));
    if (file.size > 25 * 1024 * 1024) return reject(new Error('That image is enormous — pick a smaller one'));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image is damaged or unsupported'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        // Flatten onto white so transparent PNGs don't turn black as JPEG.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        let out = canvas.toDataURL('image/jpeg', quality);
        // Step the quality down if it is still chunky.
        let q = quality;
        while (out.length > 600_000 && q > 0.4) {
          q -= 0.12;
          out = canvas.toDataURL('image/jpeg', q);
        }
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Open the file picker and hand back a resized data URI. */
export function pickImage(max = 420) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      fileToDataUrl(file, max).then(resolve).catch((err) => resolve(Promise.reject(err)));
    };
    input.click();
  });
}
